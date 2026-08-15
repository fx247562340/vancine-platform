package controller

// P10 A07 — real Passkey re-login after Google self-unbind (hard gate).
//
// The slice proves that a user who simultaneously holds a durable Google
// binding (claim + users.google_sub mirror) and a valid Passkey credential
// can, after a real Google self-unbind through the production UserAuth
// route, complete a real WebAuthn assertion ceremony:
//
//	PasskeyLoginBegin → (fresh HTTP client) → PasskeyLoginFinish
//	  → production ValidatePasskeyLogin (no validator mock)
//	  → real session bundle → refresh cookie
//	  → GET /api/user/self with the new session → the seeded user
//
// The credential is a test-generated real P-256 key pair. The persisted
// COSE public key is genuinely derived from that key (the fixture parses
// the COSE back and compares the coordinates), and the assertion signature
// is a real ECDSA/SHA-256 signature over authenticatorData ||
// SHA256(clientDataJSON), so no byte of the ceremony is fake.
//
// Discipline:
//   - The fixture runs through the real model.InitDB / model.InitLogDB chain
//     (p10SetupDatabase) on SQLite and on the configured PostgreSQL target.
//   - Passkey settings (Enabled / RP ID / Origins / UserVerification) are
//     explicitly enabled and exactly restored in cleanup; Redis/DB globals
//     are restored by p10SetupDatabase.
//   - Handlers run inside httptest servers or the production middleware;
//     none of this file's code calls testing.T / require / assert from a
//     handler or worker goroutine — assertions happen on the test goroutine
//     after the HTTP responses have returned.
//   - The private key exists only in this test process; no assertion,
//     cookie, token, DSN or credential material is written to logs or to
//     the report.

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// passkeyAssertionResponse mirrors the WebAuthn PublicKeyCredential JSON a
// browser authenticator returns for an assertion (all byte fields in
// base64url). It is marshaled with common.Marshal and fed verbatim into the
// production PasskeyLoginFinish parser.
type passkeyAssertionResponse struct {
	ID       string                       `json:"id"`
	RawID    string                       `json:"rawId"`
	Type     string                       `json:"type"`
	Response passkeyAssertionResponseData `json:"response"`
}

type passkeyAssertionResponseData struct {
	ClientDataJSON    string `json:"clientDataJSON"`
	AuthenticatorData string `json:"authenticatorData"`
	Signature         string `json:"signature"`
	UserHandle        string `json:"userHandle"`
}

// p10COSEKeyFromPublicKey encodes a real P-256 public key as a WebAuthn
// COSE_Key (EC2 / ES256 / P-256) and proves the encoding parses back to the
// exact same key, so the stored credential is genuinely derived from the
// test-generated private key that will sign the assertion.
func p10COSEKeyFromPublicKey(t *testing.T, pub *ecdsa.PublicKey) string {
	t.Helper()
	require.NotNil(t, pub, "the fixture needs a real P-256 public key")
	require.Equal(t, elliptic.P256(), pub.Curve, "the fixture only supports P-256")
	x := pub.X.FillBytes(make([]byte, 32))
	y := pub.Y.FillBytes(make([]byte, 32))
	cose := []byte{
		0xA5,       // map(5)
		0x01, 0x02, // 1 (kty): 2 (EC2)
		0x03, 0x26, // 3 (alg): -7 (ES256)
		0x20, 0x01, // -1 (crv): 1 (P-256)
		0x21, 0x58, 0x20, // -2 (x): bytes(32)
	}
	cose = append(cose, x...)
	cose = append(cose, 0x22, 0x58, 0x20) // -3 (y): bytes(32)
	cose = append(cose, y...)
	encoded := base64.StdEncoding.EncodeToString(cose)
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	require.NoError(t, err)
	parsed, err := webauthncose.ParsePublicKey(decoded)
	require.NoError(t, err, "the fixture must be a real parseable COSE key")
	parsedEC2, ok := parsed.(webauthncose.EC2PublicKeyData)
	require.True(t, ok, "the fixture must parse as an EC2 COSE key")
	roundTrip, err := parsedEC2.ToECDSA()
	require.NoError(t, err)
	require.Equal(t, pub.X, roundTrip.X, "the COSE key must round-trip to the same X coordinate")
	require.Equal(t, pub.Y, roundTrip.Y, "the COSE key must round-trip to the same Y coordinate")
	return encoded
}

// TestPasskeyReLoginAfterGoogleSelfUnbind is the P10 A07 hard gate: it runs
// the full unbind → real WebAuthn assertion → new session → protected API
// chain on every configured database (SQLite always; PostgreSQL when
// TEST_POSTGRES_DSN is set).
func TestPasskeyReLoginAfterGoogleSelfUnbind(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "passkey-relogin", passkeyReLoginBody)
}

func passkeyReLoginBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{},
		&model.ExternalIdentityClaim{},
		&model.PasskeyCredential{},
		&model.UserSession{},
		&model.AuthFlow{},
		&model.Log{},
	)

	// Explicitly enable Passkey and pin deterministic RP ID / Origins; the
	// settings struct is restored exactly in cleanup. Redis/DB globals are
	// restored by p10SetupDatabase.
	settings := system_setting.GetPasskeySettings()
	previousSettings := *settings
	settings.Enabled = true
	settings.RPID = "passkey.test"
	settings.Origins = "https://passkey.test"
	settings.AllowInsecureOrigin = false
	settings.UserVerification = "preferred"
	settings.RPDisplayName = "Vancine A07 Test RP"
	t.Cleanup(func() {
		*settings = previousSettings
	})

	// Real P-256 key pair for this test process; the private key never
	// leaves memory.
	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	rawCredID := make([]byte, 32)
	_, err = rand.Read(rawCredID)
	require.NoError(t, err)
	cosePub := p10COSEKeyFromPublicKey(t, &privKey.PublicKey)

	const googleSub = "a07-google-sub-001"
	user, token := createGoogleUnbindUser(t, model.DB, "a07-passkey-user", common.RoleCommonUser)
	credential := &model.PasskeyCredential{
		UserID:       user.Id,
		CredentialID: base64.StdEncoding.EncodeToString(rawCredID),
		PublicKey:    cosePub,
	}
	require.NoError(t, model.DB.Create(credential).Error)
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, googleSub, user.Id)
	}))

	// Precondition: durable claim and users.google_sub mirror are exactly
	// consistent, and the credential is persisted for this owner.
	preClaims := findGoogleClaims(t, model.DB)
	require.Len(t, preClaims, 1, "exactly one Google claim before unbind")
	assert.Equal(t, googleSub, preClaims[0].Subject)
	assert.Equal(t, user.Id, preClaims[0].UserId)
	preUser := reloadUnbindUser(t, model.DB, user.Id)
	assert.Equal(t, googleSub, preUser.GoogleSub, "the mirror must equal the claim subject")
	preCredential := reloadPasskeyCredential(t, model.DB, credential.ID)
	assert.Equal(t, base64.StdEncoding.EncodeToString(rawCredID), preCredential.CredentialID)
	assert.Equal(t, cosePub, preCredential.PublicKey)
	assert.Equal(t, user.Id, preCredential.UserID)

	// --- 1. Real Google self-unbind through the production UserAuth route.
	unbindRec := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	require.Equal(t, true, decodeEnvelope(t, unbindRec)["success"],
		"self-unbind must succeed while a valid Passkey alternative exists")
	assert.Empty(t, findGoogleClaims(t, model.DB), "the claim must be cleared")
	assert.Empty(t, reloadUnbindUser(t, model.DB, user.Id).GoogleSub, "the mirror must be cleared")

	// The unbind must not have touched the Passkey credential or any other
	// login credential: credential identity and sign state are byte-identical,
	// and the password column (the only other login credential of this user)
	// is unchanged.
	afterUnbind := reloadPasskeyCredential(t, model.DB, credential.ID)
	assert.Equal(t, preCredential.CredentialID, afterUnbind.CredentialID, "credential id must be unchanged")
	assert.Equal(t, preCredential.PublicKey, afterUnbind.PublicKey, "credential public key must be unchanged")
	assert.Equal(t, preCredential.UserID, afterUnbind.UserID, "credential owner must be unchanged")
	assert.Equal(t, uint32(0), afterUnbind.SignCount, "no assertion may have run yet")
	assert.Equal(t, preUser.Password, reloadUnbindUser(t, model.DB, user.Id).Password, "password credential must be unchanged")

	// --- 2. Fresh HTTP client with its own cookie jar: the pre-unbind PAT
	// session is never attached to this client.
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/user/passkey/login/begin", PasskeyLoginBegin)
	router.POST("/api/user/passkey/login/finish", PasskeyLoginFinish)
	router.GET("/api/user/self", middleware.UserAuth(), GetSelf)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	// --- 3. Real PasskeyLoginBegin returns the real flow and options.
	beginResp, err := client.Post(server.URL+"/api/user/passkey/login/begin", "application/json", nil)
	require.NoError(t, err)
	beginBytes, err := io.ReadAll(beginResp.Body)
	require.NoError(t, err)
	require.NoError(t, beginResp.Body.Close())
	var beginEnvelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    struct {
			Options struct {
				PublicKey struct {
					Challenge string `json:"challenge"`
					RPID      string `json:"rpId"`
				} `json:"publicKey"`
			} `json:"options"`
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(beginBytes, &beginEnvelope))
	require.True(t, beginEnvelope.Success, "PasskeyLoginBegin must succeed")
	require.NotEmpty(t, beginEnvelope.Data.FlowToken, "begin must return a real flow token")
	require.NotEmpty(t, beginEnvelope.Data.Options.PublicKey.Challenge, "begin must return a real challenge")
	assert.Equal(t, "passkey.test", beginEnvelope.Data.Options.PublicKey.RPID)

	// --- 4. Build a spec-compliant assertion signed by the real key.
	clientDataJSON := []byte(fmt.Sprintf(
		`{"type":"webauthn.get","challenge":%q,"origin":"https://passkey.test","crossOrigin":false}`,
		beginEnvelope.Data.Options.PublicKey.Challenge,
	))
	rpIDHash := sha256.Sum256([]byte("passkey.test"))
	authData := append([]byte{}, rpIDHash[:]...)
	authData = append(authData, 0x05) // UP | UV
	authData = append(authData, 0, 0, 0, 1)
	clientDataHash := sha256.Sum256(clientDataJSON)
	// The WebAuthn signature is ECDSA over the message
	// m = authenticatorData || SHA256(clientDataJSON); the ECDSA algorithm
	// hashes m once more (SHA-256), so the digest passed to SignASN1 is
	// SHA256(m), exactly what the production validator verifies.
	sigMessage := append(append([]byte{}, authData...), clientDataHash[:]...)
	sigDigest := sha256.Sum256(sigMessage)
	signature, err := ecdsa.SignASN1(rand.Reader, privKey, sigDigest[:])
	require.NoError(t, err)
	credentialJSON, err := common.Marshal(passkeyAssertionResponse{
		ID:    base64.RawURLEncoding.EncodeToString(rawCredID),
		RawID: base64.RawURLEncoding.EncodeToString(rawCredID),
		Type:  "public-key",
		Response: passkeyAssertionResponseData{
			ClientDataJSON:    base64.RawURLEncoding.EncodeToString(clientDataJSON),
			AuthenticatorData: base64.RawURLEncoding.EncodeToString(authData),
			Signature:         base64.RawURLEncoding.EncodeToString(signature),
			UserHandle:        base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(user.Id))),
		},
	})
	require.NoError(t, err)
	finishPayload, err := common.Marshal(struct {
		FlowToken  string          `json:"flow_token"`
		Credential json.RawMessage `json:"credential"`
	}{
		FlowToken:  beginEnvelope.Data.FlowToken,
		Credential: json.RawMessage(credentialJSON),
	})
	require.NoError(t, err)

	// --- 5. Real PasskeyLoginFinish through the production validator.
	finishResp, err := client.Post(server.URL+"/api/user/passkey/login/finish",
		"application/json", strings.NewReader(string(finishPayload)))
	require.NoError(t, err)
	finishBytes, err := io.ReadAll(finishResp.Body)
	require.NoError(t, err)
	require.NoError(t, finishResp.Body.Close())
	var finishEnvelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    struct {
			AccessToken string `json:"access_token"`
			TokenType   string `json:"token_type"`
			Session     struct {
				SID         string `json:"sid"`
				LoginMethod string `json:"login_method"`
			} `json:"session"`
			User struct {
				ID        int    `json:"id"`
				GoogleSub string `json:"google_sub"`
			} `json:"user"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(finishBytes, &finishEnvelope))
	require.True(t, finishEnvelope.Success, "PasskeyLoginFinish must accept the real assertion")
	require.NotEmpty(t, finishEnvelope.Data.AccessToken, "finish must issue a real access token")
	assert.Equal(t, "Bearer", finishEnvelope.Data.TokenType)
	assert.Equal(t, "passkey", finishEnvelope.Data.Session.LoginMethod)
	assert.NotEmpty(t, finishEnvelope.Data.Session.SID, "finish must issue a real session id")
	assert.Empty(t, finishEnvelope.Data.User.GoogleSub, "the post-login self data must not carry a Google mirror")
	refreshCookies := finishResp.Cookies()
	require.NotEmpty(t, refreshCookies, "finish must set the refresh cookie")
	foundRefresh := false
	for _, cookie := range refreshCookies {
		if cookie.Name == service.RefreshCookieName {
			foundRefresh = true
			assert.NotEmpty(t, cookie.Value, "the refresh cookie must carry the refresh token")
		}
	}
	assert.True(t, foundRefresh, "the refresh cookie must be present in the finish response")

	// --- 6. The new session reaches the real protected /api/user/self.
	selfReq, err := http.NewRequest(http.MethodGet, server.URL+"/api/user/self", nil)
	require.NoError(t, err)
	selfReq.Header.Set("Authorization", "Bearer "+finishEnvelope.Data.AccessToken)
	selfResp, err := client.Do(selfReq)
	require.NoError(t, err)
	selfBytes, err := io.ReadAll(selfResp.Body)
	require.NoError(t, err)
	require.NoError(t, selfResp.Body.Close())
	require.Equal(t, http.StatusOK, selfResp.StatusCode, "the new session must reach the real protected API")
	var selfEnvelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID        int    `json:"id"`
			GoogleSub string `json:"google_sub"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(selfBytes, &selfEnvelope))
	require.True(t, selfEnvelope.Success)
	assert.Equal(t, user.Id, selfEnvelope.Data.ID, "the protected API must resolve the seeded user")
	assert.Empty(t, selfEnvelope.Data.GoogleSub, "the mirror must still be empty on the protected API")

	// --- 7. Assertion state and session persistence per production behavior.
	persisted := reloadPasskeyCredential(t, model.DB, credential.ID)
	assert.Equal(t, uint32(1), persisted.SignCount, "the assertion counter must be persisted")
	assert.True(t, persisted.UserPresent, "the UP flag must be persisted")
	assert.True(t, persisted.UserVerified, "the UV flag must be persisted")
	assert.NotNil(t, persisted.LastUsedAt, "last_used_at must be persisted")
	assert.Equal(t, preCredential.CredentialID, persisted.CredentialID, "credential id must be immutable on login")
	assert.Equal(t, preCredential.PublicKey, persisted.PublicKey, "credential public key must be immutable on login")
	assert.Equal(t, preCredential.UserID, persisted.UserID, "credential owner must be immutable on login")

	var sessions []model.UserSession
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&sessions).Error)
	require.Len(t, sessions, 1, "exactly one real login session must exist")
	assert.Equal(t, "passkey", sessions[0].LoginMethod)
	assert.Equal(t, int64(1), sessions[0].UserAuthVersion)

	// --- 8. No orphan claims, no wrong owners, no new users.
	assert.Empty(t, findGoogleClaims(t, model.DB), "no orphan Google claims after the ceremony")
	var allUsers []model.User
	require.NoError(t, model.DB.Find(&allUsers).Error)
	require.Len(t, allUsers, 1, "the login must not create new users")
	assert.Equal(t, user.Id, allUsers[0].Id)

	// --- 9. The flow is one-time: replaying the same flow token is refused.
	replayResp, err := client.Post(server.URL+"/api/user/passkey/login/finish",
		"application/json", strings.NewReader(string(finishPayload)))
	require.NoError(t, err)
	replayBytes, err := io.ReadAll(replayResp.Body)
	require.NoError(t, err)
	require.NoError(t, replayResp.Body.Close())
	var replayEnvelope struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(replayBytes, &replayEnvelope))
	assert.False(t, replayEnvelope.Success, "a consumed flow token must not issue a second session")
	// The project API convention carries errors in the envelope (HTTP 200 +
	// success:false via common.ApiError), so only the envelope and the
	// absence of a second session are the contract.
	var sessionsAfterReplay []model.UserSession
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&sessionsAfterReplay).Error)
	assert.Len(t, sessionsAfterReplay, 1, "the replay must not create a second session")
}

// reloadPasskeyCredential reloads a PasskeyCredential row by primary key.
func reloadPasskeyCredential(t *testing.T, db *gorm.DB, id int) model.PasskeyCredential {
	t.Helper()
	var stored model.PasskeyCredential
	require.NoError(t, db.First(&stored, id).Error)
	return stored
}

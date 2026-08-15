package controller

// CP2 P1-A08 Real local OIDC re-login after Google self-unbind.
//
// The slice proves a user whose only remaining login methods include a real
// built-in OIDC binding can complete the full login ceremony through a
// loopback httptest OIDC IdP (no hardcoded GitHub/external endpoint, no real
// network egress). After self-unbinding Google the user drives:
//
//   GenerateOAuthCode → state
//   → HandleOAuth callback with the local OIDC mock serving both
//     TokenEndpoint and UserInfoEndpoint
//   → setupLogin creates a real session bundle
//   → the session token reaches the real UserAuth middleware and the real
//     GetSelf protected endpoint responds 2xx
//
// The fixture runs through the real model.InitDB / model.InitLogDB chain
// (p10SetupDatabase) so reserved-word columns are initialized and the main
// and log DB types are saved/restored; the database close is asserted.
//
// Handler discipline: the OIDC mock does NOT call testing.T / require /
// assert. It records errors into a mutex-guarded error slot and hit counts
// via atomic counters. The main goroutine asserts after the client response
// has been observed.

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// oidcLoopbackMock records the hits and any handler error the loopback OIDC
// IdP observed, and serves both TokenEndpoint (POST) and UserInfoEndpoint
// (GET) for a fixed subject. It carries no testing.T reference.
type oidcLoopbackMock struct {
	server       *httptest.Server
	tokenHits    int64
	userInfoHits int64

	mu             sync.Mutex
	subject        string
	email          string
	lastAuthHeader string
	lastBody       []byte
	lastErr        error // ordinary error recorded by the mock, asserted by the main goroutine
}

// setupOIDCLoopbackMock stands up a loopback httptest IdP and points the
// built-in OIDC settings at it. The mock never calls testing.T.
func setupOIDCLoopbackMock(t *testing.T, subject, email string) *oidcLoopbackMock {
	t.Helper()

	mock := &oidcLoopbackMock{subject: subject, email: email}
	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodPost:
			atomic.AddInt64(&mock.tokenHits, 1)
			body, err := io.ReadAll(r.Body)
			mock.mu.Lock()
			mock.lastBody = body
			if err != nil {
				mock.lastErr = err
			}
			mock.mu.Unlock()
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":"read_body"}`))
				return
			}
			if _, err := w.Write([]byte(`{
				"access_token":"loopback-oidc-access-token",
				"token_type":"Bearer",
				"expires_in":3600,
				"scope":"openid email profile"
			}`)); err != nil {
				mock.mu.Lock()
				mock.lastErr = err
				mock.mu.Unlock()
			}
		case http.MethodGet:
			atomic.AddInt64(&mock.userInfoHits, 1)
			mock.mu.Lock()
			mock.lastAuthHeader = r.Header.Get("Authorization")
			mock.mu.Unlock()
			if _, err := w.Write([]byte(fmt.Sprintf(`{
				"sub":%q,
				"email":%q,
				"preferred_username":"oidc-user",
				"name":"OIDC User"
			}`, subject, email))); err != nil {
				mock.mu.Lock()
				mock.lastErr = err
				mock.mu.Unlock()
			}
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	t.Cleanup(mock.server.Close)

	settings := system_setting.GetOIDCSettings()
	prevEnabled := settings.Enabled
	prevClientID := settings.ClientId
	prevClientSecret := settings.ClientSecret
	prevTokenEndpoint := settings.TokenEndpoint
	prevUserInfoEndpoint := settings.UserInfoEndpoint

	settings.Enabled = true
	settings.ClientId = "loopback-oidc-client"
	settings.ClientSecret = "loopback-oidc-secret"
	settings.TokenEndpoint = mock.server.URL + "/token"
	settings.UserInfoEndpoint = mock.server.URL + "/userinfo"

	t.Cleanup(func() {
		settings.Enabled = prevEnabled
		settings.ClientId = prevClientID
		settings.ClientSecret = prevClientSecret
		settings.TokenEndpoint = prevTokenEndpoint
		settings.UserInfoEndpoint = prevUserInfoEndpoint
	})
	return mock
}

// seedA08UserWithGoogleAndOIDC creates a real user with both a Google
// claim+mirror and an OIDC id that matches the loopback mock subject.
func seedA08UserWithGoogleAndOIDC(t *testing.T, googleSub, oidcSubject string) (*model.User, string) {
	t.Helper()
	token := common.GetRandomString(32)
	user := &model.User{
		Username:    "a08-user",
		Password:    "ignored",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     "a08-aff",
		AuthVersion: 1,
		OidcId:      oidcSubject,
		AccessToken: &token,
	}
	require.NoError(t, model.DB.Create(user).Error)

	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, googleSub, user.Id)
	}))
	require.NoError(t, model.DB.Model(&model.User{}).
		Where("id = ?", user.Id).
		Update("google_sub", googleSub).Error)
	return user, token
}

// TestGoogleUnbindSelfThenOIDCReLogin covers the full A08 contract on both
// SQLite and PostgreSQL fixtures.
func TestGoogleUnbindSelfThenOIDCReLogin(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "oidc", a08OIDCBody)
}

func a08OIDCBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{},
	)

	const googleSub = "a08-google-sub-001"
	const oidcSub = "a08-oidc-sub-001"
	user, token := seedA08UserWithGoogleAndOIDC(t, googleSub, oidcSub)
	mock := setupOIDCLoopbackMock(t, oidcSub, "a08@example.com")

	// 1. Self-unbind Google through the real handler.
	unbindRec := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	require.Equal(t, true, decodeEnvelope(t, unbindRec)["success"],
		"self-unbind must succeed; Google was the only login method until OIDC remained: %s", unbindRec.Body.String())
	assert.Empty(t, findGoogleClaims(t, model.DB), "claim must be cleared")
	assert.Empty(t, reloadUnbindUser(t, model.DB, user.Id).GoogleSub, "mirror must be cleared")

	// 2. Generate a real OIDC login state via the real GenerateOAuthCode.
	stateRec := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRec)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"oidc","intent":"login"}`))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx)
	require.Equal(t, http.StatusOK, stateRec.Code)
	var stateEnvelope struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(stateRec.Body.Bytes(), &stateEnvelope))
	require.True(t, stateEnvelope.Success, "GenerateOAuthCode must succeed")
	require.NotEmpty(t, stateEnvelope.Data.FlowToken, "state must be returned")

	// 3. Drive the real HandleOAuth callback for the OIDC provider.
	cbRouter := gin.New()
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		"/api/oauth/oidc?state="+stateEnvelope.Data.FlowToken+"&code=loopback-code", nil)
	cbReq.Header.Set("Accept", "application/json")
	cbRec := httptest.NewRecorder()
	cbRouter.ServeHTTP(cbRec, cbReq)
	require.Equal(t, http.StatusOK, cbRec.Code)
	var cbEnvelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(cbRec.Body.Bytes(), &cbEnvelope))
	require.True(t, cbEnvelope.Success, "OIDC callback must succeed, body=%s", cbRec.Body.String())
	require.NotEmpty(t, cbEnvelope.Data.AccessToken,
		"OIDC callback must issue an access_token (session bundle)")

	// 4. Loopback OIDC mock observed exactly one token + one userinfo.
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.tokenHits),
		"loopback OIDC TokenEndpoint must be called exactly once")
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.userInfoHits),
		"loopback OIDC UserInfoEndpoint must be called exactly once")

	// 5. No handler error was recorded by the loopback mock.
	mock.mu.Lock()
	mockErr := mock.lastErr
	mock.mu.Unlock()
	require.NoError(t, mockErr, "loopback OIDC mock must not have recorded a handler error")

	// 6. A real UserSession row exists for the user.
	var sessions []model.UserSession
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&sessions).Error)
	require.Len(t, sessions, 1, "setupLogin must write exactly one UserSession row")

	// 7. The session token reaches the real UserAuth middleware and the real
	//    GetSelf protected endpoint responds 2xx with the seeded user id.
	router := gin.New()
	router.GET("/api/user/self", middleware.UserAuth(), GetSelf)
	authReq := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	authReq.Header.Set("Authorization", "Bearer "+cbEnvelope.Data.AccessToken)
	authRec := httptest.NewRecorder()
	router.ServeHTTP(authRec, authReq)
	require.Equal(t, http.StatusOK, authRec.Code,
		"the OIDC re-login session must reach the real GetSelf protected API, body=%s", authRec.Body.String())
	var selfBody struct {
		Success bool `json:"success"`
		Data    struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(authRec.Body.Bytes(), &selfBody))
	require.True(t, selfBody.Success, "GetSelf must succeed")
	assert.Equal(t, user.Id, selfBody.Data.ID, "the real protected API must resolve the seeded user")

	// 8. Outbound network egress is fail-closed: the loopback mock received
	//    the access token it issued.
	mock.mu.Lock()
	gotAuthHeader := mock.lastAuthHeader
	mock.mu.Unlock()
	assert.Equal(t, "Bearer loopback-oidc-access-token", gotAuthHeader,
		"the loopback IdP must have received the access token issued by itself")
}

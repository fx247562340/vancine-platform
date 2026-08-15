package controller

import (
	"context"
	"crypto/elliptic"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	redis "github.com/go-redis/redis/v8"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// setupGoogleUnbindTest isolates the Google unbind tests on a file-backed
// SQLite database shared by every pooled connection, so deterministic
// trigger-based failure seams behave identically on whichever connection the
// middleware/handler path uses.
func setupGoogleUnbindTest(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousDBType := common.MainDatabaseType()
	previousCryptoSecret := common.CryptoSecret
	previousPasswordLogin := common.PasswordLoginEnabled
	previousGitHubEnabled := common.GitHubOAuthEnabled
	previousOptionMap := common.OptionMap
	previousRedisEnabled := common.RedisEnabled
	previousRDB := common.RDB
	previousPasskeyEnabled := system_setting.GetPasskeySettings().Enabled

	db, err := gorm.Open(sqlite.Open(concurrentGoogleDSN(t)), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.ExternalIdentityClaim{},
		&model.PasskeyCredential{},
		&model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
		&model.Log{},
		&model.UserSession{},
		&model.TwoFA{},
		&model.TwoFABackupCode{},
		&model.AuthFlow{},
	))

	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.CryptoSecret = "google-unbind-controller-test-secret"
	common.PasswordLoginEnabled = true
	common.GitHubOAuthEnabled = false
	common.OptionMap = map[string]string{}
	common.RedisEnabled = false
	system_setting.GetPasskeySettings().Enabled = false

	t.Cleanup(func() {
		// Explicit dependency order: tests that trigger the asynchronous gopool
		// admin fallback audit waited on auditWriteBarrier before finishing,
		// and the barrier's own cleanup (registered later) has already
		// removed the logs callback. Now close the pool with asserted
		// results, then restore every global exactly as found; t.TempDir
		// removes the database directory last.
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousDBType)
		common.CryptoSecret = previousCryptoSecret
		common.PasswordLoginEnabled = previousPasswordLogin
		common.GitHubOAuthEnabled = previousGitHubEnabled
		common.OptionMap = previousOptionMap
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRDB
		system_setting.GetPasskeySettings().Enabled = previousPasskeyEnabled
	})
	return db
}

// auditWriteBarrier lets the test goroutine deterministically wait for the
// asynchronous gopool admin fallback audit to land before teardown: a GORM
// after-create callback on the logs table signals once per created row. The
// callback itself runs on the pool goroutine and never touches testing.T.
func auditWriteBarrier(t *testing.T, db *gorm.DB) <-chan struct{} {
	t.Helper()
	signals := make(chan struct{}, 8)
	const callbackName = "test:google_unbind_audit_barrier"
	require.NoError(t, db.Callback().Create().After("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "logs" {
			select {
			case signals <- struct{}{}:
			default:
			}
		}
	}))
	t.Cleanup(func() {
		require.NoError(t, db.Callback().Create().Remove(callbackName))
	})
	return signals
}

// waitAuditSignal blocks until the barrier observes a logs-table create; the
// timeout is only a hang guard, never a synchronization mechanism.
func waitAuditSignal(t *testing.T, signals <-chan struct{}) {
	t.Helper()
	select {
	case <-signals:
	case <-time.After(10 * time.Second):
		require.Fail(t, "the asynchronous admin fallback audit did not complete")
	}
}

// validCOSEPublicKeyBase64 builds a genuinely parseable WebAuthn COSE_Key:
// an EC2/P-256 public key at the curve generator point, in the exact
// base64.StdEncoding format the passkey flow persists.
func validCOSEPublicKeyBase64(t *testing.T) string {
	t.Helper()
	params := elliptic.P256().Params()
	x := params.Gx.FillBytes(make([]byte, 32))
	y := params.Gy.FillBytes(make([]byte, 32))
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
	_, err = webauthncose.ParsePublicKey(decoded)
	require.NoError(t, err, "the fixture must be a real parseable COSE key")
	return encoded
}

// createValidCustomOAuthProvider establishes a custom provider through the
// production validation path (complete endpoints and client id), never by raw
// inserting an incomplete row.
func createValidCustomOAuthProvider(t *testing.T, slug string, enabled bool) *model.CustomOAuthProvider {
	t.Helper()
	provider := &model.CustomOAuthProvider{
		Name:                  "Valid SSO " + slug,
		Slug:                  slug,
		Enabled:               enabled,
		ClientId:              "client-" + slug,
		ClientSecret:          "secret-" + slug,
		AuthorizationEndpoint: "https://sso.example.com/authorize",
		TokenEndpoint:         "https://sso.example.com/token",
		UserInfoEndpoint:      "https://sso.example.com/userinfo",
	}
	require.NoError(t, model.CreateCustomOAuthProvider(provider))
	return provider
}

// registerCustomProviderInRuntime registers a persisted provider through the
// production registry seam and unregisters exactly that test slug on
// cleanup, so the global OAuth registry is restored precisely. The slug must
// be free before registration: this helper never overwrites an existing
// provider.
func registerCustomProviderInRuntime(t *testing.T, provider *model.CustomOAuthProvider) {
	t.Helper()
	require.Nil(t, oauth.GetProvider(provider.Slug),
		"test slug %q must be free before registration", provider.Slug)
	oauth.RegisterOrUpdateCustomProvider(provider)
	t.Cleanup(func() {
		oauth.UnregisterCustomProvider(provider.Slug)
	})
}

// requireOAuthEntryDiscoverable proves the provider is discoverable through
// the real production OAuth entry (POST /api/oauth/state login intent), not
// merely present in a map.
func requireOAuthEntryDiscoverable(t *testing.T, providerSlug string) {
	t.Helper()
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"`+providerSlug+`","intent":"login"}`), 0, "")
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeOAuthResponse(t, recorder)
	require.True(t, response.Success,
		"the production OAuth entry must discover provider %q: %s", providerSlug, recorder.Body.String())
}

// createCustomBindingForUser creates the user binding through the production
// transactional seam.
func createCustomBindingForUser(t *testing.T, db *gorm.DB, userId, providerId int, providerUserId string) {
	t.Helper()
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return model.CreateUserOAuthBindingWithTx(tx, &model.UserOAuthBinding{
			UserId:         userId,
			ProviderId:     providerId,
			ProviderUserId: providerUserId,
		})
	}))
}

// breakRedisForTest stages a deterministic cache outage without touching any
// real network: an in-memory miniredis server is started, the client is
// verified against it, and only then is the server closed. The client close
// is registered immediately after creation so the client cannot leak even if
// a later step fails; globals are restored before the close (LIFO).
func breakRedisForTest(t *testing.T) {
	t.Helper()
	server, err := miniredis.Run()
	require.NoError(t, err)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		require.NoError(t, client.Close())
	})
	require.NoError(t, client.Ping(context.Background()).Err(),
		"the cache client must be verified before the failure is staged")
	server.Close()
	previousEnabled := common.RedisEnabled
	previousRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		common.RedisEnabled = previousEnabled
		common.RDB = previousRDB
	})
}

// createGoogleUnbindUser creates an enabled user authenticated through the
// real middleware via its AccessToken. The password column deliberately holds
// a value that is not a valid password hash, so it never counts as an
// alternative login method by accident.
func createGoogleUnbindUser(t *testing.T, db *gorm.DB, username string, role int) (*model.User, string) {
	t.Helper()
	token := common.GetRandomString(32)
	user := &model.User{
		Username:    username,
		Password:    "not-a-password-hash",
		Role:        role,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     username,
		AuthVersion: 1,
		AccessToken: &token,
	}
	require.NoError(t, db.Create(user).Error)
	return user, token
}

// bindGoogleForUnbindUser establishes the Google binding through the
// production durable bind path (claim + mirror in one transaction).
func bindGoogleForUnbindUser(t *testing.T, db *gorm.DB, userId int, subject string) {
	t.Helper()
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, subject, userId)
	}))
}

func googleSelfUnbindRouter() *gin.Engine {
	r := gin.New()
	r.DELETE("/api/user/self/bindings/google", middleware.UserAuth(), UnbindGoogleSelf)
	return r
}

func doGoogleSelfUnbind(r *gin.Engine, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodDelete, "/api/user/self/bindings/google", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func adminBindingRouter() *gin.Engine {
	r := gin.New()
	r.DELETE("/api/user/:id/bindings/:binding_type", middleware.AdminAuth(), AdminClearUserBinding)
	return r
}

func customProviderUpdateRouter() *gin.Engine {
	r := gin.New()
	r.PUT("/api/custom-oauth-provider/:id", middleware.RootAuth(), UpdateCustomOAuthProvider)
	return r
}

func doCustomProviderDisable(r *gin.Engine, providerId int, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPut,
		fmt.Sprintf("/api/custom-oauth-provider/%d", providerId),
		strings.NewReader(`{"enabled":false}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func doAdminClearBinding(r *gin.Engine, targetId int, bindingType, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/user/%d/bindings/%s", targetId, bindingType), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func findGoogleClaims(t *testing.T, db *gorm.DB) []model.ExternalIdentityClaim {
	t.Helper()
	var claims []model.ExternalIdentityClaim
	require.NoError(t, db.Where("provider = ?", model.ExternalIdentityProviderGoogle).Find(&claims).Error)
	return claims
}

func reloadUnbindUser(t *testing.T, db *gorm.DB, userId int) model.User {
	t.Helper()
	var stored model.User
	require.NoError(t, db.First(&stored, userId).Error)
	return stored
}

// assertGoogleBindingIntact asserts claim and mirror are exactly as before a
// rejected unbind attempt.
func assertGoogleBindingIntact(t *testing.T, db *gorm.DB, userId int, subject string) {
	t.Helper()
	claims := findGoogleClaims(t, db)
	require.Len(t, claims, 1)
	assert.Equal(t, subject, claims[0].Subject)
	assert.Equal(t, userId, claims[0].UserId)
	assert.Equal(t, subject, reloadUnbindUser(t, db, userId).GoogleSub)
}

// TestGoogleUnbindSelfRejectedWhenGoogleIsOnlyLogin protects the lockout
// rule: a user whose only login method is Google must be refused, with claim
// and mirror untouched. Also covers the unauthenticated contract.
func TestGoogleUnbindSelfRejectedWhenGoogleIsOnlyLogin(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "google-only-user", common.RoleCommonUser)
	bindGoogleForUnbindUser(t, db, user.Id, "google-only-sub")
	r := googleSelfUnbindRouter()

	// Unauthenticated requests never reach the handler.
	anonymous := doGoogleSelfUnbind(r, "")
	assert.Equal(t, http.StatusUnauthorized, anonymous.Code)

	recorder := doGoogleSelfUnbind(r, token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"], "self-unbind must be refused without an alternative login method")
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
	assertGoogleBindingIntact(t, db, user.Id, "google-only-sub")
}

// TestGoogleUnbindSelfWithUsablePassword proves a real bcrypt password counts
// as an alternative: the unbind succeeds, claim and mirror are cleared
// together, and the retained password still completes a real password login.
func TestGoogleUnbindSelfWithUsablePassword(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "password-alt-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("correct-horse-battery")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "password-alt-sub")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	require.Equal(t, true, response["success"], recorder.Body.String())

	assert.Empty(t, findGoogleClaims(t, db), "the durable claim must be deleted")
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub, "the mirror must be cleared")

	// The retained password must still log in through the real login API.
	loginRouter := gin.New()
	loginRouter.POST("/api/user/login", Login)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/user/login",
		strings.NewReader(`{"username":"password-alt-user","password":"correct-horse-battery"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRecorder := httptest.NewRecorder()
	loginRouter.ServeHTTP(loginRecorder, loginReq)
	loginResponse := decodeEnvelope(t, loginRecorder)
	assert.Equal(t, true, loginResponse["success"],
		"the retained password must complete a real login: %s", loginRecorder.Body.String())
}

// TestGoogleUnbindSelfWithValidPasskey proves a live, decodable passkey
// credential counts while the passkey feature is enabled.
func TestGoogleUnbindSelfWithValidPasskey(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	system_setting.GetPasskeySettings().Enabled = true
	user, token := createGoogleUnbindUser(t, db, "passkey-alt-user", common.RoleCommonUser)
	credential := model.PasskeyCredential{
		UserID:       user.Id,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("passkey-credential-id")),
		PublicKey:    validCOSEPublicKeyBase64(t),
	}
	require.NoError(t, db.Create(&credential).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "passkey-alt-sub")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	require.Equal(t, true, response["success"], recorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
}

// TestGoogleUnbindSelfRejectsWhenPasskeyFeatureDisabled proves the same valid
// credential stops counting once the passkey feature is switched off.
func TestGoogleUnbindSelfRejectsWhenPasskeyFeatureDisabled(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	system_setting.GetPasskeySettings().Enabled = false
	user, token := createGoogleUnbindUser(t, db, "passkey-disabled-user", common.RoleCommonUser)
	credential := model.PasskeyCredential{
		UserID:       user.Id,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("passkey-credential-id")),
		PublicKey:    validCOSEPublicKeyBase64(t),
	}
	require.NoError(t, db.Create(&credential).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "passkey-disabled-sub")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"], "a passkey must not count while the feature is disabled")
	assertGoogleBindingIntact(t, db, user.Id, "passkey-disabled-sub")
}

// TestGoogleUnbindSelfWithEnabledBuiltInOAuth proves an enabled built-in
// provider (GitHub) with a non-blank binding counts as an alternative.
func TestGoogleUnbindSelfWithEnabledBuiltInOAuth(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	common.GitHubOAuthEnabled = true
	user, token := createGoogleUnbindUser(t, db, "github-alt-user", common.RoleCommonUser)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("github_id", "github-12345").Error)
	bindGoogleForUnbindUser(t, db, user.Id, "github-alt-sub")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	require.Equal(t, true, response["success"], recorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
}

// TestGoogleUnbindSelfWithEnabledCustomOAuth proves a persisted enabled
// custom provider plus a valid user_oauth_bindings row count as an
// alternative.
func TestGoogleUnbindSelfWithEnabledCustomOAuth(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "custom-alt-user", common.RoleCommonUser)
	provider := createValidCustomOAuthProvider(t, "acme-sso", true)
	registerCustomProviderInRuntime(t, provider)
	createCustomBindingForUser(t, db, user.Id, provider.Id, "acme-user-1")
	bindGoogleForUnbindUser(t, db, user.Id, "custom-alt-sub")

	// The provider must be discoverable through the real production OAuth
	// entry, proving the fixture is a genuinely login-capable custom OAuth.
	requireOAuthEntryDiscoverable(t, provider.Slug)

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	require.Equal(t, true, response["success"], recorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
}

// TestGoogleUnbindSelfRejectsCustomProviderMissingFromRuntimeRegistry proves
// the runtime half of the intersection: a provider that is enabled in the
// database with a valid binding but NOT registered in the live OAuth
// registry cannot complete a login, so it must not count as an alternative.
func TestGoogleUnbindSelfRejectsCustomProviderMissingFromRuntimeRegistry(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "custom-unregistered-user", common.RoleCommonUser)
	provider := createValidCustomOAuthProvider(t, "unregistered-sso", true)
	// Deliberately NOT registered in the runtime OAuth registry.
	createCustomBindingForUser(t, db, user.Id, provider.Id, "unregistered-user-1")
	bindGoogleForUnbindUser(t, db, user.Id, "custom-unregistered-sub")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"],
		"a provider missing from the runtime registry must not count as an alternative")
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
	assertGoogleBindingIntact(t, db, user.Id, "custom-unregistered-sub")
}

// TestGoogleUnbindSelfRejectsCustomProviderDisabledInDB proves the persisted
// half of the intersection with a genuine split state: the provider is
// registered and ENABLED in the runtime registry (so the controller policy
// includes its id), while an independent DB update disables only the
// persisted row — the config pointer held by the registry is never touched.
func TestGoogleUnbindSelfRejectsCustomProviderDisabledInDB(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "custom-dbdisabled-user", common.RoleCommonUser)
	provider := createValidCustomOAuthProvider(t, "dbdisabled-sso", true)
	registerCustomProviderInRuntime(t, provider)
	runtimeProvider, ok := oauth.GetProvider(provider.Slug).(*oauth.GenericOAuthProvider)
	require.True(t, ok)
	require.True(t, runtimeProvider.IsEnabled(), "the runtime provider must start enabled")
	createCustomBindingForUser(t, db, user.Id, provider.Id, "dbdisabled-user-1")
	bindGoogleForUnbindUser(t, db, user.Id, "custom-dbdisabled-sub")

	// Disable only the persisted row through an independent DB update; the
	// registry holds the original config pointer, which stays enabled.
	require.NoError(t, db.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).Update("enabled", false).Error)
	var storedProvider model.CustomOAuthProvider
	require.NoError(t, db.First(&storedProvider, provider.Id).Error)
	assert.False(t, storedProvider.Enabled, "the persisted provider must be disabled")
	assert.True(t, runtimeProvider.IsEnabled(), "the runtime registry entry must stay enabled")

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"],
		"a provider disabled in the database must not count as an alternative")
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
	assertGoogleBindingIntact(t, db, user.Id, "custom-dbdisabled-sub")
}

// TestGoogleUnbindSelfRejectsEmailSessionAccessTokenOnly proves email, a real
// login session and an API access token never count as independent login
// methods (all three present at once). The request itself authenticates
// through the genuine session credential produced by the production
// login-session path.
func TestGoogleUnbindSelfRejectsEmailSessionAccessTokenOnly(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, patToken := createGoogleUnbindUser(t, db, "email-token-only-user", common.RoleCommonUser)
	require.NotEmpty(t, patToken, "the user keeps an API access token as a third non-qualifying credential")
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).
		Update("email", "only-email@example.com").Error)
	bindGoogleForUnbindUser(t, db, user.Id, "email-token-only-sub")

	bundle, err := service.CreateLoginSession(user.Id, "test-login", "127.0.0.1", "test-agent")
	require.NoError(t, err)
	require.NotEmpty(t, bundle.AccessToken)

	// The request authenticates with the real session credential (not the
	// PAT); the session still must not count as an alternative login method.
	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), bundle.AccessToken)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"], "email/session/access token must not count as alternatives")
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
	assertGoogleBindingIntact(t, db, user.Id, "email-token-only-sub")
}

// TestGoogleUnbindSelfRejectsInvalidAlternatives covers the invalid-credential
// matrix: every candidate alternative fails closed and the Google binding
// stays intact.
func TestGoogleUnbindSelfRejectsInvalidAlternatives(t *testing.T) {
	cases := []struct {
		name    string
		prepare func(t *testing.T, db *gorm.DB, user *model.User)
	}{
		{
			name: "disabled built-in provider with binding",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				common.GitHubOAuthEnabled = false
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("github_id", "github-999").Error)
			},
		},
		{
			name: "disabled custom provider with binding",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				provider := createValidCustomOAuthProvider(t, "disabled-sso", false)
				registerCustomProviderInRuntime(t, provider)
				createCustomBindingForUser(t, db, user.Id, provider.Id, "disabled-user-1")
			},
		},
		{
			name: "missing custom provider",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				require.NoError(t, db.Create(&model.UserOAuthBinding{
					UserId: user.Id, ProviderId: 999999, ProviderUserId: "ghost-user-1",
				}).Error)
			},
		},
		{
			name: "blank custom provider user id",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				provider := createValidCustomOAuthProvider(t, "blank-sso", true)
				registerCustomProviderInRuntime(t, provider)
				createCustomBindingForUser(t, db, user.Id, provider.Id, "   ")
			},
		},
		{
			name: "soft-deleted passkey",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				system_setting.GetPasskeySettings().Enabled = true
				credential := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("deleted-credential")),
					PublicKey:    validCOSEPublicKeyBase64(t),
				}
				require.NoError(t, db.Create(&credential).Error)
				require.NoError(t, db.Delete(&credential).Error)
			},
		},
		{
			name: "invalid COSE public key in valid base64",
			prepare: func(t *testing.T, db *gorm.DB, user *model.User) {
				system_setting.GetPasskeySettings().Enabled = true
				credential := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("corrupted-credential")),
					PublicKey:    base64.StdEncoding.EncodeToString([]byte("not-a-cose-public-key")),
				}
				require.NoError(t, db.Create(&credential).Error)
			},
		},
	}

	for index, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := setupGoogleUnbindTest(t)
			username := fmt.Sprintf("invalid-alt-%d", index)
			user, token := createGoogleUnbindUser(t, db, username, common.RoleCommonUser)
			subject := username + "-sub"
			tc.prepare(t, db, user)
			bindGoogleForUnbindUser(t, db, user.Id, subject)

			recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
			response := decodeEnvelope(t, recorder)
			assert.Equal(t, false, response["success"], "invalid alternative %q must not unblock the unbind", tc.name)
			assertGoogleBindingIntact(t, db, user.Id, subject)
		})
	}
}

// TestGoogleUnbindSelfRejectsWhenNotBound covers a self-unbind request for a
// user without any durable Google claim.
func TestGoogleUnbindSelfRejectsWhenNotBound(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "not-bound-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("some-strong-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"])
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleNotBound), response["message"])
	assert.Empty(t, findGoogleClaims(t, db))
}

// TestGoogleRebindAfterSelfUnbind proves the released subject is genuinely
// free again: after a successful self-unbind the real Google bind callback
// re-establishes a consistent claim and mirror.
func TestGoogleRebindAfterSelfUnbind(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	db := env.db

	passwordHash, err := common.Password2Hash("rebind-strong-password")
	require.NoError(t, err)
	user := createGoogleOAuthTestUser(t, db, "rebind-user")
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	accessToken := common.GetRandomString(32)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("access_token", accessToken).Error)

	bindGoogleForUnbindUser(t, db, user.Id, env.userInfoSub)

	unbindRecorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), accessToken)
	require.Equal(t, true, decodeEnvelope(t, unbindRecorder)["success"], unbindRecorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)

	// Rebind the same subject through the real unified callback.
	state := startGoogleBindFlow(t, user, "session-rebind")
	rebindRecorder := serveOAuthCallback("google",
		"state="+state+"&code=mock-code", user.Id, "session-rebind")
	require.Equal(t, true, decodeOAuthResponse(t, rebindRecorder).Success, rebindRecorder.Body.String())

	claims := findGoogleClaims(t, db)
	require.Len(t, claims, 1)
	assert.Equal(t, env.userInfoSub, claims[0].Subject)
	assert.Equal(t, user.Id, claims[0].UserId)
	assert.Equal(t, env.userInfoSub, reloadUnbindUser(t, db, user.Id).GoogleSub)
}

// TestAdminClearGoogleBindingBypassesSelfLockout proves the admin recovery
// path: an administrator clears the last (and only) Google login method,
// claim and mirror disappear together, and the management audit carries the
// right operator/target/binding fields without sensitive values.
func TestAdminClearGoogleBindingBypassesSelfLockout(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	admin, adminToken := createGoogleUnbindUser(t, db, "admin-clearer", common.RoleAdminUser)
	target, _ := createGoogleUnbindUser(t, db, "admin-target", common.RoleCommonUser)
	bindGoogleForUnbindUser(t, db, target.Id, "admin-clear-sub")

	recorder := doAdminClearBinding(adminBindingRouter(), target.Id, "google", adminToken)
	response := decodeEnvelope(t, recorder)
	require.Equal(t, true, response["success"], recorder.Body.String())

	assert.Empty(t, findGoogleClaims(t, db), "the claim must be cleared")
	assert.Empty(t, reloadUnbindUser(t, db, target.Id).GoogleSub, "the mirror must be cleared")

	// Audit: operator-attributed user.binding_clear with target context.
	var logs []model.Log
	require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&logs).Error)
	var auditLogs []model.Log
	for _, log := range logs {
		if strings.Contains(log.Other, "user.binding_clear") {
			auditLogs = append(auditLogs, log)
		}
	}
	require.Len(t, auditLogs, 1, "exactly one binding_clear audit record expected")
	audit := auditLogs[0]
	assert.Equal(t, admin.Id, audit.UserId, "the audit must be attributed to the operator")

	var other struct {
		Op struct {
			Action string                 `json:"action"`
			Params map[string]interface{} `json:"params"`
		} `json:"op"`
		AdminInfo struct {
			AdminId       int    `json:"admin_id"`
			AdminUsername string `json:"admin_username"`
		} `json:"admin_info"`
	}
	require.NoError(t, common.UnmarshalJsonStr(audit.Other, &other))
	assert.Equal(t, "user.binding_clear", other.Op.Action)
	assert.Equal(t, "google", other.Op.Params["bindingType"])
	assert.Equal(t, "admin-target", other.Op.Params["username"])
	assert.EqualValues(t, target.Id, other.Op.Params["target_user_id"])
	assert.Equal(t, admin.Id, other.AdminInfo.AdminId)
	assert.Equal(t, "admin-clearer", other.AdminInfo.AdminUsername)

	// No sensitive values: neither the Google subject nor the operator's real
	// access token credential may appear in the audit.
	assert.NotContains(t, audit.Other, "admin-clear-sub")
	assert.NotContains(t, audit.Content, "admin-clear-sub")
	assert.NotContains(t, audit.Other, adminToken)
}

// TestAdminClearGoogleBindingRejectsInsufficientRole proves a lower-role
// admin cannot clear a higher-role user's binding and that no successful
// binding_clear audit is produced for the refused attempt.
func TestAdminClearGoogleBindingRejectsInsufficientRole(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	_, adminToken := createGoogleUnbindUser(t, db, "admin-low-role", common.RoleAdminUser)
	target, _ := createGoogleUnbindUser(t, db, "root-target", common.RoleRootUser)
	bindGoogleForUnbindUser(t, db, target.Id, "insufficient-role-sub")

	// The refused admin attempt triggers the asynchronous gopool fallback
	// audit; wait for it deterministically so teardown never races it.
	signals := auditWriteBarrier(t, db)

	recorder := doAdminClearBinding(adminBindingRouter(), target.Id, "google", adminToken)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"], "an admin must not clear a root user's binding")
	assertGoogleBindingIntact(t, db, target.Id, "insufficient-role-sub")

	waitAuditSignal(t, signals)

	var logs []model.Log
	require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&logs).Error)
	require.NotEmpty(t, logs, "the asynchronous fallback audit must have landed")
	for _, log := range logs {
		assert.NotContains(t, log.Other, "user.binding_clear",
			"a refused admin clear must not produce a binding_clear audit")
	}
}

// TestGoogleUnbindSelfRollsBackWhenClaimDeleteAborts forces a database
// failure at the claim DELETE stage; the mirror must remain untouched and the
// claim must survive. The trigger is dropped with an explicit assertion.
func TestGoogleUnbindSelfRollsBackWhenClaimDeleteAborts(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "claim-abort-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("claim-abort-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "claim-abort-sub")

	const triggerName = "fail_google_claim_delete"
	require.NoError(t, db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE DELETE ON external_identity_claims"+
		" BEGIN SELECT RAISE(ABORT, 'forced claim delete failure'); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	assert.Equal(t, false, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
	assertGoogleBindingIntact(t, db, user.Id, "claim-abort-sub")
}

// TestGoogleUnbindSelfRollsBackWhenMirrorUpdateAborts forces a database
// failure at the google_sub UPDATE stage after the claim DELETE already ran
// inside the same transaction; the claim delete must roll back.
func TestGoogleUnbindSelfRollsBackWhenMirrorUpdateAborts(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "mirror-abort-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("mirror-abort-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "mirror-abort-sub")

	const triggerName = "fail_google_sub_unbind_update"
	require.NoError(t, db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" BEGIN SELECT RAISE(ABORT, 'forced mirror failure'); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	assert.Equal(t, false, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
	assertGoogleBindingIntact(t, db, user.Id, "mirror-abort-sub")
}

// TestGoogleUnbindSelfSilentZeroHitRollsBack protects the silent zero-hit
// semantics (RAISE(IGNORE): no error, zero rows): the persisted read-back
// must detect the uncleaned mirror and roll the claim delete back instead of
// committing a claim-less mirror or a claim-only state.
func TestGoogleUnbindSelfSilentZeroHitRollsBack(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "mirror-zerohit-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("mirror-zerohit-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "mirror-zerohit-sub")

	const triggerName = "skip_google_sub_unbind_update"
	require.NoError(t, db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"],
		"a silently skipped mirror update must fail the unbind")
	assertGoogleBindingIntact(t, db, user.Id, "mirror-zerohit-sub")
}

// TestGoogleUnbindSelfRejectsWhenPasswordLoginDisabled proves a bcrypt
// password only counts while password login is actually enabled: with the
// switch off the real password login fails, and the Google self-unbind must
// be refused with the binding untouched.
func TestGoogleUnbindSelfRejectsWhenPasswordLoginDisabled(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	common.PasswordLoginEnabled = false
	user, token := createGoogleUnbindUser(t, db, "password-switch-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("password-switch-secret")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "password-switch-sub")

	// Prove the switch is real: the correct password no longer logs in.
	loginRouter := gin.New()
	loginRouter.POST("/api/user/login", Login)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/user/login",
		strings.NewReader(`{"username":"password-switch-user","password":"password-switch-secret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRecorder := httptest.NewRecorder()
	loginRouter.ServeHTTP(loginRecorder, loginReq)
	assert.Equal(t, false, decodeEnvelope(t, loginRecorder)["success"],
		"password login must fail while the switch is off")

	// Therefore the same password must not unlock the Google unbind.
	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, false, response["success"],
		"a valid bcrypt hash must not count while password login is disabled")
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
	assertGoogleBindingIntact(t, db, user.Id, "password-switch-sub")
}

// TestGoogleUnbindSelfSucceedsWhenCacheUnavailable protects the committed
// outcome of the self path: with the user cache backend deterministically
// down, a committed unbind must still be reported as success and the
// persisted state must be cleared.
func TestGoogleUnbindSelfSucceedsWhenCacheUnavailable(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "cache-down-self-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("cache-down-self-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "cache-down-self-sub")

	breakRedisForTest(t)

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, true, response["success"],
		"a committed unbind must not be reported as failed by a cache outage: %s", recorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
}

// TestAdminClearGoogleWritesAuditWhenCacheUnavailable protects the admin
// committed outcome: with the cache backend down, a committed clear must be
// reported as success and the mandatory user.binding_clear audit must still
// be written.
func TestAdminClearGoogleWritesAuditWhenCacheUnavailable(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	admin, adminToken := createGoogleUnbindUser(t, db, "cache-down-admin", common.RoleAdminUser)
	target, _ := createGoogleUnbindUser(t, db, "cache-down-target", common.RoleCommonUser)
	bindGoogleForUnbindUser(t, db, target.Id, "cache-down-admin-sub")

	breakRedisForTest(t)

	recorder := doAdminClearBinding(adminBindingRouter(), target.Id, "google", adminToken)
	response := decodeEnvelope(t, recorder)
	assert.Equal(t, true, response["success"],
		"a committed admin clear must not be reported as failed by a cache outage: %s", recorder.Body.String())
	assert.Empty(t, findGoogleClaims(t, db))
	assert.Empty(t, reloadUnbindUser(t, db, target.Id).GoogleSub)

	var logs []model.Log
	require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&logs).Error)
	var auditLogs []model.Log
	for _, log := range logs {
		if strings.Contains(log.Other, "user.binding_clear") {
			auditLogs = append(auditLogs, log)
		}
	}
	require.Len(t, auditLogs, 1, "the committed admin clear must always write its audit")
	assert.Equal(t, admin.Id, auditLogs[0].UserId)
}

// TestGoogleUnbindSelfSilentClaimDeleteZeroHitRollsBack protects the claim
// DELETE against silent zero-hit semantics (RAISE(IGNORE): no error, zero
// rows): the persisted read-back must detect the surviving claim and roll
// the mirror clear back, never leaving a mirror-only state.
func TestGoogleUnbindSelfSilentClaimDeleteZeroHitRollsBack(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "claim-zh-user", common.RoleCommonUser)
	passwordHash, err := common.Password2Hash("claim-zh-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "claim-zh-sub")

	const triggerName = "skip_google_claim_delete"
	require.NoError(t, db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE DELETE ON external_identity_claims"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	assert.Equal(t, false, decodeEnvelope(t, recorder)["success"],
		"a silently skipped claim delete must fail the unbind")
	assertGoogleBindingIntact(t, db, user.Id, "claim-zh-sub")
}

// TestGoogleUnbindVsPasskeyDeleteConcurrent races the self-unbind against a
// production passkey deletion (the model transaction the handler drives; the
// handler's security-proof ceremony is orthogonal to the lock-order
// invariant). The eligibility decision must correspond to one serializable
// order: the deletion always applies, and the unbind outcome must match the
// final state exactly — success implies Google was released, refusal implies
// Google stayed bound because the serialized snapshot had no alternative
// left. No claim/mirror half-state is acceptable.
func TestGoogleUnbindVsPasskeyDeleteConcurrent(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	system_setting.GetPasskeySettings().Enabled = true
	user, token := createGoogleUnbindUser(t, db, "race-passkey-user", common.RoleCommonUser)
	credential := model.PasskeyCredential{
		UserID:       user.Id,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("race-credential")),
		PublicKey:    validCOSEPublicKeyBase64(t),
	}
	require.NoError(t, db.Create(&credential).Error)
	bindGoogleForUnbindUser(t, db, user.Id, "race-passkey-sub")

	unbindRecorders := make([]*httptest.ResponseRecorder, 1)
	deleteErrs := make([]error, 1)
	runWithBarrier(
		func() {
			unbindRecorders[0] = doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
		},
		func() {
			deleteErrs[0] = model.DeletePasskeyByUserIDWithAuthVersion(user.Id)
		},
	)

	require.NotNil(t, unbindRecorders[0])
	require.NoError(t, deleteErrs[0])

	claims := findGoogleClaims(t, db)
	googleBound := len(claims) == 1
	if googleBound {
		assert.Equal(t, "race-passkey-sub", claims[0].Subject)
		assert.Equal(t, user.Id, claims[0].UserId)
		assert.Equal(t, "race-passkey-sub", reloadUnbindUser(t, db, user.Id).GoogleSub)
	} else {
		assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
	}
	unbindResponse := decodeEnvelope(t, unbindRecorders[0])
	assert.Equal(t, !googleBound, unbindResponse["success"],
		"the unbind outcome must match the serialized final state")
	if googleBound {
		assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), unbindResponse["message"],
			"a refused unbind must be refused for the missing alternative seen in the serialized snapshot")
	}
}

// TestGoogleUnbindVsCustomBindingDeleteConcurrent races the self-unbind
// against a production custom binding deletion. The deletion always applies;
// the unbind outcome must match the final state exactly and the claim/mirror
// pair must never end in a half-state.
func TestGoogleUnbindVsCustomBindingDeleteConcurrent(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "race-custom-user", common.RoleCommonUser)
	provider := createValidCustomOAuthProvider(t, "race-sso", true)
	createCustomBindingForUser(t, db, user.Id, provider.Id, "race-custom-user-1")
	bindGoogleForUnbindUser(t, db, user.Id, "race-custom-sub")

	unbindRecorders := make([]*httptest.ResponseRecorder, 1)
	deleteErrs := make([]error, 1)
	runWithBarrier(
		func() {
			unbindRecorders[0] = doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
		},
		func() {
			deleteErrs[0] = model.DeleteUserOAuthBinding(user.Id, provider.Id)
		},
	)

	require.NotNil(t, unbindRecorders[0])
	require.NoError(t, deleteErrs[0])

	claims := findGoogleClaims(t, db)
	googleBound := len(claims) == 1
	if googleBound {
		assert.Equal(t, "race-custom-sub", claims[0].Subject)
		assert.Equal(t, "race-custom-sub", reloadUnbindUser(t, db, user.Id).GoogleSub)
	} else {
		assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
	}
	var bindingCount int64
	require.NoError(t, db.Model(&model.UserOAuthBinding{}).
		Where("user_id = ? AND provider_id = ?", user.Id, provider.Id).Count(&bindingCount).Error)
	assert.Zero(t, bindingCount, "the competing deletion always applies in either serial order")
	unbindResponse := decodeEnvelope(t, unbindRecorders[0])
	assert.Equal(t, !googleBound, unbindResponse["success"],
		"the unbind outcome must match the serialized final state")
	if googleBound {
		assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), unbindResponse["message"],
			"a refused unbind must be refused for the missing alternative seen in the serialized snapshot")
	}
}

// TestGoogleUnbindVsCustomProviderDisableConcurrent races the self-unbind
// against the production provider disable path (the real RootAuth update
// handler, which persists the DB row AND re-registers the runtime OAuth
// registry entry). The disable always applies on both sides; the unbind
// outcome must match the final state exactly, proving the eligibility
// decision came from one serializable snapshot (a provider locked as enabled
// in DB and registry, or a provider already disabled).
func TestGoogleUnbindVsCustomProviderDisableConcurrent(t *testing.T) {
	db := setupGoogleUnbindTest(t)
	user, token := createGoogleUnbindUser(t, db, "race-disable-user", common.RoleCommonUser)
	root, rootToken := createGoogleUnbindUser(t, db, "race-disable-root", common.RoleRootUser)
	provider := createValidCustomOAuthProvider(t, "race-disable-sso", true)
	registerCustomProviderInRuntime(t, provider)
	createCustomBindingForUser(t, db, user.Id, provider.Id, "race-disable-user-1")
	bindGoogleForUnbindUser(t, db, user.Id, "race-disable-sub")

	// The RootAuth update handler writes an asynchronous gopool admin audit;
	// install the barrier before the race and wait on it after the join so
	// teardown never races the async write.
	signals := auditWriteBarrier(t, db)

	unbindRecorders := make([]*httptest.ResponseRecorder, 1)
	disableRecorders := make([]*httptest.ResponseRecorder, 1)
	runWithBarrier(
		func() {
			unbindRecorders[0] = doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
		},
		func() {
			disableRecorders[0] = doCustomProviderDisable(customProviderUpdateRouter(), provider.Id, rootToken)
		},
	)

	require.NotNil(t, unbindRecorders[0])
	require.NotNil(t, disableRecorders[0])
	assert.Equal(t, true, decodeEnvelope(t, disableRecorders[0])["success"],
		disableRecorders[0].Body.String())

	// Wait for the asynchronous admin audit to land, then verify its fields
	// before any teardown runs.
	waitAuditSignal(t, signals)
	var logs []model.Log
	require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&logs).Error)
	var auditLogs []model.Log
	for _, log := range logs {
		if strings.Contains(log.Other, "custom_oauth.update") {
			auditLogs = append(auditLogs, log)
		}
	}
	require.Len(t, auditLogs, 1, "exactly one custom_oauth.update audit record expected")
	audit := auditLogs[0]
	assert.Equal(t, root.Id, audit.UserId, "the audit must be attributed to the root operator")
	var other struct {
		Op struct {
			Action string `json:"action"`
		} `json:"op"`
		AdminInfo struct {
			AdminId int `json:"admin_id"`
		} `json:"admin_info"`
		AuditInfo struct {
			Success bool `json:"success"`
		} `json:"audit_info"`
	}
	require.NoError(t, common.UnmarshalJsonStr(audit.Other, &other))
	assert.Equal(t, "custom_oauth.update", other.Op.Action)
	assert.Equal(t, root.Id, other.AdminInfo.AdminId)
	assert.True(t, other.AuditInfo.Success)
	assert.NotContains(t, audit.Other, "secret-race-disable-sso",
		"the provider client secret must not appear in the audit")
	assert.NotContains(t, audit.Other, rootToken,
		"the operator token must not appear in the audit")

	claims := findGoogleClaims(t, db)
	googleBound := len(claims) == 1
	if googleBound {
		assert.Equal(t, "race-disable-sub", claims[0].Subject)
		assert.Equal(t, "race-disable-sub", reloadUnbindUser(t, db, user.Id).GoogleSub)
	} else {
		assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
	}
	// The competing disable always applies in either serial order, on both
	// sides of the production update path: the persisted DB row and the
	// runtime registry entry.
	var storedProvider model.CustomOAuthProvider
	require.NoError(t, db.First(&storedProvider, provider.Id).Error)
	assert.False(t, storedProvider.Enabled, "the DB row must be disabled")
	runtimeProvider, ok := oauth.GetProvider(provider.Slug).(*oauth.GenericOAuthProvider)
	require.True(t, ok, "the provider must stay registered")
	assert.False(t, runtimeProvider.IsEnabled(), "the runtime registry entry must be disabled")

	unbindResponse := decodeEnvelope(t, unbindRecorders[0])
	assert.Equal(t, !googleBound, unbindResponse["success"],
		"the unbind outcome must match the serialized final state")
	if googleBound {
		assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), unbindResponse["message"],
			"a refused unbind must be refused for the disabled provider seen in the serialized snapshot")
	}
}

// TestGoogleBindVsAdminClearConcurrentFinalState races a real Google bind
// callback against an administrator clear of the same user. The shared
// release primitive must serialize on the user row: the only acceptable
// final states are fully bound (claim and mirror identical) or fully empty.
// Any claim-only or mirror-only half-state fails the test.
func TestGoogleBindVsAdminClearConcurrentFinalState(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	db := env.db
	user := createGoogleOAuthTestUser(t, db, "race-bind-clear-user")
	_, adminToken := createGoogleUnbindUser(t, db, "race-bind-clear-admin", common.RoleAdminUser)

	env.userInfoSub = "race-bind-clear-sub"
	bindState := startGoogleBindFlow(t, user, "session-race")
	bindRecorders := make([]*httptest.ResponseRecorder, 1)
	clearRecorders := make([]*httptest.ResponseRecorder, 1)
	runWithBarrier(
		func() {
			bindRecorders[0] = serveOAuthCallback("google",
				"state="+bindState+"&code=mock-code", user.Id, "session-race")
		},
		func() {
			clearRecorders[0] = doAdminClearBinding(adminBindingRouter(), user.Id, "google", adminToken)
		},
	)

	require.NotNil(t, bindRecorders[0])
	require.NotNil(t, clearRecorders[0])
	assert.True(t, decodeOAuthResponse(t, bindRecorders[0]).Success, bindRecorders[0].Body.String())
	assert.Equal(t, true, decodeEnvelope(t, clearRecorders[0])["success"], clearRecorders[0].Body.String())

	claims := findGoogleClaims(t, db)
	mirror := reloadUnbindUser(t, db, user.Id).GoogleSub
	// claim count must be 0 or 1; >1 fails inside assertGoogleClaimFinalState.
	_ = assertGoogleClaimFinalState(t, user.Id, "race-bind-clear-sub", claims, mirror)
}

// TestGoogleUnbindLaunchProfileConfiguredDatabases is the thin MySQL/PostgreSQL
// entry for anti-lockout and unbind final-state launch-profile scenarios. It
// reuses setupGoogleOAuthTestOn (same package) so claim/mirror/passkey/custom
// OAuth tables share one remote fixture. SQLite-only trigger seams are not
// re-hosted. When TEST_*_DSN is unset the dialect is skipped.
func TestGoogleUnbindLaunchProfileConfiguredDatabases(t *testing.T) {
	for _, database := range configuredDatabaseTargets() {
		t.Run(database.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(database.env))
			if dsn == "" {
				t.Skip(database.env + " is not configured; skipping integration run")
			}
			dbType := database.dbType

			t.Run("selfRejectedWhenGoogleIsOnlyLogin", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, token := createGoogleUnbindUser(t, db, "google-only-user", common.RoleCommonUser)
				bindGoogleForUnbindUser(t, db, user.Id, "google-only-sub")
				r := googleSelfUnbindRouter()
				anonymous := doGoogleSelfUnbind(r, "")
				assert.Equal(t, http.StatusUnauthorized, anonymous.Code)
				recorder := doGoogleSelfUnbind(r, token)
				response := decodeEnvelope(t, recorder)
				assert.Equal(t, false, response["success"])
				assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
				assertGoogleBindingIntact(t, db, user.Id, "google-only-sub")
			})

			t.Run("selfWithUsablePassword", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, token := createGoogleUnbindUser(t, db, "password-alt-user", common.RoleCommonUser)
				passwordHash, err := common.Password2Hash("correct-horse-battery")
				require.NoError(t, err)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
				bindGoogleForUnbindUser(t, db, user.Id, "password-alt-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
				assert.Empty(t, findGoogleClaims(t, db))
				assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
				loginRouter := gin.New()
				loginRouter.POST("/api/user/login", Login)
				loginReq := httptest.NewRequest(http.MethodPost, "/api/user/login",
					strings.NewReader(`{"username":"password-alt-user","password":"correct-horse-battery"}`))
				loginReq.Header.Set("Content-Type", "application/json")
				loginRecorder := httptest.NewRecorder()
				loginRouter.ServeHTTP(loginRecorder, loginReq)
				assert.Equal(t, true, decodeEnvelope(t, loginRecorder)["success"], loginRecorder.Body.String())
			})

			t.Run("selfWithValidPasskey", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				system_setting.GetPasskeySettings().Enabled = true
				user, token := createGoogleUnbindUser(t, db, "passkey-alt-user", common.RoleCommonUser)
				credential := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("passkey-credential-id")),
					PublicKey:    validCOSEPublicKeyBase64(t),
				}
				require.NoError(t, db.Create(&credential).Error)
				bindGoogleForUnbindUser(t, db, user.Id, "passkey-alt-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
				assert.Empty(t, findGoogleClaims(t, db))
				assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
			})

			t.Run("selfRejectsDisabledPasskey", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				system_setting.GetPasskeySettings().Enabled = false
				user, token := createGoogleUnbindUser(t, db, "passkey-disabled-user", common.RoleCommonUser)
				credential := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("passkey-credential-id")),
					PublicKey:    validCOSEPublicKeyBase64(t),
				}
				require.NoError(t, db.Create(&credential).Error)
				bindGoogleForUnbindUser(t, db, user.Id, "passkey-disabled-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				assert.Equal(t, false, decodeEnvelope(t, recorder)["success"])
				assertGoogleBindingIntact(t, db, user.Id, "passkey-disabled-sub")
			})

			t.Run("selfRejectsBrokenPasskey", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				system_setting.GetPasskeySettings().Enabled = true
				user, token := createGoogleUnbindUser(t, db, "passkey-broken-user", common.RoleCommonUser)
				broken := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("corrupted-credential")),
					PublicKey:    base64.StdEncoding.EncodeToString([]byte("not-a-cose-public-key")),
				}
				require.NoError(t, db.Create(&broken).Error)
				bindGoogleForUnbindUser(t, db, user.Id, "passkey-broken-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				assert.Equal(t, false, decodeEnvelope(t, recorder)["success"])
				assertGoogleBindingIntact(t, db, user.Id, "passkey-broken-sub")
			})

			t.Run("selfWithEnabledBuiltInOAuth", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				common.GitHubOAuthEnabled = true
				user, token := createGoogleUnbindUser(t, db, "github-alt-user", common.RoleCommonUser)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("github_id", "github-12345").Error)
				bindGoogleForUnbindUser(t, db, user.Id, "github-alt-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
				assert.Empty(t, findGoogleClaims(t, db))
				assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
			})

			t.Run("selfWithEnabledCustomOAuthDBAndRuntime", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, token := createGoogleUnbindUser(t, db, "custom-alt-user", common.RoleCommonUser)
				provider := createValidCustomOAuthProvider(t, "acme-sso", true)
				registerCustomProviderInRuntime(t, provider)
				createCustomBindingForUser(t, db, user.Id, provider.Id, "acme-user-1")
				bindGoogleForUnbindUser(t, db, user.Id, "custom-alt-sub")
				requireOAuthEntryDiscoverable(t, provider.Slug)
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
				assert.Empty(t, findGoogleClaims(t, db))
				assert.Empty(t, reloadUnbindUser(t, db, user.Id).GoogleSub)
			})

			t.Run("selfRejectsEmailSessionAccessTokenOnly", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, patToken := createGoogleUnbindUser(t, db, "email-token-only-user", common.RoleCommonUser)
				require.NotEmpty(t, patToken)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).
					Update("email", "only-email@example.com").Error)
				bindGoogleForUnbindUser(t, db, user.Id, "email-token-only-sub")
				bundle, err := service.CreateLoginSession(user.Id, "test-login", "127.0.0.1", "test-agent")
				require.NoError(t, err)
				require.NotEmpty(t, bundle.AccessToken)
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), bundle.AccessToken)
				response := decodeEnvelope(t, recorder)
				assert.Equal(t, false, response["success"])
				assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
				assertGoogleBindingIntact(t, db, user.Id, "email-token-only-sub")
			})

			t.Run("selfRejectsDisabledBuiltInProvider", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				common.GitHubOAuthEnabled = false
				user, token := createGoogleUnbindUser(t, db, "disabled-github-user", common.RoleCommonUser)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("github_id", "github-999").Error)
				bindGoogleForUnbindUser(t, db, user.Id, "disabled-github-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				assert.Equal(t, false, decodeEnvelope(t, recorder)["success"])
				assertGoogleBindingIntact(t, db, user.Id, "disabled-github-sub")
			})

			t.Run("adminClearBypassesSelfLockout", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				admin, adminToken := createGoogleUnbindUser(t, db, "admin-clearer", common.RoleAdminUser)
				target, _ := createGoogleUnbindUser(t, db, "admin-target", common.RoleCommonUser)
				bindGoogleForUnbindUser(t, db, target.Id, "admin-clear-sub")
				recorder := doAdminClearBinding(adminBindingRouter(), target.Id, "google", adminToken)
				require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
				assert.Empty(t, findGoogleClaims(t, db))
				assert.Empty(t, reloadUnbindUser(t, db, target.Id).GoogleSub)
				var logs []model.Log
				require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&logs).Error)
				var auditLogs []model.Log
				for _, log := range logs {
					if strings.Contains(log.Other, "user.binding_clear") {
						auditLogs = append(auditLogs, log)
					}
				}
				require.Len(t, auditLogs, 1)
				assert.Equal(t, admin.Id, auditLogs[0].UserId)
				assert.NotContains(t, auditLogs[0].Other, "admin-clear-sub")
				assert.NotContains(t, auditLogs[0].Other, adminToken)
			})

			t.Run("selfRejectsCustomProviderMissingFromRuntime", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, token := createGoogleUnbindUser(t, db, "custom-unregistered-user", common.RoleCommonUser)
				provider := createValidCustomOAuthProvider(t, "unregistered-sso", true)
				// Deliberately NOT registered in the runtime OAuth registry.
				require.Nil(t, oauth.GetProvider(provider.Slug))
				var stored model.CustomOAuthProvider
				require.NoError(t, db.First(&stored, provider.Id).Error)
				require.True(t, stored.Enabled, "split fixture: DB provider must be enabled")
				createCustomBindingForUser(t, db, user.Id, provider.Id, "unregistered-user-1")
				bindGoogleForUnbindUser(t, db, user.Id, "custom-unregistered-sub")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				response := decodeEnvelope(t, recorder)
				assert.Equal(t, false, response["success"])
				assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
				assertGoogleBindingIntact(t, db, user.Id, "custom-unregistered-sub")
			})

			t.Run("selfRejectsCustomProviderDisabledInDB", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				user, token := createGoogleUnbindUser(t, db, "custom-dbdisabled-user", common.RoleCommonUser)
				provider := createValidCustomOAuthProvider(t, "dbdisabled-sso", true)
				registerCustomProviderInRuntime(t, provider)
				runtimeProvider, ok := oauth.GetProvider(provider.Slug).(*oauth.GenericOAuthProvider)
				require.True(t, ok)
				require.True(t, runtimeProvider.IsEnabled(), "split fixture: runtime must start enabled")
				createCustomBindingForUser(t, db, user.Id, provider.Id, "dbdisabled-user-1")
				bindGoogleForUnbindUser(t, db, user.Id, "custom-dbdisabled-sub")
				// Disable only the persisted row; runtime registry pointer stays enabled.
				require.NoError(t, db.Model(&model.CustomOAuthProvider{}).
					Where("id = ?", provider.Id).Update("enabled", false).Error)
				var storedProvider model.CustomOAuthProvider
				require.NoError(t, db.First(&storedProvider, provider.Id).Error)
				assert.False(t, storedProvider.Enabled, "split fixture: DB must be disabled")
				assert.True(t, runtimeProvider.IsEnabled(), "split fixture: runtime must stay enabled")
				recorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
				response := decodeEnvelope(t, recorder)
				assert.Equal(t, false, response["success"])
				assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserGoogleUnbindNoAlternative), response["message"])
				assertGoogleBindingIntact(t, db, user.Id, "custom-dbdisabled-sub")
			})

			t.Run("unbindVsPasskeyDeleteConcurrentFinalState", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				system_setting.GetPasskeySettings().Enabled = true
				user, token := createGoogleUnbindUser(t, db, "race-passkey-user", common.RoleCommonUser)
				credential := model.PasskeyCredential{
					UserID:       user.Id,
					CredentialID: base64.StdEncoding.EncodeToString([]byte("race-credential")),
					PublicKey:    validCOSEPublicKeyBase64(t),
				}
				require.NoError(t, db.Create(&credential).Error)
				bindGoogleForUnbindUser(t, db, user.Id, "race-passkey-sub")
				// Install after fixture bind: unbind and passkey deletion both lock the user row first.
				gate := installUserLockOverlapBarrier(t, db, 2)
				unbindRecorders := make([]*httptest.ResponseRecorder, 1)
				deleteErrs := make([]error, 1)
				runOverlappingWorkers(t, gate,
					func() {
						unbindRecorders[0] = doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
					},
					func() {
						deleteErrs[0] = model.DeletePasskeyByUserIDWithAuthVersion(user.Id)
					},
				)
				require.NotNil(t, unbindRecorders[0])
				require.NoError(t, deleteErrs[0])
				claims := findGoogleClaims(t, db)
				mirror := reloadUnbindUser(t, db, user.Id).GoogleSub
				googleBound := assertGoogleClaimFinalState(t, user.Id, "race-passkey-sub", claims, mirror)
				unbindResponse := decodeEnvelope(t, unbindRecorders[0])
				if googleBound {
					assert.Equal(t, false, unbindResponse["success"])
				} else {
					assert.Equal(t, true, unbindResponse["success"])
				}
			})
		})
	}
}

package controller

// CP2 P1-A09 Real local custom OAuth re-login after Google self-unbind.
//
// The slice proves a user whose only remaining login methods include a real
// custom OAuth binding (DB enabled + runtime registered) can complete the
// full login ceremony through a loopback httptest token/userinfo mock. After
// self-unbinding Google the user drives:
//
//   GenerateOAuthCode → state (provider=<custom-slug>)
//   → HandleOAuth callback with the loopback mock serving both
//     TokenEndpoint and UserInfoEndpoint
//   → setupLogin creates a real session bundle
//   → the session token reaches the real UserAuth middleware and the real
//     GetSelf protected endpoint responds 2xx
//
// Negative paths:
//   - provider missing from the runtime registry must reject with 400 and no
//     wire call.
//
// The fixture runs through the real model.InitDB / model.InitLogDB chain
// (p10SetupDatabase). Handler discipline: the custom OAuth mock does NOT call
// testing.T / require / assert; it records ordinary errors and atomic hit
// counts, and the main goroutine asserts after the client response.

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
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// customOAuthLoopbackMock records the hits and any handler error the loopback
// token/userinfo server observed, and serves both endpoints for a fixed
// subject. It carries no testing.T reference.
type customOAuthLoopbackMock struct {
	server       *httptest.Server
	tokenHits    int64
	userInfoHits int64

	mu             sync.Mutex
	subject        string
	email          string
	lastAuthHeader string
	lastBody       []byte
	lastErr        error // ordinary error recorded by the mock
	// midFlightBarrier, when non-nil, makes the userinfo handler signal
	// ready and block until release, enabling mid-flight provider-disable
	// tests. The barrier fields are only accessed inside the mock handler
	// goroutine and the test main goroutine; no testing.T is involved.
	midFlightReady   chan struct{}
	midFlightRelease chan struct{}
}

// setupCustomOAuthLoopbackMock stands up a loopback httptest token + userinfo
// mock. The mock never calls testing.T. When midFlightReady / midFlightRelease
// are non-nil the userinfo handler signals ready and blocks until release,
// enabling mid-flight provider-disable tests.
func setupCustomOAuthLoopbackMock(t *testing.T, subject, email string) *customOAuthLoopbackMock {
	t.Helper()

	mock := &customOAuthLoopbackMock{subject: subject, email: email}
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
				"access_token":"loopback-custom-access-token",
				"token_type":"Bearer",
				"expires_in":3600,
				"scope":"profile email"
			}`)); err != nil {
				mock.mu.Lock()
				mock.lastErr = err
				mock.mu.Unlock()
			}
		case http.MethodGet:
			atomic.AddInt64(&mock.userInfoHits, 1)
			mock.mu.Lock()
			mock.lastAuthHeader = r.Header.Get("Authorization")
			readyCh := mock.midFlightReady
			releaseCh := mock.midFlightRelease
			mock.mu.Unlock()
			// If a mid-flight barrier is active, signal ready and block
			// until the test releases. This happens BEFORE the response is
			// written so the test can modify DB state while the handler is
			// still in-flight.
			if readyCh != nil && releaseCh != nil {
				select {
				case readyCh <- struct{}{}:
				default:
				}
				<-releaseCh
			}
			if _, err := w.Write([]byte(fmt.Sprintf(`{
				"id":%q,
				"username":"custom-user",
				"display_name":"Custom User",
				"email":%q
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
	return mock
}

// seedA09UserWithGoogleAndCustomOAuth creates a real user with both a
// Google claim+mirror and a custom-OAuth binding row.
func seedA09UserWithGoogleAndCustomOAuth(t *testing.T,
	googleSub, customSubject string, providerId int) (*model.User, string) {
	t.Helper()
	token := common.GetRandomString(32)
	user := &model.User{
		Username:    "a09-user",
		Password:    "ignored",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     "a09-aff",
		AuthVersion: 1,
		AccessToken: &token,
	}
	require.NoError(t, model.DB.Create(user).Error)

	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, googleSub, user.Id)
	}))
	require.NoError(t, model.DB.Model(&model.User{}).
		Where("id = ?", user.Id).
		Update("google_sub", googleSub).Error)

	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.CreateUserOAuthBindingWithTx(tx, &model.UserOAuthBinding{
			UserId:         user.Id,
			ProviderId:     providerId,
			ProviderUserId: customSubject,
		})
	}))
	return user, token
}

// createA09CustomProvider creates a custom OAuth provider through the
// production validation path with TokenEndpoint and UserInfoEndpoint
// pointing at the loopback mock, with the given enabled state.
func createA09CustomProvider(t *testing.T, slug string, mockURL string, enabled bool) *model.CustomOAuthProvider {
	t.Helper()
	provider := &model.CustomOAuthProvider{
		Name:                  "Loopback Custom " + slug,
		Slug:                  slug,
		Enabled:               enabled,
		ClientId:              "loopback-client",
		ClientSecret:          "loopback-secret",
		AuthorizationEndpoint: mockURL + "/authorize",
		TokenEndpoint:         mockURL + "/token",
		UserInfoEndpoint:      mockURL + "/userinfo",
		UserIdField:           "id",
		UsernameField:         "username",
		DisplayNameField:      "display_name",
		EmailField:            "email",
		AuthStyle:             oauth.AuthStyleInParams,
	}
	require.NoError(t, model.CreateCustomOAuthProvider(provider))
	return provider
}

// registerOwnCustomSlug registers the provider in the runtime registry,
// guarding that the slug was free beforehand, and unregisters only that slug
// on cleanup.
func registerOwnCustomSlug(t *testing.T, provider *model.CustomOAuthProvider) {
	t.Helper()
	require.Nil(t, oauth.GetProvider(provider.Slug),
		"test slug %q must be free before registration", provider.Slug)
	oauth.RegisterOrUpdateCustomProvider(provider)
	t.Cleanup(func() { oauth.UnregisterCustomProvider(provider.Slug) })
}

// TestGoogleUnbindSelfThenCustomOAuthReLogin covers the full A09 contract on
// both SQLite and PostgreSQL fixtures.
func TestGoogleUnbindSelfThenCustomOAuthReLogin(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "custom", a09CustomBody)
}

func a09CustomBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	const customSlug = "loopback-custom-sso"
	const googleSub = "a09-google-sub-001"
	const customSub = "a09-custom-sub-001"

	mock := setupCustomOAuthLoopbackMock(t, customSub, "a09@example.com")
	provider := createA09CustomProvider(t, customSlug, mock.server.URL, true)
	registerOwnCustomSlug(t, provider)

	user, token := seedA09UserWithGoogleAndCustomOAuth(t, googleSub, customSub, provider.Id)

	// 1. Self-unbind Google through the real handler.
	unbindRec := doGoogleSelfUnbind(googleSelfUnbindRouter(), token)
	require.Equal(t, true, decodeEnvelope(t, unbindRec)["success"],
		"self-unbind must succeed, body=%s", unbindRec.Body.String())
	assert.Empty(t, findGoogleClaims(t, model.DB), "claim must be cleared")
	assert.Empty(t, reloadUnbindUser(t, model.DB, user.Id).GoogleSub, "mirror must be cleared")

	// 2. Generate a real custom-OAuth login state.
	stateRec := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRec)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"login"}`, customSlug)))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx)
	require.Equal(t, http.StatusOK, stateRec.Code, "GenerateOAuthCode must succeed, body=%s", stateRec.Body.String())
	var stateEnvelope struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(stateRec.Body.Bytes(), &stateEnvelope))
	require.True(t, stateEnvelope.Success, "GenerateOAuthCode must succeed")
	require.NotEmpty(t, stateEnvelope.Data.FlowToken)

	// 3. Drive the real HandleOAuth callback for the custom provider.
	cbRouter := gin.New()
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/oauth/%s?state=%s&code=loopback-code", customSlug, stateEnvelope.Data.FlowToken), nil)
	cbReq.Header.Set("Accept", "application/json")
	cbRec := httptest.NewRecorder()
	cbRouter.ServeHTTP(cbRec, cbReq)
	require.Equal(t, http.StatusOK, cbRec.Code, "callback must return 2xx, body=%s", cbRec.Body.String())
	var cbEnvelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(cbRec.Body.Bytes(), &cbEnvelope))
	require.True(t, cbEnvelope.Success, "custom OAuth callback must succeed, body=%s", cbRec.Body.String())
	require.NotEmpty(t, cbEnvelope.Data.AccessToken,
		"custom OAuth callback must issue an access_token (session bundle)")

	// 4. Loopback mock observed exactly one token + one userinfo, no handler error.
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.tokenHits),
		"loopback custom TokenEndpoint must be called exactly once")
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.userInfoHits),
		"loopback custom UserInfoEndpoint must be called exactly once")
	mock.mu.Lock()
	mockErr := mock.lastErr
	mock.mu.Unlock()
	require.NoError(t, mockErr, "loopback custom OAuth mock must not have recorded a handler error")

	// 5. A real UserSession row exists for the user.
	var sessions []model.UserSession
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&sessions).Error)
	require.Len(t, sessions, 1, "setupLogin must write exactly one UserSession row")

	// 6. The session token reaches the real UserAuth middleware and the real
	//    GetSelf protected endpoint responds 2xx with the seeded user id.
	router := gin.New()
	router.GET("/api/user/self", middleware.UserAuth(), GetSelf)
	authReq := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	authReq.Header.Set("Authorization", "Bearer "+cbEnvelope.Data.AccessToken)
	authRec := httptest.NewRecorder()
	router.ServeHTTP(authRec, authReq)
	require.Equal(t, http.StatusOK, authRec.Code,
		"the custom OAuth re-login session must reach the real GetSelf protected API, body=%s", authRec.Body.String())
	var selfBody struct {
		Success bool `json:"success"`
		Data    struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(authRec.Body.Bytes(), &selfBody))
	require.True(t, selfBody.Success, "GetSelf must succeed")
	assert.Equal(t, user.Id, selfBody.Data.ID, "the real protected API must resolve the seeded user")

	// 7. Outbound network egress is fail-closed.
	mock.mu.Lock()
	gotAuthHeader := mock.lastAuthHeader
	mock.mu.Unlock()
	assert.Equal(t, "Bearer loopback-custom-access-token", gotAuthHeader,
		"the loopback IdP must have received the access token issued by itself")
}

// TestCustomOAuthReLoginRejectsRuntimeMissing proves a custom OAuth provider
// that is enabled in the DB but NOT registered in the runtime registry must
// not complete a login; the loopback mock must observe zero wire calls.
func TestCustomOAuthReLoginRejectsRuntimeMissing(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "runtime-missing", a09RuntimeMissingBody)
}

func a09RuntimeMissingBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	const customSlug = "loopback-unregistered-sso"
	mock := setupCustomOAuthLoopbackMock(t, "a09-custom-reject-001", "a09-reject@example.com")
	createA09CustomProvider(t, customSlug, mock.server.URL, true)
	// Deliberately NOT registered: oauth.GetProvider(customSlug) == nil.
	require.Nil(t, oauth.GetProvider(customSlug))

	cbRouter := gin.New()
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/oauth/%s?state=ignored&code=ignored", customSlug), nil)
	cbRec := httptest.NewRecorder()
	cbRouter.ServeHTTP(cbRec, cbReq)
	assert.True(t, cbRec.Code == http.StatusBadRequest,
		"unknown provider must be rejected with 400, got %d body=%s", cbRec.Code, cbRec.Body.String())
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.tokenHits),
		"loopback mock must not receive token calls when provider is missing from runtime registry")
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.userInfoHits),
		"loopback mock must not receive userinfo calls when provider is missing from runtime registry")
}

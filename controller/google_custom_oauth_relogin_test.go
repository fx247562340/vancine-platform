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
//     wire call;
//   - split state (runtime provider enabled, DB row disabled) must reject the
//     real state/callback with token/userinfo hit = 0.
//
// The fixture runs through the real model.InitDB / model.InitLogDB chain
// (p10SetupDatabase). Handler discipline: the custom OAuth mock does NOT call
// testing.T / require / assert; it records ordinary errors and atomic hit
// counts, and the main goroutine asserts after the client response.

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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

// TestCustomOAuthReLoginRejectsDBDisabledSplitState proves a split state
// (runtime provider still enabled, persisted DB row independently disabled)
// must reject the real state/callback with zero wire calls.
func TestCustomOAuthReLoginRejectsDBDisabledSplitState(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "db-disabled", a09DBDisabledBody)
}

func a09DBDisabledBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	const customSlug = "loopback-dbdisabled-sso"
	mock := setupCustomOAuthLoopbackMock(t, "a09-custom-dbdisabled-001", "a09-dbdis@example.com")
	provider := createA09CustomProvider(t, customSlug, mock.server.URL, true)
	registerOwnCustomSlug(t, provider)

	// Snapshot the AuthFlow row count before any state generation so the
	// state-before-disabled case can assert none was created.
	var authFlowCountBefore int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&authFlowCountBefore).Error)

	// --- Case 1: provider is DB-disabled BEFORE any state generation. ---
	// GenerateOAuthCode must reject directly, no AuthFlow must be created, and
	// the loopback mock must never be touched.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).
		Update("enabled", false).Error)
	runtimeProvider, ok := oauth.GetProvider(provider.Slug).(*oauth.GenericOAuthProvider)
	require.True(t, ok)
	require.True(t, runtimeProvider.IsEnabled(), "runtime registry entry must stay enabled")

	stateRec := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRec)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"login"}`, customSlug)))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx)
	// The production handler replies with HTTP 200 and success=false; assert
	// only the success field, not the status code.
	var stateEnvelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	_ = common.Unmarshal(stateRec.Body.Bytes(), &stateEnvelope)
	assert.False(t, stateEnvelope.Success,
		"GenerateOAuthCode must return success=false when the DB row is disabled")
	assert.NotEmpty(t, stateEnvelope.Message,
		"rejection must carry a non-empty message")
	var authFlowCountAfter int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&authFlowCountAfter).Error)
	assert.Equal(t, authFlowCountBefore, authFlowCountAfter,
		"GenerateOAuthCode must not create an AuthFlow when the provider is disabled")
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.tokenHits),
		"GenerateOAuthCode must not reach the loopback when the DB row is disabled")
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.userInfoHits),
		"GenerateOAuthCode must not reach the loopback when the DB row is disabled")

	// --- Case 2: state generated when enabled, THEN the DB row is disabled
	// mid-flight (runtime stays enabled). The callback must reject, no
	// user/binding/session must be created, and the loopback must see zero
	// wire hits.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).
		Update("enabled", true).Error)
	stateRec2 := httptest.NewRecorder()
	stateCtx2, _ := gin.CreateTestContext(stateRec2)
	stateCtx2.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"login"}`, customSlug)))
	stateCtx2.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx2)
	require.Equal(t, http.StatusOK, stateRec2.Code, "GenerateOAuthCode must succeed when enabled, body=%s", stateRec2.Body.String())
	var stateEnvelope2 struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(stateRec2.Body.Bytes(), &stateEnvelope2))
	require.True(t, stateEnvelope2.Success)
	stateToken := stateEnvelope2.Data.FlowToken
	require.NotEmpty(t, stateToken)

	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).
		Update("enabled", false).Error)
	var usersBefore int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&usersBefore).Error)
	var sessionsBefore int64
	require.NoError(t, model.DB.Model(&model.UserSession{}).Count(&sessionsBefore).Error)
	var bindingsBefore int64
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsBefore).Error)

	cbRouter := gin.New()
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/oauth/%s?state=%s&code=loopback-code", customSlug, stateToken), nil)
	cbReq.Header.Set("Accept", "application/json")
	cbRec := httptest.NewRecorder()
	cbRouter.ServeHTTP(cbRec, cbReq)

	var cbEnvelope struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(cbRec.Body.Bytes(), &cbEnvelope))
	assert.False(t, cbEnvelope.Success,
		"the callback must reject when the persisted provider is disabled mid-flight")
	var usersAfter, sessionsAfter, bindingsAfter int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&usersAfter).Error)
	require.NoError(t, model.DB.Model(&model.UserSession{}).Count(&sessionsAfter).Error)
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsAfter).Error)
	assert.Equal(t, usersBefore, usersAfter, "the callback must not create a user")
	assert.Equal(t, sessionsBefore, sessionsAfter, "the callback must not create a session")
	assert.Equal(t, bindingsBefore, bindingsAfter, "the callback must not create a binding")
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.tokenHits),
		"the callback must not reach the loopback when the DB row is disabled")
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock.userInfoHits),
		"the callback must not reach the loopback when the DB row is disabled")
}

// TestCustomOAuthMidFlightDisableLogin proves that disabling the DB provider
// AFTER token+userinfo have started but BEFORE the handler creates a
// user/binding/session prevents identity establishment. The mock's userinfo
// handler signals ready then blocks; the test disables the DB row, releases
// the handler, and asserts zero user/binding/session creation.
func TestCustomOAuthMidFlightDisableLogin(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "midflight-login", a09MidFlightLoginBody)
}

func a09MidFlightLoginBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	const customSlug = "midflight-login-sso"
	readyCh := make(chan struct{}, 1)
	releaseCh := make(chan struct{})
	mock := &customOAuthLoopbackMock{
		subject:          "midflight-login-sub",
		email:            "midflight@example.com",
		midFlightReady:   readyCh,
		midFlightRelease: releaseCh,
	}
	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodPost:
			atomic.AddInt64(&mock.tokenHits, 1)
			if _, err := w.Write([]byte(`{"access_token":"midflight-at","token_type":"Bearer","expires_in":3600}`)); err != nil {
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
			if readyCh != nil && releaseCh != nil {
				select {
				case readyCh <- struct{}{}:
				default:
				}
				<-releaseCh
			}
			if _, err := w.Write([]byte(fmt.Sprintf(`{"id":%q,"username":"midflight","display_name":"Midflight","email":%q}`, mock.subject, mock.email))); err != nil {
				mock.mu.Lock()
				mock.lastErr = err
				mock.mu.Unlock()
			}
		}
	}))
	t.Cleanup(mock.server.Close)

	provider := createA09CustomProvider(t, customSlug, mock.server.URL, true)
	registerOwnCustomSlug(t, provider)

	// Generate state when enabled.
	stateRec := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRec)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"login"}`, customSlug)))
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
	require.True(t, stateEnvelope.Success)
	require.NotEmpty(t, stateEnvelope.Data.FlowToken)

	var usersBefore, sessionsBefore, bindingsBefore int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&usersBefore).Error)
	require.NoError(t, model.DB.Model(&model.UserSession{}).Count(&sessionsBefore).Error)
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsBefore).Error)

	// Run the callback in a goroutine; it will block on the userinfo barrier.
	cbRouter := gin.New()
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/oauth/%s?state=%s&code=midflight-code", customSlug, stateEnvelope.Data.FlowToken), nil)
	cbReq.Header.Set("Accept", "application/json")
	cbRec := httptest.NewRecorder()

	cbDone := make(chan struct{})
	go func() {
		defer close(cbDone)
		cbRouter.ServeHTTP(cbRec, cbReq)
	}()

	// Failure-safe: ensure release + join happen regardless of test path.
	var releaseOnce sync.Once
	doRelease := func() { releaseOnce.Do(func() { close(releaseCh) }) }
	defer func() {
		doRelease()
		<-cbDone
	}()

	// Wait for the userinfo handler to signal ready (wire has started).
	readyOK := true
	select {
	case <-readyCh:
	case <-time.After(5 * time.Second):
		readyOK = false
	}

	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.tokenHits), "token wire must have happened")
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.userInfoHits), "userinfo wire must have happened")

	// Disable the DB row while the handler is mid-flight.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).
		Update("enabled", false).Error)

	// Release and join.
	doRelease()
	select {
	case <-cbDone:
	case <-time.After(5 * time.Second):
		require.Fail(t, "callback did not complete within 5s after release")
	}

	// Check mock handler error and ready signal.
	mock.mu.Lock()
	mockErr := mock.lastErr
	mock.mu.Unlock()
	require.NoError(t, mockErr, "loopback mock must not have recorded a handler error")
	require.True(t, readyOK, "userinfo handler did not signal ready within 5s")

	var cbEnvelope struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(cbRec.Body.Bytes(), &cbEnvelope))
	assert.False(t, cbEnvelope.Success,
		"mid-flight DB disable must prevent login, body=%s", cbRec.Body.String())

	// The flow must NOT have been consumed.
	flow, flowErr := model.GetAuthFlow(stateEnvelope.Data.FlowToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: customSlug,
		Intent:   model.AuthFlowIntentLogin,
	})
	assert.NoError(t, flowErr, "the auth flow must still exist (not consumed)")
	assert.NotNil(t, flow, "the auth flow must not have been consumed by the rejected callback")

	// Zero new user, binding, session.
	var usersAfter, sessionsAfter, bindingsAfter int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&usersAfter).Error)
	require.NoError(t, model.DB.Model(&model.UserSession{}).Count(&sessionsAfter).Error)
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsAfter).Error)
	assert.Equal(t, usersBefore, usersAfter, "must not create a user")
	assert.Equal(t, sessionsBefore, sessionsAfter, "must not create a session")
	assert.Equal(t, bindingsBefore, bindingsAfter, "must not create a binding")
}

// TestCustomOAuthMidFlightDisableBind proves that disabling the DB provider
// AFTER token+userinfo have started in a bind flow but BEFORE the handler
// consumes the flow or writes a binding prevents mutation.
func TestCustomOAuthMidFlightDisableBind(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "midflight-bind", a09MidFlightBindBody)
}

func a09MidFlightBindBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	const customSlug = "midflight-bind-sso"
	readyCh := make(chan struct{}, 1)
	releaseCh := make(chan struct{})
	mock := &customOAuthLoopbackMock{
		subject:          "midflight-bind-sub",
		email:            "midflight-bind@example.com",
		midFlightReady:   readyCh,
		midFlightRelease: releaseCh,
	}
	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodPost:
			atomic.AddInt64(&mock.tokenHits, 1)
			if _, err := w.Write([]byte(`{"access_token":"midflight-bind-at","token_type":"Bearer","expires_in":3600}`)); err != nil {
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
			if readyCh != nil && releaseCh != nil {
				select {
				case readyCh <- struct{}{}:
				default:
				}
				<-releaseCh
			}
			if _, err := w.Write([]byte(fmt.Sprintf(`{"id":%q,"username":"midflight-bind","display_name":"Midflight Bind","email":%q}`, mock.subject, mock.email))); err != nil {
				mock.mu.Lock()
				mock.lastErr = err
				mock.mu.Unlock()
			}
		}
	}))
	t.Cleanup(mock.server.Close)

	provider := createA09CustomProvider(t, customSlug, mock.server.URL, true)
	registerOwnCustomSlug(t, provider)

	// Seed a real logged-in user for the bind flow.
	userToken := common.GetRandomString(32)
	user := &model.User{
		Username: "midflight-bind-user", Password: "ignored",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
		Group: "default", AffCode: "midflight-bind-aff", AuthVersion: 1,
		AccessToken: &userToken,
	}
	require.NoError(t, model.DB.Create(user).Error)

	// Generate a bind flow state.
	stateRec := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRec)
	stateCtx.Set("id", user.Id)
	stateCtx.Set("session_id", "midflight-session")
	stateCtx.Set("auth_version", int64(1))
	stateCtx.Set("session_version", int64(1))
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"bind"}`, customSlug)))
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
	require.True(t, stateEnvelope.Success)
	require.NotEmpty(t, stateEnvelope.Data.FlowToken)

	var bindingsBefore, claimsBefore, authFlowBefore int64
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsBefore).Error)
	require.NoError(t, model.DB.Model(&model.ExternalIdentityClaim{}).Count(&claimsBefore).Error)
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&authFlowBefore).Error)

	// Run the callback in a goroutine with session identity set.
	cbRouter := gin.New()
	cbRouter.Use(func(c *gin.Context) {
		c.Set("id", user.Id)
		c.Set("session_id", "midflight-session")
		c.Set("auth_version", int64(1))
		c.Set("session_version", int64(1))
		c.Next()
	})
	cbRouter.GET("/api/oauth/:provider", HandleOAuth)
	cbReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/oauth/%s?state=%s&code=midflight-bind-code", customSlug, stateEnvelope.Data.FlowToken), nil)
	cbReq.Header.Set("Accept", "application/json")
	cbRec := httptest.NewRecorder()

	cbDone := make(chan struct{})
	go func() {
		defer close(cbDone)
		cbRouter.ServeHTTP(cbRec, cbReq)
	}()

	// Failure-safe: ensure release + join happen regardless of test path.
	var releaseOnce sync.Once
	doRelease := func() { releaseOnce.Do(func() { close(releaseCh) }) }
	defer func() {
		doRelease()
		<-cbDone
	}()

	readyOK := true
	select {
	case <-readyCh:
	case <-time.After(5 * time.Second):
		readyOK = false
	}

	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.tokenHits))
	assert.Equal(t, int64(1), atomic.LoadInt64(&mock.userInfoHits))

	// Disable DB row mid-flight.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider.Id).
		Update("enabled", false).Error)

	doRelease()
	select {
	case <-cbDone:
	case <-time.After(5 * time.Second):
		require.Fail(t, "bind callback did not complete within 5s after release")
	}

	// Check mock handler error and ready signal.
	mock.mu.Lock()
	mockErr := mock.lastErr
	mock.mu.Unlock()
	require.NoError(t, mockErr, "loopback mock must not have recorded a handler error")
	require.True(t, readyOK, "userinfo handler did not signal ready within 5s")

	// The flow must NOT have been consumed.
	flow, flowErr := model.GetAuthFlow(stateEnvelope.Data.FlowToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: customSlug,
		Intent:   model.AuthFlowIntentBind,
		UserId:   user.Id,
	})
	assert.NoError(t, flowErr, "the auth flow must still exist (not consumed)")
	assert.NotNil(t, flow, "the auth flow must not have been consumed by the rejected callback")

	var bindingsAfter, claimsAfter int64
	require.NoError(t, model.DB.Model(&model.UserOAuthBinding{}).Count(&bindingsAfter).Error)
	require.NoError(t, model.DB.Model(&model.ExternalIdentityClaim{}).Count(&claimsAfter).Error)
	assert.Equal(t, bindingsBefore, bindingsAfter, "mid-flight disable must not create a binding")
	assert.Equal(t, claimsBefore, claimsAfter, "mid-flight disable must not create a claim")

	// Verify the user's existing credentials are unchanged.
	var afterUser model.User
	require.NoError(t, model.DB.First(&afterUser, user.Id).Error)
	assert.Equal(t, user.Username, afterUser.Username)
	assert.Equal(t, user.Password, afterUser.Password)
}

// TestCustomOAuthProviderConsistencyNegatives covers registry/persisted
// consistency negative paths for custom providers. Each case must be
// rejected without creating a flow/user/binding/session or making wire
// calls.
func TestCustomOAuthProviderConsistencyNegatives(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "consistency", a09ConsistencyBody)
}

func a09ConsistencyBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.UserSession{},
		&model.AuthFlow{}, &model.Log{}, &model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
	)

	// Helper: generate a state and assert it was rejected (success=false),
	// no flow created, wire hit=0. Returns the response for optional
	// further assertions.
	assertRejected := func(t *testing.T, slug string, expectMsg string, flowsBefore int64) {
		t.Helper()
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
			strings.NewReader(fmt.Sprintf(`{"provider":%q,"intent":"login"}`, slug)))
		ctx.Request.Header.Set("Content-Type", "application/json")
		GenerateOAuthCode(ctx)
		var env struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &env))
		assert.False(t, env.Success, expectMsg)
		var flowsAfter int64
		require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&flowsAfter).Error)
		assert.Equal(t, flowsBefore, flowsAfter, "must not create a flow: %s", expectMsg)
	}

	var flowsBefore int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&flowsBefore).Error)

	// Case 1: Generic runtime provider registered via oauth.Register (NOT
	// RegisterOrUpdateCustomProvider), so the custom marker is NOT set.
	// isGeneric=true, isCustom=false → must reject.
	const genericSlug = "consistency-generic-not-custom"
	mock1 := setupCustomOAuthLoopbackMock(t, "generic-sub", "generic@example.com")
	config1 := createA09CustomProvider(t, genericSlug, mock1.server.URL, true)
	require.Nil(t, oauth.GetProvider(genericSlug), "slug must be free before registration")
	// Register a GenericOAuthProvider via oauth.Register (not
	// RegisterOrUpdateCustomProvider) so the custom marker is NOT set.
	oauth.Register(genericSlug, oauth.NewGenericOAuthProvider(config1))
	t.Cleanup(func() { oauth.UnregisterCustomProvider(genericSlug) })
	require.NotNil(t, oauth.GetProvider(genericSlug), "provider must be registered")
	require.False(t, oauth.IsCustomProvider(genericSlug), "custom marker must NOT be set")
	_, isGeneric1 := oauth.GetProvider(genericSlug).(*oauth.GenericOAuthProvider)
	require.True(t, isGeneric1, "runtime type must be GenericOAuthProvider")

	assertRejected(t, genericSlug, "Generic but not custom must be rejected", flowsBefore)
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock1.tokenHits))
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock1.userInfoHits))

	// Case 2: Generic + custom marker (consistent), but runtime Generic ID
	// != persisted ID. Must reject.
	const idMismatchSlug = "consistency-id-mismatch"
	mock2 := setupCustomOAuthLoopbackMock(t, "idmismatch-sub", "idmismatch@example.com")
	provider2 := createA09CustomProvider(t, idMismatchSlug, mock2.server.URL, true)
	registerOwnCustomSlug(t, provider2)
	require.True(t, oauth.IsCustomProvider(idMismatchSlug))

	// Tamper the persisted ID to mismatch the runtime registry.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("id = ?", provider2.Id).
		Update("id", provider2.Id+99999).Error)

	assertRejected(t, idMismatchSlug, "ID mismatch must reject", flowsBefore)
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock2.tokenHits))
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock2.userInfoHits))

	// Case 3: Generic + custom marker (consistent), but the persisted DB
	// row has been deleted. Runtime provider and custom marker still exist.
	// Must reject.
	const missingRowSlug = "consistency-row-missing"
	mock3 := setupCustomOAuthLoopbackMock(t, "missingrow-sub", "missingrow@example.com")
	provider3 := createA09CustomProvider(t, missingRowSlug, mock3.server.URL, true)
	registerOwnCustomSlug(t, provider3)
	require.True(t, oauth.IsCustomProvider(missingRowSlug))
	// Delete the persisted row; runtime registry still has the provider.
	require.NoError(t, model.DB.Model(&model.CustomOAuthProvider{}).
		Where("slug = ?", missingRowSlug).
		Delete(&model.CustomOAuthProvider{}).Error)
	// Verify the row is gone but the runtime provider still exists.
	_, err := model.GetCustomOAuthProviderBySlug(missingRowSlug)
	assert.Error(t, err, "persisted row must be deleted")
	require.NotNil(t, oauth.GetProvider(missingRowSlug), "runtime provider must still exist")
	assert.True(t, oauth.IsCustomProvider(missingRowSlug), "custom marker must still be set")

	assertRejected(t, missingRowSlug, "persisted row missing must reject", flowsBefore)
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock3.tokenHits))
	assert.Equal(t, int64(0), atomic.LoadInt64(&mock3.userInfoHits))

	// Case 4: isGeneric=false (not a GenericOAuthProvider), isCustom=true
	// (registered via oauth.RegisterCustom). This is an inconsistent state
	// that resolveValidOAuthProvider must reject.
	const nonGenericSlug = "consistency-non-generic-custom"
	require.Nil(t, oauth.GetProvider(nonGenericSlug), "slug must be free")
	mock4 := &mockNonGenericProvider{name: "non-generic", enabled: true}
	oauth.RegisterCustom(nonGenericSlug, mock4)
	t.Cleanup(func() { oauth.Unregister(nonGenericSlug) })
	require.NotNil(t, oauth.GetProvider(nonGenericSlug))
	require.True(t, oauth.IsCustomProvider(nonGenericSlug), "custom marker must be set")
	_, isGeneric4 := oauth.GetProvider(nonGenericSlug).(*oauth.GenericOAuthProvider)
	require.False(t, isGeneric4, "runtime type must NOT be GenericOAuthProvider")

	assertRejected(t, nonGenericSlug, "non-Generic with custom marker must be rejected", flowsBefore)
}

// mockNonGenericProvider is a minimal oauth.Provider implementation that is
// NOT a GenericOAuthProvider. Used to test the isGeneric=false, isCustom=true
// classification path in resolveValidOAuthProvider.
type mockNonGenericProvider struct {
	name    string
	enabled bool
}

func (m *mockNonGenericProvider) GetName() string { return m.name }
func (m *mockNonGenericProvider) IsEnabled() bool { return m.enabled }
func (m *mockNonGenericProvider) ExchangeToken(_ context.Context, _ string, _ *gin.Context) (*oauth.OAuthToken, error) {
	return &oauth.OAuthToken{AccessToken: "mock-at"}, nil
}
func (m *mockNonGenericProvider) GetUserInfo(_ context.Context, _ *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return &oauth.OAuthUser{ProviderUserID: "mock-sub"}, nil
}
func (m *mockNonGenericProvider) IsUserIDTaken(_ string) bool                        { return false }
func (m *mockNonGenericProvider) FillUserByProviderID(_ *model.User, _ string) error { return nil }
func (m *mockNonGenericProvider) SetProviderUserID(_ *model.User, _ string)          {}
func (m *mockNonGenericProvider) GetProviderPrefix() string                          { return "mock_" }

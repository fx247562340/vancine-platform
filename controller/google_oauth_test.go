package controller

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// googleOAuthTestEnv is the isolated fixture for Google OAuth controller
// tests. The Google token/userinfo endpoints point at a local httptest server,
// so no real Google request is ever made; the client ID/secret are throwaway
// test fixtures, never production values.
type googleOAuthTestEnv struct {
	db            *gorm.DB
	userInfoSub   string
	userInfoEmail string
	userInfoName  string
	tokenCalls    int
	userInfoCalls int
}

func setupGoogleOAuthTest(t *testing.T) *googleOAuthTestEnv {
	t.Helper()
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousDBType := common.MainDatabaseType()
	previousEnabled := common.GoogleOAuthEnabled
	previousClientID := common.GoogleClientId
	previousClientSecret := common.GoogleClientSecret
	previousRedirect := common.GoogleRedirectUri
	previousServerAddress := system_setting.ServerAddress
	previousTokenEndpoint := oauth.GoogleTokenEndpoint
	previousUserInfoEndpoint := oauth.GoogleUserInfoEndpoint
	previousRegisterEnabled := common.RegisterEnabled
	previousOptionMap := common.OptionMap
	previousRedisEnabled := common.RedisEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.AuthFlow{}, &model.User{}))

	env := &googleOAuthTestEnv{
		db:            db,
		userInfoSub:   "google-sub-1",
		userInfoEmail: "bind-user@example.com",
		userInfoName:  "Bind User",
	}
	mockGoogle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			env.tokenCalls++
			fmt.Fprint(w, `{"access_token":"mock-access-token","token_type":"Bearer","expires_in":3600,"scope":"openid email profile"}`)
		case "/userinfo":
			env.userInfoCalls++
			body, err := common.Marshal(map[string]any{
				"sub":            env.userInfoSub,
				"email":          env.userInfoEmail,
				"email_verified": true,
				"name":           env.userInfoName,
			})
			require.NoError(t, err)
			_, _ = w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))

	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.GoogleOAuthEnabled = true
	common.GoogleClientId = "google-test-client-id"
	common.GoogleClientSecret = "google-test-client-secret"
	common.GoogleRedirectUri = ""
	system_setting.ServerAddress = "https://vancine.example.com"
	common.RegisterEnabled = false
	common.OptionMap = map[string]string{}
	common.RedisEnabled = false
	oauth.GoogleTokenEndpoint = mockGoogle.URL + "/token"
	oauth.GoogleUserInfoEndpoint = mockGoogle.URL + "/userinfo"

	t.Cleanup(func() {
		mockGoogle.Close()
		model.DB = previousDB
		common.SetMainDatabaseType(previousDBType)
		common.GoogleOAuthEnabled = previousEnabled
		common.GoogleClientId = previousClientID
		common.GoogleClientSecret = previousClientSecret
		common.GoogleRedirectUri = previousRedirect
		system_setting.ServerAddress = previousServerAddress
		common.RegisterEnabled = previousRegisterEnabled
		common.OptionMap = previousOptionMap
		oauth.GoogleTokenEndpoint = previousTokenEndpoint
		oauth.GoogleUserInfoEndpoint = previousUserInfoEndpoint
		common.RedisEnabled = previousRedisEnabled
	})
	return env
}

func createGoogleOAuthTestUser(t *testing.T, db *gorm.DB, username string) *model.User {
	t.Helper()
	user := &model.User{
		Username:    username,
		Password:    "unused",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     username,
		AuthVersion: 1,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func newGoogleOAuthContext(method, target string, body io.Reader, userID int, sessionID string) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(method, target, body)
	if body != nil {
		context.Request.Header.Set("Content-Type", "application/json")
	}
	if userID > 0 {
		context.Set("id", userID)
		context.Set("session_id", sessionID)
		context.Set("auth_version", int64(1))
		context.Set("session_version", int64(1))
	}
	return context, recorder
}

// startGoogleBindFlow drives the real POST /api/oauth/state controller with a
// session identity, exactly like the account-binding page does.
func startGoogleBindFlow(t *testing.T, user *model.User, sessionID string) string {
	t.Helper()
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"bind"}`), user.Id, sessionID)
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.NotEmpty(t, response.Data.FlowToken)
	return response.Data.FlowToken
}

// serveOAuthCallback runs HandleOAuth through a real gin router so the
// :provider route parameter is resolved exactly as in production.
func serveOAuthCallback(provider, query string, userID int, sessionID string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		if userID > 0 {
			c.Set("id", userID)
			c.Set("session_id", sessionID)
			c.Set("auth_version", int64(1))
			c.Set("session_version", int64(1))
		}
		c.Next()
	})
	router.GET("/api/oauth/:provider", HandleOAuth)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/oauth/"+provider+"?"+query, nil))
	return recorder
}

func decodeOAuthResponse(t *testing.T, recorder *httptest.ResponseRecorder) struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
} {
	t.Helper()
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func reloadGoogleOAuthUser(t *testing.T, env *googleOAuthTestEnv, id int) model.User {
	t.Helper()
	var stored model.User
	require.NoError(t, env.db.First(&stored, id).Error)
	return stored
}

func TestBuildSelfUserDataReturnsGoogleSub(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	user := createGoogleOAuthTestUser(t, env.db, "self-dto-user")
	user.GoogleSub = "google-sub-self"

	data := buildSelfUserData(user)

	assert.Equal(t, "google-sub-self", data["google_sub"])
	// The DTO must never carry the Google client secret (or any value equal
	// to it), no matter which fields are added later.
	for key, value := range data {
		if text, ok := value.(string); ok {
			assert.NotEqual(t, common.GoogleClientSecret, text,
				"buildSelfUserData field %q leaks the Google client secret", key)
		}
	}
}

func TestGetStatusExposesGoogleBindConfiguration(t *testing.T) {
	setupGoogleOAuthTest(t)
	gin.SetMode(gin.TestMode)

	// resetBaseline restores the complete, valid Google configuration before
	// every subtest. Each subtest then mutates exactly the one variable it
	// verifies, so subtests never observe leftovers from earlier ones and
	// each also passes when run in isolation (go test -run '.../name').
	resetBaseline := func() {
		common.GoogleOAuthEnabled = true
		common.GoogleClientId = "google-test-client-id"
		common.GoogleClientSecret = "google-test-client-secret"
		common.GoogleRedirectUri = ""
		system_setting.ServerAddress = "https://vancine.example.com"
	}

	fetchStatus := func(t *testing.T) (*httptest.ResponseRecorder, map[string]any) {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
		GetStatus(context)
		var payload struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		return recorder, payload.Data
	}

	t.Run("enabled google serves public bind configuration", func(t *testing.T) {
		resetBaseline()
		recorder, data := fetchStatus(t)
		assert.Equal(t, "google-test-client-id", data["google_client_id"])
		assert.Equal(t, oauth.GoogleRedirectUri(), data["google_redirect_uri"])
		assert.Equal(t, "https://vancine.example.com/oauth/google", data["google_redirect_uri"])
		// The client secret must never appear in the public status payload.
		body := recorder.Body.String()
		assert.NotContains(t, body, "google-test-client-secret")
		assert.NotContains(t, body, "google_client_secret")
	})

	t.Run("admin redirect override wins and is served verbatim", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "https://cdn.example.com/oauth/google"
		_, data := fetchStatus(t)
		assert.Equal(t, "https://cdn.example.com/oauth/google", data["google_redirect_uri"])
	})

	t.Run("plain http redirect URI is served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "http://localhost:3000/oauth/google"
		_, data := fetchStatus(t)
		assert.Equal(t, "google-test-client-id", data["google_client_id"])
		assert.Equal(t, "http://localhost:3000/oauth/google", data["google_redirect_uri"])
	})

	t.Run("disabled google exposes no bind configuration", func(t *testing.T) {
		resetBaseline()
		common.GoogleOAuthEnabled = false
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		assert.Equal(t, false, data["google_oauth"])
	})

	t.Run("whitespace client id exposes no bind configuration", func(t *testing.T) {
		resetBaseline()
		common.GoogleClientId = "   "
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("empty server address degrades to a relative path and is not served", func(t *testing.T) {
		resetBaseline()
		// oauth.GoogleRedirectUri() falls back to ServerAddress +
		// "/oauth/google"; with an empty server address that is the relative
		// path "/oauth/google", which cannot anchor the same-origin callback.
		system_setting.ServerAddress = ""
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		// The plain enable switch is still advertised even when the bind
		// configuration is unusable.
		assert.Equal(t, true, data["google_oauth"])
	})

	t.Run("relative redirect override is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "/oauth/google"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("javascript scheme redirect is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "javascript:alert(document.cookie)"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("data scheme redirect is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "data:text/html,<script>alert(1)</script>"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("redirect with userinfo or fragment is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "https://user:pass@vancine.example.com/oauth/google"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		// Restore the baseline before the second mutation so the fragment
		// case does not depend on the userinfo case running first.
		resetBaseline()
		common.GoogleRedirectUri = "https://vancine.example.com/oauth/google#fragment"
		_, data = fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("client secret is never served even when bind configuration is", func(t *testing.T) {
		resetBaseline()
		recorder, data := fetchStatus(t)
		assert.NotEmpty(t, data["google_client_id"])
		assert.NotContains(t, recorder.Body.String(), common.GoogleClientSecret)
	})
}

func assertBindConfigurationAbsent(t *testing.T, data map[string]any) {
	t.Helper()
	_, hasClientID := data["google_client_id"]
	_, hasRedirect := data["google_redirect_uri"]
	assert.False(t, hasClientID, "google_client_id must not be served")
	assert.False(t, hasRedirect, "google_redirect_uri must not be served")
}

func TestGoogleBindFlowWritesGoogleSubForOwningSession(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "google-bind-owner")

	state := startGoogleBindFlow(t, owner, "session-owner")

	// The bind flow is stored bound to the owning user and session.
	flow, err := model.GetAuthFlow(state, model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeOAuth,
		Provider:  "google",
		Intent:    model.AuthFlowIntentBind,
		UserId:    owner.Id,
		SessionId: "session-owner",
	})
	require.NoError(t, err)
	assert.Equal(t, owner.Id, flow.UserId)
	assert.Equal(t, "session-owner", flow.SessionId)

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeOAuthResponse(t, recorder)
	require.True(t, response.Success, "bind callback failed: %s", response.Message)

	stored := reloadGoogleOAuthUser(t, env, owner.Id)
	assert.Equal(t, "google-sub-1", stored.GoogleSub)

	// The flow is single-use.
	_, err = model.GetAuthFlow(state, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth})
	assert.ErrorIs(t, err, model.ErrAuthFlowConsumed)
}

func TestGoogleBindStateRequiresAuthenticatedSession(t *testing.T) {
	setupGoogleOAuthTest(t)

	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"bind"}`), 0, "")
	GenerateOAuthCode(context)

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)
}

func TestGoogleLoginIntentFlowCannotBind(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "login-intent-user")

	// A login-intent flow carries no user/session, like every login entry.
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"login"}`), 0, "")
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var stateResponse struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &stateResponse))
	require.True(t, stateResponse.Success)

	callback := serveOAuthCallback("google",
		"state="+url.QueryEscape(stateResponse.Data.FlowToken)+"&code=mock-code",
		owner.Id, "session-owner")
	response := decodeOAuthResponse(t, callback)
	assert.False(t, response.Success, "a login flow must never complete as a bind")

	stored := reloadGoogleOAuthUser(t, env, owner.Id)
	assert.Empty(t, stored.GoogleSub)
}

func TestGoogleBindRejectsCrossedSessionState(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-crossed")
	intruder := createGoogleOAuthTestUser(t, env.db, "bind-intruder")

	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", intruder.Id, "session-intruder")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.False(t, decodeOAuthResponse(t, recorder).Success)

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, intruder.Id).GoogleSub)
	// The rejected flow stays unconsumed but unusable by the intruder.
	_, err := model.GetAuthFlow(state, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeOAuth, Provider: "google",
	})
	assert.NoError(t, err)
}

func TestGoogleBindRejectsStateOfAnotherProvider(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-provider")

	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("github",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
}

func TestGoogleBindRejectsForgedState(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-forged")

	recorder := serveOAuthCallback("google",
		"state=forged-state-token&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Zero(t, env.tokenCalls, "a forged state must never reach the provider")
}

func TestGoogleBindStateReplayRejected(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-replay")

	state := startGoogleBindFlow(t, owner, "session-owner")
	first := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	require.True(t, decodeOAuthResponse(t, first).Success)

	// Replay with a different upstream identity: the consumed state must be
	// rejected and must not overwrite the established binding.
	env.userInfoSub = "google-sub-2"
	replay := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, replay.Code)
	assert.False(t, decodeOAuthResponse(t, replay).Success)

	assert.Equal(t, "google-sub-1", reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
}

func TestGoogleBindRejectsSubAlreadyBoundToAnotherUser(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-taken")
	other := createGoogleOAuthTestUser(t, env.db, "bind-other-taken")
	other.GoogleSub = "google-sub-taken"
	require.NoError(t, env.db.Save(other).Error)

	env.userInfoSub = "google-sub-taken"
	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success, "a Google account bound to another user must be rejected")

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Equal(t, "google-sub-taken", reloadGoogleOAuthUser(t, env, other.Id).GoogleSub)
}

func TestGoogleBindCallbackRejectsDisabledProvider(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-disabled")

	state := startGoogleBindFlow(t, owner, "session-owner")
	common.GoogleOAuthEnabled = false

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Zero(t, env.tokenCalls, "a disabled provider must never reach Google")
}

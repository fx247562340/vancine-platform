package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Signup-conversion contract tests: the login envelope carries
// data.signup_completed=true ONLY when this request durably created a
// brand-new account (server-side confirmation). Existing-user logins, and
// account binds never set it, so client-side Google Ads conversion tracking
// can never be triggered by a login or a bind.

func decodeSignupCompleted(t *testing.T, w *httptest.ResponseRecorder) (present bool, value bool) {
	t.Helper()
	envelope := decodeEnvelope(t, w)
	data, ok := envelope["data"].(map[string]any)
	if !ok {
		return false, false
	}
	flag, present := data["signup_completed"]
	return present, flag == true
}

func TestSignupConversionWeChatNewUserCarriesSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	mock := newWeChatMock(t, "wechat-conversion-new")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL
	common.WeChatServerToken = "signup-conversion-wechat-token"

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/wechat?code=mock-code", nil)
	w := httptest.NewRecorder()
	wechatRouter().ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	present, value := decodeSignupCompleted(t, w)
	assert.True(t, present, "new WeChat user login must carry the signup_completed flag")
	assert.True(t, value)
}

func TestSignupConversionWeChatExistingUserOmitsSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	existing := model.User{
		Username: "wechat_conversion_existing", WeChatId: "wechat-conversion-old",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&existing).Error)

	mock := newWeChatMock(t, "wechat-conversion-old")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/wechat?code=mock-code", nil)
	w := httptest.NewRecorder()
	wechatRouter().ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	present, _ := decodeSignupCompleted(t, w)
	assert.False(t, present, "existing WeChat user login must not carry the signup_completed flag")
}

func TestSignupConversionWeChatBindOmitsSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	owner := model.User{
		Username: "wechat_conversion_bind_owner", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&owner).Error)

	mock := newWeChatMock(t, "wechat-conversion-bind")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/wechat/bind",
		strings.NewReader(`{"code":"mock-code"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", owner.Id)
	WeChatBind(c)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
	present, _ := decodeSignupCompleted(t, recorder)
	assert.False(t, present, "WeChat bind response must never carry the signup_completed flag")
}

// signupConversionGoogleFlow drives the unified Google OAuth callback once
// and returns the recorder so the caller can assert on the response.
func signupConversionGoogleFlow(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	router := gin.New()
	router.GET("/api/oauth/:provider", HandleOAuth)
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func signupConversionGoogleState(t *testing.T) string {
	t.Helper()
	recorder := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(recorder)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"login"}`))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var stateResp struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &stateResp))
	require.True(t, stateResp.Success)
	return stateResp.Data.FlowToken
}

func setupSignupConversionGoogleMock(t *testing.T) {
	t.Helper()
	mockGoogle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			_, _ = w.Write([]byte(`{"access_token":"mock-access","token_type":"Bearer","expires_in":3600}`))
		case "/userinfo":
			_, _ = w.Write([]byte(`{"sub":"signup-conversion-google-sub","email":"sc@example.com","email_verified":true,"name":"SC Google"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(mockGoogle.Close)
	oauth.GoogleTokenEndpoint = mockGoogle.URL + "/token"
	oauth.GoogleUserInfoEndpoint = mockGoogle.URL + "/userinfo"
}

func TestSignupConversionGoogleNewUserCarriesSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)
	setupSignupConversionGoogleMock(t)

	flowToken := signupConversionGoogleState(t)
	w := signupConversionGoogleFlow(t,
		"/api/oauth/google?state="+flowToken+"&code=mock-code")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	present, value := decodeSignupCompleted(t, w)
	assert.True(t, present, "new Google user login must carry the signup_completed flag")
	assert.True(t, value)
}

func TestSignupConversionGoogleExistingUserOmitsSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)
	setupSignupConversionGoogleMock(t)

	// First callback creates the account.
	flowToken := signupConversionGoogleState(t)
	w := signupConversionGoogleFlow(t,
		"/api/oauth/google?state="+flowToken+"&code=mock-code")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	// Second callback logs the same Google identity in: no new account, so
	// the login envelope must not claim a signup.
	flowToken2 := signupConversionGoogleState(t)
	w2 := signupConversionGoogleFlow(t,
		"/api/oauth/google?state="+flowToken2+"&code=mock-code")
	require.Equal(t, http.StatusOK, w2.Code, w2.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w2)["success"], w2.Body.String())
	present, _ := decodeSignupCompleted(t, w2)
	assert.False(t, present, "existing Google user login must not carry the signup_completed flag")
}

func TestSignupConversionPasswordRegisterReturnsServerConfirmedUserId(t *testing.T) {
	setupAcquisitionTest(t)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/register",
		strings.NewReader(`{"username":"pw-signup-user","password":"password123"}`))
	c.Request.Header.Set("Content-Type", "application/json")

	Register(c)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	envelope := decodeEnvelope(t, recorder)
	require.Equal(t, true, envelope["success"], recorder.Body.String())
	data, ok := envelope["data"].(map[string]any)
	require.True(t, ok, "register success must carry a data object")
	userID, hasUserID := data["user_id"]
	require.True(t, hasUserID, "register success must return the server-confirmed user_id dedup key")

	var created model.User
	require.NoError(t, model.DB.Where("username = ?", "pw-signup-user").First(&created).Error)
	require.Greater(t, created.Id, 0)
	assert.Equal(t, float64(created.Id), userID, "user_id must be the persisted new account's id")
	// No personal data beyond the opaque id is returned.
	for _, key := range []string{"username", "email", "display_name"} {
		assert.NotContains(t, data, key)
	}
}

// Generic (non-Google) OAuth providers through the unified callback.
func signupConversionOAuthFlow(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	router := gin.New()
	router.GET("/api/oauth/:provider", HandleOAuth)
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestSignupConversionGenericOAuthNewUserCarriesSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	provider := &stubOAuthProvider{
		taken: map[string]bool{},
		users: map[string]*model.User{},
		info:  &oauth.OAuthUser{ProviderUserID: "stub-signup-new-1", Username: "stubsignup1"},
	}
	oauth.Register("stubsignup", provider)
	t.Cleanup(func() { oauth.Unregister("stubsignup") })

	// Mint a login-intent flow token through the real state endpoint.
	recorder := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(recorder)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"stubsignup","intent":"login"}`))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var stateResp struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &stateResp))
	require.True(t, stateResp.Success)

	w := signupConversionOAuthFlow(t,
		"/api/oauth/stubsignup?state="+stateResp.Data.FlowToken+"&code=stub-code")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	present, value := decodeSignupCompleted(t, w)
	assert.True(t, present, "new generic OAuth user login must carry the signup_completed flag")
	assert.True(t, value)
}

func TestSignupConversionGenericOAuthExistingUserOmitsSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	existing := model.User{
		Username: "stub_oauth_existing", GitHubId: "stub-signup-old-1",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&existing).Error)
	provider := &stubOAuthProvider{
		taken: map[string]bool{"stub-signup-old-1": true},
		users: map[string]*model.User{"stub-signup-old-1": &existing},
		info:  &oauth.OAuthUser{ProviderUserID: "stub-signup-old-1"},
	}
	oauth.Register("stublogin", provider)
	t.Cleanup(func() { oauth.Unregister("stublogin") })

	// findOrCreateOAuthUser is the server-side authority for new-vs-existing
	// on the generic path; drive it directly (same as the acquisition tests).
	c, recorder := newAcquisitionOAuthContext()
	c.Request = httptest.NewRequest(http.MethodGet, "/api/oauth/stublogin", nil)
	user, err := findOrCreateOAuthUser(c, provider, provider.info, "")
	require.NoError(t, err)
	require.Equal(t, existing.Id, user.Id)

	// The exact production tail of the login path: setupLogin on the same
	// context writes the envelope the frontend receives. An existing-user
	// login must not claim a signup.
	assert.False(t, c.GetBool(signupCompletedContextKey))
	setupLogin(user, c)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, true, decodeEnvelope(t, recorder)["success"], recorder.Body.String())
	present, _ := decodeSignupCompleted(t, recorder)
	assert.False(t, present, "existing generic OAuth user login must not carry the signup_completed flag")
}

func TestSignupConversionGenericOAuthBindOmitsSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)

	owner := model.User{
		Username: "signup_conversion_bind_owner", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&owner).Error)

	provider := &stubOAuthProvider{
		taken: map[string]bool{},
		users: map[string]*model.User{},
		info:  &oauth.OAuthUser{ProviderUserID: "stub-signup-bind-1"},
	}
	oauth.Register("stubbind", provider)
	t.Cleanup(func() { oauth.Unregister("stubbind") })

	// Start a bind-intent flow exactly like the account settings page does.
	stateRecorder := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(stateRecorder)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"stubbind","intent":"bind"}`))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	stateCtx.Set("id", owner.Id)
	stateCtx.Set("session_id", "signup-conversion-session-1")
	stateCtx.Set("auth_version", int64(1))
	stateCtx.Set("session_version", int64(1))
	GenerateOAuthCode(stateCtx)
	require.Equal(t, http.StatusOK, stateRecorder.Code, stateRecorder.Body.String())
	var stateResp struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(stateRecorder.Body.Bytes(), &stateResp))
	require.True(t, stateResp.Success)

	// Drive the callback through the real router so :provider resolves.
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", owner.Id)
		c.Set("session_id", "signup-conversion-session-1")
		c.Set("auth_version", int64(1))
		c.Set("session_version", int64(1))
		c.Next()
	})
	router.GET("/api/oauth/:provider", HandleOAuth)
	callback := httptest.NewRecorder()
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/api/oauth/stubbind?state="+stateResp.Data.FlowToken+"&code=bind-code", nil)
	router.ServeHTTP(callback, callbackReq)
	require.Equal(t, http.StatusOK, callback.Code, callback.Body.String())
	require.Equal(t, true, decodeEnvelope(t, callback)["success"], callback.Body.String())

	// The provider id got linked to the existing account...
	var updated model.User
	require.NoError(t, model.DB.First(&updated, owner.Id).Error)
	assert.NotEmpty(t, updated.GitHubId)
	// ...but the bind response must never claim a signup.
	present, _ := decodeSignupCompleted(t, callback)
	assert.False(t, present, "generic OAuth account bind must not carry the signup_completed flag")
}

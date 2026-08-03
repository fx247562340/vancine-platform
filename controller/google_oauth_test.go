package controller

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// setupGoogleControllerTest prepares an in-memory sqlite database and saves /
// restores every global the Google OAuth flow touches, mirroring the Telegram
// controller test setup.
func setupGoogleControllerTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	origDB := model.DB
	origLogDB := model.LOG_DB
	origCrypto := common.CryptoSecret
	origSQLite := common.UsingSQLite
	origMySQL := common.UsingMySQL
	origPG := common.UsingPostgreSQL
	origRedis := common.RedisEnabled
	origRegister := common.RegisterEnabled
	origSessionSecret := common.SessionSecret
	origGenToken := constant.GenerateDefaultToken
	origGoogleEnabled := common.GoogleOAuthEnabled
	origGoogleClientId := common.GoogleClientId
	origGoogleClientSecret := common.GoogleClientSecret
	origGoogleRedirectUri := common.GoogleRedirectUri
	origServerAddress := system_setting.ServerAddress
	origTokenEndpoint := googleTokenEndpoint
	origUserInfoEndpoint := googleUserInfoEndpoint
	t.Cleanup(func() {
		if model.DB != nil && model.DB != origDB {
			if sqlDB, err := model.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.CryptoSecret = origCrypto
		common.UsingSQLite = origSQLite
		common.UsingMySQL = origMySQL
		common.UsingPostgreSQL = origPG
		common.RedisEnabled = origRedis
		common.RegisterEnabled = origRegister
		common.SessionSecret = origSessionSecret
		constant.GenerateDefaultToken = origGenToken
		common.GoogleOAuthEnabled = origGoogleEnabled
		common.GoogleClientId = origGoogleClientId
		common.GoogleClientSecret = origGoogleClientSecret
		common.GoogleRedirectUri = origGoogleRedirectUri
		system_setting.ServerAddress = origServerAddress
		googleTokenEndpoint = origTokenEndpoint
		googleUserInfoEndpoint = origUserInfoEndpoint
	})

	common.CryptoSecret = "google-controller-test-secret"
	common.SessionSecret = "google-controller-session-secret"
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.RegisterEnabled = true
	constant.GenerateDefaultToken = false
	common.GoogleOAuthEnabled = true
	common.GoogleClientId = "test-google-client-id"
	common.GoogleClientSecret = "test-google-client-secret"
	common.GoogleRedirectUri = ""
	system_setting.ServerAddress = "https://vancine.test"

	dsn := "file:google_ctrl_" + strconv.FormatInt(int64(os.Getpid()), 10) + "_" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AcquisitionTouch{}, &model.Token{}, &model.Log{}))
}

// newGoogleOAuthEngine builds a gin engine with cookie sessions and the two
// Google OAuth routes. The extra helper route lets tests seed a logged-in
// session to exercise the bind flow.
func newGoogleOAuthEngine() *gin.Engine {
	engine := gin.New()
	store := cookie.NewStore([]byte(common.SessionSecret))
	engine.Use(sessions.Sessions("session", store))
	engine.GET("/api/oauth/google/login", GoogleLogin)
	engine.GET("/api/oauth/google/callback", GoogleCallback)
	engine.GET("/test/login-as/:id/:username", func(c *gin.Context) {
		session := sessions.Default(c)
		id, _ := strconv.Atoi(c.Param("id"))
		session.Set("id", id)
		session.Set("username", c.Param("username"))
		_ = session.Save()
		c.Status(http.StatusOK)
	})
	return engine
}

// mockGoogleServer spins up token + userinfo endpoints and points the package
// endpoint variables at them. userInfo is returned verbatim by /userinfo.
func mockGoogleServer(t *testing.T, userInfo string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			require.NoError(t, r.ParseForm())
			assert.Equal(t, "authorization_code", r.PostFormValue("grant_type"))
			assert.Equal(t, common.GoogleClientId, r.PostFormValue("client_id"))
			assert.Equal(t, common.GoogleClientSecret, r.PostFormValue("client_secret"))
			assert.NotEmpty(t, r.PostFormValue("code"))
			assert.NotEmpty(t, r.PostFormValue("redirect_uri"))
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"mock-access-token","token_type":"Bearer","expires_in":3599,"scope":"openid email profile"}`))
		case "/userinfo":
			assert.Equal(t, "Bearer mock-access-token", r.Header.Get("Authorization"))
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(userInfo))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	googleTokenEndpoint = server.URL + "/token"
	googleUserInfoEndpoint = server.URL + "/userinfo"
	return server
}

// startGoogleLogin performs GET /api/oauth/google/login and returns the state
// parsed from the authorize redirect together with the session cookie.
func startGoogleLogin(t *testing.T, engine *gin.Engine, extraQuery string) (state string, cookies []*http.Cookie) {
	t.Helper()
	target := "/api/oauth/google/login"
	if extraQuery != "" {
		target += "?" + extraQuery
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode, "login should redirect to Google")
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	state = location.Query().Get("state")
	require.NotEmpty(t, state)
	return state, resp.Cookies()
}

func doGoogleCallback(t *testing.T, engine *gin.Engine, cookies []*http.Cookie, query string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/google/callback?"+query, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

func TestGoogleLoginDisabled(t *testing.T) {
	setupGoogleControllerTest(t)
	common.GoogleOAuthEnabled = false
	engine := newGoogleOAuthEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/google/login", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"success":false`)
}

func TestGoogleLoginMissingClientId(t *testing.T) {
	setupGoogleControllerTest(t)
	common.GoogleClientId = ""
	engine := newGoogleOAuthEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/google/login", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"success":false`)
}

func TestGoogleLoginRedirectsToGoogleAuthorizeURL(t *testing.T) {
	setupGoogleControllerTest(t)
	engine := newGoogleOAuthEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/google/login", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "accounts.google.com", location.Host)
	assert.Equal(t, "/o/oauth2/v2/auth", location.Path)

	q := location.Query()
	assert.Equal(t, common.GoogleClientId, q.Get("client_id"))
	assert.Equal(t, "https://vancine.test/api/oauth/google/callback", q.Get("redirect_uri"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Contains(t, q.Get("scope"), "openid")
	assert.Contains(t, q.Get("scope"), "email")
	assert.Contains(t, q.Get("scope"), "profile")
	assert.Equal(t, "select_account", q.Get("prompt"))
	assert.NotEmpty(t, q.Get("state"))

	// state must also be persisted in the session cookie
	assert.NotEmpty(t, resp.Cookies(), "session cookie should be set with oauth state")
}

func TestGoogleLoginCustomRedirectUri(t *testing.T) {
	setupGoogleControllerTest(t)
	common.GoogleRedirectUri = "https://custom.example.com/cb"
	engine := newGoogleOAuthEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/google/login", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "https://custom.example.com/cb", location.Query().Get("redirect_uri"))
}

func TestGoogleCallbackStateMismatch(t *testing.T) {
	setupGoogleControllerTest(t)
	engine := newGoogleOAuthEngine()

	state, cookies := startGoogleLogin(t, engine, "")
	require.NotEmpty(t, state)

	w := doGoogleCallback(t, engine, cookies, "code=abc&state=wrong-state")
	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), `"success":false`)
}

func TestGoogleCallbackNewEmailCreatesUser(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-1","email":"newuser@example.com","name":"New User","picture":"https://example.com/p.png"}`)
	engine := newGoogleOAuthEngine()

	state, cookies := startGoogleLogin(t, engine, "")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode, "successful login should redirect, body: %s", w.Body.String())
	assert.Equal(t, "/", resp.Header.Get("Location"))

	var user model.User
	require.NoError(t, model.DB.Where("google_sub = ?", "google-sub-1").First(&user).Error)
	assert.Equal(t, "newuser@example.com", user.Email)
	assert.Equal(t, "New User", user.DisplayName)
	assert.Equal(t, common.UserStatusEnabled, user.Status)

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestGoogleCallbackExistingEmailBindsGoogleSub(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-2","email":"existing@example.com","name":"Existing User"}`)

	existing := model.User{
		Username:    "existing_user",
		DisplayName: "Existing",
		Email:       "existing@example.com",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, existing.Insert(0))

	engine := newGoogleOAuthEngine()
	state, cookies := startGoogleLogin(t, engine, "")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode, "body: %s", w.Body.String())

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&count).Error)
	assert.Equal(t, int64(1), count, "no new user should be created")

	var user model.User
	require.NoError(t, model.DB.Where("email = ?", "existing@example.com").First(&user).Error)
	assert.Equal(t, "google-sub-2", user.GoogleSub)
}

func TestGoogleCallbackKnownSubLogsIn(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-3","email":"known@example.com","name":"Known User"}`)

	known := model.User{
		Username:    "known_user",
		DisplayName: "Known",
		Email:       "known@example.com",
		GoogleSub:   "google-sub-3",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, known.Insert(0))

	engine := newGoogleOAuthEngine()
	state, cookies := startGoogleLogin(t, engine, "")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode, "body: %s", w.Body.String())

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestGoogleCallbackHonorsRedirectParam(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-4","email":"redirect@example.com","name":"Redirect User"}`)
	engine := newGoogleOAuthEngine()

	state, cookies := startGoogleLogin(t, engine, "redirect=/dashboard")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, "/dashboard", resp.Header.Get("Location"))
}

func TestGoogleCallbackRejectsOpenRedirect(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-5","email":"evil@example.com","name":"Evil"}`)
	engine := newGoogleOAuthEngine()

	state, cookies := startGoogleLogin(t, engine, "redirect=https://evil.example.com/phish")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, "/", resp.Header.Get("Location"))
}

func TestGoogleCallbackRegistrationDisabled(t *testing.T) {
	setupGoogleControllerTest(t)
	common.RegisterEnabled = false
	mockGoogleServer(t, `{"sub":"google-sub-6","email":"fresh@example.com","name":"Fresh"}`)
	engine := newGoogleOAuthEngine()

	state, cookies := startGoogleLogin(t, engine, "")
	w := doGoogleCallback(t, engine, cookies, "code=valid-code&state="+url.QueryEscape(state))

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"success":false`)

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

func TestGoogleCallbackBindsToLoggedInUser(t *testing.T) {
	setupGoogleControllerTest(t)
	mockGoogleServer(t, `{"sub":"google-sub-7","email":"bindme@example.com","name":"Bind Me"}`)

	loggedIn := model.User{
		Username:    "logged_in_user",
		DisplayName: "Logged In",
		Email:       "loggedin@example.com",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, loggedIn.Insert(0))

	engine := newGoogleOAuthEngine()

	// seed a logged-in session
	seedReq := httptest.NewRequest(http.MethodGet, "/test/login-as/"+strconv.Itoa(loggedIn.Id)+"/logged_in_user", nil)
	seedW := httptest.NewRecorder()
	engine.ServeHTTP(seedW, seedReq)
	cookies := seedW.Result().Cookies()

	state, mergedCookies := startGoogleLoginWithCookies(t, engine, "", cookies)
	w := doGoogleCallback(t, engine, mergedCookies, "code=valid-code&state="+url.QueryEscape(state))

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode, "body: %s", w.Body.String())

	var user model.User
	require.NoError(t, model.DB.Where("id = ?", loggedIn.Id).First(&user).Error)
	assert.Equal(t, "google-sub-7", user.GoogleSub)

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

// startGoogleLoginWithCookies performs the login step carrying pre-existing
// cookies so a logged-in session survives into the callback.
func startGoogleLoginWithCookies(t *testing.T, engine *gin.Engine, extraQuery string, cookies []*http.Cookie) (string, []*http.Cookie) {
	t.Helper()
	target := "/api/oauth/google/login"
	if extraQuery != "" {
		target += "?" + extraQuery
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	resp := w.Result()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	state := location.Query().Get("state")
	require.NotEmpty(t, state)

	// merge refreshed session cookie over the originals
	merged := map[string]*http.Cookie{}
	for _, c := range cookies {
		merged[c.Name] = c
	}
	for _, c := range resp.Cookies() {
		merged[c.Name] = c
	}
	out := make([]*http.Cookie, 0, len(merged))
	for _, c := range merged {
		out = append(out, c)
	}
	return state, out
}

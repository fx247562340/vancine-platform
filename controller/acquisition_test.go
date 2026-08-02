package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/service/acquisition"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAcquisitionControllerTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	// Snapshot globals so other controller package tests are not polluted.
	origDB := model.DB
	origLogDB := model.LOG_DB
	origCrypto := common.CryptoSecret
	origSQLite := common.UsingSQLite
	origMySQL := common.UsingMySQL
	origPG := common.UsingPostgreSQL
	origRedis := common.RedisEnabled
	origLogConsume := common.LogConsumeEnabled
	origRegister := common.RegisterEnabled
	origPasswordRegister := common.PasswordRegisterEnabled
	origEmailVerif := common.EmailVerificationEnabled
	origGenToken := constant.GenerateDefaultToken
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
		common.LogConsumeEnabled = origLogConsume
		common.RegisterEnabled = origRegister
		common.PasswordRegisterEnabled = origPasswordRegister
		common.EmailVerificationEnabled = origEmailVerif
		constant.GenerateDefaultToken = origGenToken
	})

	common.CryptoSecret = "acquisition-controller-test-secret"
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.LogConsumeEnabled = true
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false
	constant.GenerateDefaultToken = false

	// Per-test unique DSN avoids shared-cache collisions across parallel tests.
	dsn := "file:acq_ctrl_" + strconv.FormatInt(int64(os.Getpid()), 10) + "_" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.AcquisitionTouch{}, &model.User{}, &model.Token{}, &model.Log{}))
	require.NoError(t, db.Exec("DELETE FROM acquisition_touches").Error)
	require.NoError(t, db.Exec("DELETE FROM options").Error)
	require.NoError(t, db.Exec("DELETE FROM users").Error)
	require.NoError(t, db.Exec("DELETE FROM tokens").Error)
	require.NoError(t, db.Exec("DELETE FROM logs").Error)
	require.NoError(t, db.Create(&model.Option{Key: model.AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
}

func acquisitionRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/acquisition/touch", PostAcquisitionTouch)
	r.GET("/api/acquisition/funnel", func(c *gin.Context) {
		// Simulate AdminAuth by injecting role
		role := c.GetHeader("X-Test-Role")
		if role == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "unauthorized"})
			c.Abort()
			return
		}
		ri, _ := strconv.Atoi(role)
		if ri < common.RoleAdminUser {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "forbidden"})
			c.Abort()
			return
		}
		GetAcquisitionFunnel(c)
	})
	return r
}

func TestPostAcquisitionTouchLandingViewCreates(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()

	body := `{"event":"landing_view","utm_source":"reddit","utm_campaign":"kimi_k3_launch","landing_path":"/kimi-k3-api"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, true, data["ok"])
	assert.Equal(t, true, data["touch_present"])
	// No touch_id in JSON
	_, hasTouchID := data["touch_id"]
	assert.False(t, hasTouchID)

	cookies := w.Result().Cookies()
	require.NotEmpty(t, cookies)
	var ft *http.Cookie
	for _, c := range cookies {
		if c.Name == model.AcquisitionCookieName {
			ft = c
		}
	}
	require.NotNil(t, ft)
	assert.True(t, ft.HttpOnly)
	assert.False(t, ft.Secure) // plain HTTP
	id, ok := model.ParseAndVerifyTouchCookie(ft.Value)
	require.True(t, ok)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/kimi-k3-api", touch.LandingPath)
}

func TestPostAcquisitionTouchLandingViewImmutableAndIdempotent(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()

	body1 := `{"event":"landing_view","utm_source":"reddit","landing_path":"/a"}`
	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body1))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)
	cookie := w1.Result().Cookies()[0]

	body2 := `{"event":"landing_view","utm_source":"twitter","landing_path":"/b"}`
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	req2.AddCookie(cookie)
	r.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusOK, w2.Code)

	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/a", touch.LandingPath)

	var n int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&n).Error)
	assert.Equal(t, int64(1), n)
}

func TestPostAcquisitionTouchDirectUnknown(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()
	body := `{"event":"landing_view","landing_path":"/home"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	cookie := w.Result().Cookies()[0]
	id, _ := model.ParseAndVerifyTouchCookie(cookie.Value)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	assert.Equal(t, "", touch.UtmSource)
	assert.Equal(t, "/home", touch.LandingPath)
}

func TestPostAcquisitionTouchInvalidCookieMintsNew(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()
	body := `{"event":"landing_view","landing_path":"/x"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: "0123456789abcdef0123456789abcdef.deadbeef"})
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	var n int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&n).Error)
	assert.Equal(t, int64(1), n)
}

func TestPostAcquisitionTouchSignupStartedNoCreate(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()
	body := `{"event":"signup_started"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, true, data["ok"])
	assert.Equal(t, false, data["touch_present"])
	var n int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&n).Error)
	assert.Equal(t, int64(0), n)
}

func TestPostAcquisitionTouchSignupStartedIdempotent(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()

	// Create touch
	w0 := httptest.NewRecorder()
	req0 := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(`{"event":"landing_view","landing_path":"/sign-up"}`))
	req0.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w0, req0)
	cookie := w0.Result().Cookies()[0]

	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(`{"event":"signup_started"}`))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(cookie)
		r.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
	}
	id, _ := model.ParseAndVerifyTouchCookie(cookie.Value)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	require.NotNil(t, touch.SignupStartedAt)
}

func TestPostAcquisitionTouchRejectsClientSignupCompleted(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(`{"event":"signup_completed"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, false, resp["success"])
}

func TestPostAcquisitionTouchSecureCookieWhenForwardedHTTPS(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(`{"event":"landing_view","landing_path":"/"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-Proto", "https")
	r.ServeHTTP(w, req)
	cookie := w.Result().Cookies()[0]
	assert.True(t, cookie.Secure)
}

func TestGetAcquisitionFunnelAdminAuth(t *testing.T) {
	setupAcquisitionControllerTest(t)
	r := acquisitionRouter()

	// No role
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// Common user
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	req2.Header.Set("X-Test-Role", strconv.Itoa(common.RoleCommonUser))
	r.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusForbidden, w2.Code)

	// Admin
	w3 := httptest.NewRecorder()
	req3 := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	req3.Header.Set("X-Test-Role", strconv.Itoa(common.RoleAdminUser))
	r.ServeHTTP(w3, req3)
	require.Equal(t, http.StatusOK, w3.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w3.Body.Bytes(), &resp))
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, false, data["historical_backfill_available"])
	assert.Equal(t, float64(1), data["coverage_started_at"])
}

func TestRegisterBindOrderGenerateDefaultTokenFalse(t *testing.T) {
	setupAcquisitionControllerTest(t)
	constant.GenerateDefaultToken = false
	// Create touch + cookie
	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{UtmSource: "reddit", LandingPath: "/sign-up"})
	require.NoError(t, err)
	cookieVal := model.FormatTouchCookieValue(touch.TouchId)

	r := gin.New()
	store := cookie.NewStore([]byte("acquisition-register-test-session"))
	r.Use(sessions.Sessions("session", store))
	r.POST("/api/user/register", Register)

	body := map[string]string{
		"username": "acquser1",
		"password": "password123",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/user/register", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: cookieVal})
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "acquser1").First(&user).Error)
	assert.Greater(t, user.Id, 0)

	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	// OAuth-style fill of signup_started on bind when client skipped
	require.NotNil(t, loaded.SignupStartedAt)

	// Also keep a direct helper contract assertion (independent of HTTP stack).
	touch2, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/r"})
	require.NoError(t, err)
	w2 := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w2)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Request.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: model.FormatTouchCookieValue(touch2.TouchId)})
	acquisition.BindTouchToUser(c, 12345)
	loaded2, err := model.GetAcquisitionTouchByTouchID(touch2.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded2.UserId)
	assert.Equal(t, 12345, *loaded2.UserId)
	require.NotNil(t, loaded2.SignupCompletedAt)
}

// TestDefaultTokenFailureDoesNotBind exercises the real Register path with
// GenerateDefaultToken=true and a forced token.Insert failure (unique key
// collision). BindTouchToUser must NOT run; the touch stays unbound.
func TestDefaultTokenFailureDoesNotBind(t *testing.T) {
	setupAcquisitionControllerTest(t)
	constant.GenerateDefaultToken = true

	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/r"})
	require.NoError(t, err)
	cookieVal := model.FormatTouchCookieValue(touch.TouchId)

	// Pre-seed a token with a key that will collide if GenerateKey somehow
	// returned the same value. We instead force Insert failure by closing the
	// underlying SQL DB after user insert is not easily interceptable, so we
	// take a different approach: replace Token table with a CHECK-constrained
	// stub that rejects inserts. Simpler: drop tokens table so token.Insert fails.
	// But user.Insert also needs tokens? No — only Token.Insert uses tokens table.
	// Drop and recreate empty tokens without AutoMigrate fields? Use a broken table:
	require.NoError(t, model.DB.Migrator().DropTable(&model.Token{}))
	// Recreate a tokens table missing required shape so Create fails, OR with a
	// trigger. SQLite: create tokens as a view (non-insertable).
	require.NoError(t, model.DB.Exec("CREATE TABLE tokens (id integer primary key, user_id integer NOT NULL CHECK(user_id < 0))").Error)

	r := gin.New()
	store := cookie.NewStore([]byte("acquisition-register-token-fail"))
	r.Use(sessions.Sessions("session", store))
	r.POST("/api/user/register", Register)

	body := map[string]string{
		"username": "acqtokfail1",
		"password": "password123",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/user/register", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: cookieVal})
	r.ServeHTTP(w, req)

	// Register must fail on default token insert (CHECK constraint / shape).
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, false, resp["success"], w.Body.String())

	// User row may exist (Insert succeeded before token failure) — that is OK.
	// Critical: touch must remain unbound.
	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Nil(t, loaded.UserId, "touch must not bind when default token fails")
	assert.Nil(t, loaded.SignupCompletedAt)

	// Restore tokens table for subsequent tests.
	_ = model.DB.Exec("DROP TABLE IF EXISTS tokens")
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
}

// stubOAuthProvider implements oauth.Provider for findOrCreateOAuthUser tests.
type stubOAuthProvider struct {
	taken map[string]bool
	users map[string]*model.User
}

func (p *stubOAuthProvider) GetName() string { return "Stub" }
func (p *stubOAuthProvider) IsEnabled() bool { return true }
func (p *stubOAuthProvider) ExchangeToken(ctx context.Context, code string, c *gin.Context) (*oauth.OAuthToken, error) {
	return nil, nil
}
func (p *stubOAuthProvider) GetUserInfo(ctx context.Context, token *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return nil, nil
}
func (p *stubOAuthProvider) IsUserIDTaken(providerUserID string) bool {
	return p.taken[providerUserID]
}
func (p *stubOAuthProvider) FillUserByProviderID(user *model.User, providerUserID string) error {
	u := p.users[providerUserID]
	if u == nil {
		return gorm.ErrRecordNotFound
	}
	*user = *u
	return nil
}
func (p *stubOAuthProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.GitHubId = providerUserID
}
func (p *stubOAuthProvider) GetProviderPrefix() string { return "stub_" }

func TestOAuthNewUserBindExistingSkip(t *testing.T) {
	setupAcquisitionControllerTest(t)
	common.RegisterEnabled = true

	// --- New user path via real findOrCreateOAuthUser ---
	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{UtmSource: "gh", LandingPath: "/oauth"})
	require.NoError(t, err)
	cookieVal := model.FormatTouchCookieValue(touch.TouchId)

	r := gin.New()
	store := cookie.NewStore([]byte("acquisition-oauth-bind-test"))
	r.Use(sessions.Sessions("session", store))
	r.GET("/oauth/test", func(c *gin.Context) {
		prov := &stubOAuthProvider{taken: map[string]bool{}, users: map[string]*model.User{}}
		ou := &oauth.OAuthUser{ProviderUserID: "stub-new-1", Username: "stubnew1", DisplayName: "Stub New"}
		sess := sessions.Default(c)
		user, err := findOrCreateOAuthUser(c, prov, ou, sess)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "user_id": user.Id})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/oauth/test", nil)
	req.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: cookieVal})
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, true, resp["success"])
	newUID := int(resp["user_id"].(float64))
	assert.Greater(t, newUID, 0)

	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, newUID, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)

	// --- Existing user path: IsUserIDTaken true → no bind ---
	// Persist the created user under the stub's taken map via GitHubId we set.
	var existing model.User
	require.NoError(t, model.DB.First(&existing, newUID).Error)
	// Mark provider id taken by seeding a second request with same provider id
	// through a provider that reports taken and fills existing user.
	touch2, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/oauth2"})
	require.NoError(t, err)
	cookieVal2 := model.FormatTouchCookieValue(touch2.TouchId)

	r2 := gin.New()
	r2.Use(sessions.Sessions("session", store))
	r2.GET("/oauth/test", func(c *gin.Context) {
		prov := &stubOAuthProvider{
			taken: map[string]bool{"stub-new-1": true},
			users: map[string]*model.User{"stub-new-1": &existing},
		}
		ou := &oauth.OAuthUser{ProviderUserID: "stub-new-1"}
		sess := sessions.Default(c)
		user, err := findOrCreateOAuthUser(c, prov, ou, sess)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		// Existing-login path must NOT call BindTouchToUser — findOrCreate returns early.
		c.JSON(http.StatusOK, gin.H{"success": true, "user_id": user.Id, "existing": true})
	})
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/oauth/test", nil)
	req2.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: cookieVal2})
	r2.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusOK, w2.Code, w2.Body.String())

	loaded2, err := model.GetAcquisitionTouchByTouchID(touch2.TouchId)
	require.NoError(t, err)
	assert.Nil(t, loaded2.UserId, "existing OAuth login must not bind a new touch")
	assert.Nil(t, loaded2.SignupCompletedAt)
}

func TestFunnelCompletenessJSON(t *testing.T) {
	setupAcquisitionControllerTest(t)
	common.LogConsumeEnabled = false
	r := acquisitionRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	req.Header.Set("X-Test-Role", strconv.Itoa(common.RoleAdminUser))
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	s := w.Body.String()
	assert.Contains(t, s, `"first_api_call_succeeded":null`)
	assert.Contains(t, s, `"consume_logs":"unavailable"`)
	assert.Contains(t, s, `"historical_backfill_available":false`)
}

func TestRegisterSourceOrderContract(t *testing.T) {
	// Source-level contract: BindTouchToUser appears after GenerateDefaultToken block and before setupLogin.
	src, err := os.ReadFile("user.go")
	require.NoError(t, err)
	s := string(src)
	bindIdx := strings.Index(s, "acquisition.BindTouchToUser(c, insertedUser.Id)")
	setupIdx := strings.Index(s, "setupLogin(&insertedUser, c)")
	tokenBlock := strings.Index(s, "if constant.GenerateDefaultToken")
	require.Greater(t, bindIdx, 0)
	require.Greater(t, setupIdx, bindIdx)
	require.Greater(t, bindIdx, tokenBlock)
	// Ensure bind is not between Insert and GenerateDefaultToken when token enabled:
	// The only BindTouchToUser in Register should be immediately before setupLogin.
	registerStart := strings.Index(s, "func Register(")
	registerEnd := strings.Index(s[registerStart+1:], "\nfunc ")
	if registerEnd > 0 {
		reg := s[registerStart : registerStart+1+registerEnd]
		assert.Equal(t, 1, strings.Count(reg, "BindTouchToUser"))
		assert.True(t, strings.Index(reg, "BindTouchToUser") < strings.Index(reg, "setupLogin(&insertedUser"))
	}
}

// TestOAuthNewUserCreatesDefaultToken verifies the generic findOrCreateOAuthUser
// path provisions a default token for a brand-new OAuth user when
// GenerateDefaultToken=true, and that an existing-user login creates none.
func TestOAuthNewUserCreatesDefaultToken(t *testing.T) {
	setupAcquisitionControllerTest(t)
	constant.GenerateDefaultToken = true
	common.RegisterEnabled = true

	r := gin.New()
	store := cookie.NewStore([]byte("acquisition-oauth-default-token"))
	r.Use(sessions.Sessions("session", store))
	r.GET("/oauth/test", func(c *gin.Context) {
		prov := &stubOAuthProvider{taken: map[string]bool{}, users: map[string]*model.User{}}
		ou := &oauth.OAuthUser{ProviderUserID: "stub-tok-1", Username: "stubtok1", DisplayName: "Stub Tok"}
		sess := sessions.Default(c)
		user, err := findOrCreateOAuthUser(c, prov, ou, sess)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "user_id": user.Id})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/oauth/test", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, true, resp["success"])
	newUID := int(resp["user_id"].(float64))
	assert.Greater(t, newUID, 0)

	var tokens []model.Token
	require.NoError(t, model.DB.Where("user_id = ?", newUID).Find(&tokens).Error)
	require.Len(t, tokens, 1)
	assert.Equal(t, int64(-1), tokens[0].ExpiredTime)
	assert.True(t, tokens[0].UnlimitedQuota)

	// Existing-user login (provider reports taken + fills the user) creates no
	// additional token.
	var existing model.User
	require.NoError(t, model.DB.First(&existing, newUID).Error)
	r2 := gin.New()
	r2.Use(sessions.Sessions("session", store))
	r2.GET("/oauth/test", func(c *gin.Context) {
		prov := &stubOAuthProvider{
			taken: map[string]bool{"stub-tok-1": true},
			users: map[string]*model.User{"stub-tok-1": &existing},
		}
		ou := &oauth.OAuthUser{ProviderUserID: "stub-tok-1"}
		sess := sessions.Default(c)
		user, err := findOrCreateOAuthUser(c, prov, ou, sess)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "user_id": user.Id})
	})
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/oauth/test", nil)
	r2.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusOK, w2.Code, w2.Body.String())

	var afterTokens []model.Token
	require.NoError(t, model.DB.Where("user_id = ?", newUID).Find(&afterTokens).Error)
	assert.Len(t, afterTokens, 1, "existing OAuth login must not create another token")
}

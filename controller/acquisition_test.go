package controller

import (
	"bytes"
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// setupAcquisitionTest swaps every global the acquisition paths touch onto an
// isolated in-memory database and restores all of it on cleanup.
func setupAcquisitionTest(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	orig := struct {
		db                   *gorm.DB
		logDB                *gorm.DB
		mainDBType           common.DatabaseType
		secret               string
		logConsume           bool
		registerEnabled      bool
		passwordRegister     bool
		emailVerification    bool
		generateDefaultToken bool
		wechatEnabled        bool
		wechatAddress        string
		wechatToken          string
		googleEnabled        bool
		googleClientID       string
		googleClientSecret   string
		googleRedirect       string
		serverAddress        string
		googleTokenEndpoint  string
		googleUserInfoEP     string
		optionMap            map[string]string
		redisEnabled         bool
		criticalRateEnabled  bool
		criticalRateNum      int
	}{
		db:                   model.DB,
		logDB:                model.LOG_DB,
		mainDBType:           common.MainDatabaseType(),
		secret:               common.CryptoSecret,
		logConsume:           common.LogConsumeEnabled,
		registerEnabled:      common.RegisterEnabled,
		passwordRegister:     common.PasswordRegisterEnabled,
		emailVerification:    common.EmailVerificationEnabled,
		generateDefaultToken: constant.GenerateDefaultToken,
		wechatEnabled:        common.WeChatAuthEnabled,
		wechatAddress:        common.WeChatServerAddress,
		wechatToken:          common.WeChatServerToken,
		googleEnabled:        common.GoogleOAuthEnabled,
		googleClientID:       common.GoogleClientId,
		googleClientSecret:   common.GoogleClientSecret,
		googleRedirect:       common.GoogleRedirectUri,
		serverAddress:        system_setting.ServerAddress,
		googleTokenEndpoint:  oauth.GoogleTokenEndpoint,
		googleUserInfoEP:     oauth.GoogleUserInfoEndpoint,
		optionMap:            common.OptionMap,
		redisEnabled:         common.RedisEnabled,
		criticalRateEnabled:  common.CriticalRateLimitEnable,
		criticalRateNum:      common.CriticalRateLimitNum,
	}

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	// LIFO: registered first, so the pool closes only after every global was
	// restored to its original state and no test code uses the DB anymore.
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})
	t.Cleanup(func() {
		model.DB = orig.db
		model.LOG_DB = orig.logDB
		common.SetMainDatabaseType(orig.mainDBType)
		common.CryptoSecret = orig.secret
		common.LogConsumeEnabled = orig.logConsume
		common.RegisterEnabled = orig.registerEnabled
		common.PasswordRegisterEnabled = orig.passwordRegister
		common.EmailVerificationEnabled = orig.emailVerification
		constant.GenerateDefaultToken = orig.generateDefaultToken
		common.WeChatAuthEnabled = orig.wechatEnabled
		common.WeChatServerAddress = orig.wechatAddress
		common.WeChatServerToken = orig.wechatToken
		common.GoogleOAuthEnabled = orig.googleEnabled
		common.GoogleClientId = orig.googleClientID
		common.GoogleClientSecret = orig.googleClientSecret
		common.GoogleRedirectUri = orig.googleRedirect
		system_setting.ServerAddress = orig.serverAddress
		oauth.GoogleTokenEndpoint = orig.googleTokenEndpoint
		oauth.GoogleUserInfoEndpoint = orig.googleUserInfoEP
		common.OptionMap = orig.optionMap
		common.RedisEnabled = orig.redisEnabled
		common.CriticalRateLimitEnable = orig.criticalRateEnabled
		common.CriticalRateLimitNum = orig.criticalRateNum
	})

	require.NoError(t, db.AutoMigrate(
		&model.Option{},
		&model.AcquisitionTouch{},
		&model.User{},
		&model.Token{},
		&model.Log{},
		&model.AuthFlow{},
		&model.UserSession{},
		&model.UserOAuthBinding{},
		&model.ExternalIdentityClaim{},
	))
	require.NoError(t, db.Create(&model.Option{Key: model.AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.CryptoSecret = "acquisition-controller-test-secret"
	common.LogConsumeEnabled = true
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false
	constant.GenerateDefaultToken = false
	common.WeChatAuthEnabled = false
	common.GoogleOAuthEnabled = true
	common.GoogleClientId = "acq-google-client"
	common.GoogleClientSecret = "acq-google-secret"
	common.GoogleRedirectUri = ""
	system_setting.ServerAddress = "https://vancine.example.com"
	common.OptionMap = map[string]string{}
	common.RedisEnabled = false

	return db
}

func acquisitionTouchRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/acquisition/touch", PostAcquisitionTouch)
	return r
}

func postAcquisitionEvent(t *testing.T, r *gin.Engine, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decodeEnvelope(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var resp map[string]any
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
	return resp
}

func requireTouchCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == model.AcquisitionCookieName {
			return cookie
		}
	}
	require.Fail(t, "vancine_ft cookie missing from response")
	return nil
}

func newAcquisitionTouch(t *testing.T, fields model.AcquisitionUTMFields) *model.AcquisitionTouch {
	t.Helper()
	touch, err := model.CreateAcquisitionTouch(fields)
	require.NoError(t, err)
	return touch
}

func touchCookieValue(touch *model.AcquisitionTouch) *http.Cookie {
	return &http.Cookie{Name: model.AcquisitionCookieName, Value: model.FormatTouchCookieValue(touch.TouchId)}
}

func loadTouch(t *testing.T, touchID string) *model.AcquisitionTouch {
	t.Helper()
	loaded, err := model.GetAcquisitionTouchByTouchID(touchID)
	require.NoError(t, err)
	return loaded
}

func TestAcquisitionPostTouchLandingViewCreates(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	w := postAcquisitionEvent(t, r, `{"event":"landing_view","utm_source":"  reddit  ","utm_medium":"post","utm_campaign":"kimi_k3_launch","utm_content":"thread_a","utm_term":"","landing_path":"/kimi-k3-api?foo=1"}`)
	require.Equal(t, http.StatusOK, w.Code)

	resp := decodeEnvelope(t, w)
	assert.Equal(t, true, resp["success"])
	data, ok := resp["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, true, data["ok"])
	assert.Equal(t, true, data["touch_present"])
	// The touch id must never be echoed in JSON; the HttpOnly cookie is the
	// only carrier.
	assert.NotContains(t, w.Body.String(), "touch_id")

	cookie := requireTouchCookie(t, w)
	assert.True(t, cookie.HttpOnly)
	assert.False(t, cookie.Secure, "plain HTTP must keep Secure=false")
	assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	assert.Equal(t, "/", cookie.Path)
	assert.Empty(t, cookie.Domain)

	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch := loadTouch(t, id)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "post", touch.UtmMedium)
	assert.Equal(t, "kimi_k3_launch", touch.UtmCampaign)
	assert.Equal(t, "thread_a", touch.UtmContent)
	assert.Equal(t, "", touch.UtmTerm)
	assert.Equal(t, "/kimi-k3-api", touch.LandingPath)
}

func TestAcquisitionPostTouchDirectUnknown(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	// No UTM at all is a legal direct/unknown first touch.
	w := postAcquisitionEvent(t, r, `{"event":"landing_view","landing_path":"/home"}`)
	require.Equal(t, http.StatusOK, w.Code)

	cookie := requireTouchCookie(t, w)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch := loadTouch(t, id)
	assert.Equal(t, "", touch.UtmSource)
	assert.Equal(t, "", touch.UtmCampaign)
	assert.Equal(t, "/home", touch.LandingPath)
}

func TestAcquisitionPostTouchExistingSnapshotNotOverwritten(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	w1 := postAcquisitionEvent(t, r, `{"event":"landing_view","utm_source":"reddit","landing_path":"/a"}`)
	cookie := requireTouchCookie(t, w1)

	// Second landing with different UTM: snapshot frozen, no second row,
	// cookie refreshed for the same touch.
	w2 := postAcquisitionEvent(t, r, `{"event":"landing_view","utm_source":"twitter","landing_path":"/b"}`, cookie)
	require.Equal(t, http.StatusOK, w2.Code)
	cookie2 := requireTouchCookie(t, w2)
	assert.Equal(t, cookie.Value, cookie2.Value)

	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch := loadTouch(t, id)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/a", touch.LandingPath)

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestAcquisitionPostTouchInvalidCookieMintsReplacement(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	forged := &http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: "0123456789abcdef0123456789abcdef.deadbeef",
	}
	w := postAcquisitionEvent(t, r, `{"event":"landing_view","landing_path":"/x"}`, forged)
	require.Equal(t, http.StatusOK, w.Code)

	cookie := requireTouchCookie(t, w)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	assert.NotEqual(t, forged.Value, cookie.Value)
	loadTouch(t, id) // replacement row exists

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestAcquisitionPostTouchSignupStartedNeverCreates(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	// No cookie: soft success, zero rows.
	w := postAcquisitionEvent(t, r, `{"event":"signup_started"}`)
	require.Equal(t, http.StatusOK, w.Code)
	resp := decodeEnvelope(t, w)
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, true, data["ok"])
	assert.Equal(t, false, data["touch_present"])
	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	// Signature-valid cookie with no stored row: still a soft no-op.
	orphan := &http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue("0123456789abcdef0123456789abcdef"),
	}
	w = postAcquisitionEvent(t, r, `{"event":"signup_started"}`, orphan)
	require.Equal(t, http.StatusOK, w.Code)
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

func TestAcquisitionPostTouchSignupStartedIdempotent(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	w0 := postAcquisitionEvent(t, r, `{"event":"landing_view","landing_path":"/sign-up"}`)
	cookie := requireTouchCookie(t, w0)

	for i := 0; i < 2; i++ {
		w := postAcquisitionEvent(t, r, `{"event":"signup_started"}`, cookie)
		require.Equal(t, http.StatusOK, w.Code)
	}

	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch := loadTouch(t, id)
	require.NotNil(t, touch.SignupStartedAt)
}

func TestAcquisitionPostTouchRejectsClientSignupCompleted(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	w := postAcquisitionEvent(t, r, `{"event":"signup_completed"}`)
	resp := decodeEnvelope(t, w)
	assert.Equal(t, false, resp["success"])

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

func TestAcquisitionPostTouchRejectsUnknownAndInvalid(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	for _, body := range []string{
		`{"event":""}`,
		`{"event":"bogus"}`,
		`{"event":"landing_view"`, // malformed JSON
		`not json at all`,
	} {
		w := postAcquisitionEvent(t, r, body)
		resp := decodeEnvelope(t, w)
		assert.Equal(t, false, resp["success"], "body %q must be rejected", body)
	}

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

func TestAcquisitionPostTouchSecureCookieOnForwardedHTTPS(t *testing.T) {
	setupAcquisitionTest(t)
	r := acquisitionTouchRouter()

	for _, header := range []string{"X-Forwarded-Proto", "X-Forwarded-Protocol"} {
		req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(`{"event":"landing_view","landing_path":"/"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(header, "https")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
		cookie := requireTouchCookie(t, w)
		assert.True(t, cookie.Secure, "%s=https must set Secure", header)
	}
}

// ---------------------------------------------------------------------------
// Admin funnel endpoint
// ---------------------------------------------------------------------------

func funnelRouter() *gin.Engine {
	r := gin.New()
	r.GET("/api/acquisition/funnel", middleware.AdminAuth(), GetAcquisitionFunnel)
	return r
}

func createAcquisitionAuthUser(t *testing.T, username string, role int) string {
	t.Helper()
	token := common.GetRandomString(32)
	user := model.User{
		Username:    username,
		Role:        role,
		Status:      common.UserStatusEnabled,
		AccessToken: &token,
		AffCode:     username,
		AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&user).Error)
	return token
}

func getFunnel(t *testing.T, r *gin.Engine, query, bearerToken string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?"+query, nil)
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAcquisitionFunnelAuthorization(t *testing.T) {
	setupAcquisitionTest(t)
	r := funnelRouter()
	adminToken := createAcquisitionAuthUser(t, "acq_admin", common.RoleAdminUser)
	commonToken := createAcquisitionAuthUser(t, "acq_common", common.RoleCommonUser)

	// No credentials: rejected.
	w := getFunnel(t, r, "from=1000&to=2000", "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// Common user: forbidden.
	w = getFunnel(t, r, "from=1000&to=2000", commonToken)
	assert.Equal(t, http.StatusForbidden, w.Code)

	// Admin: success with the contract fields.
	w = getFunnel(t, r, "from=1000&to=2000", adminToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	resp := decodeEnvelope(t, w)
	require.Equal(t, true, resp["success"])
	data, ok := resp["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, false, data["historical_backfill_available"])
	assert.Equal(t, float64(1), data["coverage_started_at"])
	assert.Equal(t, float64(1000), data["filters"].(map[string]any)["from"])
	assert.Equal(t, float64(2000), data["filters"].(map[string]any)["to"])
	_, hasCompleteness := data["data_completeness"]
	assert.True(t, hasCompleteness)
	// Aggregate-only contract: no per-user or per-touch identifiers leak.
	body := w.Body.String()
	assert.NotContains(t, body, "user_id")
	assert.NotContains(t, body, "touch_id")
}

func TestAcquisitionFunnelParamValidation(t *testing.T) {
	setupAcquisitionTest(t)
	r := funnelRouter()
	adminToken := createAcquisitionAuthUser(t, "acq_admin2", common.RoleAdminUser)

	cases := []struct {
		name  string
		query string
	}{
		{"missing both", ""},
		{"missing to", "from=1000"},
		{"missing from", "to=2000"},
		{"invalid from", "from=nope&to=2000"},
		{"invalid to", "from=1000&to=nope"},
		{"from equals to", "from=1500&to=1500"},
		{"from after to", "from=2000&to=1000"},
		{"span over 366 days", "from=1000&to=" + strconv.FormatInt(1000+367*24*60*60, 10)},
		{"extreme span min to max",
			"from=" + strconv.FormatInt(math.MinInt64, 10) + "&to=" + strconv.FormatInt(math.MaxInt64, 10)},
		{"large span crossing zero", "from=-31536000000&to=31536000000"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := getFunnel(t, r, tc.query, adminToken)
			require.Equal(t, http.StatusOK, w.Code)
			resp := decodeEnvelope(t, w)
			assert.Equal(t, false, resp["success"], "query %q must fail", tc.query)
		})
	}

	// YYYY-MM-DD boundaries are accepted and interpreted as UTC day starts.
	w := getFunnel(t, r, "from=2026-07-01&to=2026-07-02", adminToken)
	resp := decodeEnvelope(t, w)
	require.Equal(t, true, resp["success"], w.Body.String())
	data := resp["data"].(map[string]any)
	filters := data["filters"].(map[string]any)
	assert.Equal(t, float64(1782864000), filters["from"]) // 2026-07-01T00:00:00Z
	assert.Equal(t, float64(1782950400), filters["to"])   // 2026-07-02T00:00:00Z

	// Exactly 366 days is allowed.
	w = getFunnel(t, r, "from=1000&to="+strconv.FormatInt(1000+366*24*60*60, 10), adminToken)
	assert.Equal(t, true, decodeEnvelope(t, w)["success"])

	// A small negative window is not forbidden by the design: the overflow-safe
	// comparison accepts it and the query runs honestly before coverage.
	w = getFunnel(t, r, "from=-2000&to=-1000", adminToken)
	respNeg := decodeEnvelope(t, w)
	require.Equal(t, true, respNeg["success"], w.Body.String())
	assert.Equal(t, true, respNeg["data"].(map[string]any)["from_before_coverage"])
}

func TestAcquisitionFunnelCompletenessWhenLogsDisabled(t *testing.T) {
	setupAcquisitionTest(t)
	common.LogConsumeEnabled = false
	r := funnelRouter()
	adminToken := createAcquisitionAuthUser(t, "acq_admin3", common.RoleAdminUser)

	w := getFunnel(t, r, "from=1000&to=2000", adminToken)
	require.Equal(t, http.StatusOK, w.Code)
	body := w.Body.String()
	assert.Contains(t, body, `"first_api_call_succeeded":null`)
	assert.Contains(t, body, `"signup_to_first_call":null`)
	assert.Contains(t, body, `"consume_logs":"unavailable"`)
	assert.Contains(t, body, `"consume_logs_enabled":false`)
	assert.Contains(t, body, `"historical_backfill_available":false`)
}

// ---------------------------------------------------------------------------
// Password register bind point
// ---------------------------------------------------------------------------

func registerRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/user/register", Register)
	return r
}

func postRegister(t *testing.T, username string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	body, err := common.Marshal(map[string]string{
		"username": username,
		"password": "password123",
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/api/user/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	registerRouter().ServeHTTP(w, req)
	return w
}

func TestAcquisitionRegisterBindsTouch(t *testing.T) {
	setupAcquisitionTest(t)
	constant.GenerateDefaultToken = false

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{UtmSource: "reddit", LandingPath: "/sign-up"})
	w := postRegister(t, "acq_reg_user1", touchCookieValue(touch))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"])

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "acq_reg_user1").First(&user).Error)
	assert.Greater(t, user.Id, 0)

	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	// The bind also backfills signup_started when the client skipped it.
	require.NotNil(t, loaded.SignupStartedAt)

	// No default token was requested.
	var tokens int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", user.Id).Count(&tokens).Error)
	assert.Equal(t, int64(0), tokens)
}

func TestAcquisitionRegisterDefaultTokenSuccessBinds(t *testing.T) {
	setupAcquisitionTest(t)
	constant.GenerateDefaultToken = true

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/sign-up"})
	w := postRegister(t, "acq_reg_user2", touchCookieValue(touch))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"])

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "acq_reg_user2").First(&user).Error)

	// Default token provisioning succeeded → bind happened.
	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)

	var tokens int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", user.Id).Count(&tokens).Error)
	assert.Equal(t, int64(1), tokens)
}

// When default-token provisioning fails, Register itself fails and the touch
// must stay unbound: signup_completed requires durable provisioning success.
func TestAcquisitionRegisterDefaultTokenFailureDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)
	constant.GenerateDefaultToken = true

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/sign-up"})

	// Sabotage token.Insert: rebuild tokens with a CHECK that rejects every
	// realistic user_id.
	require.NoError(t, model.DB.Migrator().DropTable(&model.Token{}))
	require.NoError(t, model.DB.Exec("CREATE TABLE tokens (id integer primary key, user_id integer NOT NULL CHECK(user_id < 0))").Error)

	w := postRegister(t, "acq_reg_user3", touchCookieValue(touch))
	resp := decodeEnvelope(t, w)
	assert.Equal(t, false, resp["success"], w.Body.String())

	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "touch must not bind when default token creation fails")
	assert.Nil(t, loaded.SignupCompletedAt)

	// Restore for later tests.
	require.NoError(t, model.DB.Exec("DROP TABLE tokens").Error)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
}

// Registration without a touch cookie must succeed with attribution simply
// absent — the cookie is best-effort, never a signup requirement.
func TestAcquisitionRegisterWithoutCookieStillSucceeds(t *testing.T) {
	setupAcquisitionTest(t)

	w := postRegister(t, "acq_reg_user4")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, true, decodeEnvelope(t, w)["success"])

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "acq_reg_user4").First(&user).Error)
	var bound int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Where("user_id = ?", user.Id).Count(&bound).Error)
	assert.Equal(t, int64(0), bound)
}

// Attribution failures must never break registration: with the touches table
// gone the bind logs and swallows the error.
func TestAcquisitionRegisterBindSoftFails(t *testing.T) {
	setupAcquisitionTest(t)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/sign-up"})
	require.NoError(t, model.DB.Migrator().DropTable(&model.AcquisitionTouch{}))

	w := postRegister(t, "acq_reg_user5", touchCookieValue(touch))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"])

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "acq_reg_user5").First(&user).Error)
	assert.Greater(t, user.Id, 0)

	// Restore for later tests.
	require.NoError(t, model.DB.AutoMigrate(&model.AcquisitionTouch{}))
}

// ---------------------------------------------------------------------------
// OAuth bind points
// ---------------------------------------------------------------------------

// stubOAuthProvider is a built-in-style provider for exercising
// findOrCreateOAuthUser without any network access.
type stubOAuthProvider struct {
	taken map[string]bool
	users map[string]*model.User
	info  *oauth.OAuthUser
}

func (p *stubOAuthProvider) GetName() string { return "Stub" }
func (p *stubOAuthProvider) IsEnabled() bool { return true }
func (p *stubOAuthProvider) ExchangeToken(ctx context.Context, code string, c *gin.Context) (*oauth.OAuthToken, error) {
	return &oauth.OAuthToken{AccessToken: "stub-access"}, nil
}
func (p *stubOAuthProvider) GetUserInfo(ctx context.Context, token *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return p.info, nil
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

func newAcquisitionOAuthContext(cookies ...*http.Cookie) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/oauth/test", nil)
	for _, cookie := range cookies {
		c.Request.AddCookie(cookie)
	}
	return c, recorder
}

func TestAcquisitionOAuthNewUserBinds(t *testing.T) {
	setupAcquisitionTest(t)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{UtmSource: "gh", LandingPath: "/oauth"})
	provider := &stubOAuthProvider{taken: map[string]bool{}, users: map[string]*model.User{}}
	oauthUser := &oauth.OAuthUser{ProviderUserID: "stub-new-1", Username: "stubnew1", DisplayName: "Stub New"}

	c, _ := newAcquisitionOAuthContext(touchCookieValue(touch))
	user, err := findOrCreateOAuthUser(c, provider, oauthUser, "")
	require.NoError(t, err)
	require.Greater(t, user.Id, 0)
	assert.Equal(t, "stub-new-1", user.GitHubId)

	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)
}

func TestAcquisitionOAuthExistingUserDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)

	// Seed an existing user already owning the provider id.
	existing := model.User{
		Username: "stub_existing", GitHubId: "stub-existing-1",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&existing).Error)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/oauth-login"})
	provider := &stubOAuthProvider{
		taken: map[string]bool{"stub-existing-1": true},
		users: map[string]*model.User{"stub-existing-1": &existing},
	}
	c, _ := newAcquisitionOAuthContext(touchCookieValue(touch))
	user, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{ProviderUserID: "stub-existing-1"}, "")
	require.NoError(t, err)
	assert.Equal(t, existing.Id, user.Id)

	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "existing-user OAuth login must not bind")
	assert.Nil(t, loaded.SignupCompletedAt)
}

// Legacy-ID migration is still a login of an existing user, not a signup.
func TestAcquisitionOAuthLegacyMigrationDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)

	existing := model.User{
		Username: "stub_legacy", GitHubId: "legacy-login",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&existing).Error)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/oauth-legacy"})
	provider := &stubOAuthProvider{
		taken: map[string]bool{"legacy-login": true},
		users: map[string]*model.User{"legacy-login": &existing},
	}
	c, _ := newAcquisitionOAuthContext(touchCookieValue(touch))
	user, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{
		ProviderUserID: "numeric-1",
		Extra:          map[string]any{"legacy_id": "legacy-login"},
	}, "")
	require.NoError(t, err)
	assert.Equal(t, existing.Id, user.Id)
	// The legacy id is migrated to the new id, but that stays a login.
	assert.Equal(t, "numeric-1", user.GitHubId)

	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "legacy-id migration login must not bind")
}

func TestAcquisitionOAuthCustomProviderNewUserBinds(t *testing.T) {
	setupAcquisitionTest(t)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/oauth-custom"})
	provider := oauth.NewGenericOAuthProvider(&model.CustomOAuthProvider{
		Id: 9, Name: "Acme", Slug: "acme", Enabled: true,
	})
	c, _ := newAcquisitionOAuthContext(touchCookieValue(touch))
	user, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{
		ProviderUserID: "acme-user-1", Username: "acmeuser1", DisplayName: "Acme User",
	}, "")
	require.NoError(t, err)
	require.Greater(t, user.Id, 0)

	// The custom-provider branch persists a user_oauth_bindings row.
	var binding model.UserOAuthBinding
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).First(&binding).Error)
	assert.Equal(t, "acme-user-1", binding.ProviderUserId)

	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
}

// A failed creation transaction must not bind.
func TestAcquisitionOAuthTransactionFailureDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/oauth-fail"})
	provider := oauth.NewGenericOAuthProvider(&model.CustomOAuthProvider{
		Id: 10, Name: "Broken", Slug: "broken", Enabled: true,
	})
	// Drop the bindings table so the creation transaction rolls back.
	require.NoError(t, model.DB.Migrator().DropTable(&model.UserOAuthBinding{}))

	c, _ := newAcquisitionOAuthContext(touchCookieValue(touch))
	_, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{
		ProviderUserID: "broken-user-1", Username: "brokenuser1",
	}, "")
	require.Error(t, err)

	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "failed OAuth transaction must not bind")

	require.NoError(t, model.DB.AutoMigrate(&model.UserOAuthBinding{}))
}

// Account-level OAuth binding (logged-in user linking a provider) must never
// write acquisition attribution.
func TestAcquisitionOAuthAccountBindDoesNotAttribute(t *testing.T) {
	setupAcquisitionTest(t)

	owner := model.User{
		Username: "acq_bind_owner", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&owner).Error)

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/dashboard/settings"})

	// Start a bind-intent flow exactly like the account settings page does.
	recorder := httptest.NewRecorder()
	stateCtx, _ := gin.CreateTestContext(recorder)
	stateCtx.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"stub","intent":"bind"}`))
	stateCtx.Request.Header.Set("Content-Type", "application/json")
	stateCtx.Set("id", owner.Id)
	stateCtx.Set("session_id", "acq-session-1")
	stateCtx.Set("auth_version", int64(1))
	stateCtx.Set("session_version", int64(1))

	provider := &stubOAuthProvider{
		taken: map[string]bool{},
		users: map[string]*model.User{},
		info:  &oauth.OAuthUser{ProviderUserID: "stub-bind-1"},
	}
	oauth.Register("stub", provider)
	t.Cleanup(func() { oauth.Unregister("stub") })

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
	require.NotEmpty(t, stateResp.Data.FlowToken)

	// Drive the callback through the real router so :provider resolves.
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", owner.Id)
		c.Set("session_id", "acq-session-1")
		c.Set("auth_version", int64(1))
		c.Set("session_version", int64(1))
		c.Next()
	})
	router.GET("/api/oauth/:provider", HandleOAuth)
	callback := httptest.NewRecorder()
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/api/oauth/stub?state="+stateResp.Data.FlowToken+"&code=bind-code", nil)
	callbackReq.AddCookie(touchCookieValue(touch))
	router.ServeHTTP(callback, callbackReq)
	require.Equal(t, http.StatusOK, callback.Code, callback.Body.String())
	require.Equal(t, true, decodeEnvelope(t, callback)["success"], callback.Body.String())

	// The provider id got linked to the existing account...
	var updated model.User
	require.NoError(t, model.DB.First(&updated, owner.Id).Error)
	assert.NotEmpty(t, updated.GitHubId)
	// ...but no acquisition attribution was written.
	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "account bind must not attribute")
	assert.Nil(t, loaded.SignupCompletedAt)
}

// ---------------------------------------------------------------------------
// Google via the unified OAuth path
// ---------------------------------------------------------------------------

func TestAcquisitionGoogleUnifiedNewUserBinds(t *testing.T) {
	setupAcquisitionTest(t)

	mockGoogle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			_, _ = w.Write([]byte(`{"access_token":"mock-access","token_type":"Bearer","expires_in":3600}`))
		case "/userinfo":
			_, _ = w.Write([]byte(`{"sub":"acq-google-sub","email":"acq-google@example.com","email_verified":true,"name":"Acq Google"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(mockGoogle.Close)
	oauth.GoogleTokenEndpoint = mockGoogle.URL + "/token"
	oauth.GoogleUserInfoEndpoint = mockGoogle.URL + "/userinfo"

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{UtmSource: "google_ads", LandingPath: "/pricing"})

	// Step 1: request a login flow token for provider "google".
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

	// Step 2: the unified /api/oauth/:provider callback creates the user.
	router := gin.New()
	router.GET("/api/oauth/:provider", HandleOAuth)
	callback := httptest.NewRecorder()
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/api/oauth/google?state="+stateResp.Data.FlowToken+"&code=mock-code", nil)
	callbackReq.AddCookie(touchCookieValue(touch))
	router.ServeHTTP(callback, callbackReq)
	require.Equal(t, http.StatusOK, callback.Code, callback.Body.String())
	require.Equal(t, true, decodeEnvelope(t, callback)["success"], callback.Body.String())

	var user model.User
	require.NoError(t, model.DB.Where("google_sub = ?", "acq-google-sub").First(&user).Error)
	require.Greater(t, user.Id, 0)

	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId, "Google signup through the unified path must bind")
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)

	// Step 3: logging in again with the same Google account binds nothing new.
	touch2 := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/login"})
	recorder2 := httptest.NewRecorder()
	stateCtx2, _ := gin.CreateTestContext(recorder2)
	stateCtx2.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"login"}`))
	stateCtx2.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(stateCtx2)
	require.Equal(t, http.StatusOK, recorder2.Code, recorder2.Body.String())
	var stateResp2 struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder2.Body.Bytes(), &stateResp2))
	require.True(t, stateResp2.Success)

	callback2 := httptest.NewRecorder()
	callbackReq2 := httptest.NewRequest(http.MethodGet,
		"/api/oauth/google?state="+stateResp2.Data.FlowToken+"&code=mock-code", nil)
	callbackReq2.AddCookie(touchCookieValue(touch2))
	router.ServeHTTP(callback2, callbackReq2)
	require.Equal(t, http.StatusOK, callback2.Code, callback2.Body.String())

	loaded2 := loadTouch(t, touch2.TouchId)
	assert.Nil(t, loaded2.UserId, "existing Google login must not bind")
}

// ---------------------------------------------------------------------------
// WeChat
// ---------------------------------------------------------------------------

func newWeChatMock(t *testing.T, wechatID string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/wechat/user" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"message":"","data":"` + wechatID + `"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func wechatRouter() *gin.Engine {
	r := gin.New()
	r.GET("/api/oauth/wechat", WeChatAuth)
	return r
}

func TestAcquisitionWeChatNewUserBinds(t *testing.T) {
	setupAcquisitionTest(t)

	mock := newWeChatMock(t, "wechat-open-id-new")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL
	common.WeChatServerToken = "acq-wechat-token"

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{UtmSource: "wechat", LandingPath: "/login"})

	req := httptest.NewRequest(http.MethodGet, "/api/oauth/wechat?code=mock-code", nil)
	req.AddCookie(touchCookieValue(touch))
	w := httptest.NewRecorder()
	wechatRouter().ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	var user model.User
	require.NoError(t, model.DB.Where("wechat_id = ?", "wechat-open-id-new").First(&user).Error)
	require.Greater(t, user.Id, 0)

	loaded := loadTouch(t, touch.TouchId)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, user.Id, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
}

func TestAcquisitionWeChatExistingUserDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)

	existing := model.User{
		Username: "wechat_existing", WeChatId: "wechat-open-id-old",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1,
	}
	require.NoError(t, model.DB.Create(&existing).Error)

	mock := newWeChatMock(t, "wechat-open-id-old")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/login"})
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/wechat?code=mock-code", nil)
	req.AddCookie(touchCookieValue(touch))
	w := httptest.NewRecorder()
	wechatRouter().ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, true, decodeEnvelope(t, w)["success"], w.Body.String())

	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId, "existing WeChat login must not bind")
}

func TestAcquisitionWeChatRegisterDisabledDoesNotBind(t *testing.T) {
	setupAcquisitionTest(t)

	mock := newWeChatMock(t, "wechat-open-id-disabled")
	common.WeChatAuthEnabled = true
	common.WeChatServerAddress = mock.URL
	common.RegisterEnabled = false

	touch := newAcquisitionTouch(t, model.AcquisitionUTMFields{LandingPath: "/login"})
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/wechat?code=mock-code", nil)
	req.AddCookie(touchCookieValue(touch))
	w := httptest.NewRecorder()
	wechatRouter().ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, false, decodeEnvelope(t, w)["success"])

	var users int64
	require.NoError(t, model.DB.Model(&model.User{}).Where("wechat_id = ?", "wechat-open-id-disabled").Count(&users).Error)
	assert.Equal(t, int64(0), users)
	loaded := loadTouch(t, touch.TouchId)
	assert.Nil(t, loaded.UserId)
}

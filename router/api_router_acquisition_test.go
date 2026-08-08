package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// setupAcquisitionRouterEnv builds the REAL production router via
// SetApiRouter against an isolated in-memory database and restores every
// touched global afterwards. Cleanups run LIFO: globals are restored before
// the connection pool closes.
func setupAcquisitionRouterEnv(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	// Registered first → runs last: the pool closes only after all globals
	// were restored and no request handler can reach it anymore.
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})

	orig := struct {
		db            *gorm.DB
		logDB         *gorm.DB
		mainDBType    common.DatabaseType
		secret        string
		logConsume    bool
		redis         bool
		critEnabled   bool
		critNum       int
		bodyLimitKB   int
		googleEnabled bool
	}{
		db:            model.DB,
		logDB:         model.LOG_DB,
		mainDBType:    common.MainDatabaseType(),
		secret:        common.CryptoSecret,
		logConsume:    common.LogConsumeEnabled,
		redis:         common.RedisEnabled,
		critEnabled:   common.CriticalRateLimitEnable,
		critNum:       common.CriticalRateLimitNum,
		bodyLimitKB:   constant.AnonymousRequestBodyLimitKB,
		googleEnabled: common.GoogleOAuthEnabled,
	}
	t.Cleanup(func() {
		model.DB = orig.db
		model.LOG_DB = orig.logDB
		common.SetMainDatabaseType(orig.mainDBType)
		common.CryptoSecret = orig.secret
		common.LogConsumeEnabled = orig.logConsume
		common.RedisEnabled = orig.redis
		common.CriticalRateLimitEnable = orig.critEnabled
		common.CriticalRateLimitNum = orig.critNum
		constant.AnonymousRequestBodyLimitKB = orig.bodyLimitKB
		common.GoogleOAuthEnabled = orig.googleEnabled
	})

	require.NoError(t, db.AutoMigrate(
		&model.Option{},
		&model.AcquisitionTouch{},
		&model.User{},
		&model.Token{},
		&model.Log{},
	))
	require.NoError(t, db.Create(&model.Option{Key: model.AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.CryptoSecret = "acquisition-router-test-secret"
	common.LogConsumeEnabled = true
	common.RedisEnabled = false
	// CriticalRateLimit captures its enable flag at registration time, so a
	// test that needs the limiter sets the flag before this helper builds the
	// engine; the snapshot/restore above keeps every other test unaffected.

	engine := gin.New()
	SetApiRouter(engine)
	return engine
}

func decodeAcquisitionEnvelope(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var resp map[string]any
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
	return resp
}

func TestSetApiRouterRegistersAcquisitionRoutes(t *testing.T) {
	engine := setupAcquisitionRouterEnv(t)

	found := map[string]bool{}
	for _, route := range engine.Routes() {
		if route.Path == "/api/acquisition/touch" && route.Method == http.MethodPost {
			found["touch"] = true
		}
		if route.Path == "/api/acquisition/funnel" && route.Method == http.MethodGet {
			found["funnel"] = true
		}
	}
	assert.True(t, found["touch"], "POST /api/acquisition/touch must be registered by SetApiRouter")
	assert.True(t, found["funnel"], "GET /api/acquisition/funnel must be registered by SetApiRouter")
}

func TestSetApiRouterAcquisitionLandingViewReachesHandler(t *testing.T) {
	engine := setupAcquisitionRouterEnv(t)

	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch",
		strings.NewReader(`{"event":"landing_view","utm_source":"reddit","landing_path":"/wired"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "203.0.113.10:1234"
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	resp := decodeAcquisitionEnvelope(t, w)
	require.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, true, data["ok"])
	assert.Equal(t, true, data["touch_present"])

	// The real handler persisted the touch.
	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == model.AcquisitionCookieName {
			cookie = c
		}
	}
	require.NotNil(t, cookie, "vancine_ft cookie must be set by the real handler")
	assert.True(t, cookie.HttpOnly)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/wired", touch.LandingPath)
}

func TestSetApiRouterAcquisitionAnonymousBodyLimit(t *testing.T) {
	engine := setupAcquisitionRouterEnv(t)
	constant.AnonymousRequestBodyLimitKB = 1 // 1 KiB for the oversize probe

	oversized := `{"event":"landing_view","landing_path":"/pad` + strings.Repeat("a", 2048) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch", strings.NewReader(oversized))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "203.0.113.11:1234"
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count, "oversized body must not reach the handler")
}

func TestSetApiRouterAcquisitionCriticalRateLimit(t *testing.T) {
	// The limiter captures its enable flag when the route registers, so both
	// globals must be set before the engine is built. Restore the pre-test
	// values ourselves, because the fixture snapshot is taken after them.
	prevEnabled := common.CriticalRateLimitEnable
	prevNum := common.CriticalRateLimitNum
	t.Cleanup(func() {
		common.CriticalRateLimitEnable = prevEnabled
		common.CriticalRateLimitNum = prevNum
	})
	common.CriticalRateLimitEnable = true
	common.CriticalRateLimitNum = 2
	engine := setupAcquisitionRouterEnv(t)

	newReq := func() *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/acquisition/touch",
			strings.NewReader(`{"event":"landing_view","landing_path":"/limited"}`))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = "203.0.113.12:1234"
		return r
	}
	w1 := httptest.NewRecorder()
	engine.ServeHTTP(w1, newReq())
	require.Equal(t, http.StatusOK, w1.Code, w1.Body.String())
	w2 := httptest.NewRecorder()
	engine.ServeHTTP(w2, newReq())
	require.Equal(t, http.StatusOK, w2.Code, w2.Body.String())
	w3 := httptest.NewRecorder()
	engine.ServeHTTP(w3, newReq())
	assert.Equal(t, http.StatusTooManyRequests, w3.Code)
}

func TestSetApiRouterAcquisitionFunnelAuth(t *testing.T) {
	engine := setupAcquisitionRouterEnv(t)

	// Unauthenticated requests never reach the funnel handler.
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil))
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// A common user is forbidden.
	commonToken := common.GetRandomString(32)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "acq_router_common", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, AccessToken: &commonToken,
		AffCode: "acq_router_common", AuthVersion: 1,
	}).Error)
	wCommon := httptest.NewRecorder()
	reqCommon := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	reqCommon.Header.Set("Authorization", "Bearer "+commonToken)
	engine.ServeHTTP(wCommon, reqCommon)
	assert.Equal(t, http.StatusForbidden, wCommon.Code)

	// An admin reaches the real handler and gets the aggregate contract.
	adminToken := common.GetRandomString(32)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "acq_router_admin", Role: common.RoleAdminUser,
		Status: common.UserStatusEnabled, AccessToken: &adminToken,
		AffCode: "acq_router_admin", AuthVersion: 1,
	}).Error)
	wAdmin := httptest.NewRecorder()
	reqAdmin := httptest.NewRequest(http.MethodGet, "/api/acquisition/funnel?from=1000&to=2000", nil)
	reqAdmin.Header.Set("Authorization", "Bearer "+adminToken)
	engine.ServeHTTP(wAdmin, reqAdmin)
	require.Equal(t, http.StatusOK, wAdmin.Code, wAdmin.Body.String())
	resp := decodeAcquisitionEnvelope(t, wAdmin)
	require.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]any)
	assert.Equal(t, float64(1), data["coverage_started_at"])
	assert.Equal(t, false, data["historical_backfill_available"])
	assert.Equal(t, float64(1000), data["filters"].(map[string]any)["from"])
	assert.Equal(t, float64(0), data["landing_view"])
	body := wAdmin.Body.String()
	assert.NotContains(t, body, "user_id")
	assert.NotContains(t, body, "touch_id")
}

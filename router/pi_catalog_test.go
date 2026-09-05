package router

import (
	"embed"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withPiCatalogService(t *testing.T, pricing []model.Pricing) {
	t.Helper()
	svc := service.NewPiCatalogService(service.PiCatalogOptions{
		Pricing: func() []model.Pricing { return pricing },
		Now:     func() time.Time { return time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC) },
	})
	restore := service.SwapPiCatalogService(svc)
	t.Cleanup(restore)
}

func withHeaderNavModules(t *testing.T, raw string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	previous, hadPrevious := common.OptionMap["HeaderNavModules"]
	common.OptionMap["HeaderNavModules"] = raw
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if hadPrevious {
			common.OptionMap["HeaderNavModules"] = previous
			return
		}
		delete(common.OptionMap, "HeaderNavModules")
	})
}

func TestPiCatalogRouteIsRegisteredPublicly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	found := false
	for _, route := range engine.Routes() {
		if route.Method == http.MethodGet && route.Path == "/api/pi/catalog" {
			found = true
			break
		}
	}
	require.True(t, found, "GET /api/pi/catalog must be registered by SetApiRouter")
}

func TestPiCatalogRouteIsNotPricingNavGated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withPiCatalogService(t, []model.Pricing{{
		ModelName:              "glm-5.3-flash",
		QuotaType:              0,
		ModelRatio:             0.03,
		CompletionRatio:        3,
		SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
	}})
	withHeaderNavModules(t, `{"pricing":{"enabled":false,"requireAuth":false}}`)

	engine := gin.New()
	SetApiRouter(engine)

	catalogReq := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	catalogRec := httptest.NewRecorder()
	engine.ServeHTTP(catalogRec, catalogReq)
	require.Equal(t, http.StatusOK, catalogRec.Code, catalogRec.Body.String())
	assert.True(t, strings.Contains(catalogRec.Header().Get("Content-Type"), "json"))
	assert.NotContains(t, catalogRec.Body.String(), "<!doctype html")
	assert.NotContains(t, catalogRec.Body.String(), `"success"`)

	pricingReq := httptest.NewRequest(http.MethodGet, "/api/pricing", nil)
	pricingRec := httptest.NewRecorder()
	engine.ServeHTTP(pricingRec, pricingReq)
	require.Equal(t, http.StatusForbidden, pricingRec.Code, "disabled pricing nav must not hide /api/pi/catalog")
}

func TestPiCatalogRouteIsNotSPAFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withPiCatalogService(t, nil)

	engine := gin.New()
	SetApiRouter(engine)
	SetWebRouter(engine, WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(testSPAIndexPage)}, func(c *gin.Context) { c.Next() })

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, strings.Contains(rec.Header().Get("Content-Type"), "json"))
	body := strings.ToLower(rec.Body.String())
	assert.NotContains(t, body, "<!doctype html")
	assert.NotContains(t, body, "<html")
	assert.Contains(t, rec.Body.String(), `"provider":"vancine"`)
}

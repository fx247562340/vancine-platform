package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
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

func piCatalogTestService(t *testing.T, pricing func() []model.Pricing, now func() time.Time) *service.PiCatalogService {
	t.Helper()
	return service.NewPiCatalogService(service.PiCatalogOptions{
		Pricing: pricing,
		Now:     now,
	})
}

func servePiCatalog(t *testing.T, svc *service.PiCatalogService, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	restore := service.SwapPiCatalogService(svc)
	t.Cleanup(restore)

	router := gin.New()
	router.GET("/api/pi/catalog", GetPiCatalog)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodePiCatalog(t *testing.T, rec *httptest.ResponseRecorder) service.PiCatalog {
	t.Helper()
	var payload service.PiCatalog
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &payload))
	return payload
}

func TestGetPiCatalogUnauthenticatedJSON(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             0.03,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return now })

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	rec := servePiCatalog(t, svc, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	assert.NotEmpty(t, rec.Header().Get("ETag"))
	assert.Equal(t, now.Format(http.TimeFormat), rec.Header().Get("Last-Modified"))
	assert.Equal(t, "public, max-age=60, must-revalidate", rec.Header().Get("Cache-Control"))

	payload := decodePiCatalog(t, rec)
	assert.Equal(t, "vancine", payload.Provider)
	assert.Equal(t, 1, payload.SchemaVersion)
	require.Len(t, payload.Models, 1)
	assert.Equal(t, "glm-5.3-flash", payload.Models[0].ID)
	assert.Nil(t, rec.Result().Header.Values("Authorization"))
}

func TestGetPiCatalogIfNoneMatchNotModified(t *testing.T) {
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "hy4-preview",
			QuotaType:              0,
			ModelRatio:             0.335,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC) })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, first.Code)
	etag := first.Header().Get("ETag")
	require.NotEmpty(t, etag)

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("If-None-Match", etag)
	second := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusNotModified, second.Code)
	assert.Equal(t, 0, second.Body.Len())
	assert.Equal(t, etag, second.Header().Get("ETag"))
	assert.Empty(t, second.Body.Bytes())
}

func TestGetPiCatalogIfModifiedSinceNotModified(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "qwen3.8-flash",
			QuotaType:              0,
			ModelRatio:             0.06,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return now })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, first.Code)
	lastModified := first.Header().Get("Last-Modified")
	require.NotEmpty(t, lastModified)

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("If-Modified-Since", lastModified)
	second := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusNotModified, second.Code)
	assert.Equal(t, 0, second.Body.Len())
}

func TestGetPiCatalogIfNoneMatchTakesPrecedenceOverModifiedSince(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             0.03,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return now })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, first.Code)

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("If-None-Match", `"not-the-current-etag"`)
	req.Header.Set("If-Modified-Since", first.Header().Get("Last-Modified"))
	second := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusOK, second.Code, "unmatched If-None-Match must not 304 via If-Modified-Since")
	assert.NotEqual(t, 0, second.Body.Len())
	assert.Equal(t, first.Header().Get("ETag"), second.Header().Get("ETag"))
}

func TestGetPiCatalogReturnsNewETagAfterChange(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	ratio := 0.03
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             ratio,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return now })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, first.Code)
	oldETag := first.Header().Get("ETag")

	ratio = 0.09
	now = now.Add(time.Minute)
	second := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, second.Code)
	assert.NotEqual(t, oldETag, second.Header().Get("ETag"))
	payload := decodePiCatalog(t, second)
	assert.Equal(t, 0.18, payload.Models[0].Cost.Input)
}

func TestGetPiCatalogIfModifiedSinceReturns200WhenContentChangesInSameSecond(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	ratio := 0.03
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             ratio,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return now })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	require.Equal(t, http.StatusOK, first.Code)
	oldETag := first.Header().Get("ETag")
	oldLastModified := first.Header().Get("Last-Modified")
	require.NotEmpty(t, oldLastModified)

	ratio = 0.09
	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("If-Modified-Since", oldLastModified)
	second := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusOK, second.Code, "same-second content change must not 304 on the old If-Modified-Since")
	assert.NotEqual(t, oldETag, second.Header().Get("ETag"))
	assert.NotEqual(t, 0, second.Body.Len())
	payload := decodePiCatalog(t, second)
	require.Len(t, payload.Models, 1)
	assert.Equal(t, 0.18, payload.Models[0].Cost.Input)
}

func TestGetPiCatalogDoesNotEchoAuthorization(t *testing.T) {
	svc := piCatalogTestService(t, func() []model.Pricing {
		return nil
	}, func() time.Time { return time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC) })

	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("Authorization", "Bearer sk-test-must-not-be-read-or-echoed")
	rec := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, rec.Header().Get("Authorization"))
	assert.NotContains(t, rec.Body.String(), "sk-test-must-not-be-read-or-echoed")
	payload := decodePiCatalog(t, rec)
	assert.Empty(t, payload.Models)
}

func TestGetPiCatalogEmptyBodyOn304UsesNoReader(t *testing.T) {
	svc := piCatalogTestService(t, func() []model.Pricing {
		return []model.Pricing{{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             0.03,
			CompletionRatio:        3,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		}}
	}, func() time.Time { return time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC) })

	first := servePiCatalog(t, svc, httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil))
	req := httptest.NewRequest(http.MethodGet, "/api/pi/catalog", nil)
	req.Header.Set("If-None-Match", first.Header().Get("ETag"))
	second := servePiCatalog(t, svc, req)
	require.Equal(t, http.StatusNotModified, second.Code)
	body, err := io.ReadAll(second.Result().Body)
	require.NoError(t, err)
	assert.Empty(t, body)
}

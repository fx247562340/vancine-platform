package router

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const codingAgentBenchmarkJSONURL = "/benchmarks/pi-coding-agent-2026-08-28.json"

func publicBenchmarkJSONBytes(t *testing.T) []byte {
	t.Helper()
	path := filepath.Join("..", "web", "public", "benchmarks", "pi-coding-agent-2026-08-28.json")
	raw, err := os.ReadFile(path)
	require.NoError(t, err, "web/public benchmark JSON must exist")
	return raw
}

func parseJSONObject(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var doc map[string]any
	require.NoError(t, json.Unmarshal(raw, &doc))
	return doc
}

func TestCodingAgentBenchmarkJSONIsPublicAndDesensitized(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, codingAgentBenchmarkJSONURL, nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<!doctype html")

	doc := parseJSONObject(t, rec.Body.Bytes())
	assert.Equal(t, "2026-08-28", doc["benchmark_date"])
	assert.Equal(t, "0.84.3", doc["pi_version"])

	results, ok := doc["results"].([]any)
	require.True(t, ok)
	require.Len(t, results, 8)

	models := make([]string, 0, 8)
	var billedMicros int64
	var requests, tokens int
	for _, raw := range results {
		row, ok := raw.(map[string]any)
		require.True(t, ok)
		model, _ := row["model"].(string)
		models = append(models, model)
		assert.Equal(t, "Pass", row["result"])
		requests += int(row["model_requests"].(float64))
		tokens += int(row["tokens"].(float64))
		billedMicros += int64(row["production_billed_usd"].(float64)*1_000_000 + 0.5)
	}
	assert.Equal(t, []string{
		"glm-5.3",
		"glm-5.3-flash",
		"kimi-k3",
		"qwen3.8-max",
		"qwen3.8-flash",
		"deepseek-v4-flash",
		"deepseek-v4-pro",
		"MiniMax-M3",
	}, models)
	assert.Equal(t, 45, requests)
	assert.Equal(t, 94502, tokens)
	assert.Equal(t, int64(37618), billedMicros)

	totals, ok := doc["totals"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, float64(8), totals["models"])
	assert.Equal(t, float64(8), totals["passed"])
	assert.Equal(t, float64(45), totals["model_requests"])
	assert.Equal(t, float64(94502), totals["tokens"])
	assert.InDelta(t, 0.037618, totals["production_billed_usd"], 1e-12)

	body := rec.Body.String()
	for _, forbidden := range []string{
		"user_id", "userId", "username", "api_key", "apiKey",
		"token_name", "request_id", "requestId", "upstream_request_id",
		"quota", "/Users/", "sk-",
	} {
		assert.NotContains(t, body, forbidden)
	}
}

func TestCodingAgentBenchmarkJSONMatchesPublicFile(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, codingAgentBenchmarkJSONURL, nil))
	require.Equal(t, http.StatusOK, rec.Code)

	served := parseJSONObject(t, rec.Body.Bytes())
	public := parseJSONObject(t, publicBenchmarkJSONBytes(t))
	assert.Equal(t, public, served,
		"Go handler JSON must match web/public/benchmarks/pi-coding-agent-2026-08-28.json field-for-field")
}

func TestCodingAgentBenchmarkJSONWinsOverStaticDistFile(t *testing.T) {
	polluted := fstest.MapFS{
		"web/dist/benchmarks/pi-coding-agent-2026-08-28.json": &fstest.MapFile{
			Data: []byte(`{"polluted":true,"source":"static-serve"}`),
		},
	}
	engine := gin.New()
	SetWebRouter(engine, WebAssets{BuildFS: polluted, IndexPage: []byte(testSPAIndexPage)}, func(c *gin.Context) { c.Next() })

	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, codingAgentBenchmarkJSONURL, nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))
	body := rec.Body.String()
	assert.NotContains(t, body, `"polluted"`)
	assert.NotContains(t, body, "static-serve")

	served := parseJSONObject(t, rec.Body.Bytes())
	public := parseJSONObject(t, publicBenchmarkJSONBytes(t))
	assert.Equal(t, public, served,
		"explicit handler must win over a same-path file in the dist FS")
}

func TestCodingAgentBenchmarkJSONIgnoresHostAndQuery(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	req := httptest.NewRequest(http.MethodGet,
		"http://vancine.com"+codingAgentBenchmarkJSONURL+"?utm_source=x&email=a@b.com", nil)
	req.Host = "evil.example.com"
	req.Header.Set("X-Forwarded-Host", "evil.example.com")
	req.Header.Set("Origin", "http://evil.example.com")

	rec := serveSEO(engine, req)
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	assert.NotContains(t, body, "evil.example.com")
	assert.NotContains(t, body, "utm_source")
	assert.NotContains(t, body, "a@b.com")
	assert.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))

	served := parseJSONObject(t, rec.Body.Bytes())
	public := parseJSONObject(t, publicBenchmarkJSONBytes(t))
	assert.Equal(t, public, served)
}

func TestCodingAgentBenchmarkJSONHEADHasNoBody(t *testing.T) {
	polluted := fstest.MapFS{
		"web/dist/benchmarks/pi-coding-agent-2026-08-28.json": &fstest.MapFile{
			Data: []byte(`{"polluted":true,"source":"static-serve"}`),
		},
	}
	engine := gin.New()
	SetWebRouter(engine, WebAssets{BuildFS: polluted, IndexPage: []byte(testSPAIndexPage)}, func(c *gin.Context) { c.Next() })

	rec := serveSEO(engine, httptest.NewRequest(http.MethodHead, codingAgentBenchmarkJSONURL, nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))
	body, err := io.ReadAll(rec.Result().Body)
	require.NoError(t, err)
	assert.Empty(t, body, "HEAD must not carry a body")
	assert.NotContains(t, rec.Body.String(), "polluted")
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<html")
}

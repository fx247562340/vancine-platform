package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// saveRateLimitEnv snapshots every global the web rate limiter reads, resets
// the in-memory limiter to a fresh state, switches gin to test mode, and
// registers a cleanup that restores all of it so no test pollutes another.
func saveRateLimitEnv(t *testing.T) {
	t.Helper()
	origEnable := common.GlobalWebRateLimitEnable
	origNum := common.GlobalWebRateLimitNum
	origDuration := common.GlobalWebRateLimitDuration
	origRedis := common.RedisEnabled
	origRDB := common.RDB
	origExpire := common.RateLimitKeyExpirationDuration
	origLimiter := inMemoryRateLimiter
	origGinMode := gin.Mode()

	common.GlobalWebRateLimitEnable = true
	common.GlobalWebRateLimitNum = 2
	common.GlobalWebRateLimitDuration = 180
	common.RedisEnabled = false
	// Avoid spawning the background expiry goroutine during tests.
	common.RateLimitKeyExpirationDuration = 0
	// Fresh in-memory limiter (pointer swap; never copies the sync.Mutex).
	inMemoryRateLimiter = &common.InMemoryRateLimiter{}
	gin.SetMode(gin.TestMode)

	t.Cleanup(func() {
		common.GlobalWebRateLimitEnable = origEnable
		common.GlobalWebRateLimitNum = origNum
		common.GlobalWebRateLimitDuration = origDuration
		common.RedisEnabled = origRedis
		common.RDB = origRDB
		common.RateLimitKeyExpirationDuration = origExpire
		inMemoryRateLimiter = origLimiter
		gin.SetMode(origGinMode)
	})
}

// newRateLimitTestRouter builds a gin engine guarded by GlobalWebRateLimit with
// trivial 200 handlers for the paths under test. Gin mode is managed by
// saveRateLimitEnv (which restores it), so it is not set here.
func newRateLimitTestRouter() *gin.Engine {
	r := gin.New()
	r.Use(GlobalWebRateLimit())
	ok := func(c *gin.Context) { c.Status(http.StatusOK) }
	r.GET("/static/js/chunk.js", ok)
	r.GET("/assets/index.js", ok)
	r.GET("/docs/chat", ok)
	r.GET("/docs/audio", ok)
	r.GET("/static-page", ok)
	r.GET("/assets-old", ok)
	r.GET("/uploads/images/x", ok)
	r.GET("/static", ok)
	r.GET("/assets", ok)
	r.GET("/", ok)
	return r
}

func doRequest(r http.Handler, path, ip string) int {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.RemoteAddr = ip + ":54321"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

// countStatuses issues n requests from the same IP and returns the number of
// responses matching each status code.
func countStatuses(r http.Handler, path, ip string, n int) map[int]int {
	codes := map[int]int{}
	for i := 0; i < n; i++ {
		codes[doRequest(r, path, ip)]++
	}
	return codes
}

func TestGlobalWebRateLimit_StaticAssetsBypassed(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2
	r := newRateLimitTestRouter()

	// Far more than the limit of 2, yet every /static/* request must pass.
	codes := countStatuses(r, "/static/js/chunk.js", "10.0.0.1", 10)
	if codes[http.StatusOK] != 10 {
		t.Fatalf("expected 10x 200 for /static/js/chunk.js, got %v", codes)
	}
}

func TestGlobalWebRateLimit_AssetsBypassed(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2
	r := newRateLimitTestRouter()

	codes := countStatuses(r, "/assets/index.js", "10.0.0.2", 10)
	if codes[http.StatusOK] != 10 {
		t.Fatalf("expected 10x 200 for /assets/index.js, got %v", codes)
	}
}

func TestGlobalWebRateLimit_QueryStringStillBypassed(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2
	r := newRateLimitTestRouter()

	// A real hashed build asset with a query string must still be recognized
	// by URL.Path (query must not defeat the bypass).
	codes := countStatuses(r, "/static/js/chunk.js?v=9f8e7d", "10.0.0.3", 10)
	if codes[http.StatusOK] != 10 {
		t.Fatalf("expected 10x 200 for /static/js/chunk.js?v=..., got %v", codes)
	}
}

func TestGlobalWebRateLimit_DocsStillLimited(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2
	r := newRateLimitTestRouter()

	codes := countStatuses(r, "/docs/chat", "10.0.0.4", 5)
	if codes[http.StatusOK] != 2 {
		t.Fatalf("expected exactly 2x 200 for /docs/chat, got %v", codes)
	}
	if codes[http.StatusTooManyRequests] != 3 {
		t.Fatalf("expected 3x 429 for /docs/chat, got %v", codes)
	}
}

func TestGlobalWebRateLimit_NonAssetPrefixesNotExempted(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2

	// These look asset-ish but are NOT build-asset segments; each must be
	// rate-limited (3rd request from the same IP => 429). Use a distinct IP per
	// path so the buckets do not interfere.
	paths := []string{"/static-page", "/assets-old", "/uploads/images/x"}
	for i, p := range paths {
		r := newRateLimitTestRouter()
		ip := "10.1.0." + string(rune('0'+i+1))
		codes := countStatuses(r, p, ip, 3)
		if codes[http.StatusOK] != 2 || codes[http.StatusTooManyRequests] != 1 {
			t.Fatalf("path %s: expected 2x200 + 1x429, got %v", p, codes)
		}
	}
}

func TestGlobalWebRateLimit_DisabledKeepsOriginalBehavior(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitEnable = false
	r := newRateLimitTestRouter()

	// With the limiter disabled, even a normal SPA route is never throttled.
	codes := countStatuses(r, "/docs/chat", "10.0.0.6", 10)
	if codes[http.StatusOK] != 10 {
		t.Fatalf("expected 10x 200 when disabled, got %v", codes)
	}
}

func TestGlobalWebRateLimit_RedisBranchSharesBypass(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2
	// Enable the Redis branch but leave RDB nil. Build assets must be bypassed
	// BEFORE the Redis limiter is reached; if the bypass were not shared with
	// the Redis branch, redisRateLimiter would dereference the nil client and
	// panic. Passing requests therefore prove the bypass covers Redis too.
	common.RedisEnabled = true
	common.RDB = nil
	r := newRateLimitTestRouter()

	codes := countStatuses(r, "/static/js/chunk.js", "10.0.0.7", 5)
	if codes[http.StatusOK] != 5 {
		t.Fatalf("expected 5x 200 for /static via Redis branch, got %v", codes)
	}
	codes = countStatuses(r, "/assets/index.js", "10.0.0.8", 5)
	if codes[http.StatusOK] != 5 {
		t.Fatalf("expected 5x 200 for /assets via Redis branch, got %v", codes)
	}
}

func TestIsBuildAssetPath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/static", false},
		{"/static/", true},
		{"/static/js/chunk.js", true},
		{"/static/css/app.css", true},
		{"/assets", false},
		{"/assets/", true},
		{"/assets/index.js", true},
		// Look-alike prefixes must NOT match (segment-aware).
		{"/static-page", false},
		{"/staticpage", false},
		{"/assets-old", false},
		{"/assetsold", false},
		// Non-top-level segments must NOT match.
		{"/foo/static/bar.js", false},
		{"/foo/assets/bar.js", false},
		// Other protected / normal routes must NOT match.
		{"/api/status", false},
		{"/v1/chat/completions", false},
		{"/uploads/images/x.png", false},
		{"/docs/chat", false},
		{"/", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isBuildAssetPath(tc.path); got != tc.want {
			t.Errorf("isBuildAssetPath(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestGlobalWebRateLimit_BareStaticAndAssetsNotBypassed(t *testing.T) {
	saveRateLimitEnv(t)
	common.GlobalWebRateLimitNum = 2

	// Bare /static and /assets are NOT build-asset files; they must remain
	// rate-limited (3rd request from the same IP => 429).
	for i, p := range []string{"/static", "/assets"} {
		r := newRateLimitTestRouter()
		ip := "10.2.0." + string(rune('0'+i+1))
		codes := countStatuses(r, p, ip, 3)
		if codes[http.StatusOK] != 2 || codes[http.StatusTooManyRequests] != 1 {
			t.Fatalf("path %s: expected 2x200 + 1x429, got %v", p, codes)
		}
	}
}

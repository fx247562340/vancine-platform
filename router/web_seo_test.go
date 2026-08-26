package router

import (
	"embed"
	"html"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// SEO Phase 1 — public HTTP-contract tests
//
// These tests assert the externally observable behaviour of the public web
// router for crawlers, link unfurls, and humans hitting the canonical
// marketing routes. They intentionally do NOT reach into private maps,
// helper function names, or unexported symbols: any internal restructuring
// of the metadata generation must keep this contract green.
// ---------------------------------------------------------------------------

// expectedRobotsBody is the exact fixed document the router must serve for
// /robots.txt. A trailing newline is mandatory.
const expectedRobotsBody = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /v1/
Sitemap: https://vancine.com/sitemap.xml
`

// newWebRouterSEOFixture is like newWebRouterFixture but uses the shared
// SPA index page fixture (declared in web-router_test.go) so the SEO
// rewrite path is exercised against the same anchor a real deployment
// will hit.
func newWebRouterSEOFixture(t *testing.T) *gin.Engine {
	t.Helper()
	engine := gin.New()
	SetWebRouter(engine, WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(testSPAIndexPage)})
	return engine
}

func serveSEO(engine http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

// ---------------------------------------------------------------------------
// 1. robots.txt
// ---------------------------------------------------------------------------

func TestRobotsTxtGETReturnsTheCanonicalRobotsBody(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))

	require.Equal(t, http.StatusOK, rec.Code, "GET /robots.txt must be 200")
	assert.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"),
		"robots Content-Type must be text/plain")
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"),
		"robots Cache-Control must be public, max-age=3600")

	body := rec.Body.String()
	assert.True(t, strings.HasSuffix(body, "\n"), "robots body must end with a newline")
	assert.Equal(t, expectedRobotsBody, body,
		"robots body must be the exact fixed document with no request-derived values")
	assert.NotContains(t, strings.ToLower(body), "<!doctype html",
		"robots must not contain the SPA index page")
	assert.NotContains(t, strings.ToLower(body), "<html",
		"robots must not contain any HTML")
}

func TestRobotsTxtIgnoresHostAndQueryAndOrigin(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	req := httptest.NewRequest(http.MethodGet,
		"http://vancine.com/robots.txt?utf8=1&utm_source=evil&disallow=/api/extra", nil)
	req.Host = "evil.example.com"
	req.Header.Set("X-Forwarded-Host", "evil.example.com")
	req.Header.Set("Origin", "http://evil.example.com")

	rec := serveSEO(engine, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"))

	body := rec.Body.String()
	assert.NotContains(t, body, "evil.example.com",
		"robots body must not reflect the malicious Host")
	assert.NotContains(t, body, "utm_source", "robots must not reflect UTM query params")
	assert.NotContains(t, body, "/api/extra",
		"robots must not pick up query values as path directives")
	assert.Equal(t, expectedRobotsBody, body,
		"robots body must be byte-identical under hostile request parameters")
}

func TestRobotsTxtHEADDoesNotFallThroughToSPA(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	req := httptest.NewRequest(http.MethodHead, "/robots.txt", nil)
	rec := serveSEO(engine, req)

	require.Equal(t, http.StatusOK, rec.Code, "HEAD /robots.txt must be 200")
	assert.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"),
		"HEAD /robots.txt must not advertise text/html")
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<!doctype html",
		"HEAD /robots.txt must not serve the SPA index body")
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<html",
		"HEAD /robots.txt must not serve any HTML")
}

// ---------------------------------------------------------------------------
// 2. sitemap.xml — GET keeps its body, gains Cache-Control, and HEAD is fixed
// ---------------------------------------------------------------------------

func TestSitemapGETAdvertisesOneHourCache(t *testing.T) {
	rec := serveSitemap(t, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/xml; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"),
		"GET /sitemap.xml must declare the one-hour public cache directive")
}

func TestSitemapHEADReturnsXMLContentTypeAndNoSPA(t *testing.T) {
	rec := serveSitemap(t, httptest.NewRequest(http.MethodHead, "/sitemap.xml", nil))
	require.Equal(t, http.StatusOK, rec.Code, "HEAD /sitemap.xml must be 200")
	assert.Equal(t, "application/xml; charset=utf-8", rec.Header().Get("Content-Type"),
		"HEAD /sitemap.xml must advertise XML, not text/html")
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<!doctype html",
		"HEAD /sitemap.xml must not serve the SPA index")
	assert.NotContains(t, strings.ToLower(rec.Body.String()), "<html",
		"HEAD /sitemap.xml must not serve any HTML")
}

// ---------------------------------------------------------------------------
// 3. Public marketing pages — server-rendered metadata
// ---------------------------------------------------------------------------

// seoPublicRouteCase describes one publicly indexed marketing route that
// must be served with the matching server-rendered metadata block.
type seoPublicRouteCase struct {
	path                 string
	wantTitle            string
	wantDescription      string
	wantCanonical        string
	wantOGTitle          string
	wantOGDescription    string
	wantOGURL            string
	wantTwitterTitle     string
	wantTwitterDesc      string
	wantTwitterCardValue string
}

var seoPublicRouteCases = []seoPublicRouteCase{
	{
		path:                 "/",
		wantTitle:            "Chinese AI Models API for Global Developers | Vancine",
		wantDescription:      "Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.",
		wantCanonical:        "https://vancine.com/",
		wantOGTitle:          "Chinese AI Models API for Global Developers",
		wantOGDescription:    "Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.",
		wantOGURL:            "https://vancine.com/",
		wantTwitterTitle:     "Chinese AI Models API for Global Developers",
		wantTwitterDesc:      "Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.",
		wantTwitterCardValue: "summary",
	},
	{
		path:                 "/pricing",
		wantTitle:            "Chinese AI Model API Pricing | Vancine",
		wantDescription:      "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
		wantCanonical:        "https://vancine.com/pricing",
		wantOGTitle:          "Chinese AI Model API Pricing",
		wantOGDescription:    "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
		wantOGURL:            "https://vancine.com/pricing",
		wantTwitterTitle:     "Chinese AI Model API Pricing",
		wantTwitterDesc:      "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
		wantTwitterCardValue: "summary",
	},
	{
		path:                 "/docs",
		wantTitle:            "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		wantDescription:      "Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.",
		wantCanonical:        "https://vancine.com/docs",
		wantOGTitle:          "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		wantOGDescription:    "Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.",
		wantOGURL:            "https://vancine.com/docs",
		wantTwitterTitle:     "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		wantTwitterDesc:      "Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.",
		wantTwitterCardValue: "summary",
	},
	{
		path:                 "/kimi-k3-api",
		wantTitle:            "Kimi K3 API for Coding Agents | Vancine",
		wantDescription:      "Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.",
		wantCanonical:        "https://vancine.com/kimi-k3-api",
		wantOGTitle:          "Kimi K3 for Coding Agents",
		wantOGDescription:    "Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier models.",
		wantOGURL:            "https://vancine.com/kimi-k3-api",
		wantTwitterTitle:     "Kimi K3 API for Coding Agents",
		wantTwitterDesc:      "Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.",
		wantTwitterCardValue: "summary",
	},
	{
		path:                 "/seedance-api",
		wantTitle:            "Seedance 2.5 API for Async Video Generation | Vancine",
		wantDescription:      "Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.",
		wantCanonical:        "https://vancine.com/seedance-api",
		wantOGTitle:          "Seedance 2.5 for Async Video Generation",
		wantOGDescription:    "Submit, poll, and retrieve Doubao-Seedance-2.5 video tasks through one API key and documented endpoints.",
		wantOGURL:            "https://vancine.com/seedance-api",
		wantTwitterTitle:     "Seedance 2.5 API for Async Video Generation",
		wantTwitterDesc:      "Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.",
		wantTwitterCardValue: "summary",
	},
	{
		path:                 "/ai-media-api",
		wantTitle:            "AI Media API: Image, Video, Speech & 3D | Vancine",
		wantDescription:      "Access Chinese AI media models through one API. Image, video, speech, and 3D generation with one API key and unified billing.",
		wantCanonical:        "https://vancine.com/ai-media-api",
		wantOGTitle:          "Chinese AI Media Models Through One API",
		wantOGDescription:    "Generate images, videos, speech, and 3D assets with one API key and documented endpoints.",
		wantOGURL:            "https://vancine.com/ai-media-api",
		wantTwitterTitle:     "AI Media API: Image, Video, Speech & 3D",
		wantTwitterDesc:      "Access Chinese AI media models through one API. Image, video, speech, and 3D generation with one API key and unified billing.",
		wantTwitterCardValue: "summary",
	},
}

var metaTagOnlyOnce = map[string]*regexp.Regexp{
	"title":       regexp.MustCompile(`(?is)<title>.*?</title>`),
	"name=title":  regexp.MustCompile(`(?i)<meta\s+name="title"`),
	"description": regexp.MustCompile(`(?i)<meta\s+name="description"`),
	"canonical":   regexp.MustCompile(`(?i)<link\s+rel="canonical"`),
	"og:type":     regexp.MustCompile(`(?i)<meta\s+property="og:type"`),
	"og:site":     regexp.MustCompile(`(?i)<meta\s+property="og:site_name"`),
	"og:title":    regexp.MustCompile(`(?i)<meta\s+property="og:title"`),
	"og:desc":     regexp.MustCompile(`(?i)<meta\s+property="og:description"`),
	"og:url":      regexp.MustCompile(`(?i)<meta\s+property="og:url"`),
	"tw:card":     regexp.MustCompile(`(?i)<meta\s+name="twitter:card"`),
	"tw:title":    regexp.MustCompile(`(?i)<meta\s+name="twitter:title"`),
	"tw:desc":     regexp.MustCompile(`(?i)<meta\s+name="twitter:description"`),
}

// assertSEOContract holds the body of the SEO contract check that runs
// for every public route case.
func assertSEOContract(t *testing.T, body, path string, c seoPublicRouteCase) {
	t.Helper()

	// The router is required to escape every HTML attribute value it
	// emits, so the served body carries the escaped form (e.g. ' is
	// rendered as &#39;, & as &amp;). We compare by decoding the served
	// HTML back to plain text and matching the expected plain-text values.
	decoded := html.UnescapeString(body)

	assert.Contains(t, decoded, "<title>"+c.wantTitle+"</title>",
		"path %q must have the exact <title> (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta name="description" content="`+c.wantDescription+`"`,
		"path %q must have the exact meta description (after HTML decoding)", path)
	assert.Contains(t, decoded, `link rel="canonical" href="`+c.wantCanonical+`"`,
		"path %q must have the exact canonical link (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta property="og:title" content="`+c.wantOGTitle+`"`,
		"path %q must have the exact og:title (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta property="og:description" content="`+c.wantOGDescription+`"`,
		"path %q must have the exact og:description (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta property="og:url" content="`+c.wantOGURL+`"`,
		"path %q must have the exact og:url (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta name="twitter:title" content="`+c.wantTwitterTitle+`"`,
		"path %q must have the exact twitter:title (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta name="twitter:description" content="`+c.wantTwitterDesc+`"`,
		"path %q must have the exact twitter:description (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta name="twitter:card" content="`+c.wantTwitterCardValue+`"`,
		"path %q must have the exact twitter:card (after HTML decoding)", path)
	assert.Contains(t, decoded, `meta property="og:type" content="website"`,
		"path %q must have og:type=website", path)
	assert.Contains(t, decoded, `meta property="og:site_name" content="Vancine"`,
		"path %q must have og:site_name=Vancine", path)
}

func TestPublicPagesHaveServerRenderedMetadata(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, c := range seoPublicRouteCases {
		c := c
		t.Run(c.path, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, c.path, nil))
			require.Equal(t, http.StatusOK, rec.Code, "GET %s must be 200", c.path)
			assert.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"),
				"GET %s must advertise HTML", c.path)

			body := rec.Body.String()
			assertSEOContract(t, body, c.path, c)

			// Every SEO tag must appear exactly once. This prevents
			// "two meta description tags" regressions when the rewrite
			// is layered on top of the existing primary-meta block.
			for name, re := range metaTagOnlyOnce {
				matches := re.FindAllString(body, -1)
				assert.Equal(t, 1, len(matches),
					"path %q: tag %q must appear exactly once (found %d: %v)", c.path, name, len(matches), matches)
			}
		})
	}
}

// TestPublicPagesMetadataIgnoresUTMAndQueryString checks that UTM and
// other query parameters never affect the metadata.
func TestPublicPagesMetadataIgnoresUTMAndQueryString(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, c := range seoPublicRouteCases {
		c := c
		t.Run(c.path, func(t *testing.T) {
			recNoUTM := serveSEO(engine, httptest.NewRequest(http.MethodGet, c.path, nil))
			recUTM := serveSEO(engine, httptest.NewRequest(http.MethodGet,
				c.path+"?utm_source=x&utm_medium=email&utm_campaign=launch&ref=foo", nil))

			require.Equal(t, http.StatusOK, recNoUTM.Code)
			require.Equal(t, http.StatusOK, recUTM.Code)
			assert.Equal(t, recNoUTM.Body.String(), recUTM.Body.String(),
				"path %q: UTM and other query params must not change the served HTML", c.path)
			assert.NotContains(t, recUTM.Body.String(), "utm_source",
				"path %q: UTM params must not appear anywhere in the served HTML", c.path)
		})
	}
}

// TestPublicPagesCanonicalIsStableForTrailingSlash checks that the
// canonical URL strips the trailing slash for non-home pages, and that
// both with and without the trailing slash serve the same canonical.
// The home path "/" has no trailing-slash variant — "//" is a different
// path that is correctly routed as an unknown SPA route.
func TestPublicPagesCanonicalIsStableForTrailingSlash(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, c := range seoPublicRouteCases {
		c := c
		if c.path == "/" {
			// The home page has no trailing-slash form; the brief
			// explicitly says "首页除外" for the no-trailing-slash rule.
			continue
		}
		withSlash := c.path + "/"
		t.Run(c.path, func(t *testing.T) {
			recA := serveSEO(engine, httptest.NewRequest(http.MethodGet, c.path, nil))
			recB := serveSEO(engine, httptest.NewRequest(http.MethodGet, withSlash, nil))

			require.Equal(t, http.StatusOK, recA.Code, "GET %s must be 200", c.path)
			require.Equal(t, http.StatusOK, recB.Code, "GET %s must be 200", withSlash)

			decodedA := html.UnescapeString(recA.Body.String())
			decodedB := html.UnescapeString(recB.Body.String())
			assert.Contains(t, decodedA, `link rel="canonical" href="`+c.wantCanonical+`"`,
				"%s canonical must match", c.path)
			assert.Contains(t, decodedB, `link rel="canonical" href="`+c.wantCanonical+`"`,
				"%s/ canonical must match %s", c.path, c.wantCanonical)
		})
	}
}

// TestPublicPagesIgnoresHostAndForwardedHost ensures no Host-related
// header ever leaks into the served HTML for any public marketing route.
func TestPublicPagesIgnoresHostAndForwardedHost(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, c := range seoPublicRouteCases {
		c := c
		t.Run(c.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, c.path, nil)
			req.Host = "evil.example.com"
			req.Header.Set("X-Forwarded-Host", "evil.example.com")
			req.Header.Set("X-Forwarded-Proto", "http")
			req.Header.Set("Origin", "http://evil.example.com")

			rec := serveSEO(engine, req)
			require.Equal(t, http.StatusOK, rec.Code)

			body := rec.Body.String()
			assert.NotContains(t, body, "evil.example.com",
				"path %q: malicious Host must not leak anywhere in the HTML", c.path)
			decoded := html.UnescapeString(body)
			assert.Contains(t, decoded, `link rel="canonical" href="`+c.wantCanonical+`"`,
				"path %q: canonical must remain anchored to vancine.com under hostile Host", c.path)
		})
	}
}

// TestEncodedRelayPrefixPathsAreIsolatedFromMarketingHTML locks in the
// rev1 contract that the NoRoute handler must use c.Request.URL.Path —
// which is already percent-decoded and query-stripped by net/http — to
// identify the path. A raw `RequestURI`-based check would let
// "/%61pi/foo" slip through to the marketing SPA because the prefix
// "/api" no longer matches the literal "/%61pi" bytes.
func TestEncodedRelayPrefixPathsAreIsolatedFromMarketingHTML(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, path := range []string{
		"/%61pi/foo",             // %61 -> a
		"/%76%31/models",         // %76%31 -> v1
		"/%61%73%73%65%74%73/x",  // %61%73%73%65%74%73 -> assets
		"/v%31/chat/completions", // %31 -> 1
		"/a%70i/bar",             // %70 -> p
	} {
		path := path
		t.Run(path, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusNotFound, rec.Code,
				"encoded path %q must reach RelayNotFound (404), not the marketing SPA", path)
		})
	}
}

// TestAbsoluteFormPublicPageStillServesMarketingMetadata locks in the
// rev1 contract that the marketing page is served by URL.Path even when
// the inbound request is in HTTP absolute-form (proxy-style request
// line), and that the query string on the absolute URL still does not
// leak into the served HTML.
func TestAbsoluteFormPublicPageStillServesMarketingMetadata(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	req, err := http.NewRequest(http.MethodGet,
		"http://vancine.com/pricing?utm_source=test&utm_campaign=launch", nil)
	require.NoError(t, err)
	rec := serveSEO(engine, req)
	require.Equal(t, http.StatusOK, rec.Code, "absolute-form GET /pricing must be 200")
	decoded := html.UnescapeString(rec.Body.String())
	assert.Contains(t, decoded, `link rel="canonical" href="https://vancine.com/pricing"`,
		"absolute-form /pricing must keep the canonical anchored to vancine.com/pricing")
	assert.NotContains(t, decoded, "utm_source",
		"absolute-form /pricing must not leak UTM params into the served HTML")
}

// TestAbsoluteFormRelayPrefixPathsAreIsolated is the negative twin of
// the previous test: an absolute-form request to a relay-prefix path
// must still reach RelayNotFound and never be coerced into a marketing
// page. URL.Path parsing must not regress when the request line is in
// absolute form.
func TestAbsoluteFormRelayPrefixPathsAreIsolated(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, url := range []string{
		"http://vancine.com/api/user/token",
		"http://vancine.com/v1/chat/completions",
		"http://vancine.com/assets/missing.js",
	} {
		url := url
		t.Run(url, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, url, nil)
			require.NoError(t, err)
			rec := serveSEO(engine, req)
			require.Equal(t, http.StatusNotFound, rec.Code,
				"absolute-form %q must reach RelayNotFound (404), not the marketing SPA", url)
		})
	}
}

// TestSetWebRouterPanicsWhenIndexPageAnchorMissing pins the rev2
// invariant: if the production dist/index.html ever loses the
// "<!-- Primary Meta Tags -->" block (or ships without the matching
// meta tags), SetWebRouter must fail loudly at startup. The test
// only asserts that SetWebRouter panics — it does not lock the
// private helper name or the exact panic message, so a future
// refactor of the build internals does not have to update this test.
func TestSetWebRouterPanicsWhenIndexPageAnchorMissing(t *testing.T) {
	const indexPageNoAnchor = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Vancine</title>
  </head>
  <body><div id="root"></div></body>
</html>
`
	defer func() {
		r := recover()
		require.NotNil(t, r, "SetWebRouter must panic at startup when the meta anchor is missing")
	}()
	SetWebRouter(gin.New(), WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(indexPageNoAnchor)})
	t.Fatal("SetWebRouter must not return normally when the index page is missing the primary-meta anchor")
}

// TestSetWebRouterPanicsWhenIndexPageAnchorDuplicated pins the rev2
// invariant: a duplicated primary-meta anchor in dist/index.html is a
// programming error (it would mean the rewrite emits two title tags).
// SetWebRouter must refuse to start rather than silently ship a page
// with two <title> blocks. The test asserts the startup panic without
// naming the internal helper.
func TestSetWebRouterPanicsWhenIndexPageAnchorDuplicated(t *testing.T) {
	// Two identical anchors side by side — the rewrite would otherwise
	// replace only the first occurrence and silently leave a second
	// <title> block in the served HTML. The contract requires SetWebRouter
	// to fail startup instead.
	duplicated := testSPAIndexPage + "\n<!-- duplicate -->\n" + testSPAIndexPage
	defer func() {
		r := recover()
		require.NotNil(t, r, "SetWebRouter must panic at startup when the meta anchor is duplicated")
	}()
	SetWebRouter(gin.New(), WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(duplicated)})
	t.Fatal("SetWebRouter must not return normally when the index page has a duplicated primary-meta anchor")
}

// TestUnknownSPARouteServesUnmodifiedIndexPage checks that an unknown
// SPA path still gets the original IndexPage (with the default title),
// not a coerced marketing-page metadata.
func TestUnknownSPARouteServesUnmodifiedIndexPage(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, path := range []string{"/totally-unknown", "/pricing-2", "/about/team", "/playground"} {
		path := path
		t.Run(path, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusOK, rec.Code)
			body := rec.Body.String()
			assert.Equal(t, testSPAIndexPage, body,
				"unknown SPA path %q must serve the original IndexPage byte-for-byte", path)
		})
	}
}

// TestAPIRoutesDoNotReceiveMarketingHTML checks that the protected
// /api/*, /v1/* and /assets/* paths continue to reach RelayNotFound and
// are not accidentally served a marketing page. The contract is a
// precise 404: a 200 OK carrying the SEO-injected marketing HTML is
// the failure mode the SEO rewrite can introduce, and the precise
// 404 status (not "any 4xx" or "any 5xx") is the publicly-asserted
// behaviour RelayNotFound is supposed to return for these paths.
func TestAPIRoutesDoNotReceiveMarketingHTML(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	for _, path := range []string{
		"/api/foo",
		"/api/user/token",
		"/v1/chat/completions",
		"/v1/models",
		"/v1/images/generations",
		"/assets/missing.js",
		"/assets/index-CSS-1234.css",
	} {
		path := path
		t.Run(path, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusNotFound, rec.Code,
				"path %q must reach RelayNotFound (404), not the marketing SPA", path)
		})
	}
}

// TestSetWebRouterPanicsWhenIndexPageAlreadyHasConflictingMetaTags pins
// the rev3 / rev4 invariant: every rewrite variant must carry exactly
// one of each required SEO tag in the <head>, evaluated by HTML
// semantics — not by raw byte matching. The rewrite is supposed to be
// the only source of these tags, so a duplicate tag injected outside
// the primary-meta anchor must trip the startup check.
//
// The test is table-driven so the conflict shapes the review flagged
// are covered in one place: each case splices a single fully-valid
// <head>-legal tag into the shared fixture, then calls SetWebRouter
// and asserts only that the call panics. The private helper name and
// the exact panic text are intentionally not locked.
//
// The rev3 cases verified the bytes-orthogonal shapes (rel-first link,
// uppercased tag name, reverse-attribute-order meta). The rev4 cases
// add the attribute-value-semantic shapes that rev3 silently
// accepted: the x/net/html parser lowercases tag names and attribute
// keys, but preserves the original case of attribute values; rev3
// compared values with `==`, so an uppercased value slipped through
// as "not matching". rev4 uses strings.EqualFold for value matching
// and strings.Fields for the rel token list, so these cases must now
// panic at startup.
func TestSetWebRouterPanicsWhenIndexPageAlreadyHasConflictingMetaTags(t *testing.T) {
	cases := []struct {
		name string
		// injection is the literal HTML to splice into the shared
		// fixture immediately after the <meta charset="UTF-8" /> tag.
		injection string
	}{
		{
			name:      "duplicate canonical via rel-first link",
			injection: `<link rel="canonical" href="https://attacker.example/" />`,
		},
		{
			name:      "duplicate meta description via uppercased tag and attribute name",
			injection: `<META NAME="description" content="attacker description" />`,
		},
		{
			name:      "duplicate og:title via reverse-attribute-order meta",
			injection: `<meta content="attacker og:title" property="og:title" />`,
		},
		{
			name:      "duplicate canonical via uppercased rel attribute value",
			injection: `<link REL="CANONICAL" href="https://attacker.example/" />`,
		},
		{
			name:      "duplicate canonical via token-list rel attribute",
			injection: `<link rel="alternate CANONICAL" href="https://attacker.example/" />`,
		},
		{
			name:      "duplicate meta description via uppercased name value",
			injection: `<META NAME="DESCRIPTION" content="attacker description" />`,
		},
		{
			name:      "duplicate og:title via uppercased property value",
			injection: `<meta content="attacker og:title" property="OG:TITLE" />`,
		},
	}

	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			conflicting := strings.Replace(
				testSPAIndexPage,
				`<meta charset="UTF-8" />`,
				`<meta charset="UTF-8" />`+"\n    "+c.injection,
				1,
			)
			defer func() {
				r := recover()
				require.NotNil(t, r,
					"SetWebRouter must panic at startup when the index page carries a conflicting SEO tag injected via %q",
					c.injection)
			}()
			SetWebRouter(gin.New(), WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(conflicting)})
			t.Fatal("SetWebRouter must not return normally when the index page has a conflicting SEO tag")
		})
	}
}

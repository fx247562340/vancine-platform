package router

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// 1. llms.txt — explicit contract: it covers the full publicSitemapPaths
//    surface. The test parses both the XML sitemap and the llms.txt
//    markdown, asserts each document has no duplicate canonical URL,
//    and asserts the URL SETS are equal (modulo trailing-slash folding).
//    Order is not required to match.
// ---------------------------------------------------------------------------

var llmsURLRegex = regexp.MustCompile(`https://vancine\.com/(?:[A-Za-z0-9._\-/{}?#&=]+)?`)

func extractCanonicalURLList(body string) []string {
	raw := llmsURLRegex.FindAllString(body, -1)
	out := make([]string, 0, len(raw))
	for _, m := range raw {
		out = append(out, strings.TrimRight(m, "/"))
	}
	return out
}

func firstDuplicateURL(urls []string) string {
	seen := make(map[string]struct{}, len(urls))
	for _, url := range urls {
		if _, ok := seen[url]; ok {
			return url
		}
		seen[url] = struct{}{}
	}
	return ""
}

func urlSet(urls []string) map[string]struct{} {
	out := make(map[string]struct{}, len(urls))
	for _, url := range urls {
		out[url] = struct{}{}
	}
	return out
}

func TestLlmsTxtCoversEveryPublicSitemapPath(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	sitemapRec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	llmsRec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/llms.txt", nil))

	require.Equal(t, http.StatusOK, sitemapRec.Code)
	require.Equal(t, http.StatusOK, llmsRec.Code)

	sitemapList := extractCanonicalURLList(sitemapRec.Body.String())
	llmsList := extractCanonicalURLList(llmsRec.Body.String())

	assert.Empty(t, firstDuplicateURL(sitemapList), "sitemap.xml must not repeat a canonical URL")
	assert.Empty(t, firstDuplicateURL(llmsList), "llms.txt must not repeat a canonical URL")

	sitemapSet := urlSet(sitemapList)
	llmsSet := urlSet(llmsList)

	// Every sitemap URL must appear in llms.txt.
	for url := range sitemapSet {
		_, ok := llmsSet[url]
		assert.True(t, ok, "llms.txt is missing public sitemap URL %q", url)
	}
	// And every llms.txt URL must appear in the sitemap — the two
	// surfaces are a complete mirror, not a one-way inclusion.
	for url := range llmsSet {
		_, ok := sitemapSet[url]
		assert.True(t, ok, "llms.txt exposes a URL that is NOT in the public sitemap: %q", url)
	}
	assert.Equal(t, len(sitemapSet), len(llmsSet), "llms.txt URL set size must equal sitemap URL set size")
}

func TestLlmsTxtIncludesAllTenModelDetailPages(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/llms.txt", nil))
	require.Equal(t, http.StatusOK, rec.Code)

	body := rec.Body.String()
	want := []string{
		"https://vancine.com/docs/models/qwen-image-3.0",
		"https://vancine.com/docs/models/qwen-image-3.0-pro",
		"https://vancine.com/docs/models/wan2.7-image-pro",
		"https://vancine.com/docs/models/doubao-seedream-5.0-pro",
		"https://vancine.com/docs/models/doubao-seedream-5.0-lite",
		"https://vancine.com/docs/models/wan3.0-video",
		"https://vancine.com/docs/models/wan3.0-video-prime",
		"https://vancine.com/docs/models/minimax-h3",
		"https://vancine.com/docs/models/doubao-seedance-2.0",
		"https://vancine.com/docs/models/doubao-seedance-2.5",
	}
	for _, url := range want {
		assert.Contains(t, body, url, "llms.txt must list %s", url)
	}
}

func TestLlmsTxtExcludesUnknownModelSlugs(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/llms.txt", nil))
	require.Equal(t, http.StatusOK, rec.Code)

	body := rec.Body.String()
	for _, slug := range []string{
		"qwen-image-2.0",
		"qwen-image-2.0-pro",
		"wan2.7-image",
		"minimax-h2",
		"doubao-seedance-3.0",
	} {
		// Same path-segment guard as the sitemap test: a prefix like
		// "wan2.7-image" is the start of "wan2.7-image-pro" so we
		// anchor the slug.
		bad := regexp.MustCompile(`docs/models/` + slug + `($|\?|<)`)
		assert.False(t, bad.MatchString(body), "llms.txt must not advertise retired slug %s", slug)
	}
}

// ---------------------------------------------------------------------------
// 2. Server-rendered metadata for every model detail page.
//
// Each known /docs/models/<slug> returns a server-rendered HTML with
// the model-specific title, description, canonical, OG pair and
// Twitter pair. Host / query / UTM / trailing-slash do not change
// the canonical. Unknown model paths return a noindex variant.
// ---------------------------------------------------------------------------

func TestPublicMarketingPagesHaveUniquePaths(t *testing.T) {
	seen := make(map[string]int, len(publicMarketingPages))
	for i, page := range publicMarketingPages {
		prev, dup := seen[page.path]
		require.False(
			t,
			dup,
			"duplicate publicMarketingPages path %q at index %d (first at %d)",
			page.path,
			i,
			prev,
		)
		seen[page.path] = i
	}
}

func TestQwenImage30MetadataKeepsVerifiedContractCopy(t *testing.T) {
	var found *publicPageMeta
	count := 0
	for i := range publicMarketingPages {
		if publicMarketingPages[i].path == "/docs/models/qwen-image-3.0" {
			count++
			found = &publicMarketingPages[i]
		}
	}
	require.Equal(t, 1, count, "qwen-image-3.0 must appear exactly once in publicMarketingPages")
	require.NotNil(t, found)
	assert.Contains(t, found.description, "Verified parameter contract and copyable cURL / Python / Node.js examples.")
	assert.Contains(t, found.ogDescription, "Verified parameter contract and copyable examples.")

	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/docs/models/qwen-image-3.0", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "Verified parameter contract and copyable cURL / Python / Node.js examples.")
}

func TestModelDetailPageServerRenderedMetadata(t *testing.T) {
	engine := newWebRouterSEOFixture(t)

	cases := []struct {
		slug        string
		wantTitle   string
		wantOGTitle string
		wantTwTitle string
		wantCanon   string
	}{
		{"qwen-image-3.0", "qwen-image-3.0 API reference | Vancine", "qwen-image-3.0 API reference", "qwen-image-3.0 API reference | Vancine", "https://vancine.com/docs/models/qwen-image-3.0"},
		{"qwen-image-3.0-pro", "qwen-image-3.0-pro API reference | Vancine", "qwen-image-3.0-pro API reference", "qwen-image-3.0-pro API reference | Vancine", "https://vancine.com/docs/models/qwen-image-3.0-pro"},
		{"wan2.7-image-pro", "wan2.7-image-pro API reference | Vancine", "wan2.7-image-pro API reference", "wan2.7-image-pro API reference | Vancine", "https://vancine.com/docs/models/wan2.7-image-pro"},
		{"doubao-seedream-5.0-pro", "Doubao-Seedream-5.0-pro API reference | Vancine", "Doubao-Seedream-5.0-pro API reference", "Doubao-Seedream-5.0-pro API reference | Vancine", "https://vancine.com/docs/models/doubao-seedream-5.0-pro"},
		{"doubao-seedream-5.0-lite", "Doubao-Seedream-5.0-lite API reference | Vancine", "Doubao-Seedream-5.0-lite API reference", "Doubao-Seedream-5.0-lite API reference | Vancine", "https://vancine.com/docs/models/doubao-seedream-5.0-lite"},
		{"wan3.0-video", "wan3.0-video API reference | Vancine", "wan3.0-video API reference", "wan3.0-video API reference | Vancine", "https://vancine.com/docs/models/wan3.0-video"},
		{"wan3.0-video-prime", "wan3.0-video-prime API reference | Vancine", "wan3.0-video-prime API reference", "wan3.0-video-prime API reference | Vancine", "https://vancine.com/docs/models/wan3.0-video-prime"},
		{"minimax-h3", "MiniMax-H3 API reference | Vancine", "MiniMax-H3 API reference", "MiniMax-H3 API reference | Vancine", "https://vancine.com/docs/models/minimax-h3"},
		{"doubao-seedance-2.0", "Doubao-Seedance-2.0 API reference | Vancine", "Doubao-Seedance-2.0 API reference", "Doubao-Seedance-2.0 API reference | Vancine", "https://vancine.com/docs/models/doubao-seedance-2.0"},
		{"doubao-seedance-2.5", "Doubao-Seedance-2.5 API reference | Vancine", "Doubao-Seedance-2.5 API reference", "Doubao-Seedance-2.5 API reference | Vancine", "https://vancine.com/docs/models/doubao-seedance-2.5"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.slug, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/docs/models/"+tc.slug, nil))
			require.Equal(t, http.StatusOK, rec.Code, "/docs/models/%s must be 200", tc.slug)
			body := rec.Body.String()
			assert.Contains(t, body, "<title>"+tc.wantTitle+"</title>")
			assert.Contains(t, body, `<meta property="og:title" content="`+tc.wantOGTitle+`"`)
			assert.Contains(t, body, `<meta name="twitter:title" content="`+tc.wantTwTitle+`"`)
			assert.Contains(t, body, `<link rel="canonical" href="`+tc.wantCanon+`" />`)
			assert.Contains(t, body, `<meta property="og:url" content="`+tc.wantCanon+`" />`)
		})
	}
}

func TestModelDetailPageCanonicalIsHostAndQueryImmune(t *testing.T) {
	engine := newWebRouterSEOFixture(t)

	// The canonical must NOT pick up Host / X-Forwarded-Host / Origin /
	// query / UTM. A single request carrying hostile values must still
	// surface the canonical vancine.com URL.
	req := httptest.NewRequest(
		http.MethodGet,
		"http://vancine.com/docs/models/qwen-image-3.0?utm_source=evil&utf8=1",
		nil,
	)
	req.Host = "evil.example.com"
	req.Header.Set("X-Forwarded-Host", "evil.example.com")
	req.Header.Set("Origin", "http://evil.example.com")

	rec := serveSEO(engine, req)
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()

	assert.Contains(
		t, body,
		`<link rel="canonical" href="https://vancine.com/docs/models/qwen-image-3.0" />`,
		"canonical must stay on vancine.com despite Host / Origin / UTM",
	)
	assert.NotContains(t, body, "evil.example.com", "server HTML must not reflect the malicious Host")
}

func TestModelDetailPageTrailingSlashReturnsSameCanonical(t *testing.T) {
	engine := newWebRouterSEOFixture(t)

	withSlash := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/docs/models/qwen-image-3.0/", nil))
	withoutSlash := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/docs/models/qwen-image-3.0", nil))
	require.Equal(t, http.StatusOK, withSlash.Code)
	require.Equal(t, http.StatusOK, withoutSlash.Code)

	want := `<link rel="canonical" href="https://vancine.com/docs/models/qwen-image-3.0" />`
	assert.Contains(t, withSlash.Body.String(), want, "trailing slash must collapse to the canonical form")
	assert.Contains(t, withoutSlash.Body.String(), want, "no trailing slash must keep the canonical form")
}

func TestModelDetailPageHEADReturnsSameMetadata(t *testing.T) {
	engine := newWebRouterSEOFixture(t)

	rec := serveSEO(engine, httptest.NewRequest(http.MethodHead, "/docs/models/doubao-seedance-2.5", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `<title>Doubao-Seedance-2.5 API reference | Vancine</title>`)
}

// ---------------------------------------------------------------------------
// 3. Unknown /docs/models/<slug> returns the noindex variant.
//
// A real client route would render the standard 404 view; a real
// crawler that ignores the JS shell must see an indexable noindex tag
// so it does not mistake a generic Vancine page for an indexable
// media-model page.
// ---------------------------------------------------------------------------

func TestUnknownDocsModelPathServesNoindexVariant(t *testing.T) {
	engine := newWebRouterSEOFixture(t)

	for _, path := range []string{
		"/docs/models/totally-fake-slug",
		"/docs/models/qwen-image-2.0", // retired
		"/docs/models/qwen-image-2.0-pro",
		"/docs/models/wan2.7-image", // retired
	} {
		path := path
		t.Run(path, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusOK, rec.Code)
			body := rec.Body.String()
			assert.Contains(
				t, body,
				`<meta name="robots" content="noindex" />`,
				"unknown /docs/models/ path %q must carry a robots noindex tag",
				path,
			)
			assert.NotContains(
				t, body,
				"qwen-image-2.0-pro", // retired id must never appear
				"unknown slug page must not advertise a retired model id",
			)
		})
	}
}

func TestKnownDocsModelPathDoesNotServeNoindex(t *testing.T) {
	engine := newWebRouterSEOFixture(t)
	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/docs/models/qwen-image-3.0", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	// Known slugs still get the full SEO block (title, description,
	// canonical) and NO noindex tag.
	assert.Contains(t, body, `<title>qwen-image-3.0 API reference | Vancine</title>`)
	assert.NotContains(t, body, `content="noindex"`, "known model page must not be marked noindex")
}

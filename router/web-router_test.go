package router

import (
	"embed"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sitemapNamespaceURI is the standard XML Sitemap namespace the response must use.
const sitemapNamespaceURI = "http://www.sitemaps.org/schemas/sitemap/0.9"

// expectedSitemapLocs is the test-owned copy of the approved canonical public
// page set. Intentionally duplicated here so the test asserts the contract
// instead of mirroring implementation internals.
var expectedSitemapLocs = []string{
	"https://vancine.com/",
	"https://vancine.com/pricing",
	"https://vancine.com/docs",
	"https://vancine.com/about",
	"https://vancine.com/user-agreement",
	"https://vancine.com/privacy-policy",
	"https://vancine.com/sign-in",
	"https://vancine.com/sign-up",
	"https://vancine.com/kimi-k3-api",
	"https://vancine.com/seedance-api",
	"https://vancine.com/ai-media-api",
}

// testSPAIndexPage is the fixture used by pre-existing sitemap tests.
// It mirrors the production dist/index.html primary-meta block verbatim
// so that buildPublicPageVariants' panic-on-missing-anchor guard does
// not fire during a SetWebRouter call that is otherwise only testing
// sitemap behaviour. The pre-existing assertions only inspect the
// sitemap *response* (e.g. assert it does not contain "<!doctype html"
// or "<html>"), so the fixture's exact bytes do not affect what those
// tests check; they exist to make SetWebRouter buildable.
const testSPAIndexPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Primary Meta Tags -->
    <title>Vancine</title>
    <meta name="title" content="Vancine" />
    <meta
      name="description"
      content="Unified AI API gateway and admin dashboard."
    />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

// sitemapTestURL mirrors one <url> element of the sitemap document.
type sitemapTestURL struct {
	Loc string `xml:"loc"`
}

// sitemapTestDoc mirrors the <urlset> root of the sitemap document.
type sitemapTestDoc struct {
	XMLName xml.Name         `xml:"urlset"`
	URLs    []sitemapTestURL `xml:"url"`
}

// newWebRouterFixture builds the real web router with the production
// middleware chain, an empty frontend FS, and a recognisable SPA index page.
func newWebRouterFixture(t *testing.T) *gin.Engine {
	t.Helper()
	engine := gin.New()
	SetWebRouter(engine, WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(testSPAIndexPage)})
	return engine
}

func serveSitemap(t *testing.T, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	newWebRouterFixture(t).ServeHTTP(rec, req)
	return rec
}

func TestSitemapReturnsValidXMLDocument(t *testing.T) {
	rec := serveSitemap(t, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))

	require.Equal(t, http.StatusOK, rec.Code, "GET /sitemap.xml must return 200")
	assert.Equal(t, "application/xml; charset=utf-8", rec.Header().Get("Content-Type"),
		"Content-Type must be XML, not text/html")

	body := rec.Body.String()
	lowered := strings.ToLower(body)
	assert.NotContains(t, lowered, "<!doctype html", "response must not be the SPA index page")
	assert.NotContains(t, lowered, "<html", "response must not be the SPA index page")
	assert.NotContains(t, lowered, "<lastmod", "response must not contain fabricated lastmod elements")

	var doc sitemapTestDoc
	require.NoError(t, xml.Unmarshal([]byte(body), &doc), "response must be parseable by encoding/xml")
	assert.Equal(t, "urlset", doc.XMLName.Local, "root element must be urlset")
	assert.Equal(t, sitemapNamespaceURI, doc.XMLName.Space, "urlset must declare the Sitemap namespace")
}

func TestSitemapListsExactlyTheApprovedPublicPages(t *testing.T) {
	rec := serveSitemap(t, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))

	var doc sitemapTestDoc
	require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &doc))

	locs := make([]string, 0, len(doc.URLs))
	seen := make(map[string]int, len(doc.URLs))
	for _, u := range doc.URLs {
		locs = append(locs, u.Loc)
		seen[u.Loc]++
	}

	require.Len(t, locs, len(expectedSitemapLocs), "sitemap must contain exactly the approved pages")
	for _, loc := range locs {
		assert.Equal(t, 1, seen[loc], "loc %q must appear exactly once", loc)
		assert.True(t, strings.HasPrefix(loc, "https://vancine.com/"),
			"loc %q must use the canonical origin", loc)
	}
	assert.Equal(t, expectedSitemapLocs, locs,
		"sitemap locs must equal the approved canonical set in the approved order, with no missing, extra, or duplicate entries")

	for _, excluded := range []string{
		"https://vancine.com/waitlist",
		"https://vancine.com/login",
		"https://vancine.com/register",
		"https://vancine.com/dashboard",
	} {
		assert.NotContains(t, locs, excluded, "%s must not be indexed", excluded)
	}
	for _, loc := range locs {
		assert.False(t, strings.HasPrefix(loc, "https://vancine.com/api/"),
			"API routes must not be indexed, got %q", loc)
		assert.False(t, strings.HasPrefix(loc, "https://vancine.com/v1/"),
			"relay routes must not be indexed, got %q", loc)
	}
}

func TestSitemapIgnoresHostHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://vancine.com/sitemap.xml", nil)
	req.Host = "evil.example.com"
	req.Header.Set("X-Forwarded-Host", "evil.example.com")
	req.Header.Set("Origin", "http://evil.example.com")

	rec := serveSitemap(t, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var doc sitemapTestDoc
	require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &doc))
	require.Len(t, doc.URLs, len(expectedSitemapLocs))

	locs := make([]string, 0, len(doc.URLs))
	for _, u := range doc.URLs {
		assert.True(t, strings.HasPrefix(u.Loc, "https://vancine.com/"),
			"loc %q must keep the canonical origin under a malicious Host", u.Loc)
		assert.NotContains(t, u.Loc, "evil.example.com",
			"loc %q must not reflect request headers", u.Loc)
		locs = append(locs, u.Loc)
	}
	assert.Equal(t, expectedSitemapLocs, locs,
		"a malicious Host must not change the sitemap content or ordering")
}

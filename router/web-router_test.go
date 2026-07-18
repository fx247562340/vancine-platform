package router

import (
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sitemapURL mirrors the XML <url> element we render for each page.
type sitemapURL struct {
	Loc        string `xml:"loc"`
	Lastmod    string `xml:"lastmod"`
	Changefreq string `xml:"changefreq"`
	Priority   string `xml:"priority"`
}

// sitemapURLSet mirrors the root <urlset> element.
type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	URLs    []sitemapURL `xml:"url"`
}

func TestSitemapHandler_Returns200AndXML(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/sitemap.xml", sitemapHandler())

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, "expected HTTP 200")
	ct := rec.Header().Get("Content-Type")
	assert.Contains(t, ct, "application/xml", "Content-Type should be application/xml, got %q", ct)
}

func TestSitemapHandler_ContainsBothLandingPages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/sitemap.xml", sitemapHandler())

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()

	assert.Contains(t, body, "https://vancine.com/seedance-api",
		"sitemap must contain /seedance-api")
	assert.Contains(t, body, "https://vancine.com/ai-media-api",
		"sitemap must contain /ai-media-api")
	assert.Contains(t, body, "https://vancine.com/kimi-k3-api",
		"sitemap must contain /kimi-k3-api")
}

func TestSitemapHandler_EachLandingPageAppearsExactlyOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/sitemap.xml", sitemapHandler())

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()

	assert.Equal(t, 1, strings.Count(body, "https://vancine.com/seedance-api"),
		"/seedance-api must appear exactly once")
	assert.Equal(t, 1, strings.Count(body, "https://vancine.com/ai-media-api"),
		"/ai-media-api must appear exactly once")
	assert.Equal(t, 1, strings.Count(body, "https://vancine.com/kimi-k3-api"),
		"/kimi-k3-api must appear exactly once")
}

func TestSitemapHandler_StillContainsHomepage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/sitemap.xml", sitemapHandler())

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var set sitemapURLSet
	require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &set),
		"sitemap body must be valid XML; got: %q", rec.Body.String())

	// Exact match on <loc>: the homepage must appear exactly once as
	// "https://vancine.com/" — no substring matching, so sub-page URLs cannot
	// satisfy this assertion.
	homepage := "https://vancine.com/"
	count := 0
	for _, u := range set.URLs {
		if u.Loc == homepage {
			count++
		}
	}
	require.Equal(t, 1, count,
		"sitemap must contain exactly one <%q> <loc> entry, got %d", homepage, count)
}

func TestSitemapHandler_BodyIsValidXML(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/sitemap.xml", sitemapHandler())

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var set sitemapURLSet
	require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &set),
		"sitemap body must be valid XML; got: %q", rec.Body.String())
	require.NotEmpty(t, set.URLs, "sitemap must contain at least one <url> entry")
}

func TestSitemapPages_ContainsLandingPages(t *testing.T) {
	pages := sitemapPages()

	foundSeedance := false
	foundAiMedia := false
	foundKimiK3 := false
	for _, p := range pages {
		if p.Path == "/seedance-api" {
			foundSeedance = true
			assert.Equal(t, "0.9", p.Priority, "/seedance-api priority")
			assert.Equal(t, "weekly", p.Freq, "/seedance-api changefreq")
		}
		if p.Path == "/ai-media-api" {
			foundAiMedia = true
			assert.Equal(t, "0.9", p.Priority, "/ai-media-api priority")
			assert.Equal(t, "weekly", p.Freq, "/ai-media-api changefreq")
		}
		if p.Path == "/kimi-k3-api" {
			foundKimiK3 = true
			assert.Equal(t, "0.9", p.Priority, "/kimi-k3-api priority")
			assert.Equal(t, "weekly", p.Freq, "/kimi-k3-api changefreq")
		}
	}
	assert.True(t, foundSeedance, "sitemapPages must include /seedance-api")
	assert.True(t, foundAiMedia, "sitemapPages must include /ai-media-api")
	assert.True(t, foundKimiK3, "sitemapPages must include /kimi-k3-api")
}

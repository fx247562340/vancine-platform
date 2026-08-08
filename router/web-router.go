package router

import (
	"embed"
	"encoding/xml"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

// canonicalSiteOrigin is the fixed public origin used in every sitemap URL.
// It is hard-coded on purpose: deriving it from the request Host,
// X-Forwarded-Host, or Origin headers would enable Host header injection.
const canonicalSiteOrigin = "https://vancine.com"

// sitemapNamespace is the standard XML Sitemap namespace.
const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9"

// publicSitemapPaths is the ordered, exhaustive set of public pages indexed
// in the sitemap. The slice order is stable by construction (never a map),
// and retired entries such as /waitlist, /login, and /register must not be
// added back without an explicit product decision.
var publicSitemapPaths = []string{
	"/",
	"/pricing",
	"/docs",
	"/about",
	"/user-agreement",
	"/privacy-policy",
	"/sign-in",
	"/sign-up",
	"/kimi-k3-api",
	"/seedance-api",
	"/ai-media-api",
}

// sitemapURL is one <url> entry of the sitemap document. lastmod is
// intentionally omitted because there is no real, stable per-page
// modification time available.
type sitemapURL struct {
	XMLName xml.Name `xml:"url"`
	Loc     string   `xml:"loc"`
}

// sitemapURLSet is the <urlset> root of the sitemap document.
type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// sitemapHandler serves the XML sitemap for the fixed public page set. The
// document is built solely from the hard-coded canonical origin and the fixed
// page list, so the response never depends on request parameters, headers,
// or user input.
func sitemapHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		urlSet := sitemapURLSet{
			Xmlns: sitemapNamespace,
			URLs:  make([]sitemapURL, 0, len(publicSitemapPaths)),
		}
		for _, page := range publicSitemapPaths {
			urlSet.URLs = append(urlSet.URLs, sitemapURL{Loc: canonicalSiteOrigin + page})
		}
		body, err := xml.MarshalIndent(urlSet, "", "  ")
		if err != nil {
			// The document is static and fully controlled; marshaling cannot fail.
			c.Status(http.StatusInternalServerError)
			return
		}
		c.Data(http.StatusOK, "application/xml; charset=utf-8", append([]byte(xml.Header+"\n"), body...))
	}
}

func SetWebRouter(router *gin.Engine, assets WebAssets) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.Use(static.Serve("/", frontendFS))
	router.GET("/sitemap.xml", sitemapHandler())
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
	})
}

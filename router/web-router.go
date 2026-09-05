package router

import (
	"encoding/xml"
	"io/fs"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   fs.FS
	IndexPage []byte
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
	// Agent Integration Center: the hub plus one canonical setup guide
	// per first-batch coding agent. Lowercase paths only; no case,
	// version or tool aliases may be added without an explicit product
	// decision.
	"/docs/agents",
	"/docs/agents/opencode",
	"/docs/agents/cline",
	"/docs/agents/roo-code",
	"/about",
	"/user-agreement",
	"/privacy-policy",
	"/sign-in",
	"/sign-up",
	"/kimi-k3-api",
	"/seedance-api",
	"/ai-media-api",
	"/openrouter-alternative",
	// SEO-4 evergreen canonical: the single GLM-5.3 acquisition page
	// lives at /glm-api. It covers both glm-5.3 and glm-5.3-flash;
	// there is deliberately no Flash sibling route, and the two retired
	// version-specific paths (/glm-5-3-api, /glm-5.3-api) stay out of
	// the sitemap entirely — they fall through to the existing
	// unknown-SPA-fallback contract with no redirect branch.
	"/glm-api",
	// SEO-5 evergreen canonical: the Pi 8-model coding-agent benchmark.
	// There is deliberately no model-version alias route.
	"/coding-agent-benchmark",
	// Acquisition guide: the fast coding models selection guide. Only
	// the /guides/fast-coding-models canonical is indexed; there is
	// deliberately no top-level alias and no model subroute.
	"/guides/fast-coding-models",
}

// sitemapHandler serves the XML sitemap for the fixed public page set. The
// document is built solely from the hard-coded canonical origin and the fixed
// page list, so the response never depends on request parameters, headers,
// or user input. Both GET and HEAD hit the same handler; gin/Go's net/http
// suppresses the response body for HEAD automatically.
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
		c.Header("Cache-Control", crawlerDocumentCacheControl)
		c.Data(http.StatusOK, sitemapContentType, append([]byte(xml.Header+"\n"), body...))
	}
}

// robotsHandler serves the static robots.txt document. The body and all
// directives are package-level constants — they never reflect the request
// Host, X-Forwarded-Host, Origin, or query parameters. Both GET and HEAD
// hit the same handler; gin/Go's net/http will suppress the response body
// for HEAD automatically.
func robotsHandler() gin.HandlerFunc {
	body := []byte(robotsTxtBody)
	return func(c *gin.Context) {
		c.Header("Cache-Control", crawlerDocumentCacheControl)
		c.Data(http.StatusOK, robotsContentType, body)
	}
}

// SetWebRouter wires the public web router: gzip, the global web rate
// limit, the static asset middleware, the explicit robots.txt and
// sitemap.xml routes, and finally the SPA NoRoute fallback that injects
// per-route SEO metadata for known marketing paths. pluginDispatcher is the
// upstream JS task-plugin route dispatcher; it runs first in the NoRoute
// chain and aborts when a plugin route matched.
func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	// Programmer-error guard. A bad entry in publicMarketingPages must fail
	// at startup, not at request time.
	assertPublicMetadataInvariant()

	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	// Pre-render one HTML variant per public marketing route. The map is
	// built once at startup so NoRoute is an O(1) lookup + bytes write.
	publicVariants, originalIndexPage := buildPublicPageVariants(assets.IndexPage)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())

	// Register the public benchmark JSON before static.Serve so a same-path
	// file in web/dist cannot shadow the explicit, pollution-proof handler.
	router.GET(codingAgentBenchmarkJSONPath, codingAgentBenchmarkJSONHandler())
	router.HEAD(codingAgentBenchmarkJSONPath, codingAgentBenchmarkJSONHandler())

	router.Use(static.Serve("/", frontendFS))

	// robots.txt: GET and HEAD must both be served with the canonical body
	// and a one-hour public cache. No content negotiation, no SPA fallback.
	router.GET("/robots.txt", robotsHandler())
	router.HEAD("/robots.txt", robotsHandler())

	// sitemap.xml: GET and HEAD must both be served with the same XML body
	// (Gin/net/http will suppress the body for HEAD automatically). The GET
	// response carries the one-hour public cache directive.
	router.GET("/sitemap.xml", sitemapHandler())
	router.HEAD("/sitemap.xml", sitemapHandler())

	router.NoRoute(
		pluginDispatcher,
		func(c *gin.Context) {
			c.Set(middleware.RouteTagKey, "web")
			// URL.Path is already percent-decoded and query-stripped by
			// net/http, so it is the only correct source of "what page did
			// the client ask for" — reading the raw RequestURI would let
			// percent-encoded prefixes ("/%61pi/...") or proxy absolute-form
			// request lines slip past the relay-isolation check.
			path := c.Request.URL.Path

			// /api/*, /v1/*, and /assets/* must reach the relay NotFound
			// handler. They are relay/static surfaces, not marketing routes,
			// and must never be served the marketing HTML.
			if routeIsRelayPrefix(path) {
				controller.RelayNotFound(c)
				return
			}

			// Known public marketing route? Serve the pre-rendered variant
			// (O(1) map lookup; the bytes were built at startup).
			if body, ok := publicVariants[path]; ok {
				c.Header("Cache-Control", "no-cache")
				c.Data(http.StatusOK, "text/html; charset=utf-8", body)
				return
			}

			// Unknown SPA path: serve the original IndexPage with its default
			// meta. Client-side routing can recover from a missing SPA route
			// by reading the shell and rendering the 404 view.
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", originalIndexPage)
		})
}

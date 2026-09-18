package router

import (
	"encoding/xml"
	"io/fs"
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
	BuildFS   fs.FS
	IndexPage []byte
	// PrivateIndexPage is the pristine SPA shell captured before any analytics
	// injection. When present, it is served for the internal admin-only SPA
	// paths listed in internalAdminSPAPaths, so no third-party statistics tag
	// ever receives those URLs. When it is nil or empty the router fails closed
	// at request time: those internal paths receive a stable 503 with no-store
	// and noindex, never the analytics-injected IndexPage. Ordinary public
	// paths are unaffected in both cases.
	PrivateIndexPage []byte
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
	// per coding agent (OpenCode, Cline, Roo Code, Pi, OpenClaw, Hermes).
	// Lowercase paths only; no case, version or tool aliases may be
	// added without an explicit product decision.
	"/docs/agents",
	"/docs/agents/opencode",
	"/docs/agents/cline",
	"/docs/agents/roo-code",
	"/docs/agents/pi",
	"/docs/agents/openclaw",
	"/docs/agents/hermes",
	// Media model detail pages. The exact set is mirrored in the
	// /llms.txt handler so crawlers and LLM agents see the same
	// canonical surface. A retired model is removed from both
	// simultaneously; an unknown slug is intentionally absent so
	// unknown subpaths do not pollute the sitemap.
	"/docs/models/qwen-image-3.0",
	"/docs/models/qwen-image-3.0-pro",
	"/docs/models/wan2.7-image-pro",
	"/docs/models/doubao-seedream-5.0-pro",
	"/docs/models/doubao-seedream-5.0-lite",
	"/docs/models/wan3.0-video",
	"/docs/models/wan3.0-video-prime",
	"/docs/models/minimax-h3",
	"/docs/models/doubao-seedance-2.0",
	"/docs/models/doubao-seedance-2.5",
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

// llmsHandler serves the static /llms.txt index. The body and every
// URL inside it are package-level constants — they never reflect
// request Host, X-Forwarded-Host, Origin, or query parameters. Both
// GET and HEAD hit the same handler; gin/Go's net/http will suppress
// the response body for HEAD automatically.
func llmsHandler() gin.HandlerFunc {
	body := []byte(llmsTxtBody)
	return func(c *gin.Context) {
		c.Header("Cache-Control", crawlerDocumentCacheControl)
		c.Data(http.StatusOK, llmsTxtContentType, body)
	}
}

// SetWebRouter wires the public web router: gzip, the global web rate
// limit, the static asset middleware, the explicit robots.txt and
// sitemap.xml routes, and finally the SPA NoRoute fallback that injects
// per-route SEO metadata for known marketing paths. pluginDispatcher is the
// upstream JS task-plugin route dispatcher; it runs first in the NoRoute
// chain and aborts when a plugin route matched.
// isUnknownDocsModelPath reports whether `path` is a /docs/models/<...>
// path that is NOT one of the ten known slugs. The check is path-only
// (no model registry here — that would create an import cycle with
// the new-media-docs); the publicSitemapPaths list IS the source of
// truth, so the comparison is exact-match against the documented set.
func isUnknownDocsModelPath(path string) bool {
	const prefix = "/docs/models/"
	if !strings.HasPrefix(path, prefix) || path == prefix {
		return false
	}
	slug := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
	if slug == "" {
		return false
	}
	for _, known := range publicSitemapPaths {
		if known == path {
			return false
		}
	}
	return true
}

// internalAdminRobotsTag is the X-Robots-Tag value sent with the internal
// admin shell response. "noindex" asks search engines that honour the
// directive not to index the page; "nofollow" asks crawlers that honour it not
// to follow the page's links. It is a crawler directive only — it is not
// access control, and it does not guarantee that third-party link-preview or
// unfurl services will skip the page. The actual privacy protection comes from
// serving the analytics-free private shell, requiring admin authentication, and
// never listing the path publicly. The header is set on the private shell
// response itself — never by reusing noindexIndexPage, which is the
// statistics-injected variant and would defeat the whole point of the private
// shell.
const internalAdminRobotsTag = "noindex, nofollow"

// internalShellUnavailableBody is the stable, content-free body of the
// fail-closed response served for internal admin paths when no private shell
// was provided. It deliberately carries no HTML, no statistics, no path echo,
// no internal data and no credentials.
var internalShellUnavailableBody = []byte("internal page unavailable\n")

// internalAdminSPAPaths are the exact SPA paths served the analytics-free
// private shell. They are internal, unlisted admin surfaces: a third-party
// analytics tag must never see them, and they must never enter first-party
// acquisition attribution. Both the bare and the trailing-slash form are
// listed because the SPA router accepts either. Matching is exact, and the
// router only ever passes c.Request.URL.Path — already percent-decoded and
// query-stripped by net/http — so a query string can never change the
// selection.
var internalAdminSPAPaths = map[string]struct{}{
	"/acquisition-funnel":  {},
	"/acquisition-funnel/": {},
}

// isInternalAdminSPAPath reports whether path is one of the internal
// admin-only SPA paths that must be served without third-party analytics.
func isInternalAdminSPAPath(path string) bool {
	_, ok := internalAdminSPAPaths[path]
	return ok
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	// Programmer-error guard. A bad entry in publicMarketingPages must fail
	// at startup, not at request time.
	assertPublicMetadataInvariant()

	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	// Pre-render one HTML variant per public marketing route. The map is
	// built once at startup so NoRoute is an O(1) lookup + bytes write.
	publicVariants, originalIndexPage, noindexIndexPage := buildPublicPageVariants(assets.IndexPage)

	// Internal admin-only shell: the pristine copy captured before analytics
	// injection in main.go. When a caller provides none, the internal paths
	// fail closed at request time (see the NoRoute branch) rather than falling
	// back to the statistics-injected shell.
	privateIndexPage := assets.PrivateIndexPage

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	// Upstream's access-token audit covers public reads and rejections that
	// happen before route-level auth. Vancine applies gzip/rate-limit/cache/
	// static at router scope, so the audit is registered here in upstream's
	// relative order instead of being re-added inside NoRoute.
	router.Use(middleware.AccessTokenAudit())
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

	// llms.txt: the LLM-agent index of every public surface. Same
	// caching and content-negotiation policy as robots.txt.
	router.GET("/llms.txt", llmsHandler())
	router.HEAD("/llms.txt", llmsHandler())

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

			// Internal admin-only SPA path: serve the analytics-free private
			// shell. It keeps the normal SPA assets and client-side routing,
			// carries no Umami / Google Analytics / Google Ads injection, and
			// gets no public canonical — an internal path must never reach a
			// third-party statistics provider.
			if isInternalAdminSPAPath(path) {
				if len(privateIndexPage) == 0 {
					// Fail closed: serving the statistics-injected IndexPage here
					// would leak the internal path to a third-party analytics
					// provider, so the route returns an explicit, stable,
					// content-free failure instead. No runtime string stripping
					// and no panic.
					c.Header("Cache-Control", "no-store")
					c.Header("X-Robots-Tag", internalAdminRobotsTag)
					c.Data(http.StatusServiceUnavailable, "text/plain; charset=utf-8", internalShellUnavailableBody)
					return
				}
				c.Header("Cache-Control", "no-cache")
				c.Header("X-Robots-Tag", internalAdminRobotsTag)
				c.Data(http.StatusOK, "text/html; charset=utf-8", privateIndexPage)
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
			//
			// /docs/models/<slug> is the only family of paths that can
			// never produce a valid SPA view when the slug is unknown:
			// the route only has a one-deep dynamic segment, and the
			// registry has a closed set of valid slugs. For those
			// non-canonical paths the server returns the noindex variant
			// so crawlers and LLM agents do not mistake a generic
			// Vancine shell for an indexable media-model page.
			body := originalIndexPage
			if isUnknownDocsModelPath(path) {
				body = noindexIndexPage
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", body)
		})
}

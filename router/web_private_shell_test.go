package router

import (
	"embed"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// Internal admin SPA shell — analytics-free serving contract
//
// /acquisition-funnel is an internal, unlisted admin surface. Serving it the
// ordinary shell leaks the internal path to third-party analytics tags
// (Google tag / Umami) and — through the first-party acquisition bootstrap —
// into attribution data. These tests pin the externally observable contract:
// the two exact internal paths and each of their percent-encoded equivalents
// are served the analytics-free private shell with X-Robots-Tag noindex, a
// query string can never change that selection, near-miss paths (extra
// segments, repeated slashes, case variants, double encoding) keep the
// ordinary injected shell byte-for-byte, a router configured without a private
// shell returns an analytics-free fail-closed 503 for those internal paths
// while leaving every public path on the ordinary shell, and the public crawl
// surface never learns the internal path.
// ---------------------------------------------------------------------------

// analyticsInjectedSPAIndexPage mirrors the production shell AFTER
// InjectUmamiAnalytics and InjectGoogleAnalytics have run: the primary-meta
// anchor is intact (so buildPublicPageVariants still succeeds), both
// third-party payloads are present, and the SPA app asset tags are present.
const analyticsInjectedSPAIndexPage = `<!doctype html>
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
    <script defer src="https://analytics.umami.is/script.js" data-website-id="UMAMI-TEST"></script><!--Umami QuantumNous-->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TESTGA"></script><script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-TESTGA');</script><!--Google Analytics QuantumNous-->
  <script defer src="/static/js/index.TESTBUILD.js"></script></head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

// privateSPAIndexPage mirrors the pristine embedded shell captured BEFORE any
// analytics injection: only the inert build-template placeholder comments, no
// third-party script, no canonical, and the same app asset tags so the SPA
// still boots and routes normally.
const privateSPAIndexPage = `<!doctype html>
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
    <!--umami-->
    <!--Google Analytics-->
  <script defer src="/static/js/index.TESTBUILD.js"></script></head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

// thirdPartyAnalyticsMarkers are the injection payloads and third-party
// domains that must never appear in the internal admin shell. The list covers
// both the Umami and the Google (Analytics + Ads) injection paths.
var thirdPartyAnalyticsMarkers = []string{
	"googletagmanager",
	"google-analytics",
	"googleads",
	"doubleclick",
	"analytics.umami.is",
	"data-website-id",
	"dataLayer",
	"gtag(",
	"__VANCINE_GOOGLE_ADS__",
	"<!--Umami QuantumNous-->",
	"<!--Google Analytics QuantumNous-->",
}

// newPrivateShellFixture builds the real web router with both shells: the
// analytics-injected public one and the pristine internal one.
func newPrivateShellFixture(t *testing.T) *gin.Engine {
	t.Helper()
	engine := gin.New()
	SetWebRouter(engine, WebAssets{
		BuildFS:          embed.FS{},
		IndexPage:        []byte(analyticsInjectedSPAIndexPage),
		PrivateIndexPage: []byte(privateSPAIndexPage),
	}, func(c *gin.Context) { c.Next() })
	return engine
}

// TestInternalAdminPathsServeTheAnalyticsFreePrivateShell pins that both
// exact internal path forms are served the private shell byte-for-byte, that
// percent-encoded equivalents of those paths are served the same shell (the
// router compares net/http's already-decoded URL.Path), that every successful
// internal response carries the noindex robots tag, and that query parameters
// cannot change the selection.
func TestInternalAdminPathsServeTheAnalyticsFreePrivateShell(t *testing.T) {
	engine := newPrivateShellFixture(t)
	for _, target := range []string{
		"/acquisition-funnel",
		"/acquisition-funnel/",
		// Percent-encoded equivalents: net/http decodes them into the same
		// URL.Path the literal forms produce.
		"/%61cquisition-funnel",
		"/%61cquisition-funnel/",
		"/acquisition%2Dfunnel",
		"/acquisition%2Dfunnel/",
		"/%61cquisition%2Dfunnel",
		"/%61cquisition%2Dfunnel/",
		"/acquisition-funnel%2F",
		// Query strings must never change the selection.
		"/acquisition-funnel?utm_source=hn&utm_medium=social",
		"/%61cquisition-funnel?utm_source=hn&utm_medium=social",
		"/acquisition-funnel?utm_campaign=launch&utm_content=x&utm_term=y",
		"/acquisition-funnel/?redirect=%2Fpricing&email=a@b.com",
		"/acquisition-funnel?foo=bar#frag",
	} {
		target := target
		t.Run(target, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, target, nil))
			require.Equal(t, http.StatusOK, rec.Code,
				"internal admin path %q must be served, not 404'd", target)
			assert.Equal(t, privateSPAIndexPage, rec.Body.String(),
				"internal admin path %q must serve the private shell byte-for-byte", target)
			assert.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
			assert.Equal(t, "no-cache", rec.Header().Get("Cache-Control"),
				"the internal admin shell must keep the no-cache directive")
			assert.Equal(t, "noindex, nofollow", rec.Header().Get("X-Robots-Tag"),
				"the internal admin shell must never be indexed")
			assert.Empty(t, rec.Header().Get("Location"), "must not redirect")
		})
	}
}

// TestPrivateShellCarriesNoThirdPartyAnalyticsOrCanonical is the precise
// negative assertion that keeps the internal path out of every third-party
// statistics shell and out of the public canonical surface, while the
// ordinary shell keeps its existing injection contract.
func TestPrivateShellCarriesNoThirdPartyAnalyticsOrCanonical(t *testing.T) {
	engine := newPrivateShellFixture(t)

	rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/acquisition-funnel", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	for _, marker := range thirdPartyAnalyticsMarkers {
		assert.NotContains(t, body, marker,
			"the internal admin shell must not carry %q", marker)
	}
	assert.NotContains(t, strings.ToLower(body), `rel="canonical"`,
		"no public canonical may be generated for the internal admin page")
	assert.NotContains(t, strings.ToLower(body), "acquisition-funnel",
		"the shell must not embed the internal path")
	// Still a bootable SPA shell with the ordinary app assets.
	assert.Contains(t, body, `<div id="root">`)
	assert.Contains(t, body, `/static/js/index.TESTBUILD.js`)

	// The ordinary (unknown SPA path) shell keeps the analytics contract.
	normal := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/playground", nil))
	require.Equal(t, http.StatusOK, normal.Code)
	assert.Equal(t, analyticsInjectedSPAIndexPage, normal.Body.String(),
		"ordinary SPA paths must keep the injected shell byte-for-byte")
	assert.Contains(t, normal.Body.String(), "https://www.googletagmanager.com/gtag/js?id=G-TESTGA")
	assert.Contains(t, normal.Body.String(), `data-website-id="UMAMI-TEST"`)
}

// TestNearMissAndPublicSPAPathsKeepTheOrdinaryShell pins the exact-match
// boundary: only the two internal paths get the private shell. Prefixes,
// siblings, sub-paths and case variants must keep the ordinary behaviour.
func TestNearMissAndPublicSPAPathsKeepTheOrdinaryShell(t *testing.T) {
	engine := newPrivateShellFixture(t)
	for _, p := range []string{
		"/acquisition",
		"/acquisition-funnels",
		"/acquisition-funnel-x",
		"/acquisition-funnel/a",
		"/acquisition-funnel//",
		"/ACQUISITION-FUNNEL",
		"//acquisition-funnel",
		// Percent-encoded near-misses: decoding must not widen the set.
		"/%61cquisition-funnels",
		"/%61cquisition-funnel-x",
		"/%61cquisition-funnel/a",
		"/acquisition%2Dfunnels",
		// Encoded case variant: decodes to /Acquisition-funnel, not internal.
		"/%41cquisition-funnel",
		// Double-encoded: net/http decodes once, leaving /%61cquisition-funnel.
		"/%2561cquisition-funnel",
		"/%2561cquisition-funnel/",
		"/totally-unknown",
		"/playground",
		"/pricing-2",
		"/dashboard",
	} {
		p := p
		t.Run(p, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, p, nil))
			require.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, analyticsInjectedSPAIndexPage, rec.Body.String(),
				"path %q must keep the ordinary injected shell", p)
		})
	}
}

// TestInternalAdminShellHEADContract keeps HEAD on the same handler and the
// same contract as GET, exactly like the rest of the SPA fallback.
func TestInternalAdminShellHEADContract(t *testing.T) {
	engine := newPrivateShellFixture(t)
	for _, p := range []string{"/acquisition-funnel", "/acquisition-funnel/"} {
		p := p
		t.Run("HEAD "+p, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodHead, p, nil))
			require.Equal(t, http.StatusOK, rec.Code)
			assert.Empty(t, rec.Header().Get("Location"), "must not redirect")
			assert.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
			assert.Equal(t, "no-cache", rec.Header().Get("Cache-Control"))
			assert.Equal(t, "noindex, nofollow", rec.Header().Get("X-Robots-Tag"),
				"HEAD on the internal path must advertise the same noindex tag")
			for _, marker := range thirdPartyAnalyticsMarkers {
				assert.NotContains(t, rec.Body.String(), marker,
					"HEAD on the internal admin path must not advertise %q", marker)
			}
		})
	}
}

// TestMissingPrivateIndexPageFailsClosedWithoutStatistics pins the fail-closed
// invariant: without an analytics-free private shell the internal paths must
// NOT fall back to the statistics-injected IndexPage. Both a nil and an empty
// slice produce the same stable, content-free 503 — no ordinary IndexPage
// bytes, no third-party statistics, no internal data, no credentials — with
// no-store and the noindex robots tag, and without panicking at startup.
func TestMissingPrivateIndexPageFailsClosedWithoutStatistics(t *testing.T) {
	cases := []struct {
		name   string
		assets WebAssets
	}{
		{
			name:   "nil private shell",
			assets: WebAssets{BuildFS: embed.FS{}, IndexPage: []byte(analyticsInjectedSPAIndexPage)},
		},
		{
			name: "empty private shell",
			assets: WebAssets{
				BuildFS:          embed.FS{},
				IndexPage:        []byte(analyticsInjectedSPAIndexPage),
				PrivateIndexPage: []byte{},
			},
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			engine := gin.New()
			require.NotPanics(t, func() {
				SetWebRouter(engine, tc.assets, func(c *gin.Context) { c.Next() })
			}, "SetWebRouter must not crash when PrivateIndexPage is absent")

			for _, target := range []string{"/acquisition-funnel", "/acquisition-funnel/", "/%61cquisition-funnel"} {
				rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, target, nil))
				require.Equal(t, http.StatusServiceUnavailable, rec.Code,
					"%q must fail closed with 503 when no private shell exists", target)
				assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"),
					"the fail-closed response must not be cached")
				assert.Equal(t, "noindex, nofollow", rec.Header().Get("X-Robots-Tag"))
				assert.Empty(t, rec.Header().Get("Location"), "must not redirect")

				body := rec.Body.String()
				assert.NotEqual(t, analyticsInjectedSPAIndexPage, body,
					"the statistics-injected IndexPage must never be served for an internal path")
				for _, marker := range thirdPartyAnalyticsMarkers {
					assert.NotContains(t, body, marker,
						"the fail-closed body must not carry %q", marker)
				}
				assert.NotContains(t, strings.ToLower(body), "<!doctype html")
				assert.NotContains(t, strings.ToLower(body), "<html")
				assert.NotContains(t, strings.ToLower(body), "acquisition-funnel",
					"the fail-closed body must not echo the internal path")
				assert.NotEmpty(t, body, "the response must be explicit, not empty")
			}

			// Ordinary public paths keep the existing behaviour untouched.
			normal := serveSEO(engine, httptest.NewRequest(http.MethodGet, "/playground", nil))
			require.Equal(t, http.StatusOK, normal.Code)
			assert.Equal(t, analyticsInjectedSPAIndexPage, normal.Body.String(),
				"public SPA paths must be unaffected by the fail-closed internal branch")
		})
	}
}

// TestInternalAdminPathStaysOutOfThePublicCrawlSurface pins that the internal
// path never enters the public crawl surface, in the same router that now
// serves it a private shell.
func TestInternalAdminPathStaysOutOfThePublicCrawlSurface(t *testing.T) {
	engine := newPrivateShellFixture(t)
	for _, p := range []string{"/sitemap.xml", "/llms.txt", "/robots.txt"} {
		p := p
		t.Run(p, func(t *testing.T) {
			rec := serveSEO(engine, httptest.NewRequest(http.MethodGet, p, nil))
			require.Equal(t, http.StatusOK, rec.Code)
			assert.NotContains(t, rec.Body.String(), "acquisition-funnel",
				"%s must not expose the internal admin path", p)
		})
	}
}

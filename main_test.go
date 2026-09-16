package main

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The injection contract tests swap the embedded index page for a minimal
// template carrying the real placeholder, run InjectGoogleAnalytics against
// controlled environment variables, and assert the observable HTML/JS:
// - GOOGLE_ANALYTICS_ID keeps its legacy output on ordinary pages (landing
//   UTM data contract preserved) but overrides page_location with
//   origin + pathname on OAuth callback paths (/oauth, /oauth/*) so the
//   OAuth query parameters (code/state/error) never reach Google.
// - Google Ads is enabled only when GOOGLE_ADS_ID and
//   GOOGLE_ADS_SIGNUP_CONVERSION_LABEL are both valid and non-empty; a lone
//   Ads ID enables nothing at all.
// - The injected Ads bootstrap only runs on the production hostnames
//   (vancine.com / www.vancine.com) - staging, preview, and localhost never
//   load or configure the Ads tag even when the env vars leak there.
// - The Ads config always uses the safe page_location override.

const injectTestTemplate = "<html><head><!--Google Analytics-->\n</head></html>"

// adsHostnameGate is the exact client-side gate the injected Ads bootstrap
// must contain: non-production hostnames return before any Ads load, config,
// or request happens.
const adsHostnameGate = "if(h!=='vancine.com'&&h!=='www.vancine.com')return;"

// safePageLocationOverride is the exact page_location override used by the
// GA config on OAuth callback paths and by the Ads config everywhere:
// origin + pathname, never query or hash.
const safePageLocationOverride = "{page_location: location.origin + location.pathname}"

// gaOAuthPathGate is the exact client-side branch that switches the GA config
// to the safe page_location on OAuth callback paths.
const gaOAuthPathGate = "if(location.pathname==='/oauth'||location.pathname.indexOf('/oauth/')===0){"

// gaLegacyConfig is the exact legacy GA config statement that must still be
// emitted for ordinary pages (no page_location override: the
// GOOGLE_ANALYTICS_ID landing-UTM data contract must not change).
const gaLegacyConfig = "gtag('config', 'G-4BCDEFGHIJ');"

var injectedGoogleEnvKeys = []string{
	"GOOGLE_ANALYTICS_ID",
	"GOOGLE_ADS_ID",
	"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL",
}

func runInjectGoogleAnalytics(t *testing.T, env map[string]string) string {
	t.Helper()
	for _, key := range injectedGoogleEnvKeys {
		original, hadOriginal := os.LookupEnv(key)
		if _, set := env[key]; !set {
			require.NoError(t, os.Unsetenv(key))
			t.Cleanup(func() {
				restoreGoogleEnvValue(key, original, hadOriginal)
			})
			continue
		}
		require.NoError(t, os.Setenv(key, env[key]))
		t.Cleanup(func() {
			restoreGoogleEnvValue(key, original, hadOriginal)
		})
	}
	originalIndexPage := indexPage
	indexPage = []byte(injectTestTemplate)
	t.Cleanup(func() { indexPage = originalIndexPage })
	InjectGoogleAnalytics()
	return string(indexPage)
}

func restoreGoogleEnvValue(key, original string, hadOriginal bool) {
	if hadOriginal {
		_ = os.Setenv(key, original)
	} else {
		_ = os.Unsetenv(key)
	}
}

// countStaticGtagScriptTags counts static <script async src=...> tag loads
// of gtag.js. The Ads-only deployment intentionally has none (it loads the
// script dynamically inside the hostname-gated bootstrap).
func countStaticGtagScriptTags(page string) int {
	return strings.Count(page, `<script async src="https://www.googletagmanager.com/gtag/js`)
}

func TestInjectGoogleAnalyticsWithoutConfigurationInjectsNothing(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{})
	assert.NotContains(t, page, "googletagmanager.com")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")
	assert.NotContains(t, page, "dataLayer")
}

func TestInjectGoogleAnalyticsWithFullAdsConfigGatesOnProductionHostnames(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ADS_ID":                      "AW-18416812623",
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E",
	})
	// No static gtag.js tag: the script is loaded dynamically, only inside
	// the production-hostname gate.
	assert.Equal(t, 0, countStaticGtagScriptTags(page))
	assert.Contains(t, page, adsHostnameGate)
	assert.Contains(t, page, "var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=AW-18416812623';")
	assert.Contains(t, page, "gtag('config', 'AW-18416812623', "+safePageLocationOverride+");")
	assert.Contains(
		t,
		page,
		`window.__VANCINE_GOOGLE_ADS__={signupSendTo:"AW-18416812623/LQ_rCMbphuocEM-E6c1E"}`,
	)
	// The gate runs before the dynamic load: nothing Ads-related executes on
	// a non-production hostname.
	gateIndex := strings.Index(page, adsHostnameGate)
	loadIndex := strings.Index(page, "document.createElement('script')")
	configIndex := strings.Index(page, "gtag('config', 'AW-18416812623'")
	require.GreaterOrEqual(t, gateIndex, 0)
	assert.Less(t, gateIndex, loadIndex, "hostname gate must precede the dynamic Ads script load")
	assert.Less(t, gateIndex, configIndex, "hostname gate must precede the Ads config")
	assert.Less(t, loadIndex, configIndex, "dynamic load must precede the Ads config")
}

func TestInjectGoogleAnalyticsWithGAAndFullAdsKeepsGALegacyOutputAndSingleLoad(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ANALYTICS_ID":                "G-4BCDEFGHIJ",
		"GOOGLE_ADS_ID":                      "AW-18416812623",
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E",
	})
	// gtag.js is loaded exactly once, by the unchanged GA script tag; no
	// dynamic second load for Ads.
	assert.Equal(t, 1, countStaticGtagScriptTags(page))
	assert.Contains(t, page, "gtag/js?id=G-4BCDEFGHIJ")
	assert.NotContains(t, page, "document.createElement('script')")
	// Ordinary pages keep the exact legacy GA config (landing UTM data
	// preserved); OAuth callback paths (/oauth, /oauth/*) get the safe
	// page_location override instead.
	assert.Contains(t, page, gaOAuthPathGate)
	assert.Contains(t, page, "gtag('config', 'G-4BCDEFGHIJ', "+safePageLocationOverride+");}")
	assert.Contains(t, page, "}else{"+gaLegacyConfig+"}")
	// The OAuth-path branch must precede the ordinary-page fallback, so an
	// OAuth callback never falls through to the legacy config.
	oauthBranch := strings.Index(page, gaOAuthPathGate)
	legacyBranch := strings.Index(page, "}else{"+gaLegacyConfig+"}")
	require.GreaterOrEqual(t, oauthBranch, 0)
	assert.Less(t, oauthBranch, legacyBranch, "OAuth-path branch must precede the legacy GA fallback")
	// Ads config only runs behind the production-hostname gate and always
	// carries the safe page_location override.
	assert.Contains(t, page, adsHostnameGate)
	assert.Contains(t, page, "gtag('config', 'AW-18416812623', "+safePageLocationOverride+");")
	assert.Contains(t, page, "__VANCINE_GOOGLE_ADS__")
	assert.Equal(t, 1, strings.Count(page, "dataLayer = window.dataLayer"))
}

func TestInjectGoogleAnalyticsWithGAOnlyProtectsOAuthCallbackPaths(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ANALYTICS_ID": "G-4BCDEFGHIJ",
	})
	// The script tag and dataLayer plumbing are unchanged from legacy.
	assert.Contains(t, page, "gtag/js?id=G-4BCDEFGHIJ")
	assert.Contains(t, page, "window.dataLayer = window.dataLayer || [];")
	// OAuth callback paths (/oauth and /oauth/*) get the safe page_location
	// override, so code/state/error never reach Google.
	assert.Contains(t, page, gaOAuthPathGate)
	assert.Contains(t, page, "gtag('config', 'G-4BCDEFGHIJ', "+safePageLocationOverride+");}")
	// Ordinary pages keep the exact legacy config: no site-wide removal of
	// GA query parameters (landing-page UTM data preserved).
	assert.Contains(t, page, "}else{"+gaLegacyConfig+"}")
	assert.Equal(t, 1, strings.Count(page, gaLegacyConfig))
	// No Ads machinery at all in GA-only deployments.
	assert.NotContains(t, page, "AW-")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")
	assert.NotContains(t, page, adsHostnameGate)
}

func TestInjectGoogleAnalyticsWithAdsIDOnlyEnablesNothing(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ADS_ID": "AW-18416812623",
	})
	assert.NotContains(t, page, "googletagmanager.com")
	assert.NotContains(t, page, "AW-")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")
	assert.NotContains(t, page, "dataLayer")
}

func TestInjectGoogleAnalyticsWithLabelOnlyEnablesNothing(t *testing.T) {
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E",
	})
	assert.NotContains(t, page, "googletagmanager.com")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")
	assert.NotContains(t, page, "dataLayer")
}

func TestInjectGoogleAnalyticsRejectsInvalidAdsEnvValues(t *testing.T) {
	// Invalid Ads ID: even with a valid label, nothing Ads-related is
	// injected (the full pair must be valid).
	page := runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ADS_ID":                      "AW-1';</script>",
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E",
	})
	assert.NotContains(t, page, "googletagmanager.com")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")

	// Invalid label: the Ads tag must not be enabled at all.
	page = runInjectGoogleAnalytics(t, map[string]string{
		"GOOGLE_ADS_ID":                      "AW-18416812623",
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E\";alert(1)",
	})
	assert.NotContains(t, page, "googletagmanager.com")
	assert.NotContains(t, page, "__VANCINE_GOOGLE_ADS__")
}

// ---------------------------------------------------------------------------
// Internal admin shell: the pristine copy must be captured BEFORE any
// analytics injection mutates indexPage, so internal admin-only routes can be
// served a shell with no third-party tags while ordinary pages keep every
// existing injection contract byte-for-byte.
// ---------------------------------------------------------------------------

// privateShellTestTemplate is a minimal production-shaped shell carrying both
// real injection placeholders (each followed by a newline, exactly as the
// embedded dist/index.html does) plus the SPA app asset tag and mount node.
const privateShellTestTemplate = `<!doctype html>
<html lang="en">
  <head>
    <title>Vancine</title>
    <!--umami-->
    <!--Google Analytics-->
  <script defer src="/static/js/index.TESTBUILD.js"></script></head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

// privateShellEnvKeys are the analytics environment variables the private
// shell tests control explicitly.
var privateShellEnvKeys = []string{
	"UMAMI_WEBSITE_ID",
	"UMAMI_SCRIPT_URL",
	"GOOGLE_ANALYTICS_ID",
	"GOOGLE_ADS_ID",
	"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL",
}

// runCaptureAndInject installs a controlled environment and template, captures
// the private shell, then runs both production injections in their real order.
// It returns the captured private shell and the resulting public indexPage.
func runCaptureAndInject(t *testing.T, env map[string]string) (string, string) {
	t.Helper()
	for _, key := range privateShellEnvKeys {
		original, hadOriginal := os.LookupEnv(key)
		if value, set := env[key]; set {
			require.NoError(t, os.Setenv(key, value))
		} else {
			require.NoError(t, os.Unsetenv(key))
		}
		t.Cleanup(func() {
			restoreGoogleEnvValue(key, original, hadOriginal)
		})
	}
	originalIndexPage := indexPage
	indexPage = []byte(privateShellTestTemplate)
	t.Cleanup(func() { indexPage = originalIndexPage })

	privateShell := capturePrivateIndexPage()
	InjectUmamiAnalytics()
	InjectGoogleAnalytics()
	return string(privateShell), string(indexPage)
}

func TestCapturePrivateIndexPageSnapshotsShellBeforeAnalyticsInjection(t *testing.T) {
	privateShell, publicShell := runCaptureAndInject(t, map[string]string{
		"UMAMI_WEBSITE_ID":    "UMAMI-TEST",
		"GOOGLE_ANALYTICS_ID": "G-4BCDEFGHIJ",
	})

	// The captured shell is the pristine template: no third-party payload.
	assert.Equal(t, privateShellTestTemplate, privateShell,
		"the private shell must be the untouched pre-injection template")
	for _, marker := range []string{
		"googletagmanager",
		"google-analytics.com",
		"analytics.umami.is",
		"data-website-id",
		"dataLayer",
		"gtag(",
		"__VANCINE_GOOGLE_ADS__",
		"<!--Umami QuantumNous-->",
		"<!--Google Analytics QuantumNous-->",
	} {
		assert.NotContains(t, privateShell, marker,
			"the private shell must not carry %q", marker)
	}
	// It is still a bootable SPA shell.
	assert.Contains(t, privateShell, `/static/js/index.TESTBUILD.js`)
	assert.Contains(t, privateShell, `<div id="root">`)

	// The ordinary public shell keeps the full existing injection contract.
	assert.Contains(t, publicShell, `https://analytics.umami.is/script.js`)
	assert.Contains(t, publicShell, `data-website-id="UMAMI-TEST"`)
	assert.Contains(t, publicShell, "<!--Umami QuantumNous-->")
	assert.Contains(t, publicShell, "https://www.googletagmanager.com/gtag/js?id=G-4BCDEFGHIJ")
	assert.Contains(t, publicShell, gaOAuthPathGate)
	assert.Contains(t, publicShell, "}else{"+gaLegacyConfig+"}")
	assert.Contains(t, publicShell, "<!--Google Analytics QuantumNous-->")
	assert.Contains(t, publicShell, `/static/js/index.TESTBUILD.js`,
		"injection must not drop the SPA app asset tag")

	// The two shells are genuinely different documents.
	assert.NotEqual(t, privateShell, publicShell)
}

func TestCapturePrivateIndexPageExcludesGoogleAdsBootstrap(t *testing.T) {
	// Ads-only deployment (no GA id): the Ads bootstrap loads gtag.js
	// dynamically behind the production-hostname gate. None of it may reach
	// the internal admin shell, while the public shell keeps the exact
	// existing registration-conversion contract.
	privateShell, publicShell := runCaptureAndInject(t, map[string]string{
		"GOOGLE_ADS_ID":                      "AW-18416812623",
		"GOOGLE_ADS_SIGNUP_CONVERSION_LABEL": "LQ_rCMbphuocEM-E6c1E",
	})

	assert.NotContains(t, privateShell, "googletagmanager")
	assert.NotContains(t, privateShell, "AW-18416812623")
	assert.NotContains(t, privateShell, "__VANCINE_GOOGLE_ADS__")
	assert.NotContains(t, privateShell, adsHostnameGate)
	assert.NotContains(t, privateShell, "dataLayer")

	assert.Contains(t, publicShell, adsHostnameGate)
	assert.Contains(t, publicShell, "var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=AW-18416812623';")
	assert.Contains(t, publicShell, "gtag('config', 'AW-18416812623', "+safePageLocationOverride+");")
	assert.Contains(t, publicShell, `window.__VANCINE_GOOGLE_ADS__={signupSendTo:"AW-18416812623/LQ_rCMbphuocEM-E6c1E"}`)
}

func TestCapturePrivateIndexPageIsUnaffectedByLaterInjection(t *testing.T) {
	// No analytics configured: the injections still replace their build-template
	// placeholders with inert marker comments, but add no third-party payload.
	// The captured private shell must stay exactly the pristine template.
	privateShell, publicShell := runCaptureAndInject(t, map[string]string{})

	assert.Equal(t, privateShellTestTemplate, privateShell,
		"the private shell must be byte-identical to the pre-injection template")
	assert.NotContains(t, privateShell, "<!--Umami QuantumNous-->")
	assert.NotContains(t, privateShell, "<!--Google Analytics QuantumNous-->")

	for _, marker := range []string{
		"googletagmanager",
		"analytics.umami.is",
		"data-website-id",
		"dataLayer",
		"gtag(",
		"__VANCINE_GOOGLE_ADS__",
		"<script async",
		"<script defer src=\"https://",
	} {
		assert.NotContains(t, publicShell, marker,
			"an unconfigured deployment must not inject %q", marker)
	}
	// The public shell still runs the injection path (placeholders replaced by
	// the inert markers), so the two shells differ only by those markers.
	assert.Contains(t, publicShell, "<!--Umami QuantumNous-->")
	assert.Contains(t, publicShell, "<!--Google Analytics QuantumNous-->")
	assert.NotContains(t, publicShell, "<!--umami-->")
	assert.NotContains(t, publicShell, "<!--Google Analytics-->")
	assert.Contains(t, publicShell, `/static/js/index.TESTBUILD.js`,
		"injection must not drop the SPA app asset tag")
}

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

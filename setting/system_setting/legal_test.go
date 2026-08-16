package system_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/config"
)

func TestLocalizedStringUnmarshalJSONObject(t *testing.T) {
	var ls LocalizedString
	err := common.Unmarshal([]byte(`{"en":"English body","zh-CN":"中文正文","fr":"Corps français"}`), &ls)
	require.NoError(t, err)
	assert.Equal(t, "English body", ls["en"])
	assert.Equal(t, "中文正文", ls["zh-CN"])
	assert.Equal(t, "Corps français", ls["fr"])
}

func TestLocalizedStringUnmarshalLegacyPlainString(t *testing.T) {
	var ls LocalizedString
	err := common.Unmarshal([]byte(`"旧版协议正文"`), &ls)
	require.NoError(t, err)
	assert.Equal(t, LocalizedString{i18n.LangZhCN: "旧版协议正文"}, ls)
}

// The raw option value decoder must accept the exact shapes found in the
// options table, including legacy values that are NOT valid JSON.
func TestLocalizedStringDecodeRawOptionValue(t *testing.T) {
	rawMarkdown := "# Legacy Agreement\n\nBody"
	tests := []struct {
		name string
		raw  string
		want LocalizedString
	}{
		{"localized object", `{"en":"EN","zh-CN":"CN"}`, LocalizedString{"en": "EN", "zh-CN": "CN"}},
		{"json string token", `"quoted legacy"`, LocalizedString{i18n.LangZhCN: "quoted legacy"}},
		{"raw markdown", rawMarkdown, LocalizedString{i18n.LangZhCN: rawMarkdown}},
		{"raw html", `<p>legacy html</p>`, LocalizedString{i18n.LangZhCN: "<p>legacy html</p>"}},
		{"raw url", `https://example.com/tos`, LocalizedString{i18n.LangZhCN: "https://example.com/tos"}},
		{"invalid json object falls back to raw", `{"en": "broken`, LocalizedString{i18n.LangZhCN: `{"en": "broken`}},
		{"empty string", ``, LocalizedString{}},
		{"quoted empty string", `""`, LocalizedString{}},
		{"null", `null`, LocalizedString{}},
		{"json array", `[1,2]`, LocalizedString{}},
		{"json number", `123`, LocalizedString{}},
		{"json bool", `true`, LocalizedString{}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var ls LocalizedString
			require.NotPanics(t, func() {
				require.NoError(t, ls.DecodeRawOptionValue(tc.raw))
			})
			assert.Equal(t, tc.want, ls)
		})
	}
}

func TestLocalizedStringUnmarshalEmptyAndNull(t *testing.T) {
	var ls LocalizedString
	require.NoError(t, common.Unmarshal([]byte(`""`), &ls))
	assert.Empty(t, ls)

	ls = nil
	require.NoError(t, common.Unmarshal([]byte(`null`), &ls))
	assert.NotNil(t, ls)
	assert.Empty(t, ls)
}

// Invalid JSON values must produce a detectable error or a defined safe
// fallback; they must never panic. Type-wrong JSON collapses to an empty
// map; unquoted raw text (even when it starts with '{') is legacy content
// and is wrapped into zh-CN.
func TestLocalizedStringUnmarshalInvalidValues(t *testing.T) {
	typeWrong := []string{`[1,2,3]`, `123`, `true`}
	for _, raw := range typeWrong {
		var ls LocalizedString
		assert.NotPanics(t, func() {
			err := common.Unmarshal([]byte(raw), &ls)
			assert.NoError(t, err)
			assert.Empty(t, ls, "input %q", raw)
		}, "input %q", raw)
	}

	var raw LocalizedString
	// encoding/json rejects the value before UnmarshalJSON runs; the error
	// is detectable and decoding never panics.
	assert.NotPanics(t, func() {
		assert.Error(t, common.Unmarshal([]byte(`{invalid json`), &raw))
	})
	// The config-layer raw decoder, which receives database strings
	// verbatim, treats the same value as legacy plain text.
	assert.NotPanics(t, func() {
		assert.NoError(t, raw.DecodeRawOptionValue(`{invalid json`))
	})
	assert.Equal(t, LocalizedString{i18n.LangZhCN: `{invalid json`}, raw)
}

func TestLocalizedStringContentForFallbackMatrix(t *testing.T) {
	tests := []struct {
		name string
		ls   LocalizedString
		lang string
		want string
	}{
		{"exact locale hit", LocalizedString{"fr": "fr body", "en": "en body"}, "fr", "fr body"},
		{"zh-TW exact hit", LocalizedString{"zh-TW": "tw body", "zh-CN": "cn body"}, "zh-TW", "tw body"},
		{"zh-TW falls back to zh-CN", LocalizedString{"zh-CN": "cn body", "en": "en body"}, "zh-TW", "cn body"},
		{"zh-TW falls through to en", LocalizedString{"en": "en body"}, "zh-TW", "en body"},
		{"other locale falls back to en", LocalizedString{"en": "en body", "zh-CN": "cn body"}, "ru", "en body"},
		{"other locale falls back to zh-CN when en missing", LocalizedString{"zh-CN": "cn body"}, "ja", "cn body"},
		{"en falls back to zh-CN", LocalizedString{"zh-CN": "cn body"}, "en", "cn body"},
		{"zh-CN falls back to en", LocalizedString{"en": "en body"}, "zh-CN", "en body"},
		{"all missing returns empty", LocalizedString{"vi": "vi body"}, "ru", ""},
		{"empty map returns empty", LocalizedString{}, "en", ""},
		{"nil map returns empty", nil, "en", ""},
		{"empty string values are skipped", LocalizedString{"en": "", "zh-CN": "cn body"}, "en", "cn body"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.ls.ContentFor(tc.lang))
		})
	}
}

// The config manager round-trip: DB values arrive as raw strings through
// config.UpdateConfigFromMap and leave as strings through config.ConfigToMap.
func TestLegalSettingsConfigRoundTrip(t *testing.T) {
	settings := &LegalSettings{}

	// Current production shape: a localized JSON object.
	err := config.UpdateConfigFromMap(settings, map[string]string{
		"user_agreement": `{"en":"EN agreement","zh-CN":"CN 协议"}`,
		"privacy_policy": `{"en":"EN privacy"}`,
	})
	require.NoError(t, err)
	assert.Equal(t, "EN agreement", settings.UserAgreement["en"])
	assert.Equal(t, "CN 协议", settings.UserAgreement[i18n.LangZhCN])
	assert.Equal(t, "EN privacy", settings.PrivacyPolicy["en"])

	// Legacy DB shape: a TRUE raw value without JSON quotes (old Markdown)
	// must be wrapped into zh-CN, not dropped.
	rawLegacy := "# Legacy Agreement\n\nBody"
	err = config.UpdateConfigFromMap(settings, map[string]string{
		"user_agreement": rawLegacy,
	})
	require.NoError(t, err)
	assert.Equal(t, rawLegacy, settings.UserAgreement[i18n.LangZhCN])
	// Immediate selection works right after the raw load.
	assert.Equal(t, rawLegacy, settings.UserAgreement.ContentFor(i18n.LangZhCN))
	assert.Equal(t, rawLegacy, settings.UserAgreement.ContentFor(i18n.LangEn))

	// Type-wrong JSON must not panic and must not corrupt other fields.
	assert.NotPanics(t, func() {
		err = config.UpdateConfigFromMap(settings, map[string]string{
			"privacy_policy": `[1,2]`,
		})
	})
	require.NoError(t, err)
	assert.Empty(t, settings.PrivacyPolicy)

	// Exported option values must stay valid JSON strings — never Go
	// `map[...]` formatting or `[object Object]`.
	exported, err := config.ConfigToMap(settings)
	require.NoError(t, err)
	for _, key := range []string{"user_agreement", "privacy_policy"} {
		value := exported[key]
		require.True(t, strings.HasPrefix(value, "{"), "key %s exported as %q", key, value)
		assert.NotContains(t, value, "map[")
		var parsed map[string]string
		require.NoError(t, common.Unmarshal([]byte(value), &parsed), "key %s", key)
	}
	assert.Equal(t, rawLegacy, mustParseLocalized(t, exported["user_agreement"])[i18n.LangZhCN])

	// Reload simulation: feeding the exported value into a fresh settings
	// object must preserve the legacy body.
	reloaded := &LegalSettings{}
	require.NoError(t, config.UpdateConfigFromMap(reloaded, exported))
	assert.Equal(t, rawLegacy, reloaded.UserAgreement.ContentFor(i18n.LangZhCN))
	assert.Equal(t, rawLegacy, reloaded.UserAgreement.ContentFor(i18n.LangZhTW))
}

func mustParseLocalized(t *testing.T, raw string) map[string]string {
	t.Helper()
	var m map[string]string
	require.NoError(t, common.Unmarshal([]byte(raw), &m))
	return m
}

// HasContent drives the public enabled flags: it must be true only when a
// supported language can resolve a non-empty body.
func TestLocalizedStringHasContent(t *testing.T) {
	tests := []struct {
		name string
		ls   LocalizedString
		want bool
	}{
		{"en body", LocalizedString{"en": "body"}, true},
		{"zh-CN body", LocalizedString{"zh-CN": "正文"}, true},
		{"supported locale only", LocalizedString{"vi": "vi body"}, true},
		{"nil", nil, false},
		{"empty", LocalizedString{}, false},
		{"only empty en value", LocalizedString{"en": ""}, false},
		{"all values empty", LocalizedString{"en": "", "zh-CN": ""}, false},
		{"unsupported locale without fallback", LocalizedString{"eo": "x"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.ls.HasContent())
		})
	}
}

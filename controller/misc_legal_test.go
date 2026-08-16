package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// legalTestEnv installs the given legal settings behind the real I18n
// middleware and returns a recorder-per-request helper. It restores the
// previous settings on test cleanup so the package-level defaults are never
// leaked between tests.
func legalTestEnv(t *testing.T, agreement, privacy system_setting.LocalizedString) func(acceptLang, path string) map[string]any {
	t.Helper()

	prev := *system_setting.GetLegalSettings()
	system_setting.GetLegalSettings().UserAgreement = agreement
	system_setting.GetLegalSettings().PrivacyPolicy = privacy
	t.Cleanup(func() {
		*system_setting.GetLegalSettings() = prev
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.I18n())
	router.GET("/api/user-agreement", GetUserAgreement)
	router.GET("/api/privacy-policy", GetPrivacyPolicy)

	return func(acceptLang, path string) map[string]any {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if acceptLang != "" {
			req.Header.Set("Accept-Language", acceptLang)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)

		var body map[string]any
		require.NoError(t, common.Unmarshal(w.Body.Bytes(), &body))
		require.Equal(t, true, body["success"])
		return body
	}
}

var legalSevenLocales = system_setting.LocalizedString{
	"en":    "English agreement",
	"zh-CN": "简体中文协议",
	"zh-TW": "繁體中文協議",
	"fr":    "Contrat en français",
	"ru":    "Русское соглашение",
	"ja":    "日本語の利用規約",
	"vi":    "Thỏa thuận tiếng Việt",
}

// Every one of the seven frontend languages must select its own content.
func TestUserAgreementSelectsContentPerLanguage(t *testing.T) {
	do := legalTestEnv(t, legalSevenLocales, system_setting.LocalizedString{})

	expected := map[string]string{
		"en":    "English agreement",
		"zh-CN": "简体中文协议",
		"zh-TW": "繁體中文協議",
		"fr":    "Contrat en français",
		"ru":    "Русское соглашение",
		"ja":    "日本語の利用規約",
		"vi":    "Thỏa thuận tiếng Việt",
	}
	for lang, want := range expected {
		body := do(lang, "/api/user-agreement")
		data, ok := body["data"].(string)
		require.Truef(t, ok, "data must be a plain string, got %T for %s", body["data"], lang)
		assert.Equal(t, want, data, "Accept-Language %s", lang)
	}
}

// Deterministic fallback chain: zh-TW -> zh-CN, other locales -> en,
// en missing -> zh-CN, nothing -> "".
func TestUserAgreementFallbackChain(t *testing.T) {
	// No zh-TW content: falls back to zh-CN, then en.
	do := legalTestEnv(t, system_setting.LocalizedString{
		"zh-CN": "CN only",
		"en":    "EN only",
	}, system_setting.LocalizedString{})
	assert.Equal(t, "CN only", do("zh-TW", "/api/user-agreement")["data"])

	// No zh-TW and no zh-CN: falls back to en.
	do = legalTestEnv(t, system_setting.LocalizedString{"en": "EN only"}, system_setting.LocalizedString{})
	assert.Equal(t, "EN only", do("zh-TW", "/api/user-agreement")["data"])

	// Unsupported/unknown locale: falls back to en, then zh-CN.
	do = legalTestEnv(t, system_setting.LocalizedString{"zh-CN": "CN only"}, system_setting.LocalizedString{})
	assert.Equal(t, "CN only", do("en", "/api/user-agreement")["data"])

	// Empty configuration: empty string, no panic.
	do = legalTestEnv(t, system_setting.LocalizedString{}, system_setting.LocalizedString{})
	body := do("fr", "/api/user-agreement")
	data, ok := body["data"].(string)
	require.True(t, ok, "data must be a plain string even when empty")
	assert.Equal(t, "", data)
}

// The endpoints must return only the body string for the request language —
// never the full localized map (regression guard for the JSON-as-content bug).
func TestPrivacyPolicyReturnsPlainStringNotMap(t *testing.T) {
	do := legalTestEnv(t, system_setting.LocalizedString{}, system_setting.LocalizedString{
		"en":    "English privacy",
		"zh-CN": "简体中文隐私政策",
	})

	for _, lang := range []string{"en", "zh-CN"} {
		body := do(lang, "/api/privacy-policy")
		data, ok := body["data"].(string)
		require.Truef(t, ok, "data must be a string, got %T", body["data"])
		assert.NotContains(t, data, "{")
		assert.NotContains(t, data, "zh-CN")
	}
	assert.Equal(t, "English privacy", do("en", "/api/privacy-policy")["data"])
	assert.Equal(t, "简体中文隐私政策", do("zh-CN", "/api/privacy-policy")["data"])
	// Unconfigured locale falls back deterministically instead of leaking the map.
	assert.Equal(t, "English privacy", do("ja", "/api/privacy-policy")["data"])
}

func TestGetAboutLocalizedAndLegacyShapes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.I18n())
	router.GET("/api/about", GetAbout)

	// The controller test binary never runs model.InitOptionMap, so the map
	// must be created before any write to avoid a nil-map panic.
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	prev, hadPrev := common.OptionMap["About"]
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if hadPrev {
			common.OptionMap["About"] = prev
		} else {
			delete(common.OptionMap, "About")
		}
	})

	setAbout := func(value string) {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		common.OptionMap["About"] = value
	}

	request := func(acceptLang string) string {
		req := httptest.NewRequest(http.MethodGet, "/api/about", nil)
		if acceptLang != "" {
			req.Header.Set("Accept-Language", acceptLang)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
		var body map[string]any
		require.NoError(t, common.Unmarshal(w.Body.Bytes(), &body))
		data, ok := body["data"].(string)
		require.True(t, ok, "about data must be a string, got %T", body["data"])
		return data
	}

	// Localized map content selects per language with fallbacks.
	setAbout(`{"en":"About EN","zh-CN":"关于中文"}`)
	assert.Equal(t, "About EN", request("en"))
	assert.Equal(t, "关于中文", request("zh-CN"))
	assert.Equal(t, "About EN", request("fr"))

	// Legacy plain (non-JSON) content passes through untouched.
	setAbout("<p>Plain HTML about</p>")
	assert.Equal(t, "<p>Plain HTML about</p>", request("en"))
	assert.Equal(t, "<p>Plain HTML about</p>", request("zh-CN"))

	// Empty about stays empty without panicking.
	setAbout("")
	assert.Equal(t, "", request("en"))
}

// The public enabled flags must reflect usable content, not mere map
// occupancy: a map whose only values are empty strings disables the
// documents, while any resolvable body enables them.
func TestGetStatusLegalEnabledFlagsFollowHasContent(t *testing.T) {
	prev := *system_setting.GetLegalSettings()
	t.Cleanup(func() { *system_setting.GetLegalSettings() = prev })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.I18n())
	router.GET("/api/status", GetStatus)

	flags := func() (bool, bool) {
		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
		var body struct {
			Success bool `json:"success"`
			Data    struct {
				UserAgreementEnabled bool `json:"user_agreement_enabled"`
				PrivacyPolicyEnabled bool `json:"privacy_policy_enabled"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(w.Body.Bytes(), &body))
		require.True(t, body.Success)
		return body.Data.UserAgreementEnabled, body.Data.PrivacyPolicyEnabled
	}

	settings := system_setting.GetLegalSettings()

	settings.UserAgreement = system_setting.LocalizedString{"en": ""}
	settings.PrivacyPolicy = system_setting.LocalizedString{}
	ua, pp := flags()
	assert.False(t, ua, `{"en":""} must disable the user agreement`)
	assert.False(t, pp)

	settings.UserAgreement = system_setting.LocalizedString{"en": "body"}
	ua, pp = flags()
	assert.True(t, ua, `{"en":"body"} must enable the user agreement`)
	assert.False(t, pp)

	settings.UserAgreement = system_setting.LocalizedString{"zh-CN": "正文"}
	ua, pp = flags()
	assert.True(t, ua, `{"zh-CN":"正文"} must enable the user agreement via fallback`)
	assert.False(t, pp)

	settings.UserAgreement = nil
	settings.PrivacyPolicy = nil
	ua, pp = flags()
	assert.False(t, ua)
	assert.False(t, pp)
}

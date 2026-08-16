package i18n

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	if err := Init(); err != nil {
		panic("i18n init failed: " + err.Error())
	}
	os.Exit(m.Run())
}

// The backend must recognize exactly the seven interface languages the
// frontend uses (en, zh-CN, zh-TW, fr, ru, ja, vi). fr/ru/ja/vi must NOT be
// collapsed onto en during normalization.
func TestNormalizeLangRecognizesAllSevenInterfaceLanguages(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"en", LangEn},
		{"en-US", LangEn},
		{"EN", LangEn},
		{"zh-CN", LangZhCN},
		{"zh", LangZhCN},
		{"zh_CN", LangZhCN},
		{"zh-Hans", LangZhCN},
		{"zh-TW", LangZhTW},
		{"zh-tw", LangZhTW},
		{"zh_TW", LangZhTW},
		{"zh-Hant", LangZhTW},
		{"fr", LangFr},
		{"fr-FR", LangFr},
		{"ru", LangRu},
		{"ru-RU", LangRu},
		{"ja", LangJa},
		{"ja-JP", LangJa},
		{"vi", LangVi},
		{"vi-VN", LangVi},
		{"", DefaultLang},
		{"xx", DefaultLang},
	}
	for _, tc := range tests {
		assert.Equal(t, tc.want, normalizeLang(tc.input), "input %q", tc.input)
	}
}

func TestSupportedLanguagesCoversFrontendSet(t *testing.T) {
	require.ElementsMatch(t,
		[]string{LangEn, LangZhCN, LangZhTW, LangFr, LangRu, LangJa, LangVi},
		SupportedLanguages())

	for _, lang := range SupportedLanguages() {
		assert.True(t, IsSupported(lang), "expected %q to be supported", lang)
	}
}

func TestParseAcceptLanguage(t *testing.T) {
	tests := []struct {
		header string
		want   string
	}{
		{"en", LangEn},
		{"en-US,en;q=0.9", LangEn},
		{"zh-CN,zh;q=0.9", LangZhCN},
		{"zh-TW,zh;q=0.9,en;q=0.8", LangZhTW},
		{"fr-FR,fr;q=0.9,en;q=0.8", LangFr},
		{"ru-RU,ru;q=0.9", LangRu},
		{"ja-JP,ja;q=0.9", LangJa},
		{"vi-VN,vi;q=0.9", LangVi},
		{"", DefaultLang},
		{"eo,ia;q=0.5", DefaultLang},
	}
	for _, tc := range tests {
		assert.Equal(t, tc.want, ParseAcceptLanguage(tc.header), "header %q", tc.header)
	}
}

// GetLangFromContext must resolve every supported Accept-Language value, not
// only the three legacy languages.
func TestGetLangFromContextAcceptLanguageHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		header string
		want   string
	}{
		{"en-US", LangEn},
		{"zh-CN", LangZhCN},
		{"zh-TW", LangZhTW},
		{"fr-FR", LangFr},
		{"ru", LangRu},
		{"ja-JP", LangJa},
		{"vi", LangVi},
		{"", DefaultLang},
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/api/user-agreement", nil)
		if tc.header != "" {
			c.Request.Header.Set("Accept-Language", tc.header)
		}
		assert.Equal(t, tc.want, GetLangFromContext(c), "header %q", tc.header)
	}
}

// Existing translation behavior must not regress: known locales translate,
// and locales without backend message catalogs fall back to English instead
// of the bundle default language.
func TestTranslateFallsBackToEnglishForCataloglessLocales(t *testing.T) {
	assert.Equal(t, "Update successful", Translate(LangEn, MsgUpdateSuccess))
	assert.Equal(t, "更新成功", Translate(LangZhCN, MsgUpdateSuccess))
	assert.Equal(t, "更新成功", Translate(LangZhTW, MsgUpdateSuccess))
	assert.Equal(t, "Update successful", Translate(LangFr, MsgUpdateSuccess))
	assert.Equal(t, "Update successful", Translate(LangRu, MsgUpdateSuccess))
	assert.Equal(t, "Update successful", Translate(LangJa, MsgUpdateSuccess))
	assert.Equal(t, "Update successful", Translate(LangVi, MsgUpdateSuccess))
}

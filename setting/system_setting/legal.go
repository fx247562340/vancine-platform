package system_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/config"
)

// LocalizedString stores per-locale legal/about content keyed by BCP-47
// language tag (en, zh-CN, zh-TW, fr, ru, ja, vi).
//
// It supports backward-compatible decoding from every shape that can be
// found in the options table:
//   - JSON object (current format): used verbatim.
//   - JSON string token (legacy quoted format): wrapped into zh-CN.
//   - Raw unquoted Markdown/HTML/URL/plain text (legacy single-language
//     format): wrapped into zh-CN.
//   - Empty string / null: yields an empty map.
//   - Valid but type-wrong JSON (array/number/bool): yields an empty map.
//
// Decoding never panics and is deterministic, so a fresh load from the
// database and an immediate update always produce the same value.
type LocalizedString map[string]string

func (ls *LocalizedString) UnmarshalJSON(data []byte) error {
	return ls.DecodeRawOptionValue(string(data))
}

// DecodeRawOptionValue implements config.RawOptionValueDecoder: it accepts
// the raw option string exactly as stored in the database, including legacy
// values that are not valid JSON.
func (ls *LocalizedString) DecodeRawOptionValue(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		*ls = LocalizedString{}
		return nil
	}

	// Current format: a JSON object mapping locale -> content. `null` also
	// lands here and produces an empty map.
	var asMap map[string]string
	if err := common.UnmarshalJsonStr(trimmed, &asMap); err == nil {
		if asMap == nil {
			asMap = map[string]string{}
		}
		*ls = asMap
		return nil
	}

	// Legacy quoted format: a JSON string token, historically Simplified
	// Chinese.
	var asString string
	if err := common.UnmarshalJsonStr(trimmed, &asString); err == nil {
		if asString == "" {
			*ls = LocalizedString{}
		} else {
			*ls = LocalizedString{i18n.LangZhCN: asString}
		}
		return nil
	}

	// Valid JSON of a type that cannot carry localized content
	// (array/number/bool): safe fallback to an empty map.
	var asAny any
	if err := common.UnmarshalJsonStr(trimmed, &asAny); err == nil {
		*ls = LocalizedString{}
		return nil
	}

	// Anything else is legacy raw text (Markdown/HTML/URL/plain), possibly
	// starting with '{' or '"' without being valid JSON.
	*ls = LocalizedString{i18n.LangZhCN: value}
	return nil
}

// ContentFor selects the content for a normalized language tag using a
// deterministic fallback chain (never map iteration):
//
//   - zh-TW: zh-TW -> zh-CN -> en
//   - zh-CN: zh-CN -> en
//   - en:    en -> zh-CN
//   - other: tag -> en -> zh-CN
//
// Returns "" when no candidate has non-empty content.
func (ls LocalizedString) ContentFor(lang string) string {
	if len(ls) == 0 {
		return ""
	}

	var candidates []string
	switch lang {
	case i18n.LangZhTW:
		candidates = []string{i18n.LangZhTW, i18n.LangZhCN, i18n.LangEn}
	case i18n.LangZhCN:
		candidates = []string{i18n.LangZhCN, i18n.LangEn}
	case i18n.LangEn:
		candidates = []string{i18n.LangEn, i18n.LangZhCN}
	default:
		candidates = []string{lang, i18n.LangEn, i18n.LangZhCN}
	}

	for _, key := range candidates {
		if content := ls[key]; content != "" {
			return content
		}
	}
	return ""
}

// HasContent reports whether at least one supported interface language can
// resolve a non-empty body through the deterministic fallback chain. It is
// the business predicate behind the public enabled flags: a map whose only
// values are empty strings, or whose keys are unsupported locales without
// any fallback target, counts as having no content.
func (ls LocalizedString) HasContent() bool {
	for _, lang := range i18n.SupportedLanguages() {
		if ls.ContentFor(lang) != "" {
			return true
		}
	}
	return false
}

type LegalSettings struct {
	UserAgreement LocalizedString `json:"user_agreement"`
	PrivacyPolicy LocalizedString `json:"privacy_policy"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: LocalizedString{},
	PrivacyPolicy: LocalizedString{},
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}

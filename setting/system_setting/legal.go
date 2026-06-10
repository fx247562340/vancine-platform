package system_setting

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/setting/config"
)

// LocalizedString stores per-locale content as a map.
// It supports backward-compatible unmarshaling: if the JSON value is a
// plain string (old format), it wraps it into {"zh-CN": value}.
type LocalizedString map[string]string

func (ls *LocalizedString) UnmarshalJSON(data []byte) error {
	// Try map format first (new format)
	var m map[string]string
	if err := json.Unmarshal(data, &m); err == nil && len(m) > 0 {
		*ls = m
		return nil
	}
	// Fall back to plain string (old format) – default to zh-CN
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		if s != "" {
			*ls = LocalizedString{"zh-CN": s}
		} else {
			*ls = LocalizedString{}
		}
		return nil
	}
	*ls = LocalizedString{}
	return nil
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

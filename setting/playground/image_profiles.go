/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package playground

import "strings"

// AspectRatio is a width:height ratio used to bound custom image sizes.
type AspectRatio struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// ImageModelProfile declares the user-tunable parameters for an image model
// and their legal ranges. The playground UI renders controls from this
// profile; the backend uses it to validate inbound requests.
//
// Only models with an exact, verified profile are advertised in Capability.
// Family membership (Chat exclusion) is separate from having a profile.
type ImageModelProfile struct {
	Sizes                    []string  `json:"sizes"`
	DefaultSize              string    `json:"defaultSize"`
	SupportsAutoSize         bool      `json:"supportsAutoSize"`
	SupportsCustomSize       bool      `json:"supportsCustomSize"`
	NRange                   IntRange  `json:"nRange"`
	MaxReferenceImages       int       `json:"maxReferenceImages"`
	SupportsNegativePrompt   bool      `json:"supportsNegativePrompt"`
	MaxNegativePromptChars   int       `json:"maxNegativePromptChars"`
	SupportsSeed             bool      `json:"supportsSeed"`
	SeedRange                *IntRange `json:"seedRange"`
	SupportsWatermark        bool      `json:"supportsWatermark"`
	DefaultWatermark         *bool     `json:"defaultWatermark"`
	SupportsPromptExtend     bool      `json:"supportsPromptExtend"`
	DefaultPromptExtend      *bool     `json:"defaultPromptExtend"`
	SupportsPromptExtendMode bool      `json:"supportsPromptExtendMode"`
	DefaultPromptExtendMode  *string   `json:"defaultPromptExtendMode,omitempty"`
	SupportsThinkingMode     bool      `json:"supportsThinkingMode"`
	DefaultThinkingMode      *bool     `json:"defaultThinkingMode"`
	ThinkingRequiresExtend   bool      `json:"thinkingRequiresExtend"`
	AgentRequiresNoRefs      bool      `json:"agentRequiresNoRefs"`
	// AllowedReferenceMIMETypes is the model-level reference image MIME
	// allowlist. An empty list means the default JPEG/PNG/WebP set.
	AllowedReferenceMIMETypes []string     `json:"allowedReferenceMimeTypes,omitempty"`
	MinPixels                 int64        `json:"minPixels,omitempty"`
	MaxPixels                 int64        `json:"maxPixels,omitempty"`
	MaxPixelsWithRefs         int64        `json:"maxPixelsWithRefs,omitempty"`
	MinAspectRatio            *AspectRatio `json:"minAspectRatio,omitempty"`
	MaxAspectRatio            *AspectRatio `json:"maxAspectRatio,omitempty"`
}

// IntRange constrains an integer parameter.
type IntRange struct {
	Min     int `json:"min"`
	Max     int `json:"max"`
	Default int `json:"default"`
}

var (
	defaultReferenceMIMETypes = []string{
		"image/jpeg",
		"image/png",
		"image/webp",
	}
	qwenImage30ReferenceMIMETypes = []string{
		"image/jpeg",
		"image/png",
		"image/bmp",
		"image/tiff",
		"image/webp",
		"image/gif",
	}

	// qwenImage20SeriesProfile is the verified contract for the Qwen Image 2.0
	// generation. Ali published sizes, default 2048x2048, supports negative
	// prompts, supports prompt_extend, no enable_thinking / prompt_extend_mode.
	qwenImage20SeriesProfile = &ImageModelProfile{
		Sizes:                     []string{"2048x2048", "2688x1536", "1536x2688", "2368x1728", "1728x2368"},
		DefaultSize:               "2048x2048",
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 6, Default: 1},
		MaxReferenceImages:        3,
		SupportsNegativePrompt:    true,
		MaxNegativePromptChars:    500,
		SupportsSeed:              true,
		SeedRange:                 &IntRange{Min: 0, Max: 2147483647, Default: 0},
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		SupportsPromptExtend:      true,
		DefaultPromptExtend:       boolPtr(true),
		AllowedReferenceMIMETypes: append([]string(nil), defaultReferenceMIMETypes...),
		MinPixels:                 512 * 512,
		MaxPixels:                 2048 * 2048,
	}

	// qwenImage30Profile is the verified contract for qwen-image-3.0.
	// Auto is the default size and is omitted from the upstream body; custom
	// WIDTH*HEIGHT is sent as "size" (see relay/channel/ali/image.go). 3.0
	// supports both prompt_extend_mode (direct / agent) and enable_thinking,
	// and agent is forbidden whenever reference images are attached.
	qwenImage30Profile = &ImageModelProfile{
		Sizes:                     []string{"Auto", "1024x1024", "1280x1280", "1536x1536", "2048x2048"},
		DefaultSize:               "Auto",
		SupportsAutoSize:          true,
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 6, Default: 1},
		MaxReferenceImages:        3,
		SupportsNegativePrompt:    true,
		MaxNegativePromptChars:    0, // Qwen 3.0: no official limit; only the gateway body-size cap applies
		SupportsSeed:              true,
		SeedRange:                 &IntRange{Min: 0, Max: 2147483647, Default: 0},
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		SupportsPromptExtend:      true,
		DefaultPromptExtend:       boolPtr(true),
		SupportsPromptExtendMode:  true,
		DefaultPromptExtendMode:   stringPtr("direct"),
		SupportsThinkingMode:      true,
		DefaultThinkingMode:       boolPtr(true),
		ThinkingRequiresExtend:    true,
		AgentRequiresNoRefs:       true,
		AllowedReferenceMIMETypes: append([]string(nil), qwenImage30ReferenceMIMETypes...),
		MinPixels:                 512 * 512,
		MaxPixels:                 2048 * 2048,
		MinAspectRatio:            &AspectRatio{Width: 1, Height: 8},
		MaxAspectRatio:            &AspectRatio{Width: 8, Height: 1},
	}

	// qwenImage30ProProfile is the verified contract for qwen-image-3.0-pro.
	// It accepts reference images and the same Auto / custom size contract.
	// prompt_extend_mode "agent" remains forbidden whenever refs are present.
	qwenImage30ProProfile = &ImageModelProfile{
		Sizes:                     []string{"Auto", "1024x1024", "1280x1280", "1536x1536", "2048x2048"},
		DefaultSize:               "Auto",
		SupportsAutoSize:          true,
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 6, Default: 1},
		MaxReferenceImages:        3,
		SupportsNegativePrompt:    true,
		MaxNegativePromptChars:    0, // Qwen 3.0 Pro: no official limit; only the gateway body-size cap applies
		SupportsSeed:              true,
		SeedRange:                 &IntRange{Min: 0, Max: 2147483647, Default: 0},
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		SupportsPromptExtend:      true,
		DefaultPromptExtend:       boolPtr(true),
		SupportsPromptExtendMode:  true,
		DefaultPromptExtendMode:   stringPtr("direct"),
		SupportsThinkingMode:      true,
		DefaultThinkingMode:       boolPtr(true),
		ThinkingRequiresExtend:    true,
		AgentRequiresNoRefs:       true,
		AllowedReferenceMIMETypes: append([]string(nil), qwenImage30ReferenceMIMETypes...),
		MinPixels:                 512 * 512,
		MaxPixels:                 2048 * 2048,
		MinAspectRatio:            &AspectRatio{Width: 1, Height: 8},
		MaxAspectRatio:            &AspectRatio{Width: 8, Height: 1},
	}

	wanImageProProfile = &ImageModelProfile{
		Sizes:                     []string{"1K", "2K", "4K"},
		DefaultSize:               "2K",
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 4, Default: 1},
		MaxReferenceImages:        9,
		SupportsSeed:              true,
		SeedRange:                 &IntRange{Min: 0, Max: 2147483647, Default: 0},
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		SupportsThinkingMode:      true,
		DefaultThinkingMode:       boolPtr(true),
		AllowedReferenceMIMETypes: append([]string(nil), defaultReferenceMIMETypes...),
		MinPixels:                 768 * 768,
		MaxPixels:                 4096 * 4096,
		MaxPixelsWithRefs:         2048 * 2048,
		MinAspectRatio:            &AspectRatio{Width: 1, Height: 8},
		MaxAspectRatio:            &AspectRatio{Width: 8, Height: 1},
	}

	seedream5ProProfile = &ImageModelProfile{
		Sizes:                     []string{"1K", "1.5K", "2K"},
		DefaultSize:               "2K",
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 1, Default: 1},
		MaxReferenceImages:        10,
		SupportsSeed:              false,
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		AllowedReferenceMIMETypes: append([]string(nil), defaultReferenceMIMETypes...),
		MinPixels:                 921600,
		MaxPixels:                 4624220,
		MinAspectRatio:            &AspectRatio{Width: 1, Height: 16},
		MaxAspectRatio:            &AspectRatio{Width: 16, Height: 1},
	}

	seedream5LiteProfile = &ImageModelProfile{
		Sizes:                     []string{"2K", "3K", "4K"},
		DefaultSize:               "2K",
		SupportsCustomSize:        true,
		NRange:                    IntRange{Min: 1, Max: 1, Default: 1},
		MaxReferenceImages:        14,
		SupportsSeed:              false,
		SupportsWatermark:         true,
		DefaultWatermark:          boolPtr(false),
		AllowedReferenceMIMETypes: append([]string(nil), defaultReferenceMIMETypes...),
		MinPixels:                 3686400,
		MaxPixels:                 16777216,
		MinAspectRatio:            &AspectRatio{Width: 1, Height: 16},
		MaxAspectRatio:            &AspectRatio{Width: 16, Height: 1},
	}
)

// imageProfiles is the exact, verified playground registry.
// wan2.7-image is intentionally absent: project sources only document WxH
// without a confirmed discrete size or advanced-parameter contract.
// qwen-image-3.0 and qwen-image-3.0-pro are registered separately from
// 2.0: the parameter contract is different (Auto size, prompt_extend_mode,
// enable_thinking with prompt_extend dependency, agent requires no refs).
var imageProfiles = map[string]*ImageModelProfile{
	"qwen-image-2.0":           qwenImage20SeriesProfile,
	"qwen-image-2.0-pro":       qwenImage20SeriesProfile,
	"qwen-image-3.0":           qwenImage30Profile,
	"qwen-image-3.0-pro":       qwenImage30ProProfile,
	"wan2.7-image-pro":         wanImageProProfile,
	"doubao-seedream-5.0-pro":  seedream5ProProfile,
	"doubao-seedream-5.0-lite": seedream5LiteProfile,
}

// ImageProfile returns the exact parameter profile for a model.
// Unknown models, including image-family models without a verified contract,
// return nil and must not be advertised in Capability.
func ImageProfile(model string) *ImageModelProfile {
	if p, ok := imageProfiles[normalizeModelName(model)]; ok {
		return cloneImageProfile(p)
	}
	return nil
}

// HasImageProfile reports whether the model has an exact verified profile.
func HasImageProfile(model string) bool {
	_, ok := imageProfiles[normalizeModelName(model)]
	return ok
}

func normalizeModelName(model string) string {
	return strings.ToLower(strings.TrimSpace(model))
}

func cloneImageProfile(profile *ImageModelProfile) *ImageModelProfile {
	if profile == nil {
		return nil
	}
	cloned := *profile
	cloned.Sizes = append([]string(nil), profile.Sizes...)
	if profile.SeedRange != nil {
		seedRange := *profile.SeedRange
		cloned.SeedRange = &seedRange
	}
	if profile.DefaultWatermark != nil {
		value := *profile.DefaultWatermark
		cloned.DefaultWatermark = &value
	}
	if profile.DefaultPromptExtend != nil {
		value := *profile.DefaultPromptExtend
		cloned.DefaultPromptExtend = &value
	}
	if profile.DefaultPromptExtendMode != nil {
		value := *profile.DefaultPromptExtendMode
		cloned.DefaultPromptExtendMode = &value
	}
	if profile.DefaultThinkingMode != nil {
		value := *profile.DefaultThinkingMode
		cloned.DefaultThinkingMode = &value
	}
	if profile.MinAspectRatio != nil {
		value := *profile.MinAspectRatio
		cloned.MinAspectRatio = &value
	}
	if profile.MaxAspectRatio != nil {
		value := *profile.MaxAspectRatio
		cloned.MaxAspectRatio = &value
	}
	if profile.AllowedReferenceMIMETypes != nil {
		cloned.AllowedReferenceMIMETypes = append([]string(nil), profile.AllowedReferenceMIMETypes...)
	}
	return &cloned
}

func boolPtr(value bool) *bool {
	return &value
}

func stringPtr(value string) *string {
	return &value
}

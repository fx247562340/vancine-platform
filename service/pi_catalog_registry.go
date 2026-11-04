package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	piCatalogProvider      = "vancine"
	piCatalogSchemaVersion = 1
	piCatalogKindChat      = "chat"
	piCatalogAPI           = "openai-completions"
	piCatalogEndpoint      = "chat.completions"
	piCatalogInputText     = "text"
	piCatalogInputImage    = "image"
)

// PiModelMeta is the platform-owned, compile-time registry of Pi catalog
// fields that cannot be derived safely from live /api/pricing data.
// It must not store enabled/available flags, prices, groups, or channel state.
type PiModelMeta struct {
	ID            string
	Name          string
	Kind          string
	API           string
	Endpoint      string
	Input         []string
	Reasoning     bool
	ContextWindow int
	MaxTokens     int
	// SupportsReasoningEffort is optional. Set only from a verified Chat
	// Completions fact. A nil value omits the field from the published JSON,
	// and Pi then falls back to its own auto-detected default, which is true
	// for a standard OpenAI-compatible provider. A model that does not accept
	// Pi's generic reasoning_effort levels must therefore publish an
	// explicit false to override that auto-detection.
	SupportsReasoningEffort *bool
	// Source records where the stable fields were verified. It is never
	// serialized into the public catalog.
	Source string
}

var piCatalogRegistry = loadPiCatalogRegistry([]PiModelMeta{
	{
		ID:            "hy4",
		Name:          "Hy4",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1024000,
		MaxTokens:     64000,
		// Explicit false: the official reasoning_effort for hy4 is a
		// provider-specific finite set (high / no_think) that the Pi
		// catalog cannot map through a thinkingLevelMap. An explicit false
		// overrides Pi's auto-detected true for OpenAI-compatible providers
		// so Pi never sends an unsupported generic reasoning level.
		SupportsReasoningEffort: common.GetPointer(false),
		Source:                  "Tencent Hy official documentation, accessed 2026-11-04: https://www.tencentcloud.com/document/product/1300/80695 (hy4 is the official stable release of Hy4 and is OpenAI Chat Completions compatible; context window 1M with 960k max input and 64k max output; visual understanding is supported for the first time), https://www.tencentcloud.com/document/product/1300/80637 (deep reasoning uses the thinking switch {\"type\":\"enabled\"} / {\"type\":\"disabled\"}, default enabled, plus a provider-specific reasoning_effort whose only allowed values for hy4 are high and no_think, default high), and https://hy.tencent.ai/research/hy4?langVersion=en (Hy4 release note, published 2026-11-04). The original input modalities are text+image, which the Pi projection keeps unchanged. contextWindow is 1024000 (official 960k max input + 64k max output) and maxTokens is 64000. The official reasoning_effort for hy4 is only the provider-specific finite set high / no_think, and the current Pi catalog has no thinkingLevelMap, so those values cannot be mapped onto Pi's generic reasoning levels. supportsReasoningEffort is therefore published as an explicit false, which overrides Pi's auto-detected true for standard OpenAI-compatible providers and stops Pi from sending unsupported generic reasoning levels; the default reasoning capability continues to be expressed by reasoning=true. Models.dev has no first-party stable Hy4 record (tencent-tokenhub only lists hy4-preview, and vercel tencent/hy4 and kilo tencent/hy4 are third-party gateway records), so no Models.dev source is claimed. Production GET https://vancine.com/api/pricing confirmed the exact ID hy4, an openai Chat Completions endpoint, billing_mode tiered_expr, and the single-tier token expression tier(\"base\", p * 0.33 + c * 1.01 + cr * 0.017). Prices are not stored in this registry; they come from the live pricing expression.",
	},
	{
		ID:            "glm-5.3-flash",
		Name:          "GLM-5.3-Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "VANCINE-ACQ-PI-CATALOG-ENDPOINT-PHASE1 audited facts; pi-provider-vancine docs/model-facts.md (2026-08-31)",
	},
	{
		ID:            "glm-5.3-flashx",
		Name:          "GLM-5.3-FlashX",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "High-speed variant of GLM-5.3-Flash. Production GET https://vancine.com/api/pricing lists ID glm-5.3-flashx with Vision, Agent, Reasoning tags and an openai Chat Completions endpoint. ContextWindow, MaxTokens, input modalities, and reasoning reuse the already-audited GLM-5.3-Flash conservative capability bounds; they are not a newly measured official limit for this variant.",
	},
	{
		ID:            "qwen3.8-flash",
		Name:          "Qwen3.8 Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "VANCINE-ACQ-PI-CATALOG-ENDPOINT-PHASE1 audited facts; pi-provider-vancine docs/model-facts.md (2026-08-31)",
	},
	{
		ID:            "deepseek-v4.1-flash",
		Name:          "DeepSeek V4.1 Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     384000,
		// Verified explicit request-field support, not suffix behaviour: the
		// official DeepSeek provider declares toggle + effort for this model,
		// GeneralOpenAIRequest carries reasoning_effort/thinking, and the
		// DeepSeek adaptor passes them through untouched for ids without a
		// deepseek-v4-* suffix.
		SupportsReasoningEffort: common.GetPointer(true),
		Source:                  "Lab base model remains deepseek/deepseek-v4.1-flash (vancine-models-dev/models.dev/models/deepseek/deepseek-v4.1-flash.toml, accessed 2026-09-11; lab limit context 1000000 / output 384000, modalities input text+image, reasoning true). Official DeepSeek host providers/deepseek/models/deepseek-flash.toml and DeepSeek API reasoning docs (accessed 2026-09-11) declare the reasoning controls for this lab model as toggle + effort low/high/max, interleaved field reasoning_content. Vancine current platform ID deepseek-v4.1-flash, live ModelRatio/CompletionRatio/CacheRatio, and openai Chat Completions endpoint were confirmed from production GET https://vancine.com/api/pricing at 2026-09-15T07:51:35Z. Planned Vancine Models.dev provider entry providers/vancine/models/deepseek-v4.1-flash.toml is local preparation only and is not yet in the public Models.dev API. supportsReasoningEffort=true rests on the request contract, not on suffix parsing: relaykit/dto/openai_request.go GeneralOpenAIRequest defines reasoning_effort and thinking, and relay/channel/deepseek/adaptor.go ConvertOpenAIRequest returns the request unchanged when ParseDeepSeekV4ThinkingSuffix does not match the model id, so an explicitly supplied reasoning_effort reaches the upstream without depending on the deepseek-v4-* suffix path.",
	},
	{
		ID:            "deepseek-v4-pro",
		Name:          "DeepSeek V4 Pro",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     384000,
		Source:        "vancine-models-dev/models.dev/models/deepseek/deepseek-v4-pro.toml (lab limit context 1000000 / output 384000, modalities input text, reasoning true). Vancine current platform ID deepseek-v4-pro and openai Chat Completions endpoint were confirmed from production GET https://vancine.com/api/pricing. Production billing uses a standard single-tier token expression; prices are not stored in this registry.",
	},
	{
		ID:            "glm-5.3",
		Name:          "GLM-5.3",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/zhipuai/glm-5.3.toml; providers/vancine/models/glm-5.3.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-26)",
	},
	{
		ID:            "qwen3.8-max",
		Name:          "Qwen3.8 Max",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/alibaba/qwen3.8-max.toml; providers/vancine/models/qwen3.8-max.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-04). Pi input keeps text+image; video/pdf dropped.",
	},
	{
		ID:            "qwen3.7-plus",
		Name:          "Qwen3.7 Plus",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     64000,
		Source:        "vancine-models-dev/models.dev/models/alibaba/qwen3.7-plus.toml (lab limit/modalities/reasoning). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "MiniMax-M3.1-Flash",
		Name:          "MiniMax-M3.1-Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     524288,
		Source:        "Models.dev global model record minimax/MiniMax-M3.1-Flash stable release (accessed 2026-10-20). Original modalities are text/image/video; the Pi projection keeps only text+image. context=1000000, output=524288, reasoning=true. Production GET https://vancine.com/api/pricing confirmed the exact ID MiniMax-M3.1-Flash with an openai Chat Completions endpoint and a standard single-tier token expression tier(\"base\", p * 0.12 + c * 0.48 + cr * 0.012). Prices are not stored in this registry; they are provided by the live pricing expression.",
	},
	{
		ID:                      "kimi-k3.1-pro",
		Name:                    "Kimi K3.1 Pro",
		Kind:                    piCatalogKindChat,
		API:                     piCatalogAPI,
		Endpoint:                piCatalogEndpoint,
		Input:                   []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:               true,
		ContextWindow:           1048576,
		MaxTokens:               1048576,
		SupportsReasoningEffort: common.GetPointer(true),
		Source:                  "Moonshot official model list https://platform.moonshot.ai/docs/models and Kimi K3.1 Pro guide https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart, accessed 2026-10-24. Original modalities are text/image/video (Chat Completions https://platform.moonshot.ai/docs/api/chat, accessed 2026-10-24, content types text, image_url, and video_url; the K3.1 Pro guide includes a video_url example on kimi-k3.1-pro). Pi input keeps only text+image; video is dropped. Official context is a 1M-token window; contextWindow is 1048576. Official max_completion_tokens defaults to 131072 and may be set up to 1048576, so maxTokens is 1048576. Reasoning is always on. reasoning_effort supports low/high/max. The same guide and model list describe kimi-k3.1-pro-highspeed as the same intelligence at about 2-3x the speed. Models.dev API provider moonshotai model kimi-k3.1-pro is the corresponding stable record (accessed 2026-10-24): reasoning true, effort low/high/max, input text/image/video, limit context 1048576, output 1048576. Models.dev cost fields are not copied. Production GET https://vancine.com/api/pricing confirmed exact ID kimi-k3.1-pro, openai Chat Completions endpoint, billing_mode tiered_expr, and standard single-tier token expression tier(\"base\", p * 1.6 + c * 8 + cr * 0.16). Prices are not stored in this registry; they come from the live pricing expression. supportsReasoningEffort=true because relaykit/dto/openai_request.go GeneralOpenAIRequest carries reasoning_effort and relay/channel/moonshot/adaptor.go ConvertOpenAIRequest passes that request through for this model (the only mutation is temperature=1 for kimi-k2.6).",
	},
	{
		ID:                      "kimi-k3.1-pro-highspeed",
		Name:                    "Kimi K3.1 Pro Highspeed",
		Kind:                    piCatalogKindChat,
		API:                     piCatalogAPI,
		Endpoint:                piCatalogEndpoint,
		Input:                   []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:               true,
		ContextWindow:           1048576,
		MaxTokens:               1048576,
		SupportsReasoningEffort: common.GetPointer(true),
		Source:                  "Moonshot official model list https://platform.moonshot.ai/docs/models and Kimi K3.1 Pro guide https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart, accessed 2026-10-24. kimi-k3.1-pro-highspeed is the high-speed variant of Kimi K3.1 Pro: same intelligence, about 2-3x the speed. Original modalities are text/image/video; Pi input keeps only text+image and drops video. Official context is a 1M-token window; contextWindow is 1048576. Chat Completions https://platform.moonshot.ai/docs/api/chat (accessed 2026-10-24) states max_completion_tokens defaults to 131072 and may be set up to 1048576 for kimi-k3.1-pro and kimi-k3.1-pro-highspeed, so maxTokens is 1048576. Reasoning is always on. reasoning_effort supports low/high/max. Models.dev API provider moonshotai model kimi-k3.1-pro-highspeed is the corresponding stable record (accessed 2026-10-24): reasoning true, effort low/high/max, input text/image/video, limit context 1048576, output 1048576. Models.dev cost fields are not copied. Production GET https://vancine.com/api/pricing confirmed exact ID kimi-k3.1-pro-highspeed, openai Chat Completions endpoint, billing_mode tiered_expr, and standard single-tier token expression tier(\"base\", p * 3.2 + c * 16 + cr * 0.16). Prices are not stored in this registry; they come from the live pricing expression. supportsReasoningEffort=true because relaykit/dto/openai_request.go GeneralOpenAIRequest carries reasoning_effort and relay/channel/moonshot/adaptor.go ConvertOpenAIRequest passes that request through for this model (the only mutation is temperature=1 for kimi-k2.6).",
	},
	{
		ID:            "LongCat-2.5",
		Name:          "LongCat-2.5",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     262144,
		// Explicit false: the official reasoning control is a thinking
		// switch plus thinking_budget, and no generic reasoning_effort
		// level is documented. An explicit false overrides Pi's
		// auto-detected true for OpenAI-compatible providers.
		SupportsReasoningEffort: common.GetPointer(false),
		Source:                  "LongCat official documentation, accessed 2026-11-04: https://longcat.ai/platform/docs/api/model-params (LongCat-2.5 context length 1,048,576 and max_tokens limit 262,144; thinking switch {\"type\":\"enabled\"} / {\"type\":\"disabled\"} plus thinking_budget up to 262,144, and no generic reasoning_effort parameter is documented), https://longcat.ai/platform/docs/image-video-understanding (LongCat-2.5 accepts images and videos alongside text; the Pi projection keeps text+image and drops video), and https://longcat.ai/platform/docs/api/chat (OpenAI-compatible POST /v1/chat/completions, model id LongCat-2.5, thinking switch only). contextWindow is 1048576 and maxTokens is 262144 from the official limits. The official reasoning control is a thinking on/off switch plus a thinking budget, and no Pi generic reasoning_effort level is declared for this model, so supportsReasoningEffort is published as an explicit false, which overrides Pi's auto-detected true for standard OpenAI-compatible providers and stops Pi from sending unsupported generic reasoning levels; the default reasoning capability continues to be expressed by reasoning=true. Models.dev has no first-party stable LongCat-2.5 record (its longcat provider still lists LongCat-2.5-Preview and LongCat-2.0), and third-party records such as vercel meituan/longcat-2.5 and nano-gpt meituan/longcat-2.5-preview report a lower 131072 output limit that conflicts with the official 262,144; the official limit is used and the conflicting third-party limit is not recorded as a source. Production GET https://vancine.com/api/pricing confirmed the exact ID LongCat-2.5, an openai Chat Completions endpoint, billing_mode tiered_expr, and the single-tier token expression tier(\"base\", p * 0.24 + c * 0.96 + cr * 0.006). Prices are not stored in this registry; they come from the live pricing expression.",
	},
	{
		ID:            "mimo-v2.6-flash",
		Name:          "MiMo-V2.6-Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     131072,
		Source:        "Production GET https://vancine.com/api/pricing lists ID mimo-v2.6-flash with a description of full-modality capabilities, Reasoning, Coding, Fast tags, and an openai Chat Completions endpoint. The Pi projection therefore keeps text+image; unsupported or undeclared other modalities are not added to Pi input. ContextWindow and MaxTokens reuse the already-audited MiMo 2.5 family conservative compatibility bounds; they are not claimed as this model's official exact limits.",
	},
	{
		ID:            "mimo-v2.6-pro",
		Name:          "MiMo-V2.6-Pro",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     131072,
		Source:        "Production GET https://vancine.com/api/pricing lists ID mimo-v2.6-pro with a multimodal description, Coding, Agent, Reasoning tags, and an openai Chat Completions endpoint. ContextWindow and MaxTokens reuse the already-audited MiMo 2.5 family conservative compatibility bounds; they are not claimed as this model's official exact limits.",
	},
	{
		ID:            "Doubao-Seed-2.1-pro",
		Name:          "Seed 2.1 Pro",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 256000,
		MaxTokens:     256000,
		Source:        "vancine-models-dev/models.dev/models/bytedance-seed/seed-2.1-pro.toml (accessed 2026-08-14; sources seed.bytedance.com/en/seed2 and volcengine docs 82379/1330310). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "Doubao-Seed-2.1-turbo",
		Name:          "Seed 2.1 Turbo",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 256000,
		MaxTokens:     256000,
		Source:        "vancine-models-dev/models.dev/models/bytedance-seed/seed-2.1-turbo.toml (accessed 2026-08-14; sources seed.bytedance.com/en/seed2 and volcengine docs 82379/1330310). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "doubao-seed-evolving",
		Name:          "Seed Evolving",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1024000,
		MaxTokens:     256000,
		Source:        "vancine-models-dev/models.dev/models/bytedance-seed/seed-evolving.toml (accessed 2026-08-14; sources seed.bytedance.com/en/seed2 and volcengine docs 82379/1330310). Evolving context window is 1024K; Doubao-Seed-2.1-pro and Doubao-Seed-2.1-turbo remain 256K. Do not generalize 1024K to the Doubao Seed 2.1 series. Pi input keeps text+image; video dropped.",
	},
})

func loadPiCatalogRegistry(entries []PiModelMeta) map[string]PiModelMeta {
	out := make(map[string]PiModelMeta, len(entries))
	for _, entry := range entries {
		id, ok := validatePiModelMeta(entry)
		if !ok {
			continue
		}
		if _, exists := out[id]; exists {
			continue
		}
		out[id] = clonePiModelMeta(entry)
	}
	return out
}

func validatePiModelMeta(entry PiModelMeta) (string, bool) {
	id := strings.TrimSpace(entry.ID)
	if id == "" {
		return "", false
	}
	if strings.TrimSpace(entry.Name) == "" {
		return "", false
	}
	if entry.Kind != piCatalogKindChat {
		return "", false
	}
	if entry.API != piCatalogAPI {
		return "", false
	}
	if entry.Endpoint != piCatalogEndpoint {
		return "", false
	}
	if entry.ContextWindow <= 0 || entry.MaxTokens <= 0 {
		return "", false
	}
	if !validPiInput(entry.Input) {
		return "", false
	}
	return id, true
}

func validPiInput(input []string) bool {
	if len(input) == 0 {
		return false
	}
	hasText := false
	seen := make(map[string]struct{}, len(input))
	for _, raw := range input {
		mod := strings.TrimSpace(raw)
		if mod == "" {
			return false
		}
		if _, dup := seen[mod]; dup {
			return false
		}
		seen[mod] = struct{}{}
		switch mod {
		case piCatalogInputText:
			hasText = true
		case piCatalogInputImage:
		default:
			return false
		}
	}
	return hasText
}

func clonePiModelMeta(entry PiModelMeta) PiModelMeta {
	cloned := entry
	cloned.ID = strings.TrimSpace(entry.ID)
	cloned.Name = strings.TrimSpace(entry.Name)
	if entry.Input != nil {
		cloned.Input = append([]string(nil), entry.Input...)
	}
	if entry.SupportsReasoningEffort != nil {
		value := *entry.SupportsReasoningEffort
		cloned.SupportsReasoningEffort = &value
	}
	return cloned
}

func copyPiCatalogRegistry(src map[string]PiModelMeta) map[string]PiModelMeta {
	out := make(map[string]PiModelMeta, len(src))
	for id, entry := range src {
		out[id] = clonePiModelMeta(entry)
	}
	return out
}

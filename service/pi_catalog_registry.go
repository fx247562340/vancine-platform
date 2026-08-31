package service

import (
	"strings"
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
	// Completions fact; nil omits the field so Pi keeps its own default.
	SupportsReasoningEffort *bool
	// Source records where the stable fields were verified. It is never
	// serialized into the public catalog.
	Source string
}

var piCatalogRegistry = loadPiCatalogRegistry([]PiModelMeta{
	{
		ID:            "hy4-preview",
		Name:          "Hy4 preview",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1024000,
		MaxTokens:     64000,
		Source:        "VANCINE-ACQ-PI-CATALOG-ENDPOINT-PHASE1 audited facts; pi-provider-vancine docs/model-facts.md (2026-08-31)",
	},
	{
		ID:            "deepseek-v4-flash-vision-exp",
		Name:          "DeepSeek V4 Flash Vision Exp",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     384000,
		Source:        "VANCINE-ACQ-PI-CATALOG-ENDPOINT-PHASE1 audited facts; pi-provider-vancine docs/model-facts.md (2026-08-31)",
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
		ID:            "deepseek-v4-flash",
		Name:          "DeepSeek V4 Flash",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     384000,
		Source:        "vancine-models-dev/models.dev/models/deepseek/deepseek-v4-flash.toml; providers/vancine/models/deepseek-v4-flash.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-02)",
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
		Source:        "vancine-models-dev/models.dev/models/deepseek/deepseek-v4-pro.toml; providers/vancine/models/deepseek-v4-pro.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-12)",
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
		ID:            "MiniMax-M3",
		Name:          "MiniMax-M3",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     512000,
		Source:        "vancine-models-dev/models.dev/models/minimax/MiniMax-M3.toml; providers/vancine/models/MiniMax-M3.toml (lab limit/modalities/reasoning; overlay accessed 2026-06-25). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "kimi-k3",
		Name:          "Kimi K3",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/moonshotai/kimi-k3.toml; providers/vancine/models/kimi-k3.toml (lab limit/modalities/reasoning; overlay accessed 2026-07-17). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "kimi-k2.7-code",
		Name:          "Kimi K2.7 Code",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 262144,
		MaxTokens:     262144,
		Source:        "vancine-models-dev/models.dev/models/moonshotai/kimi-k2.7-code.toml (lab limit/modalities/reasoning). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "kimi-k2.7-code-highspeed",
		Name:          "Kimi K2.7 Code Highspeed",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 262144,
		MaxTokens:     262144,
		Source:        "vancine-models-dev/models.dev/models/moonshotai/kimi-k2.7-code-highspeed.toml (lab limit/modalities/reasoning). Pi input keeps text+image; video dropped.",
	},
	{
		ID:            "LongCat-2.0",
		Name:          "LongCat-2.0",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1000000,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/meituan/longcat-2.0.toml; providers/vancine/models/LongCat-2.0.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-30)",
	},
	{
		ID:            "mimo-v2.5",
		Name:          "MiMo-V2.5",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText, piCatalogInputImage},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/xiaomi/mimo-v2.5.toml (lab limit/modalities/reasoning). Pi input keeps text+image; audio/video dropped.",
	},
	{
		ID:            "mimo-v2.5-pro",
		Name:          "MiMo-V2.5-Pro",
		Kind:          piCatalogKindChat,
		API:           piCatalogAPI,
		Endpoint:      piCatalogEndpoint,
		Input:         []string{piCatalogInputText},
		Reasoning:     true,
		ContextWindow: 1048576,
		MaxTokens:     131072,
		Source:        "vancine-models-dev/models.dev/models/xiaomi/mimo-v2.5-pro.toml; providers/vancine/models/mimo-v2.5-pro.toml (lab limit/modalities/reasoning; overlay accessed 2026-08-30)",
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

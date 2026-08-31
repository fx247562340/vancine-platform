package service

import (
	"math"
	"sort"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func floatPtr(v float64) *float64 { return &v }

func chatPricing(id string, ratio, completion float64) model.Pricing {
	cache := 0.2
	create := 0.0
	return model.Pricing{
		ModelName:              id,
		QuotaType:              0,
		ModelRatio:             ratio,
		CompletionRatio:        completion,
		CacheRatio:             &cache,
		CreateCacheRatio:       &create,
		EnableGroup:            []string{"default"},
		SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
	}
}

func defaultPriorityPricing() []model.Pricing {
	return []model.Pricing{
		chatPricing("glm-5.3-flash", 0.03, 3.333333333333),
		chatPricing("hy4-preview", 0.335, 2.985074626866),
		chatPricing("qwen3.8-flash", 0.06, 3.166666666667),
		chatPricing("deepseek-v4-flash-vision-exp", 0.11, 3),
	}
}

func catalogService(t *testing.T, pricing []model.Pricing, now time.Time) *PiCatalogService {
	t.Helper()
	current := append([]model.Pricing(nil), pricing...)
	clock := now
	return NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing { return current },
		Now:     func() time.Time { return clock },
	})
}

func skipByID(skipped []PiCatalogSkip) map[string]string {
	out := make(map[string]string, len(skipped))
	for _, item := range skipped {
		if _, exists := out[item.ID]; !exists {
			out[item.ID] = item.Reason
		}
	}
	return out
}

func TestPiCatalogProviderAndSchema(t *testing.T) {
	svc := catalogService(t, defaultPriorityPricing(), time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC))
	snapshot, err := svc.Snapshot()
	require.NoError(t, err)
	require.NotNil(t, snapshot)
	assert.Equal(t, "vancine", snapshot.Catalog.Provider)
	assert.Equal(t, 1, snapshot.Catalog.SchemaVersion)
	assert.Equal(t, "2026-08-31T08:00:00Z", snapshot.Catalog.GeneratedAt)
	assert.Equal(t, "application/json", snapshot.ContentType)
	assert.Equal(t, "public, max-age=60, must-revalidate", snapshot.CacheControl)
}

func TestPiCatalogModelsSortedByID(t *testing.T) {
	svc := catalogService(t, defaultPriorityPricing(), time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(defaultPriorityPricing())
	require.Empty(t, skipped)
	require.Len(t, models, 4)
	ids := make([]string, len(models))
	for i, item := range models {
		ids[i] = item.ID
	}
	assert.Equal(t, []string{
		"deepseek-v4-flash-vision-exp",
		"glm-5.3-flash",
		"hy4-preview",
		"qwen3.8-flash",
	}, ids)
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	assert.Equal(t, sorted, ids)
}

func TestPiCatalogPriorityModelFields(t *testing.T) {
	svc := catalogService(t, defaultPriorityPricing(), time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(defaultPriorityPricing())
	require.Empty(t, skipped)
	byID := map[string]PiCatalogModel{}
	for _, item := range models {
		byID[item.ID] = item
	}

	hy4 := byID["hy4-preview"]
	assert.Equal(t, "Hy4 preview", hy4.Name)
	assert.Equal(t, []string{"text"}, hy4.Input)
	assert.True(t, hy4.Reasoning)
	assert.Equal(t, 1024000, hy4.ContextWindow)
	assert.Equal(t, 64000, hy4.MaxTokens)
	assert.False(t, hy4.Compat.SupportsDeveloperRole)
	assert.Nil(t, hy4.Compat.SupportsReasoningEffort)
	assert.Equal(t, "chat", hy4.Kind)
	assert.Equal(t, "openai-completions", hy4.API)
	assert.Equal(t, "chat.completions", hy4.Endpoint)
	assert.True(t, hy4.Enabled)
	assert.True(t, hy4.Available)

	deepseek := byID["deepseek-v4-flash-vision-exp"]
	assert.Equal(t, []string{"text", "image"}, deepseek.Input)
	assert.Equal(t, 1000000, deepseek.ContextWindow)
	assert.Equal(t, 384000, deepseek.MaxTokens)

	glm := byID["glm-5.3-flash"]
	assert.Equal(t, "GLM-5.3-Flash", glm.Name)
	assert.Equal(t, []string{"text", "image"}, glm.Input)
	assert.Equal(t, 1000000, glm.ContextWindow)
	assert.Equal(t, 131072, glm.MaxTokens)

	qwen := byID["qwen3.8-flash"]
	assert.Equal(t, "Qwen3.8 Flash", qwen.Name)
	assert.Equal(t, []string{"text", "image"}, qwen.Input)
	assert.Equal(t, 1000000, qwen.ContextWindow)
	assert.Equal(t, 131072, qwen.MaxTokens)
}

func TestPiCatalogDoubaoContextWindows(t *testing.T) {
	pricing := []model.Pricing{
		chatPricing("Doubao-Seed-2.1-pro", 0.1, 1),
		chatPricing("Doubao-Seed-2.1-turbo", 0.1, 1),
		chatPricing("doubao-seed-evolving", 0.1, 1),
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 3)

	byID := map[string]PiCatalogModel{}
	for _, item := range models {
		byID[item.ID] = item
	}

	pro, ok := byID["Doubao-Seed-2.1-pro"]
	require.True(t, ok)
	assert.Equal(t, 256000, pro.ContextWindow)
	assert.Equal(t, 256000, pro.MaxTokens)

	turbo, ok := byID["Doubao-Seed-2.1-turbo"]
	require.True(t, ok)
	assert.Equal(t, 256000, turbo.ContextWindow)
	assert.Equal(t, 256000, turbo.MaxTokens)

	evolving, ok := byID["doubao-seed-evolving"]
	require.True(t, ok)
	assert.Equal(t, 1024000, evolving.ContextWindow)
	assert.Equal(t, 256000, evolving.MaxTokens)
}

func TestPiCatalogCostComesFromLiveRatiosNotRegistry(t *testing.T) {
	pricing := []model.Pricing{
		{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             0.4,
			CompletionRatio:        2.5,
			CacheRatio:             floatPtr(0.1),
			CreateCacheRatio:       floatPtr(0.25),
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)

	cost := models[0].Cost
	input := 0.4 * 2
	assert.Equal(t, input, cost.Input)
	assert.Equal(t, input*2.5, cost.Output)
	assert.Equal(t, input*0.1, cost.CacheRead)
	assert.Equal(t, input*0.25, cost.CacheWrite)
	assert.NotEqual(t, 0.06, cost.Input, "must not use the fallback snapshot input price")
	assert.NotEqual(t, 0.20, cost.Output, "must not use the fallback snapshot output price")
}

func TestPiCatalogOmitsMissingCacheRatiosAsZero(t *testing.T) {
	pricing := []model.Pricing{
		{
			ModelName:              "hy4-preview",
			QuotaType:              0,
			ModelRatio:             0.5,
			CompletionRatio:        2,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	assert.Equal(t, 1.0, models[0].Cost.Input)
	assert.Equal(t, 2.0, models[0].Cost.Output)
	assert.Equal(t, 0.0, models[0].Cost.CacheRead)
	assert.Equal(t, 0.0, models[0].Cost.CacheWrite)
}

func TestPiCatalogDelistedModelDisappears(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	live := defaultPriorityPricing()
	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing { return live },
		Now:     func() time.Time { return now },
	})

	first, err := svc.Snapshot()
	require.NoError(t, err)
	require.Len(t, first.Catalog.Models, 4)

	live = []model.Pricing{chatPricing("glm-5.3-flash", 0.03, 3)}
	now = now.Add(time.Minute)
	second, err := svc.Snapshot()
	require.NoError(t, err)
	require.Len(t, second.Catalog.Models, 1)
	assert.Equal(t, "glm-5.3-flash", second.Catalog.Models[0].ID)
	assert.NotEqual(t, first.ETag, second.ETag)
	assert.NotEqual(t, first.Catalog.GeneratedAt, second.Catalog.GeneratedAt)
}

func TestPiCatalogPriceChangeUpdatesETag(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	live := []model.Pricing{chatPricing("glm-5.3-flash", 0.03, 3)}
	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing { return live },
		Now:     func() time.Time { return now },
	})

	first, err := svc.Snapshot()
	require.NoError(t, err)
	generatedAt := first.Catalog.GeneratedAt
	etag := first.ETag

	now = now.Add(time.Hour)
	second, err := svc.Snapshot()
	require.NoError(t, err)
	assert.Equal(t, etag, second.ETag)
	assert.Equal(t, generatedAt, second.Catalog.GeneratedAt, "generatedAt must stay put when content is unchanged")

	live = []model.Pricing{chatPricing("glm-5.3-flash", 0.05, 3)}
	now = now.Add(time.Hour)
	third, err := svc.Snapshot()
	require.NoError(t, err)
	assert.NotEqual(t, etag, third.ETag)
	assert.NotEqual(t, generatedAt, third.Catalog.GeneratedAt)
	assert.Equal(t, 0.10, third.Catalog.Models[0].Cost.Input)
}

func TestPiCatalogSameSecondContentChangeAdvancesLastModified(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	live := []model.Pricing{chatPricing("glm-5.3-flash", 0.03, 3)}
	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing { return live },
		Now:     func() time.Time { return now },
	})

	first, err := svc.Snapshot()
	require.NoError(t, err)

	live = []model.Pricing{chatPricing("glm-5.3-flash", 0.05, 3)}
	second, err := svc.Snapshot()
	require.NoError(t, err)
	assert.NotEqual(t, first.ETag, second.ETag)
	assert.True(t, second.LastModified.After(first.LastModified))
	assert.Equal(t, first.LastModified.Add(time.Second), second.LastModified)
	assert.NotEqual(t, first.Catalog.GeneratedAt, second.Catalog.GeneratedAt)
	assert.Equal(t, second.LastModified.UTC().Format(time.RFC3339), second.Catalog.GeneratedAt)
}

func TestPiCatalogOmitsNonChatRegistryEntries(t *testing.T) {
	pricing := []model.Pricing{
		chatPricing("glm-5.3-flash", 0.03, 3),
		{
			ModelName:              "tts-1",
			QuotaType:              0,
			ModelRatio:             1,
			CompletionRatio:        1,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
		{
			ModelName:              "text-embedding-3",
			QuotaType:              0,
			ModelRatio:             1,
			CompletionRatio:        1,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeEmbeddings},
		},
		{
			ModelName:              "rerank-model",
			QuotaType:              0,
			ModelRatio:             1,
			CompletionRatio:        1,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeJinaRerank},
		},
		{
			ModelName:              "video-model",
			QuotaType:              0,
			ModelRatio:             1,
			CompletionRatio:        1,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
		},
		{
			ModelName:              "image-gen",
			QuotaType:              0,
			ModelRatio:             1,
			CompletionRatio:        1,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration},
		},
	}
	registry := copyPiCatalogRegistry(piCatalogRegistry)
	registry["tts-1"] = PiModelMeta{ID: "tts-1", Name: "TTS", Kind: "tts", API: "openai-completions", Endpoint: "audio.speech", Input: []string{"text"}, ContextWindow: 1, MaxTokens: 1}
	registry["text-embedding-3"] = PiModelMeta{ID: "text-embedding-3", Name: "Embed", Kind: "embedding", API: "openai-completions", Endpoint: "embeddings", Input: []string{"text"}, ContextWindow: 1, MaxTokens: 1}
	registry["rerank-model"] = PiModelMeta{ID: "rerank-model", Name: "Rerank", Kind: "rerank", API: "openai-completions", Endpoint: "rerank", Input: []string{"text"}, ContextWindow: 1, MaxTokens: 1}
	registry["video-model"] = PiModelMeta{ID: "video-model", Name: "Video", Kind: "video", API: "openai-completions", Endpoint: "videos.generations", Input: []string{"text"}, ContextWindow: 1, MaxTokens: 1}
	registry["image-gen"] = PiModelMeta{ID: "image-gen", Name: "Image", Kind: "image", API: "openai-completions", Endpoint: "images.generations", Input: []string{"text"}, ContextWindow: 1, MaxTokens: 1}

	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing:  func() []model.Pricing { return pricing },
		Now:      func() time.Time { return time.Unix(1, 0).UTC() },
		Registry: registry,
	})
	models, skipped := svc.BuildModels(pricing)
	require.Len(t, models, 1)
	assert.Equal(t, "glm-5.3-flash", models[0].ID)
	reasons := skipByID(skipped)
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["tts-1"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["text-embedding-3"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["rerank-model"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["video-model"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["image-gen"])
}

func TestPiCatalogRequiresLiveOpenAIChatCompletionsEndpoint(t *testing.T) {
	now := time.Unix(1, 0).UTC()
	cases := []struct {
		name      string
		endpoints []constant.EndpointType
		wantIDs   []string
		wantSkip  string
	}{
		{
			name:      "empty endpoint list",
			endpoints: nil,
			wantIDs:   []string{},
			wantSkip:  "no live chat completions endpoint",
		},
		{
			name:      "responses only",
			endpoints: []constant.EndpointType{constant.EndpointTypeOpenAIResponse},
			wantIDs:   []string{},
			wantSkip:  "no live chat completions endpoint",
		},
		{
			name: "openai chat completions with other endpoints",
			endpoints: []constant.EndpointType{
				constant.EndpointTypeOpenAIResponse,
				constant.EndpointTypeOpenAI,
				constant.EndpointTypeEmbeddings,
			},
			wantIDs: []string{"glm-5.3-flash"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pricing := []model.Pricing{{
				ModelName:              "glm-5.3-flash",
				QuotaType:              0,
				ModelRatio:             0.03,
				CompletionRatio:        3,
				SupportedEndpointTypes: tc.endpoints,
			}}
			svc := catalogService(t, pricing, now)
			models, skipped := svc.BuildModels(pricing)
			ids := make([]string, len(models))
			for i, item := range models {
				ids[i] = item.ID
			}
			assert.Equal(t, tc.wantIDs, ids)
			if tc.wantSkip == "" {
				assert.Empty(t, skipped)
				return
			}
			reasons := skipByID(skipped)
			assert.Equal(t, tc.wantSkip, reasons["glm-5.3-flash"])
		})
	}
}

func TestPiCatalogExcludesPerRequestAndTieredPricing(t *testing.T) {
	pricing := []model.Pricing{
		{
			ModelName:              "hy4-preview",
			QuotaType:              1,
			ModelPrice:             0.02,
			ModelRatio:             0.335,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
		{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             0.03,
			CompletionRatio:        3,
			BillingMode:            billing_setting.BillingModeTieredExpr,
			BillingExpr:            "p*0.01",
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
		{
			ModelName:              "qwen3.8-flash",
			QuotaType:              0,
			ModelRatio:             0.06,
			CompletionRatio:        3,
			BillingExpr:            "tiered()",
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	assert.Empty(t, models)
	reasons := skipByID(skipped)
	assert.Equal(t, "per-request pricing", reasons["hy4-preview"])
	assert.Equal(t, "tiered/dynamic pricing", reasons["glm-5.3-flash"])
	assert.Equal(t, "tiered/dynamic pricing", reasons["qwen3.8-flash"])
}

func TestPiCatalogOmitsMissingRegistryMetadata(t *testing.T) {
	pricing := append(defaultPriorityPricing(), chatPricing("unknown-chat-model", 1, 1))
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Len(t, models, 4)
	reasons := skipByID(skipped)
	assert.Equal(t, "missing Pi metadata", reasons["unknown-chat-model"])
}

func TestPiCatalogOmitsInvalidCostAndContext(t *testing.T) {
	pricing := []model.Pricing{
		{
			ModelName:              "hy4-preview",
			QuotaType:              0,
			ModelRatio:             math.NaN(),
			CompletionRatio:        2,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
		{
			ModelName:              "glm-5.3-flash",
			QuotaType:              0,
			ModelRatio:             math.Inf(1),
			CompletionRatio:        2,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
		{
			ModelName:              "qwen3.8-flash",
			QuotaType:              0,
			ModelRatio:             -1,
			CompletionRatio:        2,
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	brokenRegistry := copyPiCatalogRegistry(piCatalogRegistry)
	broken := brokenRegistry["deepseek-v4-flash-vision-exp"]
	broken.ContextWindow = 0
	brokenRegistry["deepseek-v4-flash-vision-exp"] = broken

	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing {
			return append(pricing, chatPricing("deepseek-v4-flash-vision-exp", 0.11, 3))
		},
		Now:      func() time.Time { return time.Unix(1, 0).UTC() },
		Registry: brokenRegistry,
	})
	models, skipped := svc.BuildModels(append(pricing, chatPricing("deepseek-v4-flash-vision-exp", 0.11, 3)))
	assert.Empty(t, models)
	reasons := skipByID(skipped)
	assert.Equal(t, "invalid token cost", reasons["hy4-preview"])
	assert.Equal(t, "invalid token cost", reasons["glm-5.3-flash"])
	assert.Equal(t, "invalid token cost", reasons["qwen3.8-flash"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["deepseek-v4-flash-vision-exp"])
}

func TestPiCatalogOmitsInternalFields(t *testing.T) {
	svc := catalogService(t, defaultPriorityPricing(), time.Unix(1, 0).UTC())
	snapshot, err := svc.Snapshot()
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(snapshot.Body, &payload))
	for _, key := range []string{"group", "enable_groups", "ratio", "model_ratio", "channel", "key", "token", "password", "data", "success"} {
		_, exists := payload[key]
		assert.False(t, exists, "top-level field %s must not be present", key)
	}
	models, ok := payload["models"].([]any)
	require.True(t, ok)
	require.NotEmpty(t, models)
	first, ok := models[0].(map[string]any)
	require.True(t, ok)
	for _, key := range []string{"group", "enable_groups", "model_ratio", "completion_ratio", "cache_ratio", "channel_id", "vendor_id", "billing_expr", "source"} {
		_, exists := first[key]
		assert.False(t, exists, "model field %s must not be present", key)
	}
}

func TestPiCatalogEmptyModels(t *testing.T) {
	svc := catalogService(t, nil, time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC))
	snapshot, err := svc.Snapshot()
	require.NoError(t, err)
	assert.NotNil(t, snapshot.Catalog.Models)
	assert.Empty(t, snapshot.Catalog.Models)
	assert.JSONEq(t, `{"provider":"vancine","schemaVersion":1,"generatedAt":"2026-01-02T03:04:05Z","models":[]}`, string(snapshot.Body))
}

func TestLoadPiCatalogRegistryRejectsInvalidEntries(t *testing.T) {
	loaded := loadPiCatalogRegistry([]PiModelMeta{
		{ID: "ok", Name: "OK", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "ok", Name: "Duplicate", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "", Name: "missing id", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "no-name", Name: "", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "image", Name: "Image", Kind: "image", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "video-input", Name: "Video", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text", "video"}, ContextWindow: 10, MaxTokens: 5},
		{ID: "zero-ctx", Name: "Zero", Kind: "chat", API: "openai-completions", Endpoint: "chat.completions", Input: []string{"text"}, ContextWindow: 0, MaxTokens: 5},
	})
	require.Len(t, loaded, 1)
	assert.Equal(t, "OK", loaded["ok"].Name)
}

func TestPiCatalogOutputsAllEligibleChatCompletionsModels(t *testing.T) {
	pricing := []model.Pricing{
		chatPricing("qwen3.8-max", 0.8, 3),
		chatPricing("glm-5.3", 0.56, 3.142857142857),
		chatPricing("MiniMax-M3", 0.12, 4),
		chatPricing("kimi-k3", 1.2, 5),
		chatPricing("deepseek-v4-flash", 0.11, 3),
		chatPricing("LongCat-2.0", 0.12, 4),
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 6, "eligible chat completions models must not be capped at four")
	ids := make([]string, len(models))
	for i, item := range models {
		ids[i] = item.ID
	}
	assert.Equal(t, []string{
		"LongCat-2.0",
		"MiniMax-M3",
		"deepseek-v4-flash",
		"glm-5.3",
		"kimi-k3",
		"qwen3.8-max",
	}, ids)
}

func TestPiCatalogOmitsRegistryOnlyModelsNotInLivePricing(t *testing.T) {
	pricing := []model.Pricing{chatPricing("glm-5.3", 0.56, 3)}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	assert.Equal(t, "glm-5.3", models[0].ID)
}

func TestPiCatalogFullSetChangeUpdatesCacheIdentity(t *testing.T) {
	now := time.Date(2026, 8, 31, 8, 0, 0, 0, time.UTC)
	live := []model.Pricing{
		chatPricing("glm-5.3", 0.56, 3),
		chatPricing("kimi-k3", 1.2, 5),
		chatPricing("qwen3.8-max", 0.8, 3),
	}
	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing { return live },
		Now:     func() time.Time { return now },
	})
	first, err := svc.Snapshot()
	require.NoError(t, err)
	require.Len(t, first.Catalog.Models, 3)

	live = []model.Pricing{
		chatPricing("glm-5.3", 0.56, 3),
		chatPricing("kimi-k3", 1.2, 5),
		chatPricing("qwen3.8-max", 0.8, 3),
		chatPricing("MiniMax-M3", 0.12, 4),
	}
	second, err := svc.Snapshot()
	require.NoError(t, err)
	require.Len(t, second.Catalog.Models, 4)
	assert.NotEqual(t, first.ETag, second.ETag)
	assert.True(t, second.LastModified.After(first.LastModified))
	assert.NotEqual(t, first.Catalog.GeneratedAt, second.Catalog.GeneratedAt)
}

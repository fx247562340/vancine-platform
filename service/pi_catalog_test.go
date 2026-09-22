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

func exprChatPricing(id, expr string) model.Pricing {
	item := chatPricing(id, 999, 999)
	item.BillingMode = billing_setting.BillingModeTieredExpr
	item.BillingExpr = expr
	return item
}

func defaultPriorityPricing() []model.Pricing {
	return []model.Pricing{
		chatPricing("glm-5.3-flash", 0.06, 3.333333333333),
		chatPricing("hy4-preview", 0.335, 2.985074626866),
		chatPricing("qwen3.8-flash", 0.06, 3.166666666667),
		chatPricing("deepseek-v4.1-flash", 0.12, 4),
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
		"deepseek-v4.1-flash",
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

	deepseek := byID["deepseek-v4.1-flash"]
	assert.Equal(t, "DeepSeek V4.1 Flash", deepseek.Name)
	assert.Equal(t, []string{"text", "image"}, deepseek.Input)
	assert.True(t, deepseek.Reasoning)
	assert.Equal(t, 1000000, deepseek.ContextWindow)
	assert.Equal(t, 384000, deepseek.MaxTokens)
	assert.Equal(t, "chat", deepseek.Kind)
	assert.Equal(t, "openai-completions", deepseek.API)
	assert.Equal(t, "chat.completions", deepseek.Endpoint)
	require.NotNil(t, deepseek.Compat.SupportsReasoningEffort)
	assert.True(t, *deepseek.Compat.SupportsReasoningEffort)

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
	assert.NotEqual(t, 0.12, cost.Input, "must not use the fallback snapshot input price")
	assert.NotEqual(t, 0.40, cost.Output, "must not use the fallback snapshot output price")
}

func TestPiCatalogDeepSeekV41FlashCostFromLiveRatios(t *testing.T) {
	pricing := []model.Pricing{
		{
			ModelName:              "deepseek-v4.1-flash",
			QuotaType:              0,
			ModelRatio:             0.12,
			CompletionRatio:        4,
			CacheRatio:             floatPtr(0.02),
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "deepseek-v4.1-flash", models[0].ID)

	cost := models[0].Cost
	input := 0.12 * 2
	assert.InDelta(t, input, cost.Input, 1e-12)
	assert.InDelta(t, input*4, cost.Output, 1e-12)
	assert.InDelta(t, input*0.02, cost.CacheRead, 1e-12)
	assert.Equal(t, 0.0, cost.CacheWrite)
	assert.Equal(t, 0.24, cost.Input)
	assert.Equal(t, 0.96, cost.Output)
	assert.Equal(t, 0.0048, cost.CacheRead)
}

func TestPiCatalogGlm53FlashCostFromLiveRatios(t *testing.T) {
	// Production pricing verified 2026-09-11T02:09:31Z: ModelRatio 0.06,
	// CompletionRatio 3.333333333333, CacheRatio 0.2 (half-price promo ended).
	pricing := []model.Pricing{chatPricing("glm-5.3-flash", 0.06, 3.333333333333)}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "glm-5.3-flash", models[0].ID)

	cost := models[0].Cost
	assert.InDelta(t, 0.12, cost.Input, 1e-12)
	assert.InDelta(t, 0.40, cost.Output, 1e-12)
	assert.InDelta(t, 0.024, cost.CacheRead, 1e-12)
	assert.Equal(t, 0.0, cost.CacheWrite)
}

func TestPiCatalogRetiredDeepSeekModelsStayOutOfCatalog(t *testing.T) {
	retired := []string{
		"deepseek-v4-flash",
		"deepseek-v4-flash-vision-exp",
		"deepseek-flash",
	}
	pricing := make([]model.Pricing, 0, len(retired)+1)
	for _, id := range retired {
		pricing = append(pricing, chatPricing(id, 0.11, 3))
	}
	pricing = append(pricing, chatPricing("deepseek-v4.1-flash", 0.12, 4))

	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)

	ids := make([]string, len(models))
	for i, item := range models {
		ids[i] = item.ID
	}
	assert.Equal(t, []string{"deepseek-v4.1-flash"}, ids, "retired ids must not enter the Pi catalog")
	assert.NotContains(t, ids, "deepseek-flash")
	reasons := skipByID(skipped)
	for _, id := range retired {
		assert.Equal(t, "missing Pi metadata", reasons[id], "%s stays out of the Pi catalog", id)
	}
}

func TestPiCatalogDeepSeekV41FlashPublishesReasoningEffortSupport(t *testing.T) {
	svc := catalogService(t, defaultPriorityPricing(), time.Unix(1, 0).UTC())
	snapshot, err := svc.Snapshot()
	require.NoError(t, err)

	var payload struct {
		Models []struct {
			ID     string `json:"id"`
			Compat struct {
				SupportsDeveloperRole   bool  `json:"supportsDeveloperRole"`
				SupportsReasoningEffort *bool `json:"supportsReasoningEffort"`
			} `json:"compat"`
		} `json:"models"`
	}
	require.NoError(t, common.Unmarshal(snapshot.Body, &payload))

	for _, item := range payload.Models {
		if item.ID != "deepseek-v4.1-flash" {
			continue
		}
		require.NotNil(t, item.Compat.SupportsReasoningEffort, "supportsReasoningEffort must be serialized, not omitted")
		assert.True(t, *item.Compat.SupportsReasoningEffort)
		assert.False(t, item.Compat.SupportsDeveloperRole)
		return
	}
	t.Fatalf("deepseek-v4.1-flash must be present in the published catalog")
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
			BillingMode:            billing_setting.BillingModeTieredExpr,
			BillingExpr:            "tiered()",
			SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI},
		},
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	assert.Empty(t, models)
	reasons := skipByID(skipped)
	assert.Equal(t, "per-request pricing", reasons["hy4-preview"])
	assert.Equal(t, "unsupported Pi token pricing expression", reasons["glm-5.3-flash"])
	assert.Equal(t, "unsupported Pi token pricing expression", reasons["qwen3.8-flash"])
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
	broken := brokenRegistry["deepseek-v4.1-flash"]
	broken.ContextWindow = 0
	brokenRegistry["deepseek-v4.1-flash"] = broken

	svc := NewPiCatalogService(PiCatalogOptions{
		Pricing: func() []model.Pricing {
			return append(pricing, chatPricing("deepseek-v4.1-flash", 0.12, 4))
		},
		Now:      func() time.Time { return time.Unix(1, 0).UTC() },
		Registry: brokenRegistry,
	})
	models, skipped := svc.BuildModels(append(pricing, chatPricing("deepseek-v4.1-flash", 0.12, 4)))
	assert.Empty(t, models)
	reasons := skipByID(skipped)
	assert.Equal(t, "invalid token cost", reasons["hy4-preview"])
	assert.Equal(t, "invalid token cost", reasons["glm-5.3-flash"])
	assert.Equal(t, "invalid token cost", reasons["qwen3.8-flash"])
	assert.Equal(t, "incomplete or invalid Pi metadata", reasons["deepseek-v4.1-flash"])
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
		chatPricing("deepseek-v4.1-flash", 0.11, 3),
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
		"deepseek-v4.1-flash",
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

func TestPiCatalogIncludesLosslessStandardTokenExpression(t *testing.T) {
	pricing := []model.Pricing{
		exprChatPricing("glm-5.3-flash", `tier("base", p * 0.12 + c * 0.4 + cr * 0.024)`),
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "glm-5.3-flash", models[0].ID)

	cost := models[0].Cost
	assert.Equal(t, 0.12, cost.Input)
	assert.Equal(t, 0.4, cost.Output)
	assert.Equal(t, 0.024, cost.CacheRead)
	assert.Equal(t, 0.12, cost.CacheWrite)
}

func TestPiCatalogIncludesStandardExpressionCacheWrite(t *testing.T) {
	pricing := []model.Pricing{
		exprChatPricing("deepseek-v4.1-flash", `tier("base", p * 0.24 + c * 0.96 + cr * 0.0048 + cc * 0.3)`),
	}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "deepseek-v4.1-flash", models[0].ID)

	cost := models[0].Cost
	assert.Equal(t, 0.24, cost.Input)
	assert.Equal(t, 0.96, cost.Output)
	assert.Equal(t, 0.0048, cost.CacheRead)
	assert.Equal(t, 0.3, cost.CacheWrite)
}

func TestPiCatalogStandardExpressionAcceptsLiteralVariants(t *testing.T) {
	cases := []struct {
		name string
		expr string
		want PiCatalogCost
	}{
		{
			name: "reversed multiplication",
			expr: `tier("base", 0.12 * p + 0.4 * c + 0.024 * cr)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.024, CacheWrite: 0.12},
		},
		{
			name: "v1 version prefix",
			expr: `v1:tier("base", p * 0.12 + c * 0.4 + cr * 0.024)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.024, CacheWrite: 0.12},
		},
		{
			name: "integer literals",
			expr: `tier("base", p * 1 + c * 2)`,
			want: PiCatalogCost{Input: 1, Output: 2, CacheRead: 1, CacheWrite: 1},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pricing := []model.Pricing{exprChatPricing("glm-5.3-flash", tc.expr)}
			models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
			require.Empty(t, skipped)
			require.Len(t, models, 1)
			assert.Equal(t, tc.want, models[0].Cost)
		})
	}
}

func TestPiCatalogLegacyRatioPricingUnchangedAlongsideExpressions(t *testing.T) {
	pricing := []model.Pricing{
		chatPricing("hy4-preview", 0.335, 2.985074626866),
		exprChatPricing("glm-5.3-flash", `tier("base", p * 0.12 + c * 0.4 + cr * 0.024)`),
	}
	models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 2)

	byID := map[string]PiCatalogModel{}
	for _, item := range models {
		byID[item.ID] = item
	}

	glm := byID["glm-5.3-flash"]
	assert.Equal(t, 0.12, glm.Cost.Input)
	assert.Equal(t, 0.4, glm.Cost.Output)
	assert.Equal(t, 0.024, glm.Cost.CacheRead)
	assert.Equal(t, 0.12, glm.Cost.CacheWrite)

	hy4 := byID["hy4-preview"]
	input := 0.335 * 2
	assert.Equal(t, input, hy4.Cost.Input)
	assert.InDelta(t, input*2.985074626866, hy4.Cost.Output, 1e-12)
	assert.InDelta(t, input*0.2, hy4.Cost.CacheRead, 1e-12)
	assert.Equal(t, 0.0, hy4.Cost.CacheWrite)
}

func TestPiCatalogLegacyRatioIgnoresUnusedBillingExprField(t *testing.T) {
	item := chatPricing("qwen3.8-flash", 0.06, 3.166666666667)
	item.BillingExpr = "tiered()"
	pricing := []model.Pricing{item}
	models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "qwen3.8-flash", models[0].ID)
	assert.Equal(t, 0.12, models[0].Cost.Input)
}

func TestPiCatalogSkipsExpressionsThatCannotMapToStaticTokenPrices(t *testing.T) {
	cases := []struct {
		name string
		expr string
	}{
		{name: "fixed per-request", expr: `tier("request", fixed(0.01))`},
		{name: "image_count billing", expr: `tier("image", fixed(0.02)) * image_count`},
		{name: "len condition and multiple tiers", expr: `len <= 32000 ? tier("short", p * 0.12 + c * 0.4) : tier("long", p * 0.24 + c * 0.8)`},
		{name: "header request rule", expr: `tier("base", p * 0.12 + c * 0.4)|||when(header("x") has "y") * 2`},
		{name: "param request probe", expr: `tier("base", p * 0.12 + c * 0.4 + param("n") * 1)`},
		{name: "usage function", expr: `tier("base", p * 0.12 + c * 0.4 + u("seconds") * 0.4)`},
		{name: "img variable", expr: `tier("base", p * 0.12 + c * 0.4 + img * 1)`},
		{name: "img_cr variable", expr: `tier("base", p * 0.12 + c * 0.4 + img_cr * 1)`},
		{name: "img_o variable", expr: `tier("base", p * 0.12 + c * 0.4 + img_o * 1)`},
		{name: "ai variable", expr: `tier("base", p * 0.12 + c * 0.4 + ai * 1)`},
		{name: "ao variable", expr: `tier("base", p * 0.12 + c * 0.4 + ao * 1)`},
		{name: "cc1h variable", expr: `tier("base", p * 0.12 + c * 0.4 + cc1h * 1)`},
		{name: "illegal expression", expr: `not a valid expr!!!`},
		{name: "empty expression", expr: ""},
		{name: "missing completion term", expr: `tier("base", p * 0.12)`},
		{name: "no tier wrapper", expr: `p * 0.12 + c * 0.4`},
		{name: "max function", expr: `tier("base", max(p, 1) * 0.12 + c * 0.4)`},
		{name: "subtraction", expr: `tier("base", p * 0.12 + c * 0.4 - cr * 0.01)`},
		{name: "division", expr: `tier("base", p * 0.12 + c * 0.4 / 2)`},
		{name: "variable times variable", expr: `tier("base", p * c)`},
		{name: "multiple added tiers", expr: `tier("a", p * 0.12 + c * 0.4) + tier("b", p * 0.24 + c * 0.8)`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pricing := []model.Pricing{exprChatPricing("glm-5.3-flash", tc.expr)}
			models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
			assert.Empty(t, models)
			reasons := skipByID(skipped)
			assert.Equal(t, "unsupported Pi token pricing expression", reasons["glm-5.3-flash"])
		})
	}
}

func TestPiCatalogOmittedCacheVarsFallbackToInputPrice(t *testing.T) {
	cases := []struct {
		name string
		expr string
		want PiCatalogCost
	}{
		{
			name: "no cr or cc falls back to input",
			expr: `tier("base", p * 0.12 + c * 0.4)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.12, CacheWrite: 0.12},
		},
		{
			name: "explicit cr omits cc to input",
			expr: `tier("base", p * 0.12 + c * 0.4 + cr * 0.024)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.024, CacheWrite: 0.12},
		},
		{
			name: "explicit cr and cc",
			expr: `tier("base", p * 0.12 + c * 0.4 + cr * 0.024 + cc * 0.15)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.024, CacheWrite: 0.15},
		},
		{
			name: "explicit cc omits cr to input",
			expr: `tier("base", p * 0.12 + c * 0.4 + cc * 0.15)`,
			want: PiCatalogCost{Input: 0.12, Output: 0.4, CacheRead: 0.12, CacheWrite: 0.15},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pricing := []model.Pricing{exprChatPricing("glm-5.3-flash", tc.expr)}
			models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
			require.Empty(t, skipped)
			require.Len(t, models, 1)
			assert.Equal(t, tc.want, models[0].Cost)
		})
	}
}

func TestPiCatalogTieredExprTakesPriorityOverLeftoverQuotaType(t *testing.T) {
	item := exprChatPricing("hy4-preview", `tier("base", p * 0.12 + c * 0.4)`)
	item.QuotaType = 1
	item.ModelPrice = 0.02
	pricing := []model.Pricing{item}
	models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
	require.Empty(t, skipped)
	require.Len(t, models, 1)
	require.Equal(t, "hy4-preview", models[0].ID)
	assert.Equal(t, 0.12, models[0].Cost.Input)
	assert.Equal(t, 0.4, models[0].Cost.Output)
	assert.Equal(t, 0.12, models[0].Cost.CacheRead)
	assert.Equal(t, 0.12, models[0].Cost.CacheWrite)
}

func TestPiCatalogSnapshotOmitsBillingExpressionSource(t *testing.T) {
	expr := `tier("base", p * 0.12 + c * 0.4 + cr * 0.024)`
	pricing := []model.Pricing{exprChatPricing("glm-5.3-flash", expr)}
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	snapshot, err := svc.Snapshot()
	require.NoError(t, err)
	require.Len(t, snapshot.Catalog.Models, 1)
	require.Equal(t, "glm-5.3-flash", snapshot.Catalog.Models[0].ID)

	body := string(snapshot.Body)
	assert.NotContains(t, body, expr)
	assert.NotContains(t, body, "p * 0.12")
	assert.NotContains(t, body, "BillingExpr")
	assert.NotContains(t, body, "billing_expr")
	assert.NotContains(t, body, "tiered_expr")
	assert.NotContains(t, body, "999")
}

func existingLivePiCatalogIDs() []string {
	return []string{
		"Doubao-Seed-2.1-pro",
		"Doubao-Seed-2.1-turbo",
		"LongCat-2.0",
		"MiniMax-M3",
		"deepseek-v4.1-flash",
		"doubao-seed-evolving",
		"glm-5.3",
		"glm-5.3-flash",
		"hy4-preview",
		"kimi-k2.7-code",
		"kimi-k2.7-code-highspeed",
		"kimi-k3",
		"qwen3.7-plus",
		"qwen3.8-flash",
		"qwen3.8-max",
	}
}

func productionShapePiCatalogPricing() []model.Pricing {
	pricing := make([]model.Pricing, 0, 30)
	for _, id := range existingLivePiCatalogIDs() {
		pricing = append(pricing, chatPricing(id, 0.1, 1))
	}
	pricing = append(pricing,
		exprChatPricing("deepseek-v4-pro", `tier("base", p * 0.66 + c * 1.98 + cr * 0.022)`),
		exprChatPricing("glm-5.3-flashx", `tier("base", p * 0.3 + c * 1.05 + cr * 0.09)`),
		exprChatPricing("kimi-k2.8-preview", `tier("base", p * 1.4 + c * 7 + cr * 0.14)`),
		exprChatPricing("mimo-v2.6-flash", `tier("base", p * 0.14 + c * 0.28 + cr * 0.0028)`),
		exprChatPricing("mimo-v2.6-pro", `tier("base", p * 0.435 + c * 0.87 + cr * 0.0036)`),
	)
	for _, item := range []model.Pricing{
		{ModelName: "Doubao-Seedance-2.0", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIVideo}},
		{ModelName: "Doubao-Seedance-2.5", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIVideo}},
		{ModelName: "Doubao-Seedream-5.0-lite", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
		{ModelName: "Doubao-Seedream-5.0-pro", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
		{ModelName: "MiniMax-H3", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}},
		{ModelName: "qwen-image-3.0", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
		{ModelName: "qwen-image-3.0-pro", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
		{ModelName: "wan2.7-image-pro", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
		{ModelName: "wan3.0-video", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIVideo}},
		{ModelName: "wan3.0-video-prime", QuotaType: 1, ModelPrice: 0.02, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIVideo}},
	} {
		pricing = append(pricing, item)
	}
	return pricing
}

func TestPiCatalogProductionShapePublishesTwentyChatModels(t *testing.T) {
	pricing := productionShapePiCatalogPricing()
	svc := catalogService(t, pricing, time.Unix(1, 0).UTC())
	models, skipped := svc.BuildModels(pricing)

	ids := make([]string, len(models))
	byID := make(map[string]PiCatalogModel, len(models))
	for i, item := range models {
		ids[i] = item.ID
		byID[item.ID] = item
	}
	require.Len(t, models, 20)
	assert.Equal(t, []string{
		"Doubao-Seed-2.1-pro",
		"Doubao-Seed-2.1-turbo",
		"LongCat-2.0",
		"MiniMax-M3",
		"deepseek-v4-pro",
		"deepseek-v4.1-flash",
		"doubao-seed-evolving",
		"glm-5.3",
		"glm-5.3-flash",
		"glm-5.3-flashx",
		"hy4-preview",
		"kimi-k2.7-code",
		"kimi-k2.7-code-highspeed",
		"kimi-k2.8-preview",
		"kimi-k3",
		"mimo-v2.6-flash",
		"mimo-v2.6-pro",
		"qwen3.7-plus",
		"qwen3.8-flash",
		"qwen3.8-max",
	}, ids)

	for _, id := range existingLivePiCatalogIDs() {
		_, ok := byID[id]
		assert.True(t, ok, "existing catalog model %s must remain published", id)
	}
	assert.NotContains(t, ids, "mimo-v2.5")
	assert.NotContains(t, ids, "mimo-v2.5-pro")

	type wantNew struct {
		name          string
		input         []string
		contextWindow int
		maxTokens     int
		cost          PiCatalogCost
	}
	added := map[string]wantNew{
		"deepseek-v4-pro": {
			name: "DeepSeek V4 Pro", input: []string{"text"},
			contextWindow: 1000000, maxTokens: 384000,
			cost: PiCatalogCost{Input: 0.66, Output: 1.98, CacheRead: 0.022, CacheWrite: 0.66},
		},
		"glm-5.3-flashx": {
			name: "GLM-5.3-FlashX", input: []string{"text", "image"},
			contextWindow: 1000000, maxTokens: 131072,
			cost: PiCatalogCost{Input: 0.3, Output: 1.05, CacheRead: 0.09, CacheWrite: 0.3},
		},
		"kimi-k2.8-preview": {
			name: "Kimi K2.8 Preview", input: []string{"text", "image"},
			contextWindow: 1048576, maxTokens: 131072,
			cost: PiCatalogCost{Input: 1.4, Output: 7, CacheRead: 0.14, CacheWrite: 1.4},
		},
		"mimo-v2.6-flash": {
			name: "MiMo-V2.6-Flash", input: []string{"text", "image"},
			contextWindow: 1048576, maxTokens: 131072,
			cost: PiCatalogCost{Input: 0.14, Output: 0.28, CacheRead: 0.0028, CacheWrite: 0.14},
		},
		"mimo-v2.6-pro": {
			name: "MiMo-V2.6-Pro", input: []string{"text", "image"},
			contextWindow: 1048576, maxTokens: 131072,
			cost: PiCatalogCost{Input: 0.435, Output: 0.87, CacheRead: 0.0036, CacheWrite: 0.435},
		},
	}
	for id, want := range added {
		item, ok := byID[id]
		require.True(t, ok, "%s must appear in the catalog", id)
		assert.Equal(t, want.name, item.Name)
		assert.Equal(t, "chat", item.Kind)
		assert.Equal(t, "openai-completions", item.API)
		assert.Equal(t, "chat.completions", item.Endpoint)
		assert.True(t, item.Enabled)
		assert.True(t, item.Available)
		assert.Equal(t, want.input, item.Input)
		assert.Contains(t, item.Input, "text")
		assert.True(t, item.Reasoning)
		assert.Equal(t, want.contextWindow, item.ContextWindow)
		assert.Equal(t, want.maxTokens, item.MaxTokens)
		assert.Greater(t, item.ContextWindow, 0)
		assert.Greater(t, item.MaxTokens, 0)
		assert.Nil(t, item.Compat.SupportsReasoningEffort)
		assert.Equal(t, want.cost, item.Cost)
	}

	reasons := skipByID(skipped)
	for _, id := range []string{
		"Doubao-Seedance-2.0",
		"Doubao-Seedance-2.5",
		"Doubao-Seedream-5.0-lite",
		"Doubao-Seedream-5.0-pro",
		"MiniMax-H3",
		"qwen-image-3.0",
		"qwen-image-3.0-pro",
		"wan2.7-image-pro",
		"wan3.0-video",
		"wan3.0-video-prime",
	} {
		assert.NotContains(t, ids, id)
		assert.Equal(t, "missing Pi metadata", reasons[id], "%s must stay out of the Pi catalog", id)
	}
}

func TestPiCatalogRemovedMimoV25DoesNotRepublishFromLivePricing(t *testing.T) {
	pricing := []model.Pricing{
		chatPricing("mimo-v2.5", 0.1, 1),
		chatPricing("mimo-v2.5-pro", 0.1, 1),
	}
	models, skipped := catalogService(t, pricing, time.Unix(1, 0).UTC()).BuildModels(pricing)
	assert.Empty(t, models)
	reasons := skipByID(skipped)
	assert.Equal(t, "missing Pi metadata", reasons["mimo-v2.5"])
	assert.Equal(t, "missing Pi metadata", reasons["mimo-v2.5-pro"])
}

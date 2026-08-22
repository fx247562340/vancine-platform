package volcengine

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestDefaultsSeedreamWatermarkFalse(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-4.5",
		RelayMode:       constant.RelayModeImagesGenerations,
	}

	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:  "Doubao-Seedream-4.5",
		Prompt: "red apple",
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}

	request, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("expected dto.ImageRequest, got %T", converted)
	}
	if request.Watermark == nil {
		t.Fatal("expected watermark to default to false for Seedream image generation")
	}
	if *request.Watermark {
		t.Fatal("expected watermark=false for Seedream image generation")
	}
}

func TestConvertImageRequestPreservesExplicitSeedreamWatermark(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-4.5",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	watermark := true

	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "Doubao-Seedream-4.5",
		Prompt:    "red apple",
		Watermark: &watermark,
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}

	request, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("expected dto.ImageRequest, got %T", converted)
	}
	if request.Watermark == nil || !*request.Watermark {
		t.Fatal("expected explicit watermark=true to be preserved")
	}
}

func TestConvertImageRequestPreservesSeedZeroAndWatermarkFalse(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "seedream-4-0-250828",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	seed := 0
	watermark := false

	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "seedream-4-0-250828",
		Prompt:    "red apple",
		Seed:      &seed,
		Watermark: &watermark,
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}
	request, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("expected dto.ImageRequest, got %T", converted)
	}
	if request.Seed == nil || *request.Seed != 0 {
		t.Fatal("expected explicit seed=0 to be preserved")
	}
	if request.Watermark == nil || *request.Watermark {
		t.Fatal("expected explicit watermark=false to be preserved")
	}
}

func TestGetRequestURLUsesSeedreamGenerationsPath(t *testing.T) {
	adaptor := &Adaptor{}
	url, err := adaptor.GetRequestURL(&relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://ark.example",
		},
		RelayMode: constant.RelayModeImagesGenerations,
	})
	if err != nil {
		t.Fatalf("GetRequestURL returned error: %v", err)
	}
	if url != "https://ark.example/api/v3/images/generations" {
		t.Fatalf("unexpected seedream generations URL: %s", url)
	}
}

func TestConvertImageRequestDoesNotDefaultWatermarkForNonSeedream(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-image-1",
		RelayMode:       constant.RelayModeImagesGenerations,
	}

	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "red apple",
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}

	request, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("expected dto.ImageRequest, got %T", converted)
	}
	if request.Watermark != nil {
		t.Fatal("expected watermark to remain nil for non-Seedream image generation")
	}
}

func TestConvertImageRequestOmitsGroupForSeedream(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-5.0-pro",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	watermark := false
	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "Doubao-Seedream-5.0-pro",
		Prompt:    "a red apple",
		Size:      "2K",
		Watermark: &watermark,
	})
	require.NoError(t, err)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"group"`)
	assert.Contains(t, string(payload), `"watermark":false`)
	assert.Contains(t, string(payload), "2K")
	assert.NotContains(t, string(payload), `"seed"`)
}

func TestConvertImageRequestSeedream5OmitsUnsupportedOutboundFields(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-5.0-pro",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	n := uint(1)
	seed := 12
	watermark := false
	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "Doubao-Seedream-5.0-pro",
		Prompt:    "a red apple",
		Size:      "2K",
		N:         &n,
		Seed:      &seed,
		Watermark: &watermark,
		Quality:   "hd",
	})
	require.NoError(t, err)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	body := string(payload)
	assert.NotContains(t, body, `"n"`)
	assert.NotContains(t, body, `"seed"`)
	assert.NotContains(t, body, `"quality"`)
	assert.NotContains(t, body, `"images"`)
	assert.NotContains(t, body, "sequential_image_generation")
	assert.Contains(t, body, `"watermark":false`)
	assert.Contains(t, body, "2K")
}

func TestConvertImageRequestSeedream5NormalizesReferenceImages(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-5.0-pro",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	watermark := false
	single, err := common.Marshal("https://example.invalid/one.png")
	require.NoError(t, err)
	many, err := common.Marshal([]string{
		"https://example.invalid/two.png",
		"https://example.invalid/three.png",
	})
	require.NoError(t, err)

	t.Run("single image stays a string", func(t *testing.T) {
		converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
			Model:     "Doubao-Seedream-5.0-pro",
			Prompt:    "a red apple",
			Size:      "2K",
			Watermark: &watermark,
			Image:     single,
		})
		require.NoError(t, err)
		payload, err := common.Marshal(converted)
		require.NoError(t, err)
		body := string(payload)
		assert.Contains(t, body, `"image":"https://example.invalid/one.png"`)
		assert.NotContains(t, body, `"images"`)
		assert.NotContains(t, body, `"n"`)
		assert.NotContains(t, body, `"seed"`)
		assert.NotContains(t, body, `"quality"`)
		assert.Contains(t, body, `"watermark":false`)
	})

	t.Run("images array becomes image array", func(t *testing.T) {
		converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
			Model:     "Doubao-Seedream-5.0-pro",
			Prompt:    "a red apple",
			Size:      "2K",
			Watermark: &watermark,
			Images:    many,
		})
		require.NoError(t, err)
		payload, err := common.Marshal(converted)
		require.NoError(t, err)
		body := string(payload)
		assert.Contains(t, body, `"image":["https://example.invalid/two.png","https://example.invalid/three.png"]`)
		assert.NotContains(t, body, `"images"`)
	})

	t.Run("image and images merge in order", func(t *testing.T) {
		converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
			Model:     "Doubao-Seedream-5.0-pro",
			Prompt:    "a red apple",
			Size:      "2K",
			Watermark: &watermark,
			Image:     single,
			Images:    many,
		})
		require.NoError(t, err)
		payload, err := common.Marshal(converted)
		require.NoError(t, err)
		body := string(payload)
		assert.Contains(t, body, `"image":["https://example.invalid/one.png","https://example.invalid/two.png","https://example.invalid/three.png"]`)
		assert.NotContains(t, body, `"images"`)
	})
}

func TestConvertImageRequestDoesNotDefaultSeedForSeedream5(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		OriginModelName: "Doubao-Seedream-5.0-lite",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	watermark := false
	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "Doubao-Seedream-5.0-lite",
		Prompt:    "a red apple",
		Size:      "2K",
		Watermark: &watermark,
	})
	require.NoError(t, err)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"seed"`)
}

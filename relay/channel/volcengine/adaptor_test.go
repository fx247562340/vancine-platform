package volcengine

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
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

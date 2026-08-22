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
package ali

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOaiImage2AliImageRequestPreservesExplicitFalseAndZero(t *testing.T) {
	n := uint(1)
	watermark := false
	promptExtend := false
	seed := 0
	negative := "blurry"
	image, err := common.Marshal("data:image/png;base64,aaaa")
	require.NoError(t, err)

	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:          "qwen-image-2.0-pro",
		Prompt:         "a red apple",
		N:              &n,
		Size:           "2048x2048",
		Watermark:      &watermark,
		PromptExtend:   &promptExtend,
		Seed:           &seed,
		NegativePrompt: &negative,
		Image:          image,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted)
	assert.Equal(t, "2048*2048", converted.Parameters.Size)
	require.NotNil(t, converted.Parameters.Watermark)
	assert.False(t, *converted.Parameters.Watermark)
	require.NotNil(t, converted.Parameters.PromptExtend)
	assert.False(t, *converted.Parameters.PromptExtend)
	require.NotNil(t, converted.Parameters.Seed)
	assert.Equal(t, 0, *converted.Parameters.Seed)

	input, ok := converted.Input.(AliImageInput)
	require.True(t, ok)
	assert.Equal(t, "blurry", input.NegativePrompt)
	require.Len(t, input.Messages, 1)
	content, ok := input.Messages[0].Content.([]AliMediaContent)
	require.True(t, ok)
	require.Len(t, content, 2)
	assert.Equal(t, "data:image/png;base64,aaaa", content[0].Image)
	assert.Equal(t, "a red apple", content[1].Text)
}

func TestOaiImage2AliImageRequestMergesImageAndImages(t *testing.T) {
	image, err := common.Marshal("https://example.invalid/one.png")
	require.NoError(t, err)
	images, err := common.Marshal([]string{
		"https://example.invalid/two.png",
		"https://example.invalid/three.png",
	})
	require.NoError(t, err)

	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Size:   "2048x2048",
		Image:  image,
		Images: images,
	}, true)
	require.NoError(t, err)
	input, ok := converted.Input.(AliImageInput)
	require.True(t, ok)
	require.Len(t, input.Messages, 1)
	content, ok := input.Messages[0].Content.([]AliMediaContent)
	require.True(t, ok)
	require.Len(t, content, 4)
	assert.Equal(t, "https://example.invalid/one.png", content[0].Image)
	assert.Equal(t, "https://example.invalid/two.png", content[1].Image)
	assert.Equal(t, "https://example.invalid/three.png", content[2].Image)
	assert.Equal(t, "a red apple", content[3].Text)
}

func TestOaiImage2AliImageRequestOmitsGroup(t *testing.T) {
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Size:   "2048x2048",
	}, true)
	require.NoError(t, err)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"group"`)
	assert.Contains(t, string(payload), "a red apple")
	assert.Equal(t, "2048*2048", converted.Parameters.Size)
}

func TestOaiImage2AliImageRequestHonorsExtraParametersForPublicAPI(t *testing.T) {
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Size:   "2048x2048",
		Extra: map[string]json.RawMessage{
			"parameters": json.RawMessage(`{"n":3,"size":"1024*1024"}`),
		},
	}, true)
	require.NoError(t, err)
	assert.Equal(t, 3, converted.Parameters.N)
	assert.Equal(t, "1024*1024", converted.Parameters.Size)
}

func TestOaiImage2AliImageRequestKeepsNamedSize(t *testing.T) {
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:  "wan2.7-image-pro",
		Prompt: "a red apple",
		Size:   "2K",
	}, true)
	require.NoError(t, err)
	assert.Equal(t, "2K", converted.Parameters.Size)
}

func TestOaiImage2AliImageRequestQwenImage30AutoOmitsSize(t *testing.T) {
	n := uint(1)
	watermark := false
	promptExtend := true
	mode := "direct"
	thinking := true
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		N:                &n,
		Size:             "Auto",
		Watermark:        &watermark,
		PromptExtend:     &promptExtend,
		PromptExtendMode: &mode,
		ThinkingMode:     &thinking,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted)
	// Auto size → no "size" key on the wire.
	assert.Equal(t, "", converted.Parameters.Size)
	require.NotNil(t, converted.Parameters.PromptExtendMode)
	assert.Equal(t, "direct", *converted.Parameters.PromptExtendMode)
	require.NotNil(t, converted.Parameters.EnableThinking)
	assert.True(t, *converted.Parameters.EnableThinking)
	assert.Nil(t, converted.Parameters.ThinkingMode)
	require.NotNil(t, converted.Parameters.PromptExtend)
	assert.True(t, *converted.Parameters.PromptExtend)
	require.NotNil(t, converted.Parameters.Watermark)
	assert.False(t, *converted.Parameters.Watermark)

	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	// Strict field set: only what Qwen 3.0 actually accepts.
	body := string(payload)
	for _, expected := range []string{
		`"model":"qwen-image-3.0"`,
		`"n":1`,
		`"watermark":false`,
		`"prompt_extend":true`,
		`"prompt_extend_mode":"direct"`,
		`"enable_thinking":true`,
		`"text":"a red apple"`,
	} {
		assert.Contains(t, body, expected, body)
	}
	for _, forbidden := range []string{
		`"size"`,
		`"group"`,
		`"thinking_mode"`,
		`"response_format"`,
		`"extra_fields"`,
		`"extra"`,
		`"style"`,
		`"quality"`,
		`"background"`,
		`"moderation"`,
		`"output_format"`,
		`"output_compression"`,
		`"partial_images"`,
		`"stream"`,
		`"mask"`,
		`"input_fidelity"`,
		`"watermark_enabled"`,
		`"user_id"`,
	} {
		assert.NotContains(t, body, forbidden, body)
	}
	// input and parameters are required on the wire; their *content* must
	// be clean: input.messages[0].content has exactly one text item, no
	// image, no negative_prompt when client did not send it.
	input, ok := converted.Input.(AliImageInput)
	require.True(t, ok)
	require.Len(t, input.Messages, 1)
	content, ok := input.Messages[0].Content.([]AliMediaContent)
	require.True(t, ok)
	require.Len(t, content, 1)
	assert.Equal(t, "a red apple", content[0].Text)
	assert.Equal(t, "", input.NegativePrompt)
}

func TestOaiImage2AliImageRequestQwenImage30CustomSize(t *testing.T) {
	n := uint(1)
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:  "qwen-image-3.0",
		Prompt: "a red apple",
		N:      &n,
		Size:   "1024x1024",
	}, true)
	require.NoError(t, err)
	assert.Equal(t, "1024*1024", converted.Parameters.Size)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.Contains(t, string(payload), `"size":"1024*1024"`)
}

func TestOaiImage2AliImageRequestQwenImage30PreservesExplicitZeroAndFalse(t *testing.T) {
	n := uint(1)
	watermark := false
	promptExtend := false
	thinking := false
	seed := 0
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:        "qwen-image-3.0",
		Prompt:       "a red apple",
		N:            &n,
		Size:         "Auto",
		Watermark:    &watermark,
		Seed:         &seed,
		PromptExtend: &promptExtend,
		ThinkingMode: &thinking,
	}, true)
	require.NoError(t, err)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	body := string(payload)
	for _, expected := range []string{
		`"watermark":false`,
		`"seed":0`,
		`"prompt_extend":false`,
		`"enable_thinking":false`,
	} {
		assert.Contains(t, body, expected, body)
	}
	assert.NotContains(t, body, `"thinking_mode"`)
}

func TestOaiImage2AliImageRequestQwenImage30AgentModeForwards(t *testing.T) {
	n := uint(1)
	mode := "agent"
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		N:                &n,
		Size:             "Auto",
		PromptExtendMode: &mode,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted.Parameters.PromptExtendMode)
	assert.Equal(t, "agent", *converted.Parameters.PromptExtendMode)
}

func TestOaiImage2AliImageRequestOmitsPromptExtendModeForQwen20(t *testing.T) {
	// Qwen 2.0 does not accept prompt_extend_mode; the converter must drop
	// the field even if a future client mistakenly sends one.
	n := uint(1)
	mode := "agent"
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{}, dto.ImageRequest{
		Model:            "qwen-image-2.0-pro",
		Prompt:           "a red apple",
		N:                &n,
		Size:             "2048x2048",
		PromptExtendMode: &mode,
	}, true)
	require.NoError(t, err)
	// Ali sync body still serializes the field name; but the frontend +
	// playground validation contract strips the value before it reaches the
	// converter. The converter is the second line of defense: it forwards
	// only direct/agent, and the 2.0 Profile refuses the field before
	// billing. Here we assert the converter behavior is consistent.
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"prompt_extend_mode":"agent"`)
	assert.NotContains(t, string(payload), `"enable_thinking"`)
}

func TestOaiImage2AliImageRequestQwenImage30NegativePromptInParameters(t *testing.T) {
	n := uint(1)
	negative := "blurry"
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{
		OriginModelName: "qwen-image-3.0",
	}, dto.ImageRequest{
		Model:          "qwen-image-3.0",
		Prompt:         "a red apple",
		N:              &n,
		Size:           "Auto",
		NegativePrompt: &negative,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted.Parameters.NegativePrompt)
	assert.Equal(t, "blurry", *converted.Parameters.NegativePrompt)
	input, ok := converted.Input.(AliImageInput)
	require.True(t, ok)
	assert.Equal(t, "", input.NegativePrompt)

	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	body := string(payload)
	assert.Contains(t, body, `"negative_prompt":"blurry"`)
	assert.NotContains(t, body, `"thinking_mode"`)
}

func TestOaiImage2AliImageRequestUsesOriginModelNameNotRequestModel(t *testing.T) {
	n := uint(1)
	thinking := true
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{
		OriginModelName: "qwen-image-3.0-pro",
	}, dto.ImageRequest{
		Model:        "aliased-qwen-3",
		Prompt:       "a red apple",
		N:            &n,
		Size:         "Auto",
		ThinkingMode: &thinking,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted.Parameters.EnableThinking)
	assert.True(t, *converted.Parameters.EnableThinking)
	assert.Nil(t, converted.Parameters.ThinkingMode)
}

func TestOaiImage2AliImageRequestDoesNotGuessQwen31Prefix(t *testing.T) {
	n := uint(1)
	thinking := true
	mode := "direct"
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{
		OriginModelName: "qwen-image-3.1",
	}, dto.ImageRequest{
		Model:            "qwen-image-3.1",
		Prompt:           "a red apple",
		N:                &n,
		Size:             "1024x1024",
		ThinkingMode:     &thinking,
		PromptExtendMode: &mode,
	}, true)
	require.NoError(t, err)
	assert.Nil(t, converted.Parameters.EnableThinking)
	assert.Nil(t, converted.Parameters.PromptExtendMode)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"enable_thinking"`)
	assert.NotContains(t, string(payload), `"prompt_extend_mode"`)
}

func TestOaiImage2AliImageRequestWanKeepsThinkingMode(t *testing.T) {
	thinking := true
	converted, err := oaiImage2AliImageRequest(&relaycommon.RelayInfo{
		OriginModelName: "wan2.7-image-pro",
	}, dto.ImageRequest{
		Model:          "wan2.7-image-pro",
		Prompt:         "a red apple",
		Size:           "2K",
		ResponseFormat: "url",
		ThinkingMode:   &thinking,
	}, true)
	require.NoError(t, err)
	require.NotNil(t, converted.Parameters.ThinkingMode)
	assert.True(t, *converted.Parameters.ThinkingMode)
	assert.Nil(t, converted.Parameters.EnableThinking)
	assert.Nil(t, converted.Parameters.PromptExtendMode)
	payload, err := common.Marshal(converted)
	require.NoError(t, err)
	body := string(payload)
	assert.Contains(t, body, `"thinking_mode":true`)
	// Wan keeps response_format: only the exact Qwen Image 3.0 products
	// strip it from the outbound contract.
	assert.Contains(t, body, `"response_format":"url"`)
	assert.NotContains(t, body, `"enable_thinking"`)
	assert.NotContains(t, body, `"prompt_extend_mode"`)
}

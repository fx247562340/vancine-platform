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
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestQwenImage30MockUpstreamSendsExactContract posts the converted Qwen
// Image 3.0 request at a mock Ali upstream and asserts the exact on-the-wire
// JSON: the size field is omitted for Auto, enable_thinking is used (never
// thinking_mode), negative_prompt lives in parameters, and no group / Extra
// fields leak through.
func TestQwenImage30MockUpstreamSendsExactContract(t *testing.T) {
	var hits atomic.Int32
	var path string
	var body string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		path = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":{"choices":[{"message":{"content":[{"image":"https://example.invalid/out.png"}]}}]},"usage":{"image_count":1}}`))
	}))
	defer upstream.Close()

	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: upstream.URL,
		},
		OriginModelName: "qwen-image-3.0",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	requestURL, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.True(t, strings.HasSuffix(requestURL, "/api/v1/services/aigc/multimodal-generation/generation"), requestURL)

	n := uint(1)
	seed := 0
	watermark := false
	promptExtend := true
	promptExtendMode := "direct"
	thinking := true
	negative := "blurry"

	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		Size:             "Auto",
		ResponseFormat:   "url",
		N:                &n,
		Seed:             &seed,
		Watermark:        &watermark,
		PromptExtend:     &promptExtend,
		PromptExtendMode: &promptExtendMode,
		ThinkingMode:     &thinking,
		NegativePrompt:   &negative,
	})
	require.NoError(t, err)
	aliRequest, ok := converted.(*AliImageRequest)
	require.True(t, ok, "expected *AliImageRequest, got %T", converted)

	payload, err := common.Marshal(aliRequest)
	require.NoError(t, err)

	resp, err := http.Post(requestURL, "application/json", strings.NewReader(string(payload)))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, int32(1), hits.Load())
	assert.Equal(t, "/api/v1/services/aigc/multimodal-generation/generation", path)

	// Supported parameters are present with explicit zero/false preserved.
	assert.Contains(t, body, `"model":"qwen-image-3.0"`)
	assert.Contains(t, body, `"n":1`)
	assert.Contains(t, body, `"seed":0`)
	assert.Contains(t, body, `"watermark":false`)
	assert.Contains(t, body, `"prompt_extend":true`)
	assert.Contains(t, body, `"prompt_extend_mode":"direct"`)
	assert.Contains(t, body, `"enable_thinking":true`)
	assert.Contains(t, body, `"text":"a red apple"`)

	// Auto size must be completely omitted (never the literal "auto").
	assert.NotContains(t, strings.ToLower(body), `"size"`)
	assert.NotContains(t, strings.ToLower(body), "auto")

	// No playground internals or foreign-model fields may leak upstream.
	// The client sent response_format:"url" (the gateway's internal default)
	// but the verified Qwen 3 upstream contract has no such field, so the
	// final outbound body must not contain it.
	assert.NotContains(t, body, `"group"`)
	assert.NotContains(t, body, `"response_format"`)
	assert.NotContains(t, body, `"thinking_mode"`)
	assert.NotContains(t, body, `"extra"`)
	// Qwen 3 negative_prompt is a parameters field, not input.
	assert.Contains(t, body, `"negative_prompt":"blurry"`)
	require.NotNil(t, aliRequest.Parameters.NegativePrompt)
	assert.Equal(t, "blurry", *aliRequest.Parameters.NegativePrompt)
	input, ok := aliRequest.Input.(AliImageInput)
	require.True(t, ok)
	assert.Equal(t, "", input.NegativePrompt)
}

// TestQwenImage30MockUpstreamSendsCustomSizeAsStar verifies a custom WxH is
// converted to Ali's WIDTH*HEIGHT form and included in parameters.
func TestQwenImage30MockUpstreamSendsCustomSizeAsStar(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://dashscope.example.invalid",
		},
		OriginModelName: "qwen-image-3.0",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	n := uint(2)
	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:  "qwen-image-3.0",
		Prompt: "a red apple",
		Size:   "1024x1536",
		N:      &n,
	})
	require.NoError(t, err)
	aliRequest, ok := converted.(*AliImageRequest)
	require.True(t, ok)
	assert.Equal(t, "1024*1536", aliRequest.Parameters.Size)
	assert.Equal(t, 2, aliRequest.Parameters.N)

	payload, err := common.Marshal(aliRequest)
	require.NoError(t, err)
	assert.Contains(t, string(payload), `"size":"1024*1536"`)
	assert.Contains(t, string(payload), `"n":2`)
}

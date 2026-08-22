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
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// P13-B R18: a single Ali choice may carry MULTIPLE image contents. The
// converter must validate every declared image in order (any invalid image
// fails the whole response) and flatten valid images into independent
// ImageData entries preserving upstream order.

func unmarshalAliOutput(t *testing.T, body string) AliOutput {
	t.Helper()
	var output AliOutput
	require.NoError(t, common.Unmarshal([]byte(body), &output))
	return output
}

func converterCtx(t *testing.T) *gin.Context {
	t.Helper()
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	return ctx
}

func TestChoicesToOpenAIImageDateFlattensMultiImageChoiceInOrder(t *testing.T) {
	gin.SetMode(gin.TestMode)

	output := unmarshalAliOutput(t, `{"choices":[
		{"message":{"content":[
			{"text":"here are the images"},
			{"image":"https://example.invalid/a.png"},
			{"image":"iVBORw0KGgoAAAANSUhEUg"},
			{"image":"https://example.invalid/b.png"}
		]}}
	]}`)

	data, err := output.ChoicesToOpenAIImageDate(converterCtx(t), "url")
	require.NoError(t, err)
	require.Len(t, data, 3)
	assert.Equal(t, "https://example.invalid/a.png", data[0].Url)
	assert.Equal(t, "", data[0].B64Json)
	assert.Equal(t, "iVBORw0KGgoAAAANSUhEUg", data[1].B64Json)
	assert.Equal(t, "", data[1].Url)
	assert.Equal(t, "https://example.invalid/b.png", data[2].Url)
	// The choice's text is preserved as revised_prompt on each image of the
	// choice (single-image choices keep the historical placement).
	for _, item := range data {
		assert.Equal(t, "here are the images", item.RevisedPrompt)
	}
}

func TestChoicesToOpenAIImageDateInvalidImageFailsWholeChoice(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// A valid image earlier in the choice must NOT mask a later invalid one.
	validThenInvalid := unmarshalAliOutput(t, `{"choices":[
		{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"javascript:alert(1)"}
		]}}
	]}`)
	data, err := validThenInvalid.ChoicesToOpenAIImageDate(converterCtx(t), "url")
	require.Error(t, err)
	require.Nil(t, data)

	// Reversed order: invalid first, valid second - still fails closed.
	invalidThenValid := unmarshalAliOutput(t, `{"choices":[
		{"message":{"content":[
			{"image":"not-a-valid-payload!!!"},
			{"image":"https://example.invalid/a.png"}
		]}}
	]}`)
	data, err = invalidThenValid.ChoicesToOpenAIImageDate(converterCtx(t), "url")
	require.Error(t, err)
	require.Nil(t, data)
}

func TestChoicesToOpenAIImageDateTextOnlyChoiceFails(t *testing.T) {
	gin.SetMode(gin.TestMode)

	output := unmarshalAliOutput(t, `{"choices":[
		{"message":{"content":[{"text":"revised prompt only"}]}}
	]}`)
	data, err := output.ChoicesToOpenAIImageDate(converterCtx(t), "url")
	require.Error(t, err)
	require.Nil(t, data)
}

func TestChoicesToOpenAIImageDateMultiChoiceOrder(t *testing.T) {
	gin.SetMode(gin.TestMode)

	output := unmarshalAliOutput(t, `{"choices":[
		{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"https://example.invalid/b.png"}
		]}},
		{"message":{"content":[
			{"image":"iVBORw0KGgoAAAANSUhEUg"}
		]}}
	]}`)

	data, err := output.ChoicesToOpenAIImageDate(converterCtx(t), "url")
	require.NoError(t, err)
	require.Len(t, data, 3)
	assert.Equal(t, "https://example.invalid/a.png", data[0].Url)
	assert.Equal(t, "https://example.invalid/b.png", data[1].Url)
	assert.Equal(t, "iVBORw0KGgoAAAANSUhEUg", data[2].B64Json)
}

func newChoicesHandlerCase(t *testing.T, body string, presetN float64) (*Adaptor, *gin.Context, *httptest.ResponseRecorder, *http.Response, *relaycommon.RelayInfo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", presetN)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	return adaptor, ctx, recorder, resp, info
}

// TestAliImageHandlerSingleChoiceValidInvalidFailsClosed covers the P13-B
// R18 production regression: one choice mixing a valid and an invalid image
// fails closed - no body, no n mutation, no settlement.
func TestAliImageHandlerSingleChoiceValidInvalidFailsClosed(t *testing.T) {
	body := `{"output":{"choices":[
		{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"javascript:alert(1)"}
		]}}
	]},"usage":{"image_count":2}}`
	adaptor, ctx, recorder, resp, info := newChoicesHandlerCase(t, body, 2)

	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	require.Empty(t, recorder.Body.String(), "no body must reach the client on the fail-closed path")
	require.Equal(t, 2.0, info.PriceData.OtherRatios()["n"], "pre-set n ratio stays untouched")
}

// TestAliImageHandlerSingleChoiceTwoValidImagesDeliversBoth covers the
// multi-image flatten contract end to end: both images are delivered in
// upstream order and the billed n equals the delivered count.
func TestAliImageHandlerSingleChoiceTwoValidImagesDeliversBoth(t *testing.T) {
	body := `{"output":{"choices":[
		{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"iVBORw0KGgoAAAANSUhEUg"}
		]}}
	]},"usage":{"image_count":2}}`
	adaptor, ctx, recorder, resp, info := newChoicesHandlerCase(t, body, 2)

	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, err)
	require.NotNil(t, usage)
	require.Equal(t, 2.0, info.PriceData.OtherRatios()["n"], "billed count equals delivered count")

	rendered := recorder.Body.String()
	require.NotEmpty(t, rendered)
	// Order must be preserved: the URL image comes before the base64 image.
	require.Less(t,
		strings.Index(rendered, "https://example.invalid/a.png"),
		strings.Index(rendered, "iVBORw0KGgoAAAANSUhEUg"),
		"delivered order must match upstream order")
	require.Equal(t, 2, strings.Count(rendered, `"url":"https://example.invalid/a.png"`)+strings.Count(rendered, `"b64_json":"iVBORw0KGgoAAAANSUhEUg"`))
}

// TestAliImageHandlerMultiChoiceAllValidKeepsOrderAndCount covers multiple
// choices each carrying one or more valid images: the flattened delivery
// order and count must match upstream exactly, and billing equals delivery.
func TestAliImageHandlerMultiChoiceAllValidKeepsOrderAndCount(t *testing.T) {
	body := `{"output":{"choices":[
		{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"https://example.invalid/b.png"}
		]}},
		{"message":{"content":[
			{"image":"iVBORw0KGgoAAAANSUhEUg"}
		]}}
	]},"usage":{"image_count":3}}`
	adaptor, ctx, recorder, resp, info := newChoicesHandlerCase(t, body, 3)

	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, err)
	require.NotNil(t, usage)
	require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"])

	rendered := recorder.Body.String()
	idxA := strings.Index(rendered, "https://example.invalid/a.png")
	idxB := strings.Index(rendered, "https://example.invalid/b.png")
	idxC := strings.Index(rendered, "iVBORw0KGgoAAAANSUhEUg")
	require.NotEqual(t, -1, idxA)
	require.NotEqual(t, -1, idxB)
	require.NotEqual(t, -1, idxC)
	require.True(t, idxA < idxB && idxB < idxC, "delivery order must match upstream choice/content order")
}

// TestAliImageHandlerChoiceTextAloneFailsClosed ensures a choice whose only
// content is text never succeeds end to end.
func TestAliImageHandlerChoiceTextAloneFailsClosed(t *testing.T) {
	body := `{"output":{"choices":[
		{"message":{"content":[
			{"text":"sorry, I cannot draw that"}
		]}}
	]},"usage":{"image_count":0}}`
	adaptor, ctx, recorder, resp, info := newChoicesHandlerCase(t, body, 1)

	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	require.Empty(t, recorder.Body.String())
	require.Equal(t, 1.0, info.PriceData.OtherRatios()["n"])
}

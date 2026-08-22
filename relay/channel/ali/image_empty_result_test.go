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

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAliImageHandlerRejectsEmptyOrUnusableResults(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}

	for _, body := range []string{
		`{"output":{"results":[]}}`,
		`{"output":{"choices":[{"message":{"content":[{"text":"revised only"}]}}]}}`,
		`{"output":{"choices":[{"message":{"content":[]}}]}}`,
		`{"output":{"results":[{"url":"javascript:alert(1)"}]}}`,
		`{"output":{"results":[{"url":"file:///tmp/a.png"}]}}`,
		`{"output":{"choices":[{"message":{"content":[{"image":"hello world"}]}}]}}`,
		`{"output":{"choices":[{"message":{"content":[{"image":"not-base64!!!"}]}}]}}`,
		// Valid base64 of plain text is decodable but not an image: must be
		// treated as bad_response, not billed success.
		`{"output":{"choices":[{"message":{"content":[{"image":"aGVsbG8gd29ybGQ="}]}}]}}`,
		`{"output":{"results":[{"b64_image":"aGVsbG8gd29ybGQ="}]}}`,
	} {
		info.PriceData.UsePrice = true
		info.PriceData.AddOtherRatio("n", 3)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
		resp := &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}
		usage, err := adaptor.DoResponse(ctx, resp, info)
		require.Nil(t, usage, body)
		require.NotNil(t, err, body)
		require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode(), body)
		require.Empty(t, recorder.Body.String(), body)
		require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"], body)
	}
}

func TestAliImageHandlerAcceptsHTTPURLAndValidBase64(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	for _, body := range []string{
		`{"output":{"choices":[{"message":{"content":[{"image":"https://example.invalid/a.png"}]}}]},"usage":{"image_count":1}}`,
		`{"output":{"choices":[{"message":{"content":[{"image":"iVBORw0KGgoAAAANSUhEUg"}]}}]},"usage":{"image_count":1}}`,
		`{"output":{"results":[{"b64_image":"iVBORw0KGgoAAAANSUhEUg"}]},"usage":{"image_count":1}}`,
	} {
		info := &relaycommon.RelayInfo{
			ChannelMeta: &relaycommon.ChannelMeta{},
			RelayMode:   constant.RelayModeImagesGenerations,
		}
		info.PriceData.UsePrice = true
		info.PriceData.AddOtherRatio("n", 3)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
		resp := &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}
		usage, err := adaptor.DoResponse(ctx, resp, info)
		require.Nil(t, err, body)
		require.NotNil(t, usage, body)
		require.NotEmpty(t, recorder.Body.String(), body)
		require.Equal(t, 1.0, info.PriceData.OtherRatios()["n"], body)
	}
}

// TestAliImageHandlerBillsByUsableCount covers the production regression:
// the upstream may report an image_count larger than the actual items the
// gateway surfaces (e.g. usage=5 but the body only contains 2 valid
// images). The PriceData ratio must equal the number of items the client
// actually receives, never the upstream-claimed count.
func TestAliImageHandlerBillsByUsableCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	// Upstream claims 5 images but only 2 choices carry a usable payload.
	body := `{"output":{"choices":[
		{"message":{"content":[{"image":"https://example.invalid/a.png"}]}},
		{"message":{"content":[{"image":"javascript:alert(1)"},{"image":"aGVsbG8="}]}},
		{"message":{"content":[]}},
		{"message":{"content":[{"image":"iVBORw0KGgoAAAANSUhEUg"}]}},
		{"message":{"content":[{"text":"just text"}]}}
	]},"usage":{"image_count":5}}`
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", 3)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	usage, err := adaptor.DoResponse(ctx, resp, info)
	// P13-B R17: mixed valid/invalid fails closed.
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	require.Empty(t, recorder.Body.String(), "no body must reach the client on the fail-closed path")
	// The pre-set n ratio stays untouched.
	require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"])
}

// TestAliImageHandlerFailsClosedOverMaxImageN covers the P13-B R16
// fail-closed contract: an Ali response that surfaces more than
// dto.MaxImageN usable images (e.g. a buggy upstream that loops the
// results array) MUST be rejected as bad_response, MUST NOT write a
// success body to the client, and MUST NOT silently raise the billed n
// past the pre-set value. The relay's error path refunds the
// pre-consumed quota and skips the success settlement.
func TestAliImageHandlerFailsClosedOverMaxImageN(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	// Build 129 valid result items, one past dto.MaxImageN (128).
	results := make([]string, 0, 129)
	for i := 0; i < 129; i++ {
		results = append(results, `{"url":"https://example.invalid/a.png"}`)
	}
	body := `{"output":{"results":[` + strings.Join(results, ",") + `]}}`

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", 3)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	// No body must reach the client on the fail-closed path.
	require.Empty(t, recorder.Body.String())
	// The pre-set n ratio must NOT be raised past 3 just because the
	// upstream produced more items than the contract allows.
	require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"])
}

// TestAliImageHandlerAllValidSucceeds covers the P13-B R17 all-valid
// success path: every declared result/choice produces a usable image, the
// original order is preserved, the delivery count equals the billing count,
// and the count is within 1..dto.MaxImageN.
func TestAliImageHandlerAllValidSucceeds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	body := `{"output":{"choices":[
		{"message":{"content":[{"image":"https://example.invalid/a.png"}]}},
		{"message":{"content":[{"image":"iVBORw0KGgoAAAANSUhEUg"}]}}
	]},"usage":{"image_count":2}}`
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", 5)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, err)
	require.NotNil(t, usage)
	require.NotEmpty(t, recorder.Body.String())
	// Delivery count == billing count == 2 (not the upstream-reported 5).
	require.Equal(t, 2.0, info.PriceData.OtherRatios()["n"])
	// Both images present, in original order.
	rendered := recorder.Body.String()
	require.Contains(t, rendered, "https://example.invalid/a.png")
	require.Contains(t, rendered, "iVBORw0KGgoAAAANSUhEUg")
}

// TestAliImageHandlerMixedValidInvalidFailsClosed is the P13-B R17
// all-valid regression: a response that mixes valid and invalid choices
// must fail closed. The whole response is rejected BEFORE writing the
// body, BEFORE modifying the n ratio, and BEFORE settling as success.
func TestAliImageHandlerMixedValidInvalidFailsClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	// 2 valid + 1 invalid (javascript: URL) choice.
	body := `{"output":{"choices":[
		{"message":{"content":[{"image":"https://example.invalid/a.png"}]}},
		{"message":{"content":[{"image":"javascript:alert(1)"}]}},
		{"message":{"content":[{"image":"iVBORw0KGgoAAAANSUhEUg"}]}}
	]},"usage":{"image_count":3}}`
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", 3)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	// Fail-closed: body is empty, n ratio unchanged, no success settlement.
	require.Empty(t, recorder.Body.String(), "no body must reach the client on the fail-closed path")
	require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"], "pre-set n ratio stays untouched on the fail-closed path")
}

// TestAliImageHandlerResultsMixedValidInvalidFailsClosed covers the same
// all-valid contract for the async-task Results path.
func TestAliImageHandlerResultsMixedValidInvalidFailsClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &Adaptor{IsSyncImageModel: true}

	body := `{"output":{"results":[
		{"url":"https://example.invalid/a.png"},
		{"url":"file:///etc/passwd"},
		{"b64_image":"iVBORw0KGgoAAAANSUhEUg"}
	]}}`
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		RelayMode:   constant.RelayModeImagesGenerations,
	}
	info.PriceData.UsePrice = true
	info.PriceData.AddOtherRatio("n", 3)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
	usage, err := adaptor.DoResponse(ctx, resp, info)
	require.Nil(t, usage)
	require.NotNil(t, err)
	require.Equal(t, types.ErrorCodeBadResponse, err.GetErrorCode())
	require.Empty(t, recorder.Body.String())
	require.Equal(t, 3.0, info.PriceData.OtherRatios()["n"])
}

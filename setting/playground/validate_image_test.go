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
package playground

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidatePlaygroundImageRequestAcceptsQwenDefaults(t *testing.T) {
	n := uint(1)
	watermark := false
	seed := 0
	req := &dto.ImageRequest{
		Model:     "qwen-image-2.0-pro",
		Prompt:    "a red apple",
		Size:      "2048x2048",
		N:         &n,
		Watermark: &watermark,
		Seed:      &seed,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidatePlaygroundImageRequestRejectsUnsupportedField(t *testing.T) {
	thinking := true
	req := &dto.ImageRequest{
		Model:        "qwen-image-2.0-pro",
		Prompt:       "a red apple",
		ThinkingMode: &thinking,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "thinking_mode")
}

func TestValidatePlaygroundImageRequestRejectsOutOfRangeN(t *testing.T) {
	n := uint(7)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		N:      &n,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "n must be between")
}

// Huge uint JSON numbers (including wrapped negatives such as
// 18446744073709551615) must be rejected in uint space, before any int
// conversion could silently wrap them into a billable value.
func TestValidatePlaygroundImageRequestRejectsHugeUintNBeforeIntConversion(t *testing.T) {
	for _, un := range []uint{uint(dto.MaxImageN) + 1, 18446744073709551615, uint(18446744073686646784)} {
		req := &dto.ImageRequest{
			Model:  "qwen-image-3.0",
			Prompt: "a red apple",
			N:      &un,
		}
		err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
		require.Error(t, err, "n=%d", un)
		assert.Contains(t, err.Error(), "n must be between", "n=%d", un)
	}
}

func TestValidatePlaygroundImageRequestRejectsZeroN(t *testing.T) {
	zero := uint(0)
	req := &dto.ImageRequest{
		Model:  "qwen-image-3.0",
		Prompt: "a red apple",
		N:      &zero,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "n must be between")
}

func TestValidatePlaygroundImageRequestRejectsMissingProfile(t *testing.T) {
	req := &dto.ImageRequest{Model: "gpt-4o", Prompt: "hi"}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not have an image profile")
}

func TestValidateReferenceImagesRejectsInvalidBase64(t *testing.T) {
	image, err := common.Marshal("data:image/png;base64,%%%not-base64%%%")
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid base64")
}

func TestValidateReferenceImagesRejectsOversizedEncodedPayload(t *testing.T) {
	payload := strings.Repeat("A", maxSingleImageBytes*4/3+32)
	image, err := common.Marshal("data:image/png;base64," + payload)
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds maximum size")
}

func TestValidateReferenceImagesAcceptsPNGDataURL(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidateReferenceImagesRejectsWhenUnsupported(t *testing.T) {
	profile := ImageProfile("qwen-image-2.0")
	require.NotNil(t, profile)
	profile.MaxReferenceImages = 0
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0",
		Prompt: "a red apple",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, profile)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not support reference images")
}

func TestValidatePlaygroundImageRequestRejectsExtraParameters(t *testing.T) {
	n := uint(1)
	req := &dto.ImageRequest{
		Model:  "qwen-image-2.0-pro",
		Prompt: "a red apple",
		N:      &n,
		Extra: map[string]json.RawMessage{
			"parameters": json.RawMessage(`{"n":9}`),
		},
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parameters")
}

func TestValidateSeedreamLiteRejects1KAndLowPixels(t *testing.T) {
	req := &dto.ImageRequest{
		Model:  "Doubao-Seedream-5.0-lite",
		Prompt: "a red apple",
		Size:   "1K",
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "size")

	req.Size = "1024x1024"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
}

func TestValidateWanRejectsReferenceImagesAt4K(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "wan2.7-image-pro",
		Prompt: "a red apple",
		Size:   "4K",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "4K")
}

func TestValidateQwenImage20AcceptsNRefsAdvancedAndCustomSize(t *testing.T) {
	n := uint(6)
	negative := "blurry"
	seed := 42
	watermark := false
	extend := true
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal([]string{
		"data:image/png;base64," + encoded,
		"https://cdn.example.com/ref.png",
	})
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:          "qwen-image-2.0",
		Prompt:         "a red apple",
		Size:           "1280x720",
		N:              &n,
		NegativePrompt: &negative,
		Seed:           &seed,
		Watermark:      &watermark,
		PromptExtend:   &extend,
		Image:          image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidateSeedreamProAccepts15KAndCustomSize(t *testing.T) {
	req := &dto.ImageRequest{
		Model:  "Doubao-Seedream-5.0-pro",
		Prompt: "a red apple",
		Size:   "1.5K",
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	req.Size = "1440x1440"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidateSeedreamLiteAcceptsMaxPixelsAndRejectsOverMax(t *testing.T) {
	req := &dto.ImageRequest{
		Model:  "Doubao-Seedream-5.0-lite",
		Prompt: "a red apple",
		Size:   "4096x4096",
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	req.Size = "4097x4096"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at most")
}

func TestValidateSeedreamRejectsSeed(t *testing.T) {
	seed := 1
	req := &dto.ImageRequest{
		Model:  "Doubao-Seedream-5.0-pro",
		Prompt: "a red apple",
		Size:   "2K",
		Seed:   &seed,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "seed")
}

func TestValidateWanCustomSizeAndLowerLimitWithRefs(t *testing.T) {
	req := &dto.ImageRequest{
		Model:  "wan2.7-image-pro",
		Prompt: "a red apple",
		Size:   "1280x720",
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req.Size = "4096x4096"
	req.Image = image
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at most")

	req.Size = "2048x2048"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidateReferenceURLRejectsNonHTTP(t *testing.T) {
	profile := ImageProfile("qwen-image-2.0-pro")
	require.NotNil(t, profile)
	for _, raw := range []string{
		"file:///etc/passwd",
		"javascript:alert(1)",
		"data:text/html;base64,aaaa",
		"/relative/path.png",
		"//cdn.example.com/x.png",
		"http://",
		"not a url",
	} {
		image, err := common.Marshal(raw)
		require.NoError(t, err)
		req := &dto.ImageRequest{
			Model:  "qwen-image-2.0-pro",
			Prompt: "a red apple",
			Image:  image,
		}
		err = ValidatePlaygroundImageRequest(req, profile)
		require.Error(t, err, raw)
	}
}

func TestParseWidthHeightRejectsTrailingJunk(t *testing.T) {
	for _, size := range []string{
		"1024abcx1024",
		"1024x1024abc",
		" 1024x1024",
		"1024x1024 ",
		"+1024x1024",
		"1024.0x1024",
		"x1024",
		"1024x",
		"1024x1024x1",
	} {
		_, _, ok := parseWidthHeight(size)
		assert.False(t, ok, size)
		req := &dto.ImageRequest{
			Model:  "qwen-image-2.0-pro",
			Prompt: "a red apple",
			Size:   size,
		}
		err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
		require.Error(t, err, size)
	}

	width, height, ok := parseWidthHeight("1280x720")
	require.True(t, ok)
	assert.Equal(t, 1280, width)
	assert.Equal(t, 720, height)
}

func TestValidateQwenImage30AutoSizeAndPromptExtendMode(t *testing.T) {
	// Auto size with no reference images is accepted; n=1, watermark=false,
	// seed=0, prompt_extend=true, prompt_extend_mode="direct",
	// enable_thinking=true all valid.
	n := uint(1)
	watermark := false
	seed := 0
	extend := true
	mode := "direct"
	thinking := true
	req := &dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		Size:             "Auto",
		N:                &n,
		Watermark:        &watermark,
		Seed:             &seed,
		PromptExtend:     &extend,
		PromptExtendMode: &mode,
		ThinkingMode:     &thinking,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// Empty Size (the on-the-wire form for Auto) is also accepted.
	req.Size = ""
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// Custom WxH is accepted; range 512..2048 enforced.
	req.Size = "1024x1024"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// Out-of-range custom size rejected before billing.
	req.Size = "4096x4096"
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at most")
}

func TestValidateQwenImage30AutoSizeRejectsReferenceImages(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-3.0",
		Prompt: "a red apple",
		Size:   "Auto",
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Auto")
}

func TestValidateQwenImage30AgentModeRequiresNoRefs(t *testing.T) {
	// agent + no refs is fine (text-to-image only).
	n := uint(1)
	mode := "agent"
	req := &dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		Size:             "Auto",
		N:                &n,
		PromptExtendMode: &mode,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// agent + 1 ref is rejected.
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal("data:image/png;base64," + encoded)
	require.NoError(t, err)
	req.Image = image
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "agent")
}

func TestValidateQwenImage30ThinkingRequiresPromptExtend(t *testing.T) {
	// prompt_extend=false + enable_thinking=true is rejected.
	n := uint(1)
	extend := false
	thinking := true
	req := &dto.ImageRequest{
		Model:        "qwen-image-3.0",
		Prompt:       "a red apple",
		Size:         "Auto",
		N:            &n,
		PromptExtend: &extend,
		ThinkingMode: &thinking,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "enable_thinking")

	// prompt_extend=false + enable_thinking=false (or unset) is fine.
	thinking = false
	req.ThinkingMode = &thinking
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	req.ThinkingMode = nil
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)
}

func TestValidateQwenImage30RejectsInvalidPromptExtendMode(t *testing.T) {
	n := uint(1)
	mode := "magic"
	req := &dto.ImageRequest{
		Model:            "qwen-image-3.0",
		Prompt:           "a red apple",
		Size:             "Auto",
		N:                &n,
		PromptExtendMode: &mode,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prompt_extend_mode")
}

func TestValidateQwenImage30RejectsAspectOutOfRange(t *testing.T) {
	// 2048x128 = 262144 pixels (just over MinPixels) but 2048/128 = 16:1,
	// which exceeds the MaxAspectRatio of 8:1.
	n := uint(1)
	req := &dto.ImageRequest{
		Model:  "qwen-image-3.0",
		Prompt: "a wide image",
		Size:   "2048x128",
		N:      &n,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "aspect ratio")
}

// TestValidateQwenImage30AcceptsLongNegativePrompt proves Qwen 3.0 does not
// inherit the fictional 500-char negative_prompt cap from Qwen 2.0. Only the
// shared gateway request-body cap bounds it, so a 500+ char prompt is valid.
func TestValidateQwenImage30AcceptsLongNegativePrompt(t *testing.T) {
	n := uint(1)
	longNegative := strings.Repeat("blurry ", 200) // 1400 chars
	require.Greater(t, len(longNegative), 500)
	req := &dto.ImageRequest{
		Model:          "qwen-image-3.0",
		Prompt:         "a red apple",
		Size:           "Auto",
		N:              &n,
		NegativePrompt: &longNegative,
	}
	err := ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// Qwen 2.0 still enforces its documented 500-char cap.
	req2 := &dto.ImageRequest{
		Model:          "qwen-image-2.0",
		Prompt:         "a red apple",
		Size:           "2048x2048",
		N:              &n,
		NegativePrompt: &longNegative,
	}
	err = ValidatePlaygroundImageRequest(req2, ImageProfile(req2.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "negative_prompt")
}

func TestValidateQwenImage30ProAcceptsReferences(t *testing.T) {
	n := uint(1)
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-png-bytes"))
	image, err := common.Marshal([]string{
		"https://cdn.example.invalid/a.png",
		"data:image/png;base64," + encoded,
	})
	require.NoError(t, err)
	req := &dto.ImageRequest{
		Model:  "qwen-image-3.0-pro",
		Prompt: "a red apple",
		Size:   "1024x1024",
		N:      &n,
		Image:  image,
	}
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.NoError(t, err)

	// Fourth reference image is rejected before billing.
	image4, err := common.Marshal([]string{
		"https://cdn.example.invalid/a.png",
		"https://cdn.example.invalid/b.png",
		"https://cdn.example.invalid/c.png",
		"https://cdn.example.invalid/d.png",
	})
	require.NoError(t, err)
	req.Image = image4
	err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "too many reference images")
}

func TestValidateQwenImage30AcceptsGifBmpTiffReferences(t *testing.T) {
	n := uint(1)
	for _, mime := range []string{"image/gif", "image/bmp", "image/tiff", "image/webp", "image/jpeg", "image/png"} {
		encoded := base64.StdEncoding.EncodeToString([]byte("fake-" + mime))
		image, err := common.Marshal("data:" + mime + ";base64," + encoded)
		require.NoError(t, err)
		req := &dto.ImageRequest{
			Model:  "qwen-image-3.0",
			Prompt: "a red apple",
			Size:   "1024x1024",
			N:      &n,
			Image:  image,
		}
		err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
		require.NoError(t, err, mime)
	}
}

func TestValidateNonQwenModelsRejectQwenOnlyReferenceMIMEs(t *testing.T) {
	n := uint(1)
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-gif-bytes"))
	image, err := common.Marshal("data:image/gif;base64," + encoded)
	require.NoError(t, err)
	for _, model := range []string{"qwen-image-2.0", "wan2.7-image-pro", "doubao-seedream-5.0-pro"} {
		size := "2048x2048"
		switch model {
		case "wan2.7-image-pro":
			size = "2K"
		case "doubao-seedream-5.0-pro":
			size = "2K"
		}
		req := &dto.ImageRequest{
			Model:  model,
			Prompt: "a red apple",
			Size:   size,
			N:      &n,
			Image:  image,
		}
		err = ValidatePlaygroundImageRequest(req, ImageProfile(req.Model))
		require.Error(t, err, model)
		assert.Contains(t, err.Error(), "unsupported reference image MIME type", model)
	}
}

func TestMultiplyPixelsOverflow(t *testing.T) {
	_, err := multiplyPixels(1, 1)
	require.NoError(t, err)
	if math.MaxInt <= math.MaxInt32 {
		t.Skip("int cannot represent an overflowing pixel product")
	}
	_, err = multiplyPixels(math.MaxInt, 3)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "overflows")
}

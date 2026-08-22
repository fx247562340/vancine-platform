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
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageProfileExactEnabledModels(t *testing.T) {
	qwen := ImageProfile("qwen-image-2.0")
	require.NotNil(t, qwen)
	assert.Equal(t, []string{"2048x2048", "2688x1536", "1536x2688", "2368x1728", "1728x2368"}, qwen.Sizes)
	assert.Equal(t, "2048x2048", qwen.DefaultSize)
	assert.True(t, qwen.SupportsCustomSize)
	assert.Equal(t, IntRange{Min: 1, Max: 6, Default: 1}, qwen.NRange)
	assert.Equal(t, 3, qwen.MaxReferenceImages)
	assert.True(t, qwen.SupportsNegativePrompt)
	assert.Equal(t, 500, qwen.MaxNegativePromptChars)
	assert.True(t, qwen.SupportsSeed)
	assert.True(t, qwen.SupportsWatermark)
	assert.True(t, qwen.SupportsPromptExtend)
	assert.False(t, qwen.SupportsThinkingMode)
	assert.Equal(t, []string{"image/jpeg", "image/png", "image/webp"}, qwen.AllowedReferenceMIMETypes)
	assert.Equal(t, int64(512*512), qwen.MinPixels)
	assert.Equal(t, int64(2048*2048), qwen.MaxPixels)

	qwenPro := ImageProfile("qwen-image-2.0-pro")
	require.NotNil(t, qwenPro)
	assert.Equal(t, qwen.Sizes, qwenPro.Sizes)
	assert.Equal(t, qwen.NRange, qwenPro.NRange)
	assert.Equal(t, qwen.MaxReferenceImages, qwenPro.MaxReferenceImages)
	assert.True(t, qwenPro.SupportsCustomSize)

	// Qwen 3.0 has a different, more recent contract: Auto size, prompt_extend_mode
	// (direct / agent), enable_thinking with prompt_extend dependency, agent
	// forbidden with reference images, 1:8 .. 8:1 aspect ratio. It must NOT
	// inherit from the Qwen 2.0 series.
	qwen30 := ImageProfile("qwen-image-3.0")
	require.NotNil(t, qwen30)
	assert.True(t, qwen30.SupportsAutoSize)
	assert.Equal(t, "Auto", qwen30.DefaultSize)
	assert.Contains(t, qwen30.Sizes, "Auto")
	assert.True(t, qwen30.SupportsCustomSize)
	assert.Equal(t, IntRange{Min: 1, Max: 6, Default: 1}, qwen30.NRange)
	assert.Equal(t, 3, qwen30.MaxReferenceImages)
	assert.True(t, qwen30.SupportsNegativePrompt)
	assert.True(t, qwen30.SupportsSeed)
	assert.True(t, qwen30.SupportsWatermark)
	assert.True(t, qwen30.SupportsPromptExtend)
	assert.True(t, qwen30.SupportsPromptExtendMode)
	assert.True(t, qwen30.SupportsThinkingMode)
	assert.True(t, qwen30.ThinkingRequiresExtend)
	assert.True(t, qwen30.AgentRequiresNoRefs)
	assert.Equal(t, []string{
		"image/jpeg", "image/png", "image/bmp", "image/tiff", "image/webp", "image/gif",
	}, qwen30.AllowedReferenceMIMETypes)
	require.NotNil(t, qwen30.DefaultPromptExtend)
	assert.True(t, *qwen30.DefaultPromptExtend)
	require.NotNil(t, qwen30.DefaultThinkingMode)
	assert.True(t, *qwen30.DefaultThinkingMode)
	require.NotNil(t, qwen30.DefaultPromptExtendMode)
	assert.Equal(t, "direct", *qwen30.DefaultPromptExtendMode)
	require.NotNil(t, qwen30.MinAspectRatio)
	assert.Equal(t, AspectRatio{Width: 1, Height: 8}, *qwen30.MinAspectRatio)
	require.NotNil(t, qwen30.MaxAspectRatio)
	assert.Equal(t, AspectRatio{Width: 8, Height: 1}, *qwen30.MaxAspectRatio)

	qwen30Pro := ImageProfile("qwen-image-3.0-pro")
	require.NotNil(t, qwen30Pro)
	assert.Equal(t, "Auto", qwen30Pro.DefaultSize)
	assert.True(t, qwen30Pro.SupportsAutoSize)
	assert.Equal(t, qwen30.NRange, qwen30Pro.NRange)
	assert.Equal(t, qwen30.MaxReferenceImages, qwen30Pro.MaxReferenceImages)
	assert.True(t, qwen30Pro.SupportsPromptExtendMode)
	assert.True(t, qwen30Pro.AgentRequiresNoRefs)

	// Qwen 2.0 and 3.0 profiles must remain distinct: 2.0 has no Auto, no
	// prompt_extend_mode, no enable_thinking, no aspect-ratio bound.
	assert.NotEqual(t, qwen.Sizes, qwen30.Sizes)
	assert.False(t, qwen.SupportsAutoSize)
	assert.False(t, qwen.SupportsPromptExtendMode)
	assert.False(t, qwen.SupportsThinkingMode)
	assert.Nil(t, qwen.DefaultPromptExtendMode)

	wanPro := ImageProfile("wan2.7-image-pro")
	require.NotNil(t, wanPro)
	assert.Equal(t, []string{"1K", "2K", "4K"}, wanPro.Sizes)
	assert.True(t, wanPro.SupportsCustomSize)
	assert.Equal(t, 9, wanPro.MaxReferenceImages)
	assert.True(t, wanPro.SupportsThinkingMode)
	assert.True(t, wanPro.SupportsSeed)
	assert.Equal(t, int64(768*768), wanPro.MinPixels)
	assert.Equal(t, int64(4096*4096), wanPro.MaxPixels)
	assert.Equal(t, int64(2048*2048), wanPro.MaxPixelsWithRefs)
	require.NotNil(t, wanPro.MinAspectRatio)
	assert.Equal(t, AspectRatio{Width: 1, Height: 8}, *wanPro.MinAspectRatio)
	require.NotNil(t, wanPro.MaxAspectRatio)
	assert.Equal(t, AspectRatio{Width: 8, Height: 1}, *wanPro.MaxAspectRatio)

	seedreamPro := ImageProfile("Doubao-Seedream-5.0-pro")
	require.NotNil(t, seedreamPro)
	assert.Equal(t, []string{"1K", "1.5K", "2K"}, seedreamPro.Sizes)
	assert.True(t, seedreamPro.SupportsCustomSize)
	assert.Equal(t, 1, seedreamPro.NRange.Max)
	assert.Equal(t, 10, seedreamPro.MaxReferenceImages)
	assert.Equal(t, int64(921600), seedreamPro.MinPixels)
	assert.Equal(t, int64(4624220), seedreamPro.MaxPixels)
	assert.True(t, seedreamPro.SupportsWatermark)
	assert.False(t, seedreamPro.SupportsSeed)
	assert.False(t, seedreamPro.SupportsNegativePrompt)
	require.NotNil(t, seedreamPro.MinAspectRatio)
	assert.Equal(t, AspectRatio{Width: 1, Height: 16}, *seedreamPro.MinAspectRatio)

	seedreamLite := ImageProfile("Doubao-Seedream-5.0-lite")
	require.NotNil(t, seedreamLite)
	assert.Equal(t, []string{"2K", "3K", "4K"}, seedreamLite.Sizes)
	assert.NotContains(t, seedreamLite.Sizes, "1K")
	assert.NotContains(t, seedreamLite.Sizes, "1.5K")
	assert.True(t, seedreamLite.SupportsCustomSize)
	assert.Equal(t, 14, seedreamLite.MaxReferenceImages)
	assert.Equal(t, int64(3686400), seedreamLite.MinPixels)
	assert.Equal(t, int64(16777216), seedreamLite.MaxPixels)
	assert.False(t, seedreamLite.SupportsSeed)
}

func TestImageProfileDoesNotGuessUnknownOrUnverifiedModels(t *testing.T) {
	assert.Nil(t, ImageProfile("qwen-image-unknown-version"))
	assert.Nil(t, ImageProfile("wan2.7-image"))
	assert.Nil(t, ImageProfile("gpt-4o"))
	assert.False(t, HasImageProfile("wan2.7-image"))
	assert.False(t, HasImageProfile("doubao-seedream-4-0-250828"))
}

func TestImageProfileJSONTags(t *testing.T) {
	profile := ImageProfile("qwen-image-2.0-pro")
	require.NotNil(t, profile)
	data, err := common.Marshal(profile)
	require.NoError(t, err)

	var raw map[string]any
	require.NoError(t, common.Unmarshal(data, &raw))
	for _, key := range []string{
		"sizes", "defaultSize", "supportsCustomSize", "nRange", "maxReferenceImages",
		"supportsNegativePrompt", "supportsSeed", "supportsWatermark",
		"supportsPromptExtend", "supportsThinkingMode",
	} {
		_, ok := raw[key]
		assert.Truef(t, ok, "missing JSON key %q", key)
	}
}

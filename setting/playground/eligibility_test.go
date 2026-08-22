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

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRequiredChannelType(t *testing.T) {
	channelType, ok := RequiredChannelType("qwen-image-2.0-pro")
	require.True(t, ok)
	assert.Equal(t, constant.ChannelTypeAli, channelType)

	channelType, ok = RequiredChannelType("wan2.7-image-pro")
	require.True(t, ok)
	assert.Equal(t, constant.ChannelTypeAli, channelType)

	channelType, ok = RequiredChannelType("Doubao-Seedream-5.0-pro")
	require.True(t, ok)
	assert.Equal(t, constant.ChannelTypeVolcEngine, channelType)

	_, ok = RequiredChannelType("gpt-4o")
	assert.False(t, ok)
}

func TestChannelEligibleForRequestOnlyAppliesToImageWorkspace(t *testing.T) {
	assert.True(t, ChannelEligibleForRequest("/v1/images/generations", constant.ChannelTypeOpenAI, "qwen-image-2.0-pro"))
	assert.True(t, ChannelEligibleForRequest("/v1/chat/completions", constant.ChannelTypeOpenAI, "qwen-image-2.0-pro"))
	assert.False(t, ChannelEligibleForRequest("/pg/images/generations", constant.ChannelTypeOpenAI, "qwen-image-2.0-pro"))
	assert.True(t, ChannelEligibleForRequest("/pg/images/generations", constant.ChannelTypeAli, "qwen-image-2.0-pro"))
	assert.False(t, ApplyImageWorkspaceEligibility("/v1/images/generations", "qwen-image-2.0-pro"))
	assert.True(t, ApplyImageWorkspaceEligibility("/pg/images/generations", "qwen-image-2.0-pro"))
	assert.False(t, ApplyImageWorkspaceEligibility("/pg/images/generations", "gpt-4o"))
}

func TestIsImageWorkspacePathExactMatch(t *testing.T) {
	assert.True(t, IsImageWorkspacePath("/pg/images/generations"))
	assert.True(t, IsImageWorkspacePath("/pg/images/generations/"))
	assert.False(t, IsImageWorkspacePath("/pg/images/generations/extra"))
	assert.False(t, IsImageWorkspacePath("/v1/images/generations"))
	assert.False(t, IsImageWorkspacePath("/pg/chat/completions"))
	assert.False(t, IsImageWorkspacePath(""))
}

func TestIsChatExcludedModelUsesSharedFamilyDetector(t *testing.T) {
	assert.True(t, IsChatExcludedModel("qwen-image-2.0-pro"))
	assert.True(t, IsChatExcludedModel("wan2.7-image"))
	assert.True(t, IsChatExcludedModel("Doubao-Seedream-5.0-lite"))
	assert.True(t, IsChatExcludedModel("dall-e-3"))
	assert.False(t, IsChatExcludedModel("gpt-4o"))
}

func TestBuildImageCapabilityModelsRequiresExactProfileAndEligibleChannel(t *testing.T) {
	models := BuildImageCapabilityModels([]EligibleImageAbility{
		{Model: "qwen-image-2.0-pro", ChannelType: constant.ChannelTypeOpenAI},
		{Model: "qwen-image-2.0-pro", ChannelType: constant.ChannelTypeAli},
		{Model: "wan2.7-image", ChannelType: constant.ChannelTypeAli},
		{Model: "gpt-4o", ChannelType: constant.ChannelTypeOpenAI},
		{Model: "Doubao-Seedream-5.0-pro", ChannelType: constant.ChannelTypeVolcEngine},
	})
	require.Len(t, models, 2)
	assert.Equal(t, "Doubao-Seedream-5.0-pro", models[0].Model)
	assert.Equal(t, ProviderVolcEngine, models[0].Provider)
	assert.Equal(t, "qwen-image-2.0-pro", models[1].Model)
	assert.Equal(t, ProviderAli, models[1].Provider)
}

// TestBuildImageCapabilityModelsExposesQwenImage30 verifies that the Qwen
// Image 3.0 family is advertised with the Ali provider and the exact Auto
// size / prompt_extend_mode / enable_thinking profile, and that an unknown
// Qwen version without a verified profile is never advertised.
func TestBuildImageCapabilityModelsExposesQwenImage30(t *testing.T) {
	models := BuildImageCapabilityModels([]EligibleImageAbility{
		{Model: "qwen-image-3.0", ChannelType: constant.ChannelTypeAli},
		{Model: "qwen-image-3.0-pro", ChannelType: constant.ChannelTypeAli},
		{Model: "qwen-image-9.9", ChannelType: constant.ChannelTypeAli},
	})
	require.Len(t, models, 2)
	byModel := map[string]CapabilityModel{}
	for _, m := range models {
		byModel[m.Model] = m
	}

	for _, name := range []string{"qwen-image-3.0", "qwen-image-3.0-pro"} {
		m, ok := byModel[name]
		require.True(t, ok, name)
		assert.Equal(t, ProviderAli, m.Provider)
		require.NotNil(t, m.Profile)
		assert.True(t, m.Profile.SupportsAutoSize)
		assert.Equal(t, "Auto", m.Profile.DefaultSize)
		assert.True(t, m.Profile.SupportsPromptExtendMode)
		assert.True(t, m.Profile.SupportsThinkingMode)
		assert.True(t, m.Profile.ThinkingRequiresExtend)
		assert.True(t, m.Profile.AgentRequiresNoRefs)
		assert.Equal(t, IntRange{Min: 1, Max: 6, Default: 1}, m.Profile.NRange)
		assert.Equal(t, 3, m.Profile.MaxReferenceImages)
	}

	// The unknown Qwen version has no profile and must not be advertised.
	_, exists := byModel["qwen-image-9.9"]
	assert.False(t, exists)
}

// TestBuildImageCapabilityModelsHidesQwen20WithoutAbility documents that a
// Qwen model only appears when an enabled ability is present; the catalog is
// driven by abilities, so a model with metadata but no enabled ability is
// simply absent from the input and therefore absent from the output.
func TestBuildImageCapabilityModelsHidesQwen20WithoutAbility(t *testing.T) {
	// Only qwen-image-3.0 has an enabled ability here; qwen-image-2.0 is not
	// passed in at all (it has no enabled ability in production).
	models := BuildImageCapabilityModels([]EligibleImageAbility{
		{Model: "qwen-image-3.0", ChannelType: constant.ChannelTypeAli},
	})
	require.Len(t, models, 1)
	assert.Equal(t, "qwen-image-3.0", models[0].Model)
	for _, m := range models {
		assert.NotEqual(t, "qwen-image-2.0", m.Model)
		assert.NotEqual(t, "qwen-image-2.0-pro", m.Model)
	}
}

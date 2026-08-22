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

	"github.com/stretchr/testify/assert"
)

func TestIsNonChatModelExcludesAllMediaFamilies(t *testing.T) {
	nonChat := []string{
		// Image — full catalog of current production image models
		"Doubao-Seedream-5.0-lite",
		"Doubao-Seedream-5.0-pro",
		"qwen-image-2.0",
		"qwen-image-2.0-pro",
		"wan2.7-image-pro",
		"cogview-4",
		"dall-e-3",
		"gpt-image-1",
		"imagen-3.0",
		"flux.1-schnell",
		// Video — Volcengine Seedance family
		"Doubao-Seedance-1.5-pro",
		"Doubao-Seedance-2.0",
		// TTS — Volcengine Doubao TTS + MiniMax mimo TTS
		"Doubao-tts",
		"Doubao-tts2.0",
		"mimo-v2.5-tts",
		// 3D — Volcengine Seed3D + Hitem3D + Hyper3D
		"Doubao-Seed3D-2.0",
		"Hitem3D-2.0",
		"Hyper3D-Gen2",
	}
	for _, model := range nonChat {
		assert.Truef(t, IsNonChatModel(model), "expected %q to be non-chat", model)
		assert.Truef(t, IsChatExcludedModel(model), "IsChatExcludedModel(%q) must mirror IsNonChatModel", model)
	}
}

func TestIsNonChatModelKeepsChatAndOmniModels(t *testing.T) {
	chat := []string{
		"gpt-4o",
		"gpt-4o-mini",
		"o1-preview",
		"o3-mini",
		"claude-3-5-sonnet",
		"claude-sonnet-4",
		"gemini-2.0-flash",
		"gemini-1.5-pro",
		"deepseek-chat",
		"deepseek-v3",
		"kimi-k2.5",
		"kimi-k2.6",
		"qwen3-7",
		"qwen3-5",
		"qwen3-6",
		"qwen3.5",
		"glm-5",
		"glm-5.1",
		"minimax-m2.5",
		"MiniMax-M2.5",
		// MiniMax mimo chat models must NOT be hidden by the TTS family
		// marker. Only the explicit `mimo-v2.5-tts` model is media-only;
		// `mimo-v2.5` and `mimo-v2.5-pro` are chat models and the broader
		// `mimo-` prefix would silently hide them, which is exactly the
		// kind of over-match the chat eligibility guard must avoid.
		"mimo-v2.5",
		"mimo-v2.5-pro",
		"omni-1",
		"doubao-pro",
		"doubao-lite",
	}
	for _, model := range chat {
		assert.Falsef(t, IsNonChatModel(model), "expected %q to remain chat-eligible", model)
		assert.Falsef(t, IsChatExcludedModel(model), "IsChatExcludedModel(%q) must mirror IsNonChatModel", model)
	}
}

func TestIsNonChatModelFailCompatibleOnUnknownModel(t *testing.T) {
	// New upstream chat release whose family marker we have not registered.
	// Must stay chat-eligible so users are not silently hidden from new
	// chat models.
	assert.False(t, IsNonChatModel("brand-new-chat-model-2026"))
	assert.False(t, IsNonChatModel("some-future-omni-9"))
}

func TestIsNonChatModelEmptyInput(t *testing.T) {
	assert.False(t, IsNonChatModel(""))
	assert.False(t, IsNonChatModel("   "))
}

func TestIsNonChatModelCaseInsensitive(t *testing.T) {
	assert.True(t, IsNonChatModel("DOUBAO-SEEDANCE-1.5-PRO"))
	assert.True(t, IsNonChatModel("doubao-seedance-1.5-pro"))
	assert.True(t, IsNonChatModel("Doubao-Seedance-1.5-pro"))
	assert.True(t, IsNonChatModel("QWEN-IMAGE-2.0-PRO"))
	assert.True(t, IsNonChatModel("MIMO-V2.5-TTS"))
}

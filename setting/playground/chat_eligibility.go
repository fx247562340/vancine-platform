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
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// Chat eligibility — family membership catalog.
//
// The Chat playground must hide and reject models that are not usable on a
// chat-completions relay. We compose four narrow family detectors (Image /
// Video / TTS / 3D) and leave the universe of unrecognized names as eligible.
//
// The list is the single source of truth shared by:
//   - GET /api/user/models?modality=chat  (server-side list filter)
//   - POST /pg/chat/completions          (defensive rejection in Playground)
//   - any future Chat-side UI label
//
// Fail-compatible: unknown models stay eligible so a new upstream Chat
// release is never silently hidden from users. Do not replace this with a
// broad "contains video/3d" substring check, which would over-match normal
// chat or omni models.

// mediaModelFamilies is the union of explicit media-only family markers
// (video / TTS / 3D) used by the Chat playground. Image family membership
// is delegated entirely to common.IsImageGenerationModel so the chat and
// image surfaces share one source of truth; do not reintroduce an image
// list here.
//
// Each entry is matched case-insensitively as a substring against the model
// name. Membership is family-driven, not capability-driven, because a
// model without an Image profile can still belong to a media family.
var mediaModelFamilies = []string{
	// Video — Volcengine Seedance family is the only Video model in the
	// current production catalog. New families (Kling, Jimeng, Sora, …)
	// extend this list explicitly instead of via a wildcard.
	"doubao-seedance",
	// TTS — Volcengine Doubao TTS plus explicit MiniMax mimo TTS model.
	// Use specific family markers so chat-only models such as mimo-v2.5
	// are not over-matched. New TTS families add an explicit marker; the
	// fail-compatible default is to leave unknown models visible.
	"doubao-tts",
	"mimo-v2.5-tts",
	// 3D — Volcengine Seed3D plus third-party Hitem3D and Hyper3D.
	"doubao-seed3d",
	"hitem3d",
	"hyper3d",
}

// IsNonChatModel reports whether the model belongs to a non-chat media
// family (image, video, TTS, 3D) and therefore must be hidden from and
// rejected by the Chat playground. Unknown models return false so that new
// upstream Chat releases are not silently hidden.
func IsNonChatModel(modelName string) bool {
	if modelName == "" {
		return false
	}
	if common.IsImageGenerationModel(modelName) {
		return true
	}
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	if normalized == "" {
		return false
	}
	for _, marker := range mediaModelFamilies {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

// IsChatExcludedModel reports whether Chat playground must hide and reject
// the model. Family membership is shared with the server-side list filter
// and the controller, so the three surfaces cannot drift apart.
func IsChatExcludedModel(model string) bool {
	return IsNonChatModel(model)
}

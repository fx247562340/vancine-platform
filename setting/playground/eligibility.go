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
	"net/url"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/constant"
)

const (
	ProviderAli        = "Ali"
	ProviderVolcEngine = "VolcEngine"
	imageWorkspacePath = "/pg/images/generations"
)

// IsImageWorkspacePath reports whether the request is the Image Workspace
// generation seam. Provider eligibility applies only on this exact path.
func IsImageWorkspacePath(requestPath string) bool {
	if requestPath == "" {
		return false
	}
	parsed, err := url.Parse(requestPath)
	if err != nil {
		return false
	}
	cleaned := path.Clean(parsed.Path)
	if cleaned != "/" {
		cleaned = strings.TrimSuffix(cleaned, "/")
	}
	return cleaned == imageWorkspacePath
}

// ApplyImageWorkspaceEligibility reports whether channel selection must
// restrict providers for this request. /v1/* keeps the original behavior.
func ApplyImageWorkspaceEligibility(requestPath, model string) bool {
	if !IsImageWorkspacePath(requestPath) {
		return false
	}
	_, ok := RequiredChannelType(model)
	return ok
}

// ChannelEligibleForRequest reports whether a channel type may serve the
// model for this request path. Non-playground paths are unrestricted.
func ChannelEligibleForRequest(requestPath string, channelType int, model string) bool {
	if !IsImageWorkspacePath(requestPath) {
		return true
	}
	return ChannelTypeEligibleForModel(channelType, model)
}

// RequiredChannelType returns the only channel type that may serve this image
// model on the Image Workspace path. ok is false when the model has no
// playground image provider constraint.
func RequiredChannelType(model string) (int, bool) {
	key := normalizeModelName(model)
	if strings.Contains(key, "seedream") {
		return constant.ChannelTypeVolcEngine, true
	}
	if strings.Contains(key, "qwen-image") || isWanImageModel(key) {
		return constant.ChannelTypeAli, true
	}
	return 0, false
}

// ChannelTypeEligibleForModel reports whether a channel type may serve the model
// when Image Workspace eligibility is active.
func ChannelTypeEligibleForModel(channelType int, model string) bool {
	required, ok := RequiredChannelType(model)
	if !ok {
		return true
	}
	return channelType == required
}

// ProviderName returns the display name for a constrained image provider.
func ProviderName(channelType int) string {
	switch channelType {
	case constant.ChannelTypeAli:
		return ProviderAli
	case constant.ChannelTypeVolcEngine:
		return ProviderVolcEngine
	default:
		return ""
	}
}

// IsChatExcludedModel lives in chat_eligibility.go and shares the same
// family-driven predicate used by the server-side list filter and the
// defensive controller rejection, so the three surfaces cannot drift apart.

func isWanImageModel(model string) bool {
	if !strings.Contains(model, "wan") {
		return false
	}
	if strings.Contains(model, "t2v") || strings.Contains(model, "i2v") || strings.Contains(model, "video") {
		return false
	}
	if strings.Contains(model, "image") {
		return true
	}
	return strings.Contains(model, "wan2.6") || strings.Contains(model, "wan2.7")
}

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

import "sort"

// CapabilityModel describes an image model available for the current user/group.
type CapabilityModel struct {
	Model    string             `json:"model"`
	Provider string             `json:"provider"`
	Profile  *ImageModelProfile `json:"profile"`
}

// CapabilityResponse is returned by GET /pg/capabilities.
type CapabilityResponse struct {
	Modality string            `json:"modality"`
	Group    string            `json:"group"`
	Groups   []string          `json:"groups"`
	Models   []CapabilityModel `json:"models"`
}

// EligibleImageAbility is the channel-join row used to build capabilities.
type EligibleImageAbility struct {
	Model       string
	ChannelType int
}

// BuildImageCapabilityModels keeps models that have a profile and at least one
// eligible channel. Ineligible higher-priority channels cannot hide a later
// eligible channel for the same model.
func BuildImageCapabilityModels(abilities []EligibleImageAbility) []CapabilityModel {
	seen := make(map[string]CapabilityModel)
	for _, ability := range abilities {
		if ability.Model == "" {
			continue
		}
		if _, exists := seen[ability.Model]; exists {
			continue
		}
		if !HasImageProfile(ability.Model) {
			continue
		}
		if !ChannelTypeEligibleForModel(ability.ChannelType, ability.Model) {
			continue
		}
		profile := ImageProfile(ability.Model)
		if profile == nil {
			continue
		}
		seen[ability.Model] = CapabilityModel{
			Model:    ability.Model,
			Provider: ProviderName(ability.ChannelType),
			Profile:  profile,
		}
	}

	models := make([]CapabilityModel, 0, len(seen))
	for _, model := range seen {
		models = append(models, model)
	}
	sort.Slice(models, func(i, j int) bool {
		return models[i].Model < models[j].Model
	})
	return models
}

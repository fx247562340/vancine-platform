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
package volcengine

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// seedream5ImageRequest is the VolcEngine ImageGenerations body for Seedream 5.
// Official generations accept a single `image` field (string or string[]).
// They do not accept images, n, seed, or OpenAI/Ali-only fields.
// n=1 remains on the internal ImageRequest for validation and billing.
type seedream5ImageRequest struct {
	Model          string          `json:"model"`
	Prompt         string          `json:"prompt"`
	Size           string          `json:"size,omitempty"`
	ResponseFormat string          `json:"response_format,omitempty"`
	Watermark      *bool           `json:"watermark,omitempty"`
	Image          json.RawMessage `json:"image,omitempty"`
}

func isSeedream5(model string) bool {
	return strings.Contains(strings.ToLower(model), "seedream-5")
}

func convertSeedream5ImageRequest(request dto.ImageRequest) (seedream5ImageRequest, error) {
	watermark := request.Watermark
	if watermark == nil {
		disabled := false
		watermark = &disabled
	}
	image, err := normalizeSeedream5ImageField(request.Image, request.Images)
	if err != nil {
		return seedream5ImageRequest{}, err
	}
	return seedream5ImageRequest{
		Model:          request.Model,
		Prompt:         request.Prompt,
		Size:           request.Size,
		ResponseFormat: request.ResponseFormat,
		Watermark:      watermark,
		Image:          image,
	}, nil
}

func normalizeSeedream5ImageField(image, images json.RawMessage) (json.RawMessage, error) {
	urls, err := parseSeedreamImageValues(image)
	if err != nil {
		return nil, err
	}
	extra, err := parseSeedreamImageValues(images)
	if err != nil {
		return nil, err
	}
	urls = append(urls, extra...)
	if len(urls) == 0 {
		return nil, nil
	}
	if len(urls) == 1 {
		payload, err := common.Marshal(urls[0])
		if err != nil {
			return nil, err
		}
		return payload, nil
	}
	payload, err := common.Marshal(urls)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func parseSeedreamImageValues(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil, nil
	}
	var single string
	if err := common.Unmarshal([]byte(trimmed), &single); err == nil {
		single = strings.TrimSpace(single)
		if single == "" {
			return nil, nil
		}
		return []string{single}, nil
	}
	var many []string
	if err := common.Unmarshal([]byte(trimmed), &many); err != nil {
		return nil, fmt.Errorf("image must be a string or array of strings")
	}
	urls := make([]string, 0, len(many))
	for _, item := range many {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		urls = append(urls, item)
	}
	return urls, nil
}

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
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// Playground image generation accepts only this explicit field set.
// group is used for playground channel selection and is stripped before relay.
var allowedPlaygroundImageFields = map[string]struct{}{
	"model":              {},
	"group":              {},
	"prompt":             {},
	"n":                  {},
	"size":               {},
	"response_format":    {},
	"image":              {},
	"images":             {},
	"negative_prompt":    {},
	"seed":               {},
	"watermark":          {},
	"prompt_extend":      {},
	"prompt_extend_mode": {},
	"thinking_mode":      {},
}

var allowedPlaygroundResponseFormats = map[string]struct{}{
	"":         {},
	"url":      {},
	"b64_json": {},
}

// ParsePlaygroundImageRequest enforces the Vancine Playground Image contract.
// Unknown fields, Extra passthrough, and vendor-only parameters are rejected
// before billing and upstream.
func ParsePlaygroundImageRequest(data []byte) (*dto.ImageRequest, error) {
	var fields map[string]json.RawMessage
	if err := common.Unmarshal(data, &fields); err != nil {
		return nil, fmt.Errorf("invalid image request")
	}
	for key := range fields {
		if _, ok := allowedPlaygroundImageFields[key]; !ok {
			return nil, fmt.Errorf("field %s is not allowed", key)
		}
	}

	var req dto.ImageRequest
	if err := common.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("invalid image request")
	}
	if err := rejectDisallowedImageRequestFields(&req); err != nil {
		return nil, err
	}
	format := strings.TrimSpace(req.ResponseFormat)
	if _, ok := allowedPlaygroundResponseFormats[format]; !ok {
		return nil, fmt.Errorf("response_format %q is not supported", req.ResponseFormat)
	}
	req.Extra = nil
	return &req, nil
}

func rejectDisallowedImageRequestFields(req *dto.ImageRequest) error {
	if req == nil {
		return fmt.Errorf("image request is required")
	}
	for key := range req.Extra {
		if key == "group" {
			continue
		}
		return fmt.Errorf("field %s is not allowed", key)
	}
	if req.Quality != "" {
		return fmt.Errorf("field quality is not allowed")
	}
	if len(req.Style) > 0 {
		return fmt.Errorf("field style is not allowed")
	}
	if len(req.User) > 0 {
		return fmt.Errorf("field user is not allowed")
	}
	if len(req.ExtraFields) > 0 {
		return fmt.Errorf("field extra_fields is not allowed")
	}
	if len(req.Background) > 0 {
		return fmt.Errorf("field background is not allowed")
	}
	if len(req.Moderation) > 0 {
		return fmt.Errorf("field moderation is not allowed")
	}
	if len(req.OutputFormat) > 0 {
		return fmt.Errorf("field output_format is not allowed")
	}
	if len(req.OutputCompression) > 0 {
		return fmt.Errorf("field output_compression is not allowed")
	}
	if len(req.PartialImages) > 0 {
		return fmt.Errorf("field partial_images is not allowed")
	}
	if req.Stream != nil {
		return fmt.Errorf("field stream is not allowed")
	}
	if len(req.Mask) > 0 {
		return fmt.Errorf("field mask is not allowed")
	}
	if len(req.InputFidelity) > 0 {
		return fmt.Errorf("field input_fidelity is not allowed")
	}
	if len(req.WatermarkEnabled) > 0 {
		return fmt.Errorf("field watermark_enabled is not allowed")
	}
	if len(req.UserId) > 0 {
		return fmt.Errorf("field user_id is not allowed")
	}
	return nil
}

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
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

const (
	maxSingleImageBytes     = 10 * 1024 * 1024
	maxTotalReferenceBytes  = 30 * 1024 * 1024
	maxTotalReferenceImages = 20
)

// ReferenceImage is a validated reference image from the playground request.
type ReferenceImage struct {
	URL         string
	IsDataURL   bool
	MIMEType    string
	DecodedSize int
}

// ValidatePlaygroundImageRequest validates image generation parameters against
// the model profile. All failures happen before billing and upstream.
func ValidatePlaygroundImageRequest(req *dto.ImageRequest, profile *ImageModelProfile) error {
	if req == nil {
		return fmt.Errorf("image request is required")
	}
	if strings.TrimSpace(req.Model) == "" {
		return fmt.Errorf("model is required")
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return fmt.Errorf("prompt is required")
	}
	if profile == nil {
		return fmt.Errorf("model %s does not have an image profile", req.Model)
	}

	if req.N != nil {
		// Compare in uint BEFORE any int conversion: a huge JSON number
		// (e.g. a wrapped negative) would silently change value via int(*req.N)
		// and reach billing as a multiplier.
		un := *req.N
		minAllowed := uint(1)
		if profile.NRange.Min > 1 {
			minAllowed = uint(profile.NRange.Min)
		}
		if un < minAllowed || un > uint(profile.NRange.Max) || un > uint(dto.MaxImageN) {
			return fmt.Errorf("n must be between %d and %d, got %d", profile.NRange.Min, profile.NRange.Max, un)
		}
	}

	if err := rejectDisallowedImageRequestFields(req); err != nil {
		return err
	}
	req.Extra = nil

	if req.NegativePrompt != nil {
		if !profile.SupportsNegativePrompt {
			return fmt.Errorf("model %s does not support negative_prompt", req.Model)
		}
		if profile.MaxNegativePromptChars > 0 && utf8.RuneCountInString(*req.NegativePrompt) > profile.MaxNegativePromptChars {
			return fmt.Errorf("negative_prompt exceeds maximum length of %d characters", profile.MaxNegativePromptChars)
		}
	}

	if req.Seed != nil {
		if !profile.SupportsSeed {
			return fmt.Errorf("model %s does not support seed", req.Model)
		}
		if profile.SeedRange != nil {
			seed := *req.Seed
			if seed < profile.SeedRange.Min || seed > profile.SeedRange.Max {
				return fmt.Errorf("seed must be between %d and %d, got %d", profile.SeedRange.Min, profile.SeedRange.Max, seed)
			}
		}
	}

	if req.Watermark != nil && !profile.SupportsWatermark {
		return fmt.Errorf("model %s does not support watermark", req.Model)
	}
	if req.PromptExtend != nil && !profile.SupportsPromptExtend {
		return fmt.Errorf("model %s does not support prompt_extend", req.Model)
	}
	if req.ThinkingMode != nil && !profile.SupportsThinkingMode {
		return fmt.Errorf("model %s does not support thinking_mode", req.Model)
	}

	// Qwen Image 3.0 contract: prompt_extend_mode is the explicit
	// direct / agent selector. agent is only legal for text-to-image; when
	// reference images are attached the request is rejected before billing
	// and upstream.
	var promptExtendMode string
	if req.PromptExtendMode != nil {
		promptExtendMode = strings.ToLower(strings.TrimSpace(*req.PromptExtendMode))
		if !profile.SupportsPromptExtendMode {
			return fmt.Errorf("model %s does not support prompt_extend_mode", req.Model)
		}
		if promptExtendMode != "direct" && promptExtendMode != "agent" {
			return fmt.Errorf("prompt_extend_mode must be 'direct' or 'agent', got %q", *req.PromptExtendMode)
		}
	}

	// Qwen Image 3.0 contract: enable_thinking may only be true when
	// prompt_extend is also true. prompt_extend=false + enable_thinking=true
	// is rejected before billing and upstream.
	enableThinking := req.ThinkingMode != nil && *req.ThinkingMode
	promptExtendOn := req.PromptExtend == nil || *req.PromptExtend
	if profile.ThinkingRequiresExtend && enableThinking && !promptExtendOn {
		return fmt.Errorf("enable_thinking requires prompt_extend=true for model %s", req.Model)
	}

	images, err := ExtractReferenceImagesFromRequest(req)
	if err != nil {
		return err
	}
	if profile.AgentRequiresNoRefs && promptExtendMode == "agent" && len(images) > 0 {
		return fmt.Errorf("prompt_extend_mode 'agent' is not allowed with reference images for model %s", req.Model)
	}
	if err := validatePlaygroundImageSize(req.Size, req.Model, profile, len(images) > 0); err != nil {
		return err
	}
	return ValidateReferenceImages(images, profile, req.Model, req.Size)
}

func allowedReferenceMIMETypes(profile *ImageModelProfile) []string {
	if profile != nil && len(profile.AllowedReferenceMIMETypes) > 0 {
		return profile.AllowedReferenceMIMETypes
	}
	return []string{"image/jpeg", "image/png", "image/webp"}
}

func isAllowedReferenceMIME(mime string, allowed []string) bool {
	normalized := strings.ToLower(strings.TrimSpace(mime))
	if normalized == "image/jpg" {
		normalized = "image/jpeg"
	}
	for _, candidate := range allowed {
		want := strings.ToLower(strings.TrimSpace(candidate))
		if want == "image/jpg" {
			want = "image/jpeg"
		}
		if normalized == want {
			return true
		}
	}
	return false
}

func validatePlaygroundImageSize(size, model string, profile *ImageModelProfile, hasRefs bool) error {
	if size == "" {
		return nil
	}
	if isAutoSize(size) {
		if !profile.SupportsAutoSize {
			return fmt.Errorf("size 'Auto' is not supported for model %s", model)
		}
		if hasRefs {
			return fmt.Errorf("size 'Auto' is not supported with reference images for model %s", model)
		}
		return nil
	}
	if isPresetSize(size, profile) {
		if hasRefs && strings.EqualFold(size, "4K") && isWanImageModel(normalizeModelName(model)) {
			return fmt.Errorf("model %s does not support reference images at 4K resolution", model)
		}
		return nil
	}
	width, height, ok := parseWidthHeight(size)
	if !ok || !profile.SupportsCustomSize {
		return fmt.Errorf("size %q is not supported for model %s, supported sizes: %v", size, model, profile.Sizes)
	}
	return validateCustomImageSize(width, height, profile, hasRefs)
}

func isAutoSize(size string) bool {
	return strings.EqualFold(strings.TrimSpace(size), "Auto")
}

func validateCustomImageSize(width, height int, profile *ImageModelProfile, hasRefs bool) error {
	pixels, err := multiplyPixels(width, height)
	if err != nil {
		return err
	}
	if profile.MinPixels > 0 && pixels < profile.MinPixels {
		return fmt.Errorf("image size must be at least %d pixels", profile.MinPixels)
	}
	maxPixels := profile.MaxPixels
	if hasRefs && profile.MaxPixelsWithRefs > 0 {
		maxPixels = profile.MaxPixelsWithRefs
	}
	if maxPixels > 0 && pixels > maxPixels {
		return fmt.Errorf("image size must be at most %d pixels", maxPixels)
	}
	return validateAspectRatio(width, height, profile)
}

func isPresetSize(size string, profile *ImageModelProfile) bool {
	for _, candidate := range profile.Sizes {
		if candidate == size {
			return true
		}
	}
	return false
}

func parseWidthHeight(size string) (int, int, bool) {
	if size != strings.TrimSpace(size) {
		return 0, 0, false
	}
	widthStr, heightStr, found := strings.Cut(size, "x")
	if !found || strings.Contains(heightStr, "x") {
		return 0, 0, false
	}
	width, ok := parseStrictDimension(widthStr)
	if !ok {
		return 0, 0, false
	}
	height, ok := parseStrictDimension(heightStr)
	if !ok {
		return 0, 0, false
	}
	return width, height, true
}

func parseStrictDimension(value string) (int, bool) {
	if value == "" || strings.ContainsAny(value, "+-. ") {
		return 0, false
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

func multiplyPixels(width, height int) (int64, error) {
	if width <= 0 || height <= 0 {
		return 0, fmt.Errorf("invalid image dimensions")
	}
	w := int64(width)
	h := int64(height)
	if h > 0 && w > math.MaxInt64/h {
		return 0, fmt.Errorf("image size overflows")
	}
	return w * h, nil
}

func validateAspectRatio(width, height int, profile *ImageModelProfile) error {
	if profile.MinAspectRatio != nil {
		ok, err := aspectAtLeast(width, height, *profile.MinAspectRatio)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("image aspect ratio must be at least %d:%d", profile.MinAspectRatio.Width, profile.MinAspectRatio.Height)
		}
	}
	if profile.MaxAspectRatio != nil {
		ok, err := aspectAtMost(width, height, *profile.MaxAspectRatio)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("image aspect ratio must be at most %d:%d", profile.MaxAspectRatio.Width, profile.MaxAspectRatio.Height)
		}
	}
	return nil
}

func aspectAtLeast(width, height int, min AspectRatio) (bool, error) {
	// width/height >= min.Width/min.Height  <=>  width*min.Height >= height*min.Width
	left, err := multiplyPixels(width, min.Height)
	if err != nil {
		return false, err
	}
	right, err := multiplyPixels(height, min.Width)
	if err != nil {
		return false, err
	}
	return left >= right, nil
}

func aspectAtMost(width, height int, max AspectRatio) (bool, error) {
	// width/height <= max.Width/max.Height  <=>  width*max.Height <= height*max.Width
	left, err := multiplyPixels(width, max.Height)
	if err != nil {
		return false, err
	}
	right, err := multiplyPixels(height, max.Width)
	if err != nil {
		return false, err
	}
	return left <= right, nil
}

// ExtractReferenceImagesFromRequest reads image / images from an OpenAI image request.
func ExtractReferenceImagesFromRequest(req *dto.ImageRequest) ([]ReferenceImage, error) {
	if req == nil {
		return nil, nil
	}
	urls, err := parseImageURLList(req.Image)
	if err != nil {
		return nil, err
	}
	extra, err := parseImageURLList(req.Images)
	if err != nil {
		return nil, err
	}
	urls = append(urls, extra...)

	images := make([]ReferenceImage, 0, len(urls))
	for _, raw := range urls {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		ref := ReferenceImage{URL: raw}
		if isDataURL(raw) {
			ref.IsDataURL = true
			mimeType, decodedSize, parseErr := parseDataURL(raw)
			if parseErr != nil {
				return nil, parseErr
			}
			ref.MIMEType = mimeType
			ref.DecodedSize = decodedSize
		} else if err := validateRemoteReferenceURL(raw); err != nil {
			return nil, err
		}
		images = append(images, ref)
	}
	return images, nil
}

func isDataURL(raw string) bool {
	return strings.HasPrefix(strings.ToLower(raw), "data:")
}

func validateRemoteReferenceURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid reference image URL")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("reference image URL must use http or https")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return fmt.Errorf("reference image URL must include a host")
	}
	return nil
}

func parseImageURLList(raw []byte) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var single string
	if err := common.Unmarshal(raw, &single); err == nil {
		if strings.TrimSpace(single) == "" {
			return nil, nil
		}
		return []string{single}, nil
	}
	var many []string
	if err := common.Unmarshal(raw, &many); err != nil {
		return nil, fmt.Errorf("reference images must be a string or array of strings")
	}
	return many, nil
}

func parseDataURL(dataURL string) (string, int, error) {
	comma := strings.Index(dataURL, ",")
	if comma < 0 {
		return "", 0, fmt.Errorf("malformed data URL")
	}
	if comma < 5 {
		return "", 0, fmt.Errorf("malformed data URL")
	}
	meta := dataURL[5:comma]
	if !strings.Contains(strings.ToLower(meta), ";base64") {
		return "", 0, fmt.Errorf("data URL must use ;base64 encoding")
	}
	mimeType := strings.ToLower(strings.TrimSpace(meta))
	if semi := strings.Index(mimeType, ";"); semi >= 0 {
		mimeType = strings.TrimSpace(mimeType[:semi])
	}
	payload := strings.TrimSpace(dataURL[comma+1:])
	if payload == "" {
		return mimeType, 0, fmt.Errorf("empty base64 payload")
	}
	if len(payload) > maxSingleImageBytes*4/3+16 {
		return mimeType, 0, fmt.Errorf("reference image exceeds maximum size of %d MB", maxSingleImageBytes/(1024*1024))
	}
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(payload)
		if err != nil {
			return mimeType, 0, fmt.Errorf("invalid base64 payload")
		}
	}
	if len(decoded) == 0 {
		return mimeType, 0, fmt.Errorf("empty base64 payload")
	}
	return mimeType, len(decoded), nil
}

// ValidateReferenceImages checks reference images against the model profile.
func ValidateReferenceImages(images []ReferenceImage, profile *ImageModelProfile, modelName string, size string) error {
	if profile == nil {
		return fmt.Errorf("model %s does not have an image profile", modelName)
	}
	if len(images) == 0 {
		return nil
	}
	if profile.MaxReferenceImages <= 0 {
		return fmt.Errorf("model %s does not support reference images", modelName)
	}
	if strings.EqualFold(size, "4K") && isWanImageModel(normalizeModelName(modelName)) {
		return fmt.Errorf("model %s does not support reference images at 4K resolution", modelName)
	}
	if len(images) > maxTotalReferenceImages {
		return fmt.Errorf("too many reference images: %d (maximum %d)", len(images), maxTotalReferenceImages)
	}
	if len(images) > profile.MaxReferenceImages {
		return fmt.Errorf("too many reference images for model %s: %d (maximum %d)", modelName, len(images), profile.MaxReferenceImages)
	}

	totalBytes := 0
	for _, img := range images {
		if !img.IsDataURL {
			continue
		}
		if !isAllowedReferenceMIME(img.MIMEType, allowedReferenceMIMETypes(profile)) {
			return fmt.Errorf("unsupported reference image MIME type: %s", img.MIMEType)
		}
		if img.DecodedSize > maxSingleImageBytes {
			return fmt.Errorf("reference image exceeds maximum size of %d MB", maxSingleImageBytes/(1024*1024))
		}
		totalBytes += img.DecodedSize
	}
	if totalBytes > maxTotalReferenceBytes {
		return fmt.Errorf("total reference image size exceeds maximum of %d MB", maxTotalReferenceBytes/(1024*1024))
	}
	return nil
}

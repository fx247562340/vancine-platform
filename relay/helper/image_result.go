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
package helper

import (
	"encoding/base64"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/tidwall/gjson"
)

// IsUsableImageHTTPURL reports whether raw is an http(s) URL with a host.
func IsUsableImageHTTPURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return false
	}
	return strings.TrimSpace(parsed.Host) != ""
}

// Generated-image Base64 payloads are validated with one linear structure
// scan plus a bounded header decode: the payload is never fully decoded or
// copied just to prove it is an image.
const (
	generatedImageB64PrefixChars = 16 // enough alphabet chars for a 12-byte header
	generatedImageHeaderBytes    = 12
)

func isBase64WhitespaceByte(c byte) bool {
	switch c {
	case ' ', '\t', '\n', '\r', '\f':
		return true
	}
	return false
}

func isBase64AlphabetByte(c byte) bool {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/'
}

// decodeBase64HeaderPrefix decodes only the captured leading alphabet chars
// (padding-less) into a bounded header slice.
func decodeBase64HeaderPrefix(prefix []byte) ([]byte, bool) {
	if len(prefix) == 0 {
		return nil, false
	}
	decoded, err := base64.RawStdEncoding.DecodeString(string(prefix))
	if err != nil || len(decoded) == 0 {
		return nil, false
	}
	if len(decoded) > generatedImageHeaderBytes {
		decoded = decoded[:generatedImageHeaderBytes]
	}
	return decoded, true
}

// hasGeneratedImageSignature matches the same signatures as the frontend
// inspectBase64Image: PNG, JPEG, GIF, WebP.
func hasGeneratedImageSignature(header []byte) bool {
	if len(header) >= 8 &&
		header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4e && header[3] == 0x47 &&
		header[4] == 0x0d && header[5] == 0x0a && header[6] == 0x1a && header[7] == 0x0a {
		return true // PNG
	}
	if len(header) >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff {
		return true // JPEG
	}
	if len(header) >= 6 && header[0] == 'G' && header[1] == 'I' && header[2] == 'F' && header[3] == '8' &&
		(header[4] == '7' || header[4] == '9') && header[5] == 'a' {
		return true // GIF
	}
	if len(header) >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F' &&
		header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P' {
		return true // WebP
	}
	return false
}

// IsValidGeneratedImageBase64 reports whether raw is structurally valid
// base64 whose decoded payload really starts with an image signature
// (PNG / JPEG / GIF / WebP). Encoded plain text, corrupt base64, and wrong
// image headers are NOT valid generated-image payloads. The string is
// scanned once linearly; only the leading header chars are decoded.
func IsValidGeneratedImageBase64(raw string) bool {
	alphabetCount := 0
	paddingCount := 0
	seenPadding := false
	prefix := make([]byte, 0, generatedImageB64PrefixChars)
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if isBase64WhitespaceByte(c) {
			continue
		}
		if c == '=' {
			seenPadding = true
			paddingCount++
			if paddingCount > 2 {
				return false
			}
			continue
		}
		if seenPadding || !isBase64AlphabetByte(c) {
			return false
		}
		alphabetCount++
		if len(prefix) < generatedImageB64PrefixChars {
			prefix = append(prefix, c)
		}
	}
	if alphabetCount == 0 {
		return false
	}
	if paddingCount == 0 {
		if alphabetCount%4 == 1 {
			return false
		}
	} else if (alphabetCount+paddingCount)%4 != 0 {
		return false
	}
	header, ok := decodeBase64HeaderPrefix(prefix)
	if !ok {
		return false
	}
	return hasGeneratedImageSignature(header)
}

// HasUsableGeneratedImage reports whether a converted image item has a usable
// remote http(s) URL or a base64 payload that is structurally valid base64
// with a real PNG/JPEG/GIF/WebP signature. revised_prompt alone is not
// enough; javascript:, file:, and other non-http schemes are not success;
// encoded plain text is not success either.
func HasUsableGeneratedImage(imageURL, b64JSON string) bool {
	return IsUsableImageHTTPURL(imageURL) || IsValidGeneratedImageBase64(b64JSON)
}

// ImageDataHasUsableResult reports whether any converted image item is usable.
func ImageDataHasUsableResult(data []dto.ImageData) bool {
	for _, item := range data {
		if HasUsableGeneratedImage(item.Url, item.B64Json) {
			return true
		}
	}
	return false
}

// OpenAIImageBodyValidateUsable validates an OpenAI-compatible image body in
// a single linear scan. The result is the exact number of data[] items the
// client will receive, plus a boolean that is true only when:
//   - the data field is a JSON array;
//   - the array length is in [1, dto.MaxImageN] (every legitimate generation
//     is bounded; anything beyond that is treated as an upstream contract
//     violation);
//   - every item carries either a legal http(s) url or a base64 image
//     payload whose decoded header matches PNG/JPEG/GIF/WebP.
//
// The body is scanned exactly once via gjson: no item is copied or decoded
// beyond a 16-char base64 header prefix. There is no second-pass filter
// step, so the validated count is the count the client will see, and the
// caller can write the original body verbatim when ok is true.
func OpenAIImageBodyValidateUsable(body []byte) (count int, ok bool) {
	data := gjson.GetBytes(body, "data")
	if !data.IsArray() {
		return 0, false
	}
	items := data.Array()
	if len(items) == 0 {
		return 0, false
	}
	if len(items) > dto.MaxImageN {
		return 0, false
	}
	valid := 0
	for _, item := range items {
		if !IsUsableImageDataItem(item) {
			return 0, false
		}
		valid++
	}
	return valid, true
}

// OpenAIImageBodyUsableCount returns the number of data[] items that pass
// the production-level validity rules (legal http(s) URL, or valid base64
// image payload). revised_prompt-only items, non-string url/b64_json,
// non-http(s) URLs, and b64_json values that are not valid base64 image
// payloads do NOT count. The body is scanned once; no item is copied or
// decoded beyond a 16-char header prefix.
func OpenAIImageBodyUsableCount(body []byte) int {
	count, _ := OpenAIImageBodyValidateUsable(body)
	return count
}

// OpenAIImageBodyHasUsableResult reports whether an OpenAI-compatible image
// body contains at least one item that passes the production-level
// validity rules. The full contract (1..dto.MaxImageN items, all valid) is
// enforced by OpenAIImageBodyValidateUsable; this helper exists for tests
// and for call sites that only need a yes/no answer.
func OpenAIImageBodyHasUsableResult(body []byte) bool {
	_, ok := OpenAIImageBodyValidateUsable(body)
	return ok
}

// OpenAIImageBodyFilterUsable returns a new OpenAI-compatible image body
// whose data[] array contains only the items that pass the production-level
// validity rules. Other top-level fields (created, usage, ...) are kept
// verbatim. The returned bool is true when at least one usable item
// survives the filter.
//
// The input body is scanned once via gjson. No item is copied or decoded
// beyond a 16-char base64 header prefix. Caller still has to count the
// remaining data items for billing.
//
// The filter is intentionally strict: any item that fails the validity
// rules is treated as a contract violation and the whole filter returns
// (nil, false). This keeps the billed count, the delivered count, and the
// rendered data array length in lockstep, so the OpenaiImageHandler can
// safely fall back to writing the original body verbatim when the filter
// returns ok=true.
func OpenAIImageBodyFilterUsable(body []byte) ([]byte, bool) {
	if _, ok := OpenAIImageBodyValidateUsable(body); !ok {
		return nil, false
	}
	return body, true
}

func jsonStringIsUsableImageURL(result gjson.Result) bool {
	if result.Type != gjson.String {
		return false
	}
	return IsUsableImageHTTPURL(result.Str)
}

// IsUsableImageDataItem reports whether a single gjson item from an
// OpenAI-style image data[] array passes the production-level validity
// rules: either a legal http(s) url, or a base64 image payload whose
// decoded header matches PNG/JPEG/GIF/WebP. revised_prompt-only items,
// non-string url/b64_json, non-http(s) URLs, and b64_json values that
// are not valid base64 image payloads are not success.
func IsUsableImageDataItem(item gjson.Result) bool {
	if !item.IsObject() {
		return false
	}
	if jsonStringIsUsableImageURL(item.Get("url")) {
		return true
	}
	return jsonRawStringIsValidImageBase64(item.Get("b64_json"))
}

// jsonRawStringIsValidImageBase64 validates a b64_json value straight from
// the raw JSON token (no copy of the large payload): base64 never needs JSON
// escaping, so any backslash disqualifies it.
func jsonRawStringIsValidImageBase64(result gjson.Result) bool {
	if result.Type != gjson.String {
		return false
	}
	raw := result.Raw
	if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
		return false
	}
	inner := raw[1 : len(raw)-1]
	if strings.IndexByte(inner, '\\') >= 0 {
		return false
	}
	return IsValidGeneratedImageBase64(inner)
}

// IsUsableImageEventPayload reports whether a gjson token from an SSE
// image_generation.completed / image_edit.completed event carries a
// deliverable image. The token is either a top-level "url" string or a
// top-level "b64_json" string. P13-B R16 calls this from the OpenAI image
// streaming relay to count only events that pass the same validity rules
// as the non-streaming path; the token is validated from the raw JSON
// bytes, so multi-MB base64 payloads are never copied into a Go string.
func IsUsableImageEventPayload(result gjson.Result) bool {
	if !result.Exists() {
		return false
	}
	return jsonStringIsUsableImageURL(result) || jsonRawStringIsValidImageBase64(result)
}

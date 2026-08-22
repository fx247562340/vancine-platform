/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version.

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
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

func TestOpenAIImageBodyHasUsableResult(t *testing.T) {
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"revised_prompt":"only"}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":" ","b64_json":""}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":123}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":true}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":{}}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":"javascript:alert(1)"}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":"file:///tmp/a.png"}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":123}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":true}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":{}}]}`)))
	// Structurally valid base64 that is NOT an image must not count as success.
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"abc"}]}`)))
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"aGVsbG8gd29ybGQ="}]}`))) // base64 of "hello world"
	assert.False(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"not-base64!!!"}]}`)))
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":"https://example.invalid/a.png"}]}`)))
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"url":"http://example.invalid/a.png"}]}`)))
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUg"}]}`))) // PNG
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"/9j/4AAQSkZJRgABAQ"}]}`)))    // JPEG
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"R0lGODlhAQABAIAAAAAAAP"}]}`))) // GIF
	assert.True(t, OpenAIImageBodyHasUsableResult([]byte(`{"data":[{"b64_json":"UklGRhIAAABXRUJQVlA4TCAYAAA"}]}`))) // WebP
}

func TestImageDataHasUsableResult(t *testing.T) {
	assert.False(t, ImageDataHasUsableResult(nil))
	assert.False(t, ImageDataHasUsableResult([]dto.ImageData{{RevisedPrompt: "only"}}))
	assert.False(t, ImageDataHasUsableResult([]dto.ImageData{{Url: "javascript:alert(1)"}}))
	assert.False(t, ImageDataHasUsableResult([]dto.ImageData{{Url: "file:///tmp/a.png"}}))
	// Decodable base64 without an image signature is not a usable image.
	assert.False(t, ImageDataHasUsableResult([]dto.ImageData{{B64Json: "aGVsbG8="}})) // "hello"
	assert.True(t, ImageDataHasUsableResult([]dto.ImageData{{Url: "https://example.invalid/a.png"}}))
	assert.True(t, ImageDataHasUsableResult([]dto.ImageData{{B64Json: "iVBORw0KGgoAAAANSUhEUg"}}))
}

func TestIsValidGeneratedImageBase64(t *testing.T) {
	// Real image signatures for all four supported formats.
	assert.True(t, IsValidGeneratedImageBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")) // PNG
	assert.True(t, IsValidGeneratedImageBase64("/9j/4AAQSkZJRgABAQEAYABgAAD"))       // JPEG
	assert.True(t, IsValidGeneratedImageBase64("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")) // GIF
	assert.True(t, IsValidGeneratedImageBase64("UklGRhIAAABXRUJQVlA4TCAYAAAAsAAAAEgASBEIAAAA"))             // WebP

	// Structurally broken base64.
	assert.False(t, IsValidGeneratedImageBase64(""))
	assert.False(t, IsValidGeneratedImageBase64("   "))
	assert.False(t, IsValidGeneratedImageBase64("not-base64!!!"))
	assert.False(t, IsValidGeneratedImageBase64("abcde"))  // len % 4 == 1
	assert.False(t, IsValidGeneratedImageBase64("abc=="))  // padding misaligned
	assert.False(t, IsValidGeneratedImageBase64("a=b=c=")) // padding mid-stream
	assert.False(t, IsValidGeneratedImageBase64("ab=c"))   // alphabet after padding

	// Valid base64, wrong payload.
	assert.False(t, IsValidGeneratedImageBase64("aGVsbG8gd29ybGQ=")) // "hello world"
	assert.False(t, IsValidGeneratedImageBase64("eA=="))             // single byte 0x78

	// Whitespace inside the payload is tolerated, like the frontend scanner.
	assert.True(t, IsValidGeneratedImageBase64("iVBORw0KGgo\nAAAANSUhEUg"))
}

func TestIsUsableImageHTTPURL(t *testing.T) {
	assert.False(t, IsUsableImageHTTPURL(""))
	assert.False(t, IsUsableImageHTTPURL("javascript:alert(1)"))
	assert.False(t, IsUsableImageHTTPURL("file:///tmp/a.png"))
	assert.False(t, IsUsableImageHTTPURL("/relative.png"))
	assert.False(t, IsUsableImageHTTPURL("https://"))
	assert.True(t, IsUsableImageHTTPURL(" https://example.invalid/a.png "))
}

func TestOpenAIImageBodyFilterUsable(t *testing.T) {
	pngB64 := "iVBORw0KGgoAAAANSUhEUg"

	t.Run("all items valid returns the original body", func(t *testing.T) {
		body := []byte(`{"data":[
			{"url":"https://example.invalid/a.png"},
			{"b64_json":"` + pngB64 + `"}
		]}`)
		filtered, ok := OpenAIImageBodyFilterUsable(body)
		assert.True(t, ok)
		// Strict contract: when the whole body is usable the filter returns
		// the original bytes verbatim — no rewrite, no sjson copy, no
		// per-item rebuild. The caller writes the body straight to the
		// client and bills the data array length.
		assert.Equal(t, string(body), string(filtered))
	})

	t.Run("any invalid item returns false and refuses to rewrite", func(t *testing.T) {
		body := []byte(`{"data":[
			{"url":"https://example.invalid/a.png"},
			{"url":"javascript:alert(1)"}
		]}`)
		_, ok := OpenAIImageBodyFilterUsable(body)
		assert.False(t, ok, "any invalid item must fail closed")
	})

	t.Run("empty array returns false", func(t *testing.T) {
		body := []byte(`{"data":[]}`)
		_, ok := OpenAIImageBodyFilterUsable(body)
		assert.False(t, ok)
	})

	t.Run("over-MaxImageN returns false", func(t *testing.T) {
		// 129 items, one past dto.MaxImageN (128).
		items := make([]string, 0, 129)
		for i := 0; i < 129; i++ {
			items = append(items, `{"url":"https://example.invalid/a.png"}`)
		}
		body := []byte(`{"data":[` + strings.Join(items, ",") + `]}`)
		_, ok := OpenAIImageBodyFilterUsable(body)
		assert.False(t, ok, "over-MaxImageN arrays must fail closed")
	})
}

func TestOpenAIImageBodyValidateUsable(t *testing.T) {
	pngB64 := "iVBORw0KGgoAAAANSUhEUg"

	t.Run("empty data is invalid", func(t *testing.T) {
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":[]}`))
		assert.False(t, ok)
		assert.Equal(t, 0, count)
	})

	t.Run("non-array data is invalid", func(t *testing.T) {
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":"oops"}`))
		assert.False(t, ok)
		assert.Equal(t, 0, count)
	})

	t.Run("one valid url returns count=1", func(t *testing.T) {
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":[{"url":"https://example.invalid/a.png"}]}`))
		assert.True(t, ok)
		assert.Equal(t, 1, count)
	})

	t.Run("multiple valid items return the data length", func(t *testing.T) {
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":[{"url":"https://example.invalid/a.png"},{"b64_json":"` + pngB64 + `"}]}`))
		assert.True(t, ok)
		assert.Equal(t, 2, count)
	})

	t.Run("any invalid item returns false", func(t *testing.T) {
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":[{"url":"https://example.invalid/a.png"},{"b64_json":"abc"}]}`))
		assert.False(t, ok)
		assert.Equal(t, 0, count)
	})

	t.Run("over-MaxImageN returns false", func(t *testing.T) {
		items := make([]string, 0, 129)
		for i := 0; i < 129; i++ {
			items = append(items, `{"url":"https://example.invalid/a.png"}`)
		}
		count, ok := OpenAIImageBodyValidateUsable([]byte(`{"data":[` + strings.Join(items, ",") + `]}`))
		assert.False(t, ok)
		assert.Equal(t, 0, count)
	})
}

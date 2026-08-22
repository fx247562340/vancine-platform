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

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParsePlaygroundImageRequestAllowsContractFields(t *testing.T) {
	raw := []byte(`{"model":"qwen-image-2.0-pro","group":"default","prompt":"a red apple","n":1,"size":"2048x2048","response_format":"url","watermark":false,"seed":0}`)
	req, err := ParsePlaygroundImageRequest(raw)
	require.NoError(t, err)
	require.NotNil(t, req)
	assert.Equal(t, "qwen-image-2.0-pro", req.Model)
	assert.Equal(t, "a red apple", req.Prompt)
	assert.Nil(t, req.Extra)
	payload, err := common.Marshal(req)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), `"group"`)
}

func TestParsePlaygroundImageRequestRejectsBypassFields(t *testing.T) {
	cases := []string{
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","parameters":{"n":9,"size":"512x512"}}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","input":{"prompt":"hijack"}}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","extra_fields":{"n":9}}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","quality":"hd"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","style":"vivid"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","user":"attacker"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","background":"transparent"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","moderation":"low"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","output_format":"png"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","output_compression":50}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","partial_images":1}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","mask":"x"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","input_fidelity":"high"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","watermark_enabled":true}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","user_id":"u1"}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","stream":true}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","unknown_field":1}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","response_format":"json"}`,
	}
	for _, body := range cases {
		req, err := ParsePlaygroundImageRequest([]byte(body))
		require.Error(t, err, body)
		assert.Nil(t, req, body)
	}
}

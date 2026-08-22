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
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSeedream5MockUpstreamOmitsUnsupportedFields(t *testing.T) {
	single, err := common.Marshal("https://example.invalid/one.png")
	require.NoError(t, err)
	many, err := common.Marshal([]string{
		"https://example.invalid/two.png",
		"https://example.invalid/three.png",
	})
	require.NoError(t, err)
	n := uint(1)
	seed := 9
	watermark := false

	cases := []struct {
		name    string
		request dto.ImageRequest
		want    string
	}{
		{
			name: "single image",
			request: dto.ImageRequest{
				Model:     "Doubao-Seedream-5.0-lite",
				Prompt:    "a red apple",
				Size:      "2K",
				N:         &n,
				Seed:      &seed,
				Quality:   "hd",
				Watermark: &watermark,
				Image:     single,
			},
			want: `"image":"https://example.invalid/one.png"`,
		},
		{
			name: "images array becomes image",
			request: dto.ImageRequest{
				Model:     "Doubao-Seedream-5.0-lite",
				Prompt:    "a red apple",
				Size:      "2K",
				N:         &n,
				Watermark: &watermark,
				Images:    many,
			},
			want: `"image":["https://example.invalid/two.png","https://example.invalid/three.png"]`,
		},
		{
			name: "image and images merge",
			request: dto.ImageRequest{
				Model:     "Doubao-Seedream-5.0-lite",
				Prompt:    "a red apple",
				Size:      "2K",
				N:         &n,
				Watermark: &watermark,
				Image:     single,
				Images:    many,
			},
			want: `"image":["https://example.invalid/one.png","https://example.invalid/two.png","https://example.invalid/three.png"]`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var hits atomic.Int32
			var body string
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hits.Add(1)
				raw, _ := io.ReadAll(r.Body)
				body = string(raw)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"created":1,"data":[{"url":"https://example.invalid/image.png"}]}`))
			}))
			defer upstream.Close()

			adaptor := &Adaptor{}
			info := &relaycommon.RelayInfo{
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: upstream.URL,
				},
				OriginModelName: "Doubao-Seedream-5.0-lite",
				RelayMode:       constant.RelayModeImagesGenerations,
			}
			requestURL, err := adaptor.GetRequestURL(info)
			require.NoError(t, err)
			converted, err := adaptor.ConvertImageRequest(nil, info, tc.request)
			require.NoError(t, err)
			payload, err := common.Marshal(converted)
			require.NoError(t, err)
			resp, err := http.Post(requestURL, "application/json", strings.NewReader(string(payload)))
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, int32(1), hits.Load())
			assert.Contains(t, body, tc.want)
			assert.Contains(t, body, `"watermark":false`)
			assert.NotContains(t, body, `"images"`)
			assert.NotContains(t, body, `"n"`)
			assert.NotContains(t, body, `"seed"`)
			assert.NotContains(t, body, `"quality"`)
		})
	}
}

func TestSeedreamMockUpstreamReceivesGenerationsPathAndExplicitFalse(t *testing.T) {
	var hits atomic.Int32
	var path string
	var body string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		path = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1,"data":[{"url":"https://example.invalid/image.png"}]}`))
	}))
	defer upstream.Close()

	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: upstream.URL,
		},
		OriginModelName: "seedream-4-0-250828",
		RelayMode:       constant.RelayModeImagesGenerations,
	}
	requestURL, err := adaptor.GetRequestURL(info)
	if err != nil {
		t.Fatalf("GetRequestURL: %v", err)
	}
	if !strings.HasSuffix(requestURL, "/api/v3/images/generations") {
		t.Fatalf("unexpected request URL %s", requestURL)
	}

	seed := 0
	watermark := false
	converted, err := adaptor.ConvertImageRequest(nil, info, dto.ImageRequest{
		Model:     "seedream-4-0-250828",
		Prompt:    "a red apple",
		Seed:      &seed,
		Watermark: &watermark,
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest: %v", err)
	}
	imageRequest, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("expected ImageRequest, got %T", converted)
	}
	payload, err := common.Marshal(imageRequest)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	resp, err := http.Post(requestURL, "application/json", strings.NewReader(string(payload)))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if hits.Load() != 1 {
		t.Fatalf("expected 1 upstream hit, got %d", hits.Load())
	}
	if path != "/api/v3/images/generations" {
		t.Fatalf("unexpected upstream path %s", path)
	}
	if !strings.Contains(body, `"watermark":false`) || !strings.Contains(body, `"seed":0`) {
		t.Fatalf("expected explicit false/0 in upstream body: %s", body)
	}
}

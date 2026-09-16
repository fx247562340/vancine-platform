package tencent

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDispatchAdaptorInit(t *testing.T) {
	tests := []struct {
		name        string
		apiKey      string
		baseURL     string
		wantTC3     bool
		wantBaseURL string
	}{
		{
			name:        "legacy three-segment key selects TC3 adaptor and keeps base url",
			apiKey:      "1300000000|AKIDxxxxxxxx|secretxxxxxxxx",
			baseURL:     constant.ChannelBaseURLs[constant.ChannelTypeTencent],
			wantTC3:     true,
			wantBaseURL: constant.ChannelBaseURLs[constant.ChannelTypeTencent],
		},
		{
			name:        "tokenhub key with default base url rewrites to tokenhub",
			apiKey:      "sk-xxxxxxxxxxxxxxxx",
			baseURL:     constant.ChannelBaseURLs[constant.ChannelTypeTencent],
			wantTC3:     false,
			wantBaseURL: tokenHubBaseURL,
		},
		{
			name:        "tokenhub key with empty base url rewrites to tokenhub",
			apiKey:      "sk-xxxxxxxxxxxxxxxx",
			baseURL:     "",
			wantTC3:     false,
			wantBaseURL: tokenHubBaseURL,
		},
		{
			name:        "tokenhub key with custom base url is preserved",
			apiKey:      "sk-xxxxxxxxxxxxxxxx",
			baseURL:     "https://proxy.example.com",
			wantTC3:     false,
			wantBaseURL: "https://proxy.example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType:    constant.ChannelTypeTencent,
				ApiKey:         tt.apiKey,
				ChannelBaseUrl: tt.baseURL,
			}}

			dispatch := &DispatchAdaptor{}
			dispatch.Init(info)

			require.NotNil(t, dispatch.Adaptor)
			if tt.wantTC3 {
				assert.IsType(t, &Adaptor{}, dispatch.Adaptor)
			} else {
				assert.IsType(t, &openai.Adaptor{}, dispatch.Adaptor)
			}
			assert.Equal(t, tt.wantBaseURL, info.ChannelBaseUrl)
		})
	}
}

// TestTokenHubPreservesStreamOptions pins the upstream request contract for a
// single-segment TokenHub key: the stream_options.include_usage injected by the
// compatible handler must survive conversion, otherwise TokenHub never returns
// usage and cached_tokens is lost for streaming requests.
func TestTokenHubPreservesStreamOptions(t *testing.T) {
	info := &relaycommon.RelayInfo{
		IsStream:        true,
		OriginModelName: "hunyuan-t1-latest",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:          constant.ChannelTypeTencent,
			ApiKey:               "test-tokenhub-key",
			ChannelBaseUrl:       constant.ChannelBaseURLs[constant.ChannelTypeTencent],
			UpstreamModelName:    "hunyuan-t1-latest",
			SupportStreamOptions: true,
		},
	}

	dispatch := &DispatchAdaptor{}
	dispatch.Init(info)

	require.NotNil(t, dispatch.Adaptor)
	require.IsType(t, &openai.Adaptor{}, dispatch.Adaptor,
		"single-segment TokenHub key must dispatch to the OpenAI-compatible adaptor")

	request := &dto.GeneralOpenAIRequest{
		Model:    "hunyuan-t1-latest",
		Messages: []dto.Message{{Role: "user", Content: "ping"}},
		Stream:   lo.ToPtr(true),
		// Mirrors what relay/compatible_handler.go injects for stream requests.
		StreamOptions: &dto.StreamOptions{IncludeUsage: true},
	}

	converted, err := dispatch.ConvertOpenAIRequest(nil, info, request)
	require.NoError(t, err)

	upstream, ok := converted.(*dto.GeneralOpenAIRequest)
	require.True(t, ok, "converted upstream request must stay an OpenAI chat request")

	require.NotNil(t, upstream.StreamOptions, "stream_options must survive TokenHub conversion")
	assert.True(t, upstream.StreamOptions.IncludeUsage,
		"stream_options.include_usage must stay true so TokenHub reports usage and cached_tokens")

	// The contract must hold for a real Tencent channel, not by masquerading as OpenAI.
	assert.Equal(t, constant.ChannelTypeTencent, info.ChannelType)
}

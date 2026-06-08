package volcengine

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	channelconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/claude"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

const (
	contextKeyTTSRequest     = "volcengine_tts_request"
	contextKeyResponseFormat = "response_format"
)

type Adaptor struct {
}

func (a *Adaptor) ConvertGeminiRequest(*gin.Context, *relaycommon.RelayInfo, *dto.GeminiChatRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, req *dto.ClaudeRequest) (any, error) {
	if _, ok := channelconstant.ChannelSpecialBases[info.ChannelBaseUrl]; ok {
		adaptor := claude.Adaptor{}
		return adaptor.ConvertClaudeRequest(c, info, req)
	}
	adaptor := openai.Adaptor{}
	return adaptor.ConvertClaudeRequest(c, info, req)
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	if info.RelayMode != constant.RelayModeAudioSpeech {
		return nil, errors.New("unsupported audio relay mode")
	}

	voiceType := mapVoiceType(request.Voice)
	encoding := mapEncoding(request.ResponseFormat)
	speedRatio := lo.FromPtrOr(request.Speed, 0.0)

	c.Set(contextKeyResponseFormat, encoding)

	// New v3 request format for HTTP Chunked endpoint
	volcRequest := map[string]interface{}{
		"user": map[string]string{
			"uid": "openai_relay_user",
		},
		"req_params": map[string]interface{}{
			"text":    request.Input,
			"speaker": voiceType,
			"audio_params": map[string]interface{}{
				"format":      encoding,
				"sample_rate": 24000,
			},
		},
	}

	// Add speed if specified
	if speedRatio > 0 {
		reqParams := volcRequest["req_params"].(map[string]interface{})
		audioParams := reqParams["audio_params"].(map[string]interface{})
		// Convert speed ratio to speech_rate: 1.0 = 0, 2.0 = 100, 0.5 = -50
		speechRate := int((speedRatio - 1.0) * 100)
		if speechRate < -50 {
			speechRate = -50
		}
		if speechRate > 100 {
			speechRate = 100
		}
		audioParams["speech_rate"] = speechRate
	}

	jsonData, err := json.Marshal(volcRequest)
	if err != nil {
		return nil, fmt.Errorf("error marshalling volcengine request: %w", err)
	}

	return bytes.NewReader(jsonData), nil
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	switch info.RelayMode {
	case constant.RelayModeImagesGenerations:
		return request, nil
	default:
		return request, nil
	}
}

func detectImageMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		if strings.HasPrefix(ext, ".jp") {
			return "image/jpeg"
		}
		return "image/png"
	}
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	baseUrl := info.ChannelBaseUrl
	if baseUrl == "" {
		baseUrl = channelconstant.ChannelBaseURLs[channelconstant.ChannelTypeVolcEngine]
	}
	specialPlan, hasSpecialPlan := channelconstant.ChannelSpecialBases[baseUrl]

	switch info.RelayFormat {
	case types.RelayFormatClaude:
		if hasSpecialPlan && specialPlan.ClaudeBaseURL != "" {
			return fmt.Sprintf("%s/v1/messages", specialPlan.ClaudeBaseURL), nil
		}
		if strings.HasPrefix(info.UpstreamModelName, "bot") {
			return fmt.Sprintf("%s/api/v3/bots/chat/completions", baseUrl), nil
		}
		return fmt.Sprintf("%s/api/v3/chat/completions", baseUrl), nil
	default:
		switch info.RelayMode {
		case constant.RelayModeChatCompletions:
			if hasSpecialPlan && specialPlan.OpenAIBaseURL != "" {
				return fmt.Sprintf("%s/chat/completions", specialPlan.OpenAIBaseURL), nil
			}
			if strings.HasPrefix(info.UpstreamModelName, "bot") {
				return fmt.Sprintf("%s/api/v3/bots/chat/completions", baseUrl), nil
			}
			return fmt.Sprintf("%s/api/v3/chat/completions", baseUrl), nil
		case constant.RelayModeEmbeddings:
			return fmt.Sprintf("%s/api/v3/embeddings", baseUrl), nil
		case constant.RelayModeImagesGenerations, constant.RelayModeImagesEdits:
			return fmt.Sprintf("%s/api/v3/images/generations", baseUrl), nil
		case constant.RelayModeRerank:
			return fmt.Sprintf("%s/api/v3/rerank", baseUrl), nil
		case constant.RelayModeResponses:
			return fmt.Sprintf("%s/api/v3/responses", baseUrl), nil
		case constant.RelayModeAudioSpeech:
			// Use Volcengine's HTTP Chunked TTS API
			return "https://openspeech.bytedance.com/api/v3/tts/unidirectional", nil
		default:
		}
	}
	return "", fmt.Errorf("unsupported relay mode: %d", info.RelayMode)
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)

	if info.RelayMode == constant.RelayModeAudioSpeech {
		// Support both new (X-Api-Key) and old (appid|access_token) auth formats
		parts := strings.Split(info.ApiKey, "|")
		if len(parts) == 2 {
			// Old format: appid|access_token
			req.Set("X-Api-App-Id", parts[0])
			req.Set("X-Api-Access-Key", parts[1])
		} else {
			// New format: single API key
			req.Set("X-Api-Key", info.ApiKey)
		}
		// Use upstream model name as resource ID (e.g. seed-tts-1.0, seed-tts-2.0)
		req.Set("X-Api-Resource-Id", info.UpstreamModelName)
		req.Set("Content-Type", "application/json")
		return nil
	} else if info.RelayMode == constant.RelayModeImagesEdits {
		req.Set("Content-Type", gin.MIMEJSON)
	}

	req.Set("Authorization", "Bearer "+info.ApiKey)
	return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}

	if !model_setting.ShouldPreserveThinkingSuffix(info.OriginModelName) &&
		strings.HasSuffix(info.UpstreamModelName, "-thinking") &&
		strings.HasPrefix(info.UpstreamModelName, "deepseek") {
		info.UpstreamModelName = strings.TrimSuffix(info.UpstreamModelName, "-thinking")
		request.Model = info.UpstreamModelName
		request.THINKING = json.RawMessage(`{"type": "enabled"}`)
	}
	return request, nil
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, nil
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	if info.RelayFormat == types.RelayFormatClaude {
		if _, ok := channelconstant.ChannelSpecialBases[info.ChannelBaseUrl]; ok {
			adaptor := claude.Adaptor{}
			return adaptor.DoResponse(c, resp, info)
		}
	}

	if info.RelayMode == constant.RelayModeAudioSpeech {
		// Volcengine returns JSON with base64-encoded audio data
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("failed to read response: %w", readErr),
				types.ErrorCodeReadResponseBodyFailed,
				http.StatusInternalServerError,
			)
		}
		defer resp.Body.Close()

		// Log response for debugging
		logger.LogError(c, fmt.Sprintf("TTS response length: %d, first 500 chars: %s", len(body), string(body[:min(500, len(body))])))

		var volcResp struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Data    string `json:"data"`
		}
		if unmarshalErr := json.Unmarshal(body, &volcResp); unmarshalErr != nil {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("failed to parse response: %w", unmarshalErr),
				types.ErrorCodeBadResponseBody,
				http.StatusInternalServerError,
			)
		}

		if volcResp.Code != 0 {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("TTS error: %s", volcResp.Message),
				types.ErrorCodeBadResponse,
				http.StatusBadRequest,
			)
		}

		// Decode base64 audio data
		audioData, decodeErr := base64.StdEncoding.DecodeString(volcResp.Data)
		if decodeErr != nil {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("failed to decode audio: %w", decodeErr),
				types.ErrorCodeBadResponseBody,
				http.StatusInternalServerError,
			)
		}

		// Return raw audio
		encoding := mapEncoding(c.GetString(contextKeyResponseFormat))
		contentType := getContentTypeByEncoding(encoding)
		c.Header("Content-Type", contentType)
		c.Data(http.StatusOK, contentType, audioData)

		usage = &dto.Usage{
			PromptTokens:     info.GetEstimatePromptTokens(),
			CompletionTokens: 0,
			TotalTokens:      info.GetEstimatePromptTokens(),
		}
		return usage, nil
	}

	adaptor := openai.Adaptor{}
	usage, err = adaptor.DoResponse(c, resp, info)
	return
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}

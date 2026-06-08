package volcengine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// VolcengineTTSRequest is the legacy WebSocket format (kept for backward compat)
type VolcengineTTSRequest struct {
	App     VolcengineTTSApp     `json:"app"`
	User    VolcengineTTSUser    `json:"user"`
	Audio   VolcengineTTSAudio   `json:"audio"`
	Request VolcengineTTSReqInfo `json:"request"`
}

type VolcengineTTSApp struct {
	AppID   string `json:"appid"`
	Token   string `json:"token"`
	Cluster string `json:"cluster"`
}

type VolcengineTTSUser struct {
	UID string `json:"uid"`
}

type VolcengineTTSAudio struct {
	VoiceType        string  `json:"voice_type"`
	Encoding         string  `json:"encoding"`
	SpeedRatio       float64 `json:"speed_ratio"`
	Rate             int     `json:"rate"`
	Bitrate          int     `json:"bitrate,omitempty"`
	LoudnessRatio    float64 `json:"loudness_ratio,omitempty"`
	EnableEmotion    bool    `json:"enable_emotion,omitempty"`
	Emotion          string  `json:"emotion,omitempty"`
	EmotionScale     float64 `json:"emotion_scale,omitempty"`
	ExplicitLanguage string  `json:"explicit_language,omitempty"`
	ContextLanguage  string  `json:"context_language,omitempty"`
}

type VolcengineTTSReqInfo struct {
	ReqID           string                   `json:"reqid"`
	Text            string                   `json:"text"`
	Operation       string                   `json:"operation"`
	Model           string                   `json:"model,omitempty"`
	TextType        string                   `json:"text_type,omitempty"`
	SilenceDuration float64                  `json:"silence_duration,omitempty"`
	WithTimestamp   interface{}              `json:"with_timestamp,omitempty"`
	ExtraParam      *VolcengineTTSExtraParam `json:"extra_param,omitempty"`
}

type VolcengineTTSExtraParam struct {
	DisableMarkdownFilter      bool                      `json:"disable_markdown_filter,omitempty"`
	EnableLatexTn              bool                      `json:"enable_latex_tn,omitempty"`
	MuteCutThreshold           string                    `json:"mute_cut_threshold,omitempty"`
	MuteCutRemainMs            string                    `json:"mute_cut_remain_ms,omitempty"`
	DisableEmojiFilter         bool                      `json:"disable_emoji_filter,omitempty"`
	UnsupportedCharRatioThresh float64                   `json:"unsupported_char_ratio_thresh,omitempty"`
	AigcWatermark              bool                      `json:"aigc_watermark,omitempty"`
	CacheConfig                *VolcengineTTSCacheConfig `json:"cache_config,omitempty"`
}

type VolcengineTTSCacheConfig struct {
	TextType int  `json:"text_type,omitempty"`
	UseCache bool `json:"use_cache,omitempty"`
}

// VolcengineTTSResponse is the legacy WebSocket response format
type VolcengineTTSResponse struct {
	ReqID    string                     `json:"reqid"`
	Code     int                        `json:"code"`
	Message  string                     `json:"message"`
	Sequence int                        `json:"sequence"`
	Data     string                     `json:"data"`
	Addition *VolcengineTTSAdditionInfo `json:"addition,omitempty"`
}

type VolcengineTTSAdditionInfo struct {
	Duration string `json:"duration"`
}

// New API v3 request/response structures
type VolcengineTTSV3Request struct {
	User     VolcengineTTSV3User     `json:"user"`
	UniqueID string                  `json:"unique_id"`
	ReqParams VolcengineTTSV3ReqParams `json:"req_params"`
}

type VolcengineTTSV3User struct {
	UID string `json:"uid"`
}

type VolcengineTTSV3ReqParams struct {
	Text       string                    `json:"text"`
	Speaker    string                    `json:"speaker"`
	AudioParams VolcengineTTSV3AudioParams `json:"audio_params"`
}

type VolcengineTTSV3AudioParams struct {
	Format     string `json:"format"`
	SampleRate int    `json:"sample_rate"`
}

type VolcengineTTSV3SubmitResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		TaskID       string `json:"task_id"`
		ReqTextLength int   `json:"req_text_length"`
		TaskStatus   int    `json:"task_status"`
	} `json:"data"`
}

type VolcengineTTSV3QueryResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		TaskID               string `json:"task_id"`
		TaskStatus           int    `json:"task_status"`
		AudioURL             string `json:"audio_url"`
		ReqTextLength        int    `json:"req_text_length"`
		SynthesizeTextLength int    `json:"synthesize_text_length"`
		URLExpireTime        int    `json:"url_expire_time"`
	} `json:"data"`
}

var openAIToVolcengineVoiceMap = map[string]string{
	"alloy":   "zh_male_M392_conversation_wvae_bigtts",
	"echo":    "zh_male_wenhao_mars_bigtts",
	"fable":   "zh_female_tianmei_mars_bigtts",
	"onyx":    "zh_male_zhibei_mars_bigtts",
	"nova":    "zh_female_shuangkuaisisi_mars_bigtts",
	"shimmer": "zh_female_cancan_mars_bigtts",
}

var responseFormatToEncodingMap = map[string]string{
	"mp3":  "mp3",
	"opus": "ogg_opus",
	"aac":  "mp3",
	"flac": "mp3",
	"wav":  "wav",
	"pcm":  "pcm",
}

func parseVolcengineAuth(apiKey string) (appID, token string, err error) {
	parts := strings.Split(apiKey, "|")
	if len(parts) != 2 {
		return "", "", errors.New("invalid api key format, expected: appid|access_token")
	}
	return parts[0], parts[1], nil
}

func mapVoiceType(openAIVoice string) string {
	if voice, ok := openAIToVolcengineVoiceMap[openAIVoice]; ok {
		return voice
	}
	return openAIVoice
}

func mapEncoding(responseFormat string) string {
	if encoding, ok := responseFormatToEncodingMap[responseFormat]; ok {
		return encoding
	}
	return "mp3"
}

func getContentTypeByEncoding(encoding string) string {
	contentTypeMap := map[string]string{
		"mp3":      "audio/mpeg",
		"ogg_opus": "audio/ogg",
		"wav":      "audio/wav",
		"pcm":      "audio/pcm",
	}
	if ct, ok := contentTypeMap[encoding]; ok {
		return ct
	}
	return "application/octet-stream"
}

func handleTTSResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo, encoding string) (usage any, err *types.NewAPIError) {
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, types.NewErrorWithStatusCode(
			errors.New("failed to read volcengine response"),
			types.ErrorCodeReadResponseBodyFailed,
			http.StatusInternalServerError,
		)
	}
	defer resp.Body.Close()

	var volcResp VolcengineTTSResponse
	if unmarshalErr := json.Unmarshal(body, &volcResp); unmarshalErr != nil {
		return nil, types.NewErrorWithStatusCode(
			errors.New("failed to parse volcengine response"),
			types.ErrorCodeBadResponseBody,
			http.StatusInternalServerError,
		)
	}

	if volcResp.Code != 3000 {
		return nil, types.NewErrorWithStatusCode(
			errors.New(volcResp.Message),
			types.ErrorCodeBadResponse,
			http.StatusBadRequest,
		)
	}

	// For legacy API, audio data is base64 encoded
	// For new API v3, we need to handle differently
	// This function handles the legacy format
	contentType := getContentTypeByEncoding(encoding)
	c.Header("Content-Type", contentType)
	c.Data(http.StatusOK, contentType, body)

	usage = &dto.Usage{
		PromptTokens:     info.GetEstimatePromptTokens(),
		CompletionTokens: 0,
		TotalTokens:      info.GetEstimatePromptTokens(),
	}

	return usage, nil
}

func generateRequestID() string {
	return uuid.New().String()
}

func handleTTSWebSocketResponse(c *gin.Context, requestURL string, volcRequest VolcengineTTSRequest, info *relaycommon.RelayInfo, encoding string) (usage any, err *types.NewAPIError) {
	_, token, parseErr := parseVolcengineAuth(info.ApiKey)
	if parseErr != nil {
		return nil, types.NewErrorWithStatusCode(
			parseErr,
			types.ErrorCodeChannelInvalidKey,
			http.StatusUnauthorized,
		)
	}

	header := http.Header{}
	header.Set("Authorization", fmt.Sprintf("Bearer;%s", token))

	conn, resp, dialErr := websocket.DefaultDialer.DialContext(context.Background(), requestURL, header)
	if dialErr != nil {
		if resp != nil {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("failed to connect to websocket: %w, status: %d", dialErr, resp.StatusCode),
				types.ErrorCodeBadResponseStatusCode,
				http.StatusBadGateway,
			)
		}
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to connect to websocket: %w", dialErr),
			types.ErrorCodeBadResponseStatusCode,
			http.StatusBadGateway,
		)
	}
	defer conn.Close()

	payload, marshalErr := json.Marshal(volcRequest)
	if marshalErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to marshal request: %w", marshalErr),
			types.ErrorCodeBadRequestBody,
			http.StatusInternalServerError,
		)
	}

	if sendErr := FullClientRequest(conn, payload); sendErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to send request: %w", sendErr),
			types.ErrorCodeBadRequestBody,
			http.StatusInternalServerError,
		)
	}

	contentType := getContentTypeByEncoding(encoding)
	c.Header("Content-Type", contentType)
	c.Header("Transfer-Encoding", "chunked")

	for {
		msg, recvErr := ReceiveMessage(conn)
		if recvErr != nil {
			if websocket.IsCloseError(recvErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				break
			}
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("failed to receive message: %w", recvErr),
				types.ErrorCodeBadResponse,
				http.StatusInternalServerError,
			)
		}

		switch msg.MsgType {
		case MsgTypeError:
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("received error from server: code=%d, %s", msg.ErrorCode, string(msg.Payload)),
				types.ErrorCodeBadResponse,
				http.StatusBadRequest,
			)
		case MsgTypeFrontEndResultServer:
			continue
		case MsgTypeAudioOnlyServer:
			if len(msg.Payload) > 0 {
				if _, writeErr := c.Writer.Write(msg.Payload); writeErr != nil {
					return nil, types.NewErrorWithStatusCode(
						fmt.Errorf("failed to write audio data: %w", writeErr),
						types.ErrorCodeBadResponse,
						http.StatusInternalServerError,
					)
				}
				c.Writer.Flush()
			}

			if msg.Sequence < 0 {
				c.Status(http.StatusOK)
				usage = &dto.Usage{
					PromptTokens:     info.GetEstimatePromptTokens(),
					CompletionTokens: 0,
					TotalTokens:      info.GetEstimatePromptTokens(),
				}
				return usage, nil
			}
		default:
			continue
		}
	}

	c.Status(http.StatusOK)
	usage = &dto.Usage{
		PromptTokens:     info.GetEstimatePromptTokens(),
		CompletionTokens: 0,
		TotalTokens:      info.GetEstimatePromptTokens(),
	}
	return usage, nil
}

// handleTTSV3SubmitQuery handles the new API v3 submit/query pattern
func handleTTSV3SubmitQuery(c *gin.Context, volcRequest VolcengineTTSRequest, info *relaycommon.RelayInfo, encoding string) (usage any, err *types.NewAPIError) {
	// Convert legacy request to v3 format
	v3Request := VolcengineTTSV3Request{
		User: VolcengineTTSV3User{
			UID: volcRequest.User.UID,
		},
		UniqueID: generateRequestID(),
		ReqParams: VolcengineTTSV3ReqParams{
			Text:    volcRequest.Request.Text,
			Speaker: volcRequest.Audio.VoiceType,
			AudioParams: VolcengineTTSV3AudioParams{
				Format:     encoding,
				SampleRate: volcRequest.Audio.Rate,
			},
		},
	}

	// Submit task
	submitBody, marshalErr := json.Marshal(v3Request)
	if marshalErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to marshal v3 request: %w", marshalErr),
			types.ErrorCodeBadRequestBody,
			http.StatusInternalServerError,
		)
	}

	// Make HTTP request to submit endpoint
	req, reqErr := http.NewRequest("POST", "https://openspeech.bytedance.com/api/v3/tts/submit", bytes.NewReader(submitBody))
	if reqErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to create request: %w", reqErr),
			types.ErrorCodeBadRequestBody,
			http.StatusInternalServerError,
		)
	}

	// Set auth headers (support both new and old formats)
	parts := strings.Split(info.ApiKey, "|")
	if len(parts) == 2 {
		req.Header.Set("X-Api-App-Id", parts[0])
		req.Header.Set("X-Api-Access-Key", parts[1])
	} else {
		req.Header.Set("X-Api-Key", info.ApiKey)
	}
	req.Header.Set("X-Api-Resource-Id", info.UpstreamModelName)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, respErr := client.Do(req)
	if respErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to submit TTS task: %w", respErr),
			types.ErrorCodeBadResponseStatusCode,
			http.StatusBadGateway,
		)
	}
	defer resp.Body.Close()

	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to read submit response: %w", readErr),
			types.ErrorCodeReadResponseBodyFailed,
			http.StatusInternalServerError,
		)
	}

	var submitResp VolcengineTTSV3SubmitResponse
	if unmarshalErr := json.Unmarshal(respBody, &submitResp); unmarshalErr != nil {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("failed to parse submit response: %w", unmarshalErr),
			types.ErrorCodeBadResponseBody,
			http.StatusInternalServerError,
		)
	}

	if submitResp.Code != 20000000 {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("TTS submit failed: %s", submitResp.Message),
			types.ErrorCodeBadResponse,
			http.StatusBadRequest,
		)
	}

	taskID := submitResp.Data.TaskID

	// Poll for results
	for i := 0; i < 60; i++ { // Max 60 retries (5 minutes)
		time.Sleep(5 * time.Second)

		queryReq := map[string]string{"task_id": taskID}
		queryBody, _ := json.Marshal(queryReq)

		req, _ := http.NewRequest("POST", "https://openspeech.bytedance.com/api/v3/tts/query", bytes.NewReader(queryBody))
		if len(parts) == 2 {
			req.Header.Set("X-Api-App-Id", parts[0])
			req.Header.Set("X-Api-Access-Key", parts[1])
		} else {
			req.Header.Set("X-Api-Key", info.ApiKey)
		}
		req.Header.Set("X-Api-Resource-Id", info.UpstreamModelName)
		req.Header.Set("Content-Type", "application/json")

		resp, respErr := client.Do(req)
		if respErr != nil {
			continue
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var queryResp VolcengineTTSV3QueryResponse
		if unmarshalErr := json.Unmarshal(respBody, &queryResp); unmarshalErr != nil {
			continue
		}

		if queryResp.Code != 20000000 {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("TTS query failed: %s", queryResp.Message),
				types.ErrorCodeBadResponse,
				http.StatusBadRequest,
			)
		}

		switch queryResp.Data.TaskStatus {
		case 2: // Success
			// Download audio from URL
			audioResp, audioErr := http.Get(queryResp.Data.AudioURL)
			if audioErr != nil {
				return nil, types.NewErrorWithStatusCode(
					fmt.Errorf("failed to download audio: %w", audioErr),
					types.ErrorCodeBadResponse,
					http.StatusBadGateway,
				)
			}
			defer audioResp.Body.Close()

			contentType := getContentTypeByEncoding(encoding)
			c.Header("Content-Type", contentType)
			c.Writer.WriteHeader(http.StatusOK)

			if _, copyErr := io.Copy(c.Writer, audioResp.Body); copyErr != nil {
				return nil, types.NewErrorWithStatusCode(
					fmt.Errorf("failed to stream audio: %w", copyErr),
					types.ErrorCodeBadResponse,
					http.StatusInternalServerError,
				)
			}

			usage = &dto.Usage{
				PromptTokens:     info.GetEstimatePromptTokens(),
				CompletionTokens: 0,
				TotalTokens:      info.GetEstimatePromptTokens(),
			}
			return usage, nil

		case 3: // Failure
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("TTS task failed"),
				types.ErrorCodeBadResponse,
				http.StatusInternalServerError,
			)

		default: // Still running
			continue
		}
	}

	return nil, types.NewErrorWithStatusCode(
		fmt.Errorf("TTS task timeout"),
		types.ErrorCodeBadResponse,
		http.StatusGatewayTimeout,
	)
}

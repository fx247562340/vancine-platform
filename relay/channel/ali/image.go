package ali

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func aliImageSize(size string) string {
	if strings.Contains(size, "x") {
		return strings.ReplaceAll(size, "x", "*")
	}
	return size
}

// isAliAutoSize reports whether the playground sent the literal "Auto"
// size. Ali Qwen Image 3.0+ accepts Auto by omitting the size field
// entirely; the upstream returns its chosen dimensions.
func isAliAutoSize(size string) bool {
	return strings.EqualFold(strings.TrimSpace(size), "Auto")
}

// aliImageOriginModel is the product-contract name. OriginModelName is the
// verified playground/channel identity; request.Model is only a fallback for
// tests or callers that have not populated RelayInfo.
func aliImageOriginModel(info *relaycommon.RelayInfo, request dto.ImageRequest) string {
	if info != nil {
		origin := strings.ToLower(strings.TrimSpace(info.OriginModelName))
		if origin != "" {
			return origin
		}
	}
	return strings.ToLower(strings.TrimSpace(request.Model))
}

// isQwenImage30Product is the exact Qwen Image 3.0 / 3.0-pro contract.
// Do not guess qwen-image-3.1 / 3.2 / 3.3 prefixes — those products are not
// in the playground registry and must not inherit 3.0 outbound fields.
func isQwenImage30Product(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "qwen-image-3.0", "qwen-image-3.0-pro":
		return true
	default:
		return false
	}
}

func extractAliReferenceImageURLs(request dto.ImageRequest) []string {
	appendRaw := func(raw []byte, urls []string) []string {
		if len(raw) == 0 {
			return urls
		}
		var single string
		if err := common.Unmarshal(raw, &single); err == nil {
			single = strings.TrimSpace(single)
			if single != "" {
				return append(urls, single)
			}
			return urls
		}
		var many []string
		if err := common.Unmarshal(raw, &many); err != nil {
			return urls
		}
		for _, item := range many {
			item = strings.TrimSpace(item)
			if item != "" {
				urls = append(urls, item)
			}
		}
		return urls
	}
	urls := appendRaw(request.Image, nil)
	return appendRaw(request.Images, urls)
}

func oaiImage2AliImageRequest(info *relaycommon.RelayInfo, request dto.ImageRequest, isSync bool) (*AliImageRequest, error) {
	var imageRequest AliImageRequest
	imageRequest.Model = request.Model
	imageRequest.ResponseFormat = request.ResponseFormat
	origin := aliImageOriginModel(info, request)
	paramsFromExtra := false
	inputFromExtra := false
	if request.Extra != nil {
		if val, ok := request.Extra["parameters"]; ok {
			err := common.Unmarshal(val, &imageRequest.Parameters)
			if err != nil {
				return nil, fmt.Errorf("invalid parameters field: %w", err)
			}
			paramsFromExtra = true
		}
		if val, ok := request.Extra["input"]; ok {
			err := common.Unmarshal(val, &imageRequest.Input)
			if err != nil {
				return nil, fmt.Errorf("invalid input field: %w", err)
			}
			inputFromExtra = true
		}
	}
	if !paramsFromExtra {
		imageRequest.Parameters = AliImageParameters{
			Size:         aliImageSize(request.Size),
			N:            int(lo.FromPtrOr(request.N, uint(1))),
			Watermark:    request.Watermark,
			Seed:         request.Seed,
			PromptExtend: request.PromptExtend,
			ThinkingMode: request.ThinkingMode,
		}
		// Ali Qwen Image 3.0 / 3.0-pro accept prompt_extend_mode (direct | agent).
		// Only forward it for those exact products; never invent a value for
		// Qwen 2 / Wan / Seedream, and never guess qwen-image-3.x prefixes.
		if request.PromptExtendMode != nil && isQwenImage30Product(origin) {
			mode := strings.ToLower(strings.TrimSpace(*request.PromptExtendMode))
			if mode == "direct" || mode == "agent" {
				imageRequest.Parameters.PromptExtendMode = &mode
			}
		}
	}
	// "Auto" means the client wants the upstream to pick the size; Ali
	// Qwen Image 3.0 / 3.0-pro drop the size field entirely in that case.
	// Apply after Extra unmarshal too so a passthrough cannot leak "Auto".
	if isAliAutoSize(imageRequest.Parameters.Size) || isAliAutoSize(request.Size) {
		imageRequest.Parameters.Size = ""
	}

	if strings.Contains(request.Model, "z-image") {
		// z-image 开启prompt_extend后，按2倍计费
		if imageRequest.Parameters.PromptExtendValue() {
			info.PriceData.AddOtherRatio("prompt_extend", 2)
		}
	}

	// Parameters may come from Extra["parameters"], bypassing the standard
	// top-level n validation; enforce the same bound before it becomes a
	// billing multiplier.
	if imageRequest.Parameters.N < 0 || imageRequest.Parameters.N > dto.MaxImageN {
		return nil, fmt.Errorf("parameters.n must be an integer between 1 and %d", dto.MaxImageN)
	}
	if imageRequest.Parameters.N != 0 {
		info.PriceData.AddOtherRatio("n", float64(imageRequest.Parameters.N))
	}

	// 同步图片模型和异步图片模型请求格式不一样
	if !inputFromExtra && imageRequest.Input == nil {
		negativePrompt := ""
		if request.NegativePrompt != nil {
			negativePrompt = *request.NegativePrompt
		}
		refImages := extractAliReferenceImageURLs(request)
		if isSync {
			content := make([]AliMediaContent, 0, len(refImages)+1)
			for _, url := range refImages {
				content = append(content, AliMediaContent{Image: url})
			}
			content = append(content, AliMediaContent{Text: request.Prompt})
			imageRequest.Input = AliImageInput{
				NegativePrompt: negativePrompt,
				Messages: []AliMessage{
					{
						Role:    "user",
						Content: content,
					},
				},
			}
		} else {
			imageRequest.Input = AliImageInput{
				Prompt:         request.Prompt,
				NegativePrompt: negativePrompt,
			}
		}
	}

	applyAliImageProductContract(origin, request, &imageRequest)
	return &imageRequest, nil
}

// applyAliImageProductContract is the last outbound gate: Qwen Image 3.0 /
// 3.0-pro serialize enable_thinking + parameters.negative_prompt, never emit
// thinking_mode, and never emit response_format (the verified upstream
// contract has no such field; the gateway's internal response_format:"url"
// must not leak). Wan keeps thinking_mode. Qwen 2 / Wan / Seedream
// must not receive Qwen 3-only fields.
func applyAliImageProductContract(origin string, request dto.ImageRequest, imageRequest *AliImageRequest) {
	if imageRequest == nil {
		return
	}
	if isQwenImage30Product(origin) {
		imageRequest.ResponseFormat = ""
		if imageRequest.Parameters.EnableThinking == nil {
			imageRequest.Parameters.EnableThinking = imageRequest.Parameters.ThinkingMode
		}
		imageRequest.Parameters.ThinkingMode = nil
		if request.NegativePrompt != nil {
			imageRequest.Parameters.NegativePrompt = request.NegativePrompt
		}
		if input, ok := imageRequest.Input.(AliImageInput); ok {
			if input.NegativePrompt != "" && imageRequest.Parameters.NegativePrompt == nil {
				negative := input.NegativePrompt
				imageRequest.Parameters.NegativePrompt = &negative
			}
			input.NegativePrompt = ""
			imageRequest.Input = input
		}
		return
	}
	imageRequest.Parameters.EnableThinking = nil
	imageRequest.Parameters.PromptExtendMode = nil
}
func getImageBase64sFromForm(c *gin.Context, fieldName string) ([]string, error) {
	mf := c.Request.MultipartForm
	if mf == nil {
		if _, err := c.MultipartForm(); err != nil {
			return nil, fmt.Errorf("failed to parse image edit form request: %w", err)
		}
		mf = c.Request.MultipartForm
	}

	var imageFiles []*multipart.FileHeader
	var exists bool

	// First check for standard "image" field
	if imageFiles, exists = mf.File["image"]; !exists || len(imageFiles) == 0 {
		// If not found, check for "image[]" field
		if imageFiles, exists = mf.File["image[]"]; !exists || len(imageFiles) == 0 {
			// If still not found, iterate through all fields to find any that start with "image["
			foundArrayImages := false
			for fieldName, files := range mf.File {
				if strings.HasPrefix(fieldName, "image[") && len(files) > 0 {
					foundArrayImages = true
					imageFiles = append(imageFiles, files...)
				}
			}

			// If no image fields found at all
			if !foundArrayImages && (len(imageFiles) == 0) {
				return nil, errors.New("image is required")
			}
		}
	}

	if len(imageFiles) == 0 {
		return nil, errors.New("image is required")
	}

	//if len(imageFiles) > 1 {
	//	return nil, errors.New("only one image is supported for qwen edit")
	//}

	// 获取base64编码的图片
	var imageBase64s []string
	for _, file := range imageFiles {
		image, err := file.Open()
		if err != nil {
			return nil, errors.New("failed to open image file")
		}

		// 读取文件内容
		imageData, err := io.ReadAll(image)
		if err != nil {
			return nil, errors.New("failed to read image file")
		}

		// 获取MIME类型
		mimeType := http.DetectContentType(imageData)

		// 编码为base64
		base64Data := base64.StdEncoding.EncodeToString(imageData)

		// 构造data URL格式
		dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64Data)
		imageBase64s = append(imageBase64s, dataURL)
		image.Close()
	}
	return imageBase64s, nil
}

func oaiFormEdit2AliImageEdit(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (*AliImageRequest, error) {
	var imageRequest AliImageRequest
	imageRequest.Model = request.Model
	imageRequest.ResponseFormat = request.ResponseFormat

	imageBase64s, err := getImageBase64sFromForm(c, "image")
	if err != nil {
		return nil, fmt.Errorf("get image base64s from form failed: %w", err)
	}
	//dto.MediaContent{}
	mediaContents := make([]AliMediaContent, len(imageBase64s))
	for i, b64 := range imageBase64s {
		mediaContents[i] = AliMediaContent{
			Image: b64,
		}
	}
	mediaContents = append(mediaContents, AliMediaContent{
		Text: request.Prompt,
	})
	imageRequest.Input = AliImageInput{
		Messages: []AliMessage{
			{
				Role:    "user",
				Content: mediaContents,
			},
		},
	}
	imageRequest.Parameters = AliImageParameters{
		N:         int(lo.FromPtrOr(request.N, uint(1))),
		Watermark: request.Watermark,
	}
	return &imageRequest, nil
}

func updateTask(info *relaycommon.RelayInfo, taskID string) (*AliResponse, error, []byte) {
	url := fmt.Sprintf("%s/api/v1/tasks/%s", info.ChannelBaseUrl, taskID)

	var aliResponse AliResponse

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return &aliResponse, err, nil
	}

	req.Header.Set("Authorization", "Bearer "+info.ApiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		common.SysLog("updateTask client.Do err: " + err.Error())
		return &aliResponse, err, nil
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)

	var response AliResponse
	err = common.Unmarshal(responseBody, &response)
	if err != nil {
		common.SysLog("updateTask NewDecoder err: " + err.Error())
		return &aliResponse, err, nil
	}

	return &response, nil, responseBody
}

func asyncTaskWait(c *gin.Context, info *relaycommon.RelayInfo, taskID string) (*AliResponse, []byte, error) {
	waitSeconds := 10
	step := 0
	maxStep := 20

	var taskResponse AliResponse
	var responseBody []byte

	time.Sleep(time.Duration(5) * time.Second)

	for {
		logger.LogDebug(c, "asyncTaskWait step %d/%d, wait %d seconds", step, maxStep, waitSeconds)
		step++
		rsp, err, body := updateTask(info, taskID)
		responseBody = body
		if err != nil {
			logger.LogWarn(c, "asyncTaskWait UpdateTask err: "+err.Error())
			time.Sleep(time.Duration(waitSeconds) * time.Second)
			continue
		}

		if rsp.Output.TaskStatus == "" {
			return &taskResponse, responseBody, nil
		}

		switch rsp.Output.TaskStatus {
		case "FAILED":
			fallthrough
		case "CANCELED":
			fallthrough
		case "SUCCEEDED":
			fallthrough
		case "UNKNOWN":
			return rsp, responseBody, nil
		}
		if step >= maxStep {
			break
		}
		time.Sleep(time.Duration(waitSeconds) * time.Second)
	}

	return nil, nil, fmt.Errorf("aliAsyncTaskWait timeout")
}

func responseAli2OpenAIImage(c *gin.Context, response *AliResponse, originBody []byte, info *relaycommon.RelayInfo, responseFormat string) (*dto.ImageResponse, error) {
	imageResponse := dto.ImageResponse{
		Created: info.StartTime.Unix(),
	}

	if len(response.Output.Results) > 0 {
		data, err := response.Output.ResultToOpenAIImageDate(c, responseFormat)
		if err != nil {
			return nil, err
		}
		imageResponse.Data = data
	} else if len(response.Output.Choices) > 0 {
		data, err := response.Output.ChoicesToOpenAIImageDate(c, responseFormat)
		if err != nil {
			return nil, err
		}
		imageResponse.Data = data
	}

	imageResponse.Metadata = originBody
	return &imageResponse, nil
}

func aliImageHandler(a *Adaptor, c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*types.NewAPIError, *dto.Usage) {
	responseFormat := ""
	if imageReq, ok := info.Request.(*dto.ImageRequest); ok {
		responseFormat = imageReq.ResponseFormat
	}

	var aliTaskResponse AliResponse
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError), nil
	}
	service.CloseResponseBodyGracefully(resp)
	err = common.Unmarshal(responseBody, &aliTaskResponse)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError), nil
	}

	if aliTaskResponse.Message != "" {
		logger.LogError(c, "ali_async_task_failed: "+aliTaskResponse.Message)
		return types.NewError(errors.New(aliTaskResponse.Message), types.ErrorCodeBadResponse), nil
	}

	var (
		aliResponse    *AliResponse
		originRespBody []byte
	)

	if a.IsSyncImageModel {
		aliResponse = &aliTaskResponse
		originRespBody = responseBody
	} else {
		// 异步图片模型需要轮询任务结果
		aliResponse, originRespBody, err = asyncTaskWait(c, info, aliTaskResponse.Output.TaskId)
		if err != nil {
			return types.NewError(err, types.ErrorCodeBadResponse), nil
		}
		if aliResponse.Output.TaskStatus != "SUCCEEDED" {
			return types.WithOpenAIError(types.OpenAIError{
				Message: aliResponse.Output.Message,
				Type:    "ali_error",
				Param:   "",
				Code:    aliResponse.Output.Code,
			}, resp.StatusCode), nil
		}
	}

	if a.IsSyncImageModel {
		logger.LogDebug(c, "ali_sync_image_result: %s", originRespBody)
	} else {
		logger.LogDebug(c, "ali_async_image_result: %s", originRespBody)
	}

	imageResponses, err := responseAli2OpenAIImage(c, aliResponse, originRespBody, info, responseFormat)
	if err != nil {
		// P13-B R17 all-valid, fail-closed: the Ali converter returns an
		// error when any declared result/choice lacks a usable image. The
		// whole response must be rejected BEFORE writing the body, BEFORE
		// modifying the n ratio, and BEFORE settling as success. The
		// pre-set n ratio stays untouched so the relay's error path
		// refunds the pre-consumed quota.
		return types.NewError(err, types.ErrorCodeBadResponse), nil
	}
	// P13-B R17 count contract: the converter now guarantees every item
	// is usable, but we still enforce the 1..dto.MaxImageN bound the
	// same way the OpenAI image handler does. Zero items means the
	// upstream declared no images at all (empty results/choices);
	// over MaxImageN means a buggy upstream that loops the array.
	usableCount := len(imageResponses.Data)
	if usableCount == 0 {
		return types.NewError(fmt.Errorf("upstream returned no images"), types.ErrorCodeBadResponse), nil
	}
	if usableCount > dto.MaxImageN {
		return types.NewError(fmt.Errorf("upstream returned more than %d images", dto.MaxImageN), types.ErrorCodeBadResponse), nil
	}
	// Bill exactly the number of items the client will receive. The Ali
	// upstream may report an image_count that exceeds the items we
	// actually surfaced, or it may omit the count entirely. Trust the
	// rendered body, not the upstream usage, so the client-received
	// count, the PriceData ratio, and the final settlement count agree.
	info.PriceData.AddOtherRatio("n", float64(usableCount))
	jsonResponse, err := common.Marshal(imageResponses)
	if err != nil {
		return types.NewError(err, types.ErrorCodeBadResponseBody), nil
	}
	service.IOCopyBytesGracefully(c, resp, jsonResponse)

	return nil, &dto.Usage{}
}

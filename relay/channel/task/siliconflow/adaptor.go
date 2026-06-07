package siliconflow

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
)

// TaskAdaptor implements the TaskAdaptor interface for SiliconFlow video generation.
// SiliconFlow API: POST /v1/video/submit, GET /v1/video/status/{task_id}
type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	return fmt.Sprintf("%s%s", a.baseURL, TextToVideoEndpoint), nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	v, exists := c.Get("task_request")
	if !exists {
		return nil, fmt.Errorf("request not found in context")
	}
	req, ok := v.(relaycommon.TaskSubmitReq)
	if !ok {
		return nil, fmt.Errorf("invalid request type in context")
	}

	body, err := a.convertToRequestPayload(&req, info)
	if err != nil {
		return nil, errors.Wrap(err, "convert request payload failed")
	}

	data, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}

	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}
	_ = resp.Body.Close()

	var sfResp VideoResponse
	if err := common.Unmarshal(responseBody, &sfResp); err != nil {
		taskErr = service.TaskErrorWrapper(
			errors.Wrapf(err, "body: %s", responseBody),
			"unmarshal_response_body_failed",
			http.StatusInternalServerError,
		)
		return
	}

	if sfResp.TaskID == "" {
		taskErr = service.TaskErrorWrapper(
			fmt.Errorf("siliconflow api error: no task_id returned, status=%s", sfResp.Status),
			"task_submit_failed",
			http.StatusBadRequest,
		)
		return
	}

	ov := dto.NewOpenAIVideo()
	ov.ID = info.PublicTaskID
	ov.TaskID = info.PublicTaskID
	ov.CreatedAt = time.Now().Unix()
	ov.Model = info.OriginModelName

	c.JSON(http.StatusOK, ov)
	return sfResp.TaskID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}

	uri := fmt.Sprintf("%s%s/%s", baseUrl, QueryTaskEndpoint, taskID)

	req, err := http.NewRequest(http.MethodGet, uri, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var queryResp QueryTaskResponse
	if err := common.Unmarshal(respBody, &queryResp); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := relaycommon.TaskInfo{
		TaskID: queryResp.TaskID,
	}

	switch queryResp.Status {
	case TaskStatusSubmitted:
		taskResult.Status = model.TaskStatusSubmitted
		taskResult.Progress = taskcommon.ProgressSubmitted
	case TaskStatusProcessing:
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = taskcommon.ProgressInProgress
	case TaskStatusSucceed:
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Progress = taskcommon.ProgressComplete
		taskResult.Url = queryResp.VideoURL
	case TaskStatusFailed, TaskStatusCancelled:
		taskResult.Status = model.TaskStatusFailure
		taskResult.Progress = taskcommon.ProgressComplete
		taskResult.Reason = queryResp.Reason
		if taskResult.Reason == "" {
			taskResult.Reason = "video generation failed"
		}
	default:
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = taskcommon.ProgressInProgress
	}

	return &taskResult, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var sfResp QueryTaskResponse
	if err := common.Unmarshal(originTask.Data, &sfResp); err != nil {
		return nil, errors.Wrap(err, "unmarshal siliconflow task data failed")
	}

	openAIVideo := originTask.ToOpenAIVideo()
	if sfResp.VideoURL != "" {
		openAIVideo.SetMetadata("url", sfResp.VideoURL)
	}
	if sfResp.Status == TaskStatusFailed || sfResp.Status == TaskStatusCancelled {
		openAIVideo.Error = &dto.OpenAIVideoError{
			Message: sfResp.Reason,
		}
	}

	jsonData, err := common.Marshal(openAIVideo)
	if err != nil {
		return nil, errors.Wrap(err, "marshal openai video failed")
	}
	return jsonData, nil
}

// convertToRequestPayload converts the standard TaskSubmitReq to SiliconFlow's format.
func (a *TaskAdaptor) convertToRequestPayload(req *relaycommon.TaskSubmitReq, info *relaycommon.RelayInfo) (*VideoRequest, error) {
	modelConfig := GetModelConfig(info.UpstreamModelName)

	duration := DefaultDuration
	if req.Duration > 0 {
		duration = req.Duration
	}

	resolution := modelConfig.DefaultResolution
	if req.Size != "" {
		resolution = parseResolution(req.Size, modelConfig)
	}

	videoReq := &VideoRequest{
		Model:     info.UpstreamModelName,
		Prompt:    req.Prompt,
		ImageSize: resolution,
	}

	// Image-to-video: use image field
	if req.Image != "" {
		videoReq.ImageURL = req.Image
	}

	if duration > 0 {
		videoReq.Extra = &Extra{Duration: duration}
	}

	// Allow metadata overrides
	if err := taskcommon.UnmarshalMetadata(req.Metadata, videoReq); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}

	return videoReq, nil
}

// parseResolution maps size strings to SiliconFlow resolution format.
func parseResolution(size string, config ModelConfig) string {
	switch {
	case strings.Contains(size, "1080"):
		return "1080p"
	case strings.Contains(size, "720"):
		return "720p"
	case strings.Contains(size, "480"):
		return "480p"
	default:
		return config.DefaultResolution
	}
}

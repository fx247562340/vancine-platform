package controller

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/relay/channel"
	jspluginadaptor "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// TestAlibabaWan3PlatformVideoGenerationsSubmitAndPoll proves that a platform
// POST /v1/video/generations submission for wan3.0-video on an Ali channel
// (type 17) resolves the built-in alibaba task plugin — no legacy Go adaptor —
// sends the real DashScope contract upstream, persists the plugin snapshot
// under key "alibaba", and that polling plus artifact access keep using the
// same snapshot. Everything runs against an httptest upstream; no public
// network and no real API key are involved.
func TestAlibabaWan3PlatformVideoGenerationsSubmitAndPoll(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service.InitHttpClient()

	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousMemoryCache := common.MemoryCacheEnabled
	previousBatchUpdate := common.BatchUpdateEnabled
	previousLogConsume := common.LogConsumeEnabled
	previousRedisEnabled := common.RedisEnabled
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Channel{}, &model.Task{}, &model.Log{}))
	model.DB = database
	model.LOG_DB = database
	common.MemoryCacheEnabled = false
	common.BatchUpdateEnabled = false
	common.LogConsumeEnabled = false
	common.RedisEnabled = false
	previousModelRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"wan3.0-video":1}`))
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.MemoryCacheEnabled = previousMemoryCache
		common.BatchUpdateEnabled = previousBatchUpdate
		common.LogConsumeEnabled = previousLogConsume
		common.RedisEnabled = previousRedisEnabled
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(previousModelRatios))
	})
	require.NoError(t, database.Create(&model.User{
		Id:       21,
		Username: "wan3-platform-user",
		Group:    "default",
		Quota:    10_000_000,
	}).Error)

	const upstreamVideoURL = "https://cdn.example/wan3.mp4?Expires=1&Signature=must-not-leak"
	var submitCalls atomic.Int32
	var queryCalls atomic.Int32
	var submitBody []byte
	var submitHeader http.Header
	var submitPath string
	var queryHeader http.Header
	var queryPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/services/aigc/video-generation/video-synthesis":
			submitCalls.Add(1)
			submitPath = r.URL.Path
			submitHeader = r.Header.Clone()
			body, readErr := io.ReadAll(r.Body)
			if !assert.NoError(t, readErr) {
				http.Error(w, "read request", http.StatusInternalServerError)
				return
			}
			submitBody = body
			_, _ = io.WriteString(w, `{"request_id":"req-wan3-1","output":{"task_id":"ali-wan3-1","task_status":"PENDING"}}`)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/tasks/ali-wan3-1":
			queryCalls.Add(1)
			queryPath = r.URL.Path
			queryHeader = r.Header.Clone()
			_, _ = io.WriteString(w, `{"request_id":"req-wan3-2","output":{"task_id":"ali-wan3-1","task_status":"SUCCEEDED","video_url":"`+upstreamVideoURL+`","duration":5,"resolution":"720P"}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	channelRecord := model.Channel{
		Type:    constant.ChannelTypeAli,
		Name:    "alibaba-wan3-e2e",
		Key:     "sk-test",
		BaseURL: &upstream.URL,
		Status:  common.ChannelStatusEnabled,
		Models:  "wan3.0-video,wan3.0-video-prime",
		Group:   "default",
	}
	require.NoError(t, database.Create(&channelRecord).Error)
	require.Equal(t, 17, channelRecord.Type)

	generation := pluginruntime.DefaultRegistry.Generation()
	require.NotNil(t, generation)
	declaredPlugin, declaredFound := generation.Get("alibaba")
	require.True(t, declaredFound)
	assert.Equal(t, "1.1.0", declaredPlugin.Meta.Version)
	assert.Contains(t, declaredPlugin.Meta.Models, "wan3.0-video")

	submitRecorder := httptest.NewRecorder()
	submitContext, _ := gin.CreateTestContext(submitRecorder)
	submitContext.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/video/generations",
		bytes.NewBufferString(`{"model":"wan3.0-video","prompt":"a spaceship gliding over the Great Wall at night"}`),
	)
	submitContext.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(submitContext, constant.ContextKeyUserId, 21)
	common.SetContextKey(submitContext, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(submitContext, constant.ContextKeyUsingGroup, "default")
	common.SetContextKey(submitContext, constant.ContextKeyTokenGroup, "default")
	common.SetContextKey(submitContext, constant.ContextKeyUserQuota, 10_000_000)
	require.Nil(t, middleware.SetupContextForSelectedChannel(submitContext, &channelRecord, "wan3.0-video"))
	require.Equal(t, constant.ChannelTypeAli, submitContext.GetInt("channel_type"))

	billing := &nativeRouteBilling{userID: 21}
	relayInfo := &relaycommon.RelayInfo{
		UserId:          21,
		UserGroup:       "default",
		UsingGroup:      "default",
		UserQuota:       10_000_000,
		TokenGroup:      "default",
		OriginModelName: "wan3.0-video",
		Billing:         billing,
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			PublicTaskID:  "task_wan3_public",
			LockedChannel: &channelRecord,
		},
	}

	outcome, taskErr := executeTaskSubmissionWith(submitContext, relayInfo, relay.RelayTaskSubmit)
	require.Nil(t, taskErr)
	require.NotNil(t, outcome)
	require.Equal(t, []string{"reserve", "settle"}, billing.events)
	require.False(t, submitContext.Writer.Written())

	t.Run("channel type 17 resolves the alibaba plugin, not a legacy adaptor", func(t *testing.T) {
		pinnedValue, exists := submitContext.Get(pluginruntime.ContextKeyPinnedPlugin)
		require.True(t, exists, "RelayTaskSubmit must pin the resolved task plugin")
		pinned, ok := pinnedValue.(pluginruntime.PinnedPlugin)
		require.True(t, ok)
		require.NotNil(t, pinned.Plugin)
		assert.Equal(t, "alibaba", pinned.Plugin.Meta.Key)
		assert.Same(t, pinned.Generation, generation)

		platformAdaptor := relay.GetTaskAdaptor(constant.TaskPlatform("17"))
		require.NotNil(t, platformAdaptor)
		_, isPluginAdaptor := platformAdaptor.(*jspluginadaptor.TaskAdaptor)
		assert.True(t, isPluginAdaptor, "platform 17 must be served by the jsplugin adaptor")
		assert.Equal(t, "text_to_video", relayInfo.Action)
	})

	t.Run("upstream request follows the DashScope contract", func(t *testing.T) {
		assert.Equal(t, int32(1), submitCalls.Load())
		assert.Equal(t, "/api/v1/services/aigc/video-generation/video-synthesis", submitPath)
		require.NotNil(t, submitHeader)
		assert.Equal(t, "Bearer sk-test", submitHeader.Get("Authorization"))
		assert.Equal(t, "enable", submitHeader.Get("X-DashScope-Async"))
		assert.Contains(t, submitHeader.Get("Content-Type"), "application/json")

		var upstreamBody map[string]any
		require.NoError(t, common.Unmarshal(submitBody, &upstreamBody))
		assert.Equal(t, "wan3.0-video", upstreamBody["model"])
		input, ok := upstreamBody["input"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "a spaceship gliding over the Great Wall at night", input["prompt"])
		assert.NotContains(t, input, "img_url")
		assert.NotContains(t, input, "media")
		parameters, ok := upstreamBody["parameters"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, float64(5), parameters["duration"])
		assert.Equal(t, "720P", parameters["resolution"])
		assert.Equal(t, true, parameters["prompt_extend"])
	})

	t.Run("public response hides upstream identity", func(t *testing.T) {
		presentTaskSubmission(submitContext, outcome)
		require.Equal(t, http.StatusOK, submitRecorder.Code)
		body := submitRecorder.Body.String()
		assert.Contains(t, body, `"task_id":"task_wan3_public"`)
		assert.Contains(t, body, `"model":"wan3.0-video"`)
		assert.NotContains(t, body, "ali-wan3-1")
		assert.NotContains(t, body, "cdn.example")
		assert.Equal(t, `{"seconds":5}`, submitRecorder.Header().Get("X-New-Api-Other-Ratios"))
	})

	var persisted model.Task
	require.NoError(t, database.Where("task_id = ?", "task_wan3_public").First(&persisted).Error)

	t.Run("task persists the alibaba plugin snapshot", func(t *testing.T) {
		assert.Equal(t, constant.TaskPlatform("17"), persisted.Platform)
		assert.Equal(t, "ali-wan3-1", persisted.PrivateData.UpstreamTaskID)
		assert.Equal(t, model.TaskStatus(model.TaskStatusNotStart), persisted.Status)
		assert.Equal(t, "text_to_video", persisted.Action)
		require.NotNil(t, persisted.PrivateData.Execution)
		require.NotNil(t, persisted.PrivateData.Execution.TaskPlugin)
		snapshot := persisted.PrivateData.Execution.TaskPlugin
		assert.Equal(t, "alibaba", snapshot.Key)
		assert.Equal(t, "Alibaba Bailian", snapshot.Name)
		assert.Equal(t, "1.1.0", snapshot.Version)
		require.NotNil(t, persisted.PrivateData.BillingContext)
		assert.Equal(t, map[string]float64{"seconds": 5}, persisted.PrivateData.BillingContext.OtherRatios)
		assert.Equal(t, "wan3.0-video", persisted.PrivateData.BillingContext.OriginModelName)
		assert.False(t, persisted.PrivateData.BillingContext.PerCallBilling)
		assert.Nil(t, persisted.PrivateData.BillingContext.TieredSnapshot)
		assert.Equal(t, 1_250_000, persisted.Quota)
	})

	var chargedUser model.User
	require.NoError(t, database.First(&chargedUser, 21).Error)
	assert.Equal(t, 8_750_000, chargedUser.Quota)

	previousAdaptorFactory := service.GetTaskAdaptorFunc
	service.GetTaskAdaptorFunc = func(platform constant.TaskPlatform) service.TaskPollingAdaptor {
		return relay.GetTaskAdaptor(platform)
	}
	t.Cleanup(func() { service.GetTaskAdaptorFunc = previousAdaptorFactory })
	service.DispatchPlatformUpdate(
		context.Background(),
		persisted.Platform,
		map[int][]string{channelRecord.Id: {"ali-wan3-1"}},
		map[string]*model.Task{"ali-wan3-1": &persisted},
	)

	t.Run("polling continues through the same platform snapshot", func(t *testing.T) {
		assert.Equal(t, int32(1), queryCalls.Load())
		assert.Equal(t, "/api/v1/tasks/ali-wan3-1", queryPath)
		require.NotNil(t, queryHeader)
		assert.Equal(t, "Bearer sk-test", queryHeader.Get("Authorization"))

		require.NoError(t, database.Where("task_id = ?", "task_wan3_public").First(&persisted).Error)
		assert.Equal(t, model.TaskStatus(model.TaskStatusSuccess), persisted.Status)
		assert.Equal(t, "100%", persisted.Progress)
		assert.Equal(t, upstreamVideoURL, persisted.PrivateData.ResultURL)
		assert.Equal(t, 1_250_000, persisted.Quota, "matching completion facts must not move the settled quota")

		var settledUser model.User
		require.NoError(t, database.First(&settledUser, 21).Error)
		assert.Equal(t, 8_750_000, settledUser.Quota)
	})

	t.Run("artifacts stay available through platform 17", func(t *testing.T) {
		platformAdaptor := relay.GetTaskAdaptor(persisted.Platform)
		require.NotNil(t, platformAdaptor)
		platformAdaptor.Init(&relaycommon.RelayInfo{
			ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: upstream.URL, ApiKey: "sk-test"},
		})

		artifactProvider, isArtifactProvider := platformAdaptor.(channel.TaskArtifactProvider)
		require.True(t, isArtifactProvider)
		artifacts, artifactErr := artifactProvider.ListArtifacts(&persisted)
		require.NoError(t, artifactErr)
		assert.Equal(t, []channel.TaskArtifact{{Key: "video", Type: "video"}}, artifacts)

		contentProvider, isContentProvider := platformAdaptor.(channel.TaskContentRequestProvider)
		require.True(t, isContentProvider)
		contentRequest, contentErr := contentProvider.BuildContentRequest(&persisted, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
		require.NoError(t, contentErr)
		require.NotNil(t, contentRequest)
		assert.Equal(t, upstreamVideoURL, contentRequest.URL)
		assert.Equal(t, http.MethodGet, contentRequest.Method)
		assert.True(t, contentRequest.Credentialless, "artifact fetches must not carry channel credentials")
		assert.Empty(t, contentRequest.Headers)
	})
}

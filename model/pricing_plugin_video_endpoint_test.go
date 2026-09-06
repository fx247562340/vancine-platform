package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	// Importing plugins runs its init, which registers every embedded task
	// plugin into jsplugin.DefaultRegistry — exactly what the running server
	// does, and the generation updatePricing reads.
	_ "github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The video playground decides which models it may offer from the
// `supported_endpoint_types` of GET /v1/models, and that list is assembled here
// in updatePricing. A task plugin that declares the openai_video protocol really
// serves POST /v1/videos for its declared models — but only on a channel it can
// actually be routed to. These tests pin the capability to the intersection of
// the plugin declaration and a genuinely compatible enabled ability, never to a
// channel type and never to a bare model name, and prove the existing
// channel-native and models-table endpoints keep merging unchanged.

// wan3VideoModels are the two Wan3 models the video playground must be able to
// offer; the embedded alibaba task plugin declares both.
var wan3VideoModels = []string{"wan3.0-video", "wan3.0-video-prime"}

// alibabaDeclaredModels is the complete model list of the embedded alibaba task
// plugin. Its openai_video protocol claim is plugin-wide, so every entry binds
// the video protocol.
var alibabaDeclaredModels = []string{
	"wan3.0-video",
	"wan3.0-video-prime",
	"wan2.7-i2v",
	"wan2.7-t2v",
	"wan2.5-t2v-preview",
	"wan2.5-i2v-preview",
	"wan2.2-i2v-flash",
	"wan2.2-i2v-plus",
	"wanx2.1-i2v-plus",
	"wanx2.1-i2v-turbo",
}

// sunoDeclaredModels belong to the one embedded task plugin that does NOT claim
// openai_video, so they must never become video-capable.
var sunoDeclaredModels = []string{"suno_music", "suno_lyrics"}

// sharedVeoModel is declared by BOTH the google and the vertex-ai plugins with a
// plugin-wide openai_video claim. A global model-name set loses that ambiguity;
// only the channel each ability actually sits on can decide which plugin — if
// any — may serve it.
const sharedVeoModel = "veo-3.0-generate-001"

// embeddedVideoPluginGeneration returns the live routing generation and drops
// any cached task-alias view, so alias resolution rebuilds against the channels
// this test inserted instead of a previous test's.
func embeddedVideoPluginGeneration(t *testing.T) *jsplugin.RoutingGeneration {
	t.Helper()
	generation := jsplugin.DefaultRegistry.Generation()
	require.NotNil(t, generation)
	plugin, ok := generation.Get("alibaba")
	require.True(t, ok, "the embedded alibaba task plugin must be registered")
	for _, modelName := range wan3VideoModels {
		require.Contains(t, plugin.Meta.Models, modelName)
	}
	taskAliasViewPtr.Store(nil)
	return generation
}

// countEndpointOccurrences reports how many times one endpoint type appears in a
// model's advertised list, so a duplicated capability is a visible failure.
func countEndpointOccurrences(endpoints []constant.EndpointType, target constant.EndpointType) int {
	count := 0
	for _, endpoint := range endpoints {
		if endpoint == target {
			count++
		}
	}
	return count
}

func insertVideoEndpointChannel(t *testing.T, channelID int, channelType int, models string, modelMapping string) {
	t.Helper()
	channel := &Channel{
		Id:     channelID,
		Type:   channelType,
		Key:    "video-endpoint-key",
		Status: common.ChannelStatusEnabled,
		Name:   "video-endpoint-channel",
		Group:  "default",
		Models: models,
	}
	if modelMapping != "" {
		mapping := modelMapping
		channel.ModelMapping = &mapping
	}
	require.NoError(t, DB.Create(channel).Error)
}

// insertTaskPluginVideoChannel creates a generic task-plugin channel bound to one
// plugin key. Such a channel is matched by that binding alone: its channel type
// carries no provider identity, so a model it serves inherits video capability
// only from the plugin it is bound to.
func insertTaskPluginVideoChannel(t *testing.T, channelID int, pluginKey string, models string) {
	t.Helper()
	channel := &Channel{
		Id:     channelID,
		Type:   constant.ChannelTypeTaskPlugin,
		Key:    "task-plugin-video-key",
		Status: common.ChannelStatusEnabled,
		Name:   "task-plugin-video-channel",
		Group:  "default",
		Models: models,
	}
	channel.SetSetting(dto.ChannelSettings{TaskPluginKey: pluginKey})
	require.NoError(t, DB.Create(channel).Error)
}

func TestTaskPluginVideoRoutesFollowTheOpenAIVideoProtocolClaim(t *testing.T) {
	generation := embeddedVideoPluginGeneration(t)

	routes := taskPluginVideoRoutes(generation)
	require.NotEmpty(t, routes)
	routeByKey := make(map[string]taskPluginVideoRoute, len(routes))
	for _, route := range routes {
		routeByKey[route.pluginKey] = route
	}

	alibaba, ok := routeByKey["alibaba"]
	require.True(t, ok, "the alibaba plugin declares openai_video")
	for _, modelName := range alibabaDeclaredModels {
		assert.Contains(t, alibaba.videoModels, modelName,
			"a plugin-wide openai_video claim binds every model the plugin declares")
	}
	for _, modelName := range append([]string{"gpt-4o", "qwen-image"}, sunoDeclaredModels...) {
		assert.NotContains(t, alibaba.videoModels, modelName,
			"%s is not an alibaba openai_video model", modelName)
	}

	assert.NotContains(t, routeByKey, "sunoapi",
		"a plugin without an openai_video claim confers no video capability")

	// The premise of the plugin-identity test below: two routes hold the same
	// declared model name, so the name alone cannot decide routing.
	google, ok := routeByKey["google"]
	require.True(t, ok, "the google plugin declares openai_video")
	vertexAI, ok := routeByKey["vertex-ai"]
	require.True(t, ok, "the vertex-ai plugin declares openai_video")
	assert.Contains(t, google.videoModels, sharedVeoModel)
	assert.Contains(t, vertexAI.videoModels, sharedVeoModel)
}

func TestPricingAdvertisesOpenAIVideoForPluginDeclaredModelsOnly(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 501, constant.ChannelTypeAli, strings.Join(wan3VideoModels, ","), "")
	insertPricingEndpointChannel(t, 502, constant.ChannelTypeOpenAI, dto.ChannelOtherSettings{})
	insertVideoEndpointChannel(t, 503, constant.ChannelTypeSunoAPI, strings.Join(sunoDeclaredModels, ","), "")
	insertVideoEndpointChannel(t, 506, constant.ChannelTypeAli, "qwen-image", "")
	for _, modelName := range wan3VideoModels {
		insertPricingEndpointAbility(t, 501, modelName)
	}
	insertPricingEndpointAbility(t, 502, "gpt-4o")
	for _, modelName := range sunoDeclaredModels {
		insertPricingEndpointAbility(t, 503, modelName)
	}
	insertPricingEndpointAbility(t, 506, "qwen-image")

	byModel := pricingEndpointTypesByModel(t)

	for _, modelName := range wan3VideoModels {
		assert.Equal(t, 1, countEndpointOccurrences(byModel[modelName], constant.EndpointTypeOpenAIVideo),
			"%s must advertise openai-video exactly once", modelName)
		assert.Contains(t, byModel[modelName], constant.EndpointTypeOpenAI,
			"%s keeps its channel-native endpoint", modelName)
	}
	for _, modelName := range append([]string{"gpt-4o", "qwen-image"}, sunoDeclaredModels...) {
		assert.NotContains(t, byModel[modelName], constant.EndpointTypeOpenAIVideo,
			"%s must not become a video model", modelName)
	}
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, byModel["gpt-4o"])
}

func TestPricingWithholdsOpenAIVideoWhenOnlyIncompatibleChannelsServeTheModel(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	// wan3.0-video is declared by alibaba, whose only compatible channel type is
	// 17. An OpenAI channel and a Kling channel both expose the same name, and
	// the sora plugin does claim channel type 1 — but it does not declare this
	// model, so no plugin may serve it and no video capability is advertised.
	insertVideoEndpointChannel(t, 510, constant.ChannelTypeOpenAI, "wan3.0-video", "")
	insertVideoEndpointChannel(t, 511, constant.ChannelTypeKling, "wan3.0-video", "")
	insertPricingEndpointAbility(t, 510, "wan3.0-video")
	insertPricingEndpointAbility(t, 511, "wan3.0-video")

	byModel := pricingEndpointTypesByModel(t)

	assert.NotContains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo,
		"a model name served only by channels the declaring plugin cannot take over is not video-capable")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAI,
		"channel-native endpoints are untouched")
}

func TestPricingWithholdsOpenAIVideoWhenCompatibleChannelIsDisabled(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	// An Ali channel is exactly what the alibaba plugin can take over, so the
	// only thing that can make it unroutable here is its status.
	insertVideoEndpointChannel(t, 518, constant.ChannelTypeAli, "wan3.0-video", "")
	insertPricingEndpointAbility(t, 518, "wan3.0-video")

	// Positive control on the identical data: with the channel enabled the
	// capability is advertised, so the second half of this test can only be
	// explained by the status flip below.
	byModel := pricingEndpointTypesByModel(t)
	require.Equal(t, 1, countEndpointOccurrences(byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo),
		"precondition: an enabled compatible channel advertises openai-video exactly once")

	// Reproduce the reachable drift instead of a clean cascading disable.
	// UpdateChannelStatus persists the channel status first and then defers
	// UpdateAbilityStatus, only logging when that sync fails and never rolling
	// the status back, so a disabled channel can keep enabled abilities. Only the
	// channel row is written here.
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 518).
		Update("status", common.ChannelStatusManuallyDisabled).Error)
	var ability Ability
	require.NoError(t, DB.Where("channel_id = ? AND model = ?", 518, "wan3.0-video").Take(&ability).Error)
	require.True(t, ability.Enabled,
		"the ability row must stay enabled: this is the drift state, not a cascading disable")

	InvalidatePricingCache()
	byModel = pricingEndpointTypesByModel(t)

	assert.NotContains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo,
		"a disabled channel can never be selected by the distributor, so it must not make the model look video-capable")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAI,
		"upstream endpoint inference from the ability is deliberately left untouched")

	// Channel status is the ONLY reason for the rejection: the plugin system was
	// never disabled, the alibaba route still exists, and the model still resolves
	// to that plugin's declaration.
	routes := taskPluginVideoRoutes(jsplugin.DefaultRegistry.Generation())
	require.NotEmpty(t, routes, "the plugin system stays enabled throughout this test")
	foundAlibabaRoute := false
	for i := range routes {
		if routes[i].pluginKey != "alibaba" {
			continue
		}
		foundAlibabaRoute = true
		assert.True(t, routes[i].servesVideoModel(jsplugin.DefaultRegistry.Generation(), "wan3.0-video"),
			"the model still resolves to the declaring plugin, so channel status is the only gate left to withhold the capability")
	}
	require.True(t, foundAlibabaRoute, "the alibaba plugin still declares openai_video")
}

func TestPricingAdvertisesOpenAIVideoOnceAcrossMixedCompatibleAndIncompatibleChannels(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 512, constant.ChannelTypeAli, "wan3.0-video", "")
	insertVideoEndpointChannel(t, 513, constant.ChannelTypeOpenAI, "wan3.0-video", "")
	insertPricingEndpointAbility(t, 512, "wan3.0-video")
	insertPricingEndpointAbility(t, 513, "wan3.0-video")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, 1, countEndpointOccurrences(byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo),
		"one compatible ability is enough, and the capability must appear exactly once")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAI,
		"both channels' native endpoint still merges")
}

func TestPricingTaskPluginChannelBoundToTheDeclaringPluginAdvertisesOpenAIVideo(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertTaskPluginVideoChannel(t, 514, "alibaba", "wan3.0-video")
	insertPricingEndpointAbility(t, 514, "wan3.0-video")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, 1, countEndpointOccurrences(byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo),
		"a task-plugin channel bound to the declaring plugin is routable")
}

func TestPricingTaskPluginChannelBoundToAnotherPluginDoesNotAdvertiseOpenAIVideo(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertTaskPluginVideoChannel(t, 515, "doubao", "wan3.0-video")
	insertPricingEndpointAbility(t, 515, "wan3.0-video")

	byModel := pricingEndpointTypesByModel(t)

	assert.NotContains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo,
		"a task-plugin channel is matched by its bound plugin key, never by the model name")
}

func TestPricingModelMappingAliasInheritsPluginOpenAIVideoCapability(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 504, constant.ChannelTypeAli, "Wan3-Video-Alias",
		`{"Wan3-Video-Alias":"wan3.0-video"}`)
	insertPricingEndpointAbility(t, 504, "Wan3-Video-Alias")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, 1, countEndpointOccurrences(byModel["Wan3-Video-Alias"], constant.EndpointTypeOpenAIVideo),
		"an alias of a plugin video model on a compatible channel inherits openai-video exactly once")
}

func TestPricingModelMappingAliasOnAnIncompatibleChannelDoesNotInheritOpenAIVideo(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 516, constant.ChannelTypeOpenAI, "Wan3-Video-Alias",
		`{"Wan3-Video-Alias":"wan3.0-video"}`)
	insertPricingEndpointAbility(t, 516, "Wan3-Video-Alias")

	byModel := pricingEndpointTypesByModel(t)

	assert.NotContains(t, byModel["Wan3-Video-Alias"], constant.EndpointTypeOpenAIVideo,
		"resolving an alias to a declared name is not enough: the channel must also be routable")
	assert.NotContains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo,
		"the declared model itself gains nothing from an alias on an incompatible channel")
}

func TestPricingResolvesSharedModelNamesByPluginIdentityNotByGlobalModelSet(t *testing.T) {
	cases := []struct {
		name        string
		channelType int
		wantVideo   bool
		reason      string
	}{
		{
			name:        "google channel",
			channelType: constant.ChannelTypeGemini,
			wantVideo:   true,
			reason:      "the google plugin declares channel type 24",
		},
		{
			name:        "vertex-ai channel",
			channelType: constant.ChannelTypeVertexAi,
			wantVideo:   true,
			reason:      "the vertex-ai plugin declares channel type 41",
		},
		{
			name:        "kling channel",
			channelType: constant.ChannelTypeKling,
			wantVideo:   false,
			reason:      "neither veo plugin declares channel type 50, so a global model set would wrongly advertise it",
		},
		{
			name:        "openai channel",
			channelType: constant.ChannelTypeOpenAI,
			wantVideo:   false,
			reason:      "only the sora plugin claims channel type 1 and it does not declare this model",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			embeddedVideoPluginGeneration(t)
			resetPricingEndpointTestTables(t)

			insertVideoEndpointChannel(t, 520, testCase.channelType, sharedVeoModel, "")
			insertPricingEndpointAbility(t, 520, sharedVeoModel)

			byModel := pricingEndpointTypesByModel(t)

			if testCase.wantVideo {
				assert.Equal(t, 1, countEndpointOccurrences(byModel[sharedVeoModel], constant.EndpointTypeOpenAIVideo),
					testCase.reason)
				return
			}
			assert.NotContains(t, byModel[sharedVeoModel], constant.EndpointTypeOpenAIVideo, testCase.reason)
		})
	}
}

func TestPricingWithholdsOpenAIVideoWhenThePluginSystemIsDisabled(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 517, constant.ChannelTypeAli, "wan3.0-video", "")
	insertPricingEndpointAbility(t, 517, "wan3.0-video")

	require.Equal(t, 1, countEndpointOccurrences(
		pricingEndpointTypesByModel(t)["wan3.0-video"], constant.EndpointTypeOpenAIVideo),
		"precondition: an enabled plugin system advertises the capability")

	jsplugin.DefaultRegistry.SetEnabled(false)
	t.Cleanup(func() {
		jsplugin.DefaultRegistry.SetEnabled(true)
		taskAliasViewPtr.Store(nil)
	})

	assert.Empty(t, taskPluginVideoRoutes(jsplugin.DefaultRegistry.Generation()),
		"a disabled plugin system carries no video route")

	InvalidatePricingCache()
	byModel := pricingEndpointTypesByModel(t)

	assert.NotContains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo,
		"a disabled plugin system must not advertise video capability")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAI,
		"channel-native endpoints survive the plugin system being off")
}

func TestPricingMergesPluginOpenAIVideoWithCustomModelEndpointsWithoutDuplicates(t *testing.T) {
	embeddedVideoPluginGeneration(t)
	resetPricingEndpointTestTables(t)

	insertVideoEndpointChannel(t, 505, constant.ChannelTypeAli, "wan3.0-video", "")
	insertPricingEndpointAbility(t, 505, "wan3.0-video")
	require.NoError(t, DB.Create(&Model{
		ModelName: "wan3.0-video",
		Endpoints: `{
			"openai-video": "/v1/video/generations",
			"image-generation": "/v1/images/generations"
		}`,
		Status:   1,
		NameRule: NameRuleExact,
	}).Error)

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, 1, countEndpointOccurrences(byModel["wan3.0-video"], constant.EndpointTypeOpenAIVideo),
		"a models-table openai-video endpoint must not be duplicated by the plugin capability")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeImageGeneration,
		"the models-table custom endpoint still merges")
	assert.Contains(t, byModel["wan3.0-video"], constant.EndpointTypeOpenAI,
		"the channel-native endpoint still merges")
}

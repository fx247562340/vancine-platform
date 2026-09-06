package model

import (
	"fmt"
	"maps"
	"strings"

	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

type Pricing struct {
	ModelName              string                               `json:"model_name"`
	Description            string                               `json:"description,omitempty"`
	Icon                   string                               `json:"icon,omitempty"`
	Tags                   string                               `json:"tags,omitempty"`
	VendorID               int                                  `json:"vendor_id,omitempty"`
	QuotaType              int                                  `json:"quota_type"`
	ModelRatio             float64                              `json:"model_ratio"`
	ModelPrice             float64                              `json:"model_price"`
	OwnerBy                string                               `json:"owner_by"`
	CompletionRatio        float64                              `json:"completion_ratio"`
	CacheRatio             *float64                             `json:"cache_ratio,omitempty"`
	CreateCacheRatio       *float64                             `json:"create_cache_ratio,omitempty"`
	ImageRatio             *float64                             `json:"image_ratio,omitempty"`
	AudioRatio             *float64                             `json:"audio_ratio,omitempty"`
	AudioCompletionRatio   *float64                             `json:"audio_completion_ratio,omitempty"`
	EnableGroup            []string                             `json:"enable_groups"`
	SupportedEndpointTypes []constant.EndpointType              `json:"supported_endpoint_types"`
	BillingMode            string                               `json:"billing_mode,omitempty"`
	BillingExpr            string                               `json:"billing_expr,omitempty"`
	BillingUsageSchema     map[string]jsplugin.UsageFieldSchema `json:"billing_usage_schema,omitempty"`
	BillingUsageExamples   []jsplugin.UsageExample              `json:"billing_usage_examples,omitempty"`
	PricingVersion         string                               `json:"pricing_version,omitempty"`
}

type PricingVendor struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Icon        string `json:"icon,omitempty"`
}

var (
	pricingMap           []Pricing
	vendorsList          []PricingVendor
	supportedEndpointMap map[string]common.EndpointInfo
	lastGetPricingTime   time.Time
	updatePricingLock    sync.Mutex

	// 缓存映射：模型名 -> 启用分组 / 计费类型
	modelEnableGroups     = make(map[string][]string)
	modelQuotaTypeMap     = make(map[string]int)
	modelEnableGroupsLock = sync.RWMutex{}
)

var (
	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	modelSupportEndpointsLock = sync.RWMutex{}
)

func GetPricing() []Pricing {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		updatePricingLock.Lock()
		defer updatePricingLock.Unlock()
		// Double check after acquiring the lock
		if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
			modelSupportEndpointsLock.Lock()
			defer modelSupportEndpointsLock.Unlock()
			updatePricing()
		}
	}
	return pricingMap
}

func InvalidatePricingCache() {
	updatePricingLock.Lock()
	defer updatePricingLock.Unlock()

	pricingMap = nil
	vendorsList = nil
	lastGetPricingTime = time.Time{}
}

// GetVendors 返回当前定价接口使用到的供应商信息
func GetVendors() []PricingVendor {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		// 保证先刷新一次
		GetPricing()
	}
	return vendorsList
}

// CountedStats is the aggregate result exposed to the homepage
// stats endpoint. Both counts come from a single walk over the
// same pricing list, so the two numbers can never disagree about
// which models were considered.
type CountedStats struct {
	VendorCount int
	ModelCount  int
}

// CountActiveVendorsAndModels walks the provided pricing list once
// and returns the distinct vendor count and the distinct model
// count in a single pass. The caller is responsible for passing the
// SAME anonymous public-available set the public /api/pricing
// endpoint serves — i.e. model.GetPricing() filtered through
// controller.filterPricingByUsableGroups with the anonymous usable
// groups. Counting from the unfiltered list would leak models that
// are only reachable through private groups into a public marketing
// number, so this function deliberately takes an already-filtered
// slice instead of reading the global cache itself.
//
// Counting rules:
//   - A model is counted when its ModelName is non-empty; the same
//     model name is counted once even if several pricing rows carry
//     it.
//   - A vendor is counted when at least one counted model row
//     carries that VendorID. VendorID <= 0 is the legacy
//     "unassigned" bucket and never counts as a real vendor.
//
// An empty (or nil) list returns zero counts — that is the honest
// "nothing is publicly available" state, not an error.
func CountActiveVendorsAndModels(pricing []Pricing) CountedStats {
	if len(pricing) == 0 {
		return CountedStats{}
	}
	vendorSeen := make(map[int]struct{}, len(pricing))
	modelSeen := make(map[string]struct{}, len(pricing))
	vendorCount := 0
	modelCount := 0
	for _, item := range pricing {
		if item.ModelName == "" {
			continue
		}
		if _, ok := modelSeen[item.ModelName]; !ok {
			modelSeen[item.ModelName] = struct{}{}
			modelCount++
		}
		if item.VendorID <= 0 {
			continue
		}
		if _, ok := vendorSeen[item.VendorID]; ok {
			continue
		}
		vendorSeen[item.VendorID] = struct{}{}
		vendorCount++
	}
	return CountedStats{VendorCount: vendorCount, ModelCount: modelCount}
}

func GetModelSupportEndpointTypes(model string) []constant.EndpointType {
	if model == "" {
		return make([]constant.EndpointType, 0)
	}
	modelSupportEndpointsLock.RLock()
	defer modelSupportEndpointsLock.RUnlock()
	if endpoints, ok := modelSupportEndpointTypes[model]; ok {
		return endpoints
	}
	return make([]constant.EndpointType, 0)
}

func getPricingEndpointTypesForAbility(ability AbilityWithChannel, advancedCustomConfigs map[int]*dto.AdvancedCustomConfig) []constant.EndpointType {
	if ability.ChannelType != constant.ChannelTypeAdvancedCustom {
		return common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
	}
	if config := advancedCustomConfigs[ability.ChannelId]; config != nil {
		return config.SupportedEndpointTypesForModel(ability.Model)
	}
	return common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
}

// loadPricingAdvancedCustomConfigs runs inside updatePricing while
// updatePricingLock is held, and nests channelSyncLock.RLock. This defines the
// global lock order updatePricingLock -> channelSyncLock: any code path holding
// channelSyncLock must release it before touching the pricing cache (see
// InitChannelCache / CacheUpdateChannel), otherwise it deadlocks.
// The returned configs are pointers shared with the channel cache; they are
// replaced wholesale on update and never mutated in place, so reading them after
// RUnlock is safe.
func loadPricingAdvancedCustomConfigs(enableAbilities []AbilityWithChannel) map[int]*dto.AdvancedCustomConfig {
	channelIDs := make([]int, 0)
	seen := make(map[int]struct{})
	for _, ability := range enableAbilities {
		if ability.ChannelType != constant.ChannelTypeAdvancedCustom {
			continue
		}
		if _, exists := seen[ability.ChannelId]; exists {
			continue
		}
		seen[ability.ChannelId] = struct{}{}
		channelIDs = append(channelIDs, ability.ChannelId)
	}
	if len(channelIDs) == 0 {
		return nil
	}

	configs := make(map[int]*dto.AdvancedCustomConfig, len(channelIDs))
	if common.MemoryCacheEnabled {
		channelSyncLock.RLock()
		defer channelSyncLock.RUnlock()
		for _, channelID := range channelIDs {
			if config := channel2advancedCustomConfig[channelID]; config != nil {
				configs[channelID] = config
			}
		}
		return configs
	}

	for _, channelID := range channelIDs {
		channel, err := CacheGetChannel(channelID)
		if err != nil {
			common.SysLog(fmt.Sprintf("load advanced custom channel settings error: channel_id=%d, error=%v", channelID, err))
			continue
		}
		if channel.Type != constant.ChannelTypeAdvancedCustom {
			continue
		}
		if config := channel.GetOtherSettings().AdvancedCustom; config != nil {
			configs[channelID] = config
		}
	}
	return configs
}

func appendPricingEndpoint(endpoints []string, endpoint string) []string {
	if endpoint == "" || common.StringsContains(endpoints, endpoint) {
		return endpoints
	}
	return append(endpoints, endpoint)
}

// taskPluginVideoRoute is one enabled task plugin that serves models over the
// openai_video host protocol, paired with the channel-identity filter the task
// distributor pins when it routes to that plugin.
//
// Keeping the plugin key beside the declared models is what makes the video
// endpoint mean "routable": two plugins may declare the same model name, and a
// channel that cannot be taken over by the declaring plugin must not confer the
// capability just because the name matches.
type taskPluginVideoRoute struct {
	pluginKey   string
	videoModels map[string]struct{}
	// identity is the single FilterTaskPluginIdentity the distributor applies
	// for this plugin. A task-plugin channel matches only by its bound key;
	// every other channel matches only when its type is one the plugin declares.
	identity []taskdto.ChannelFilter
}

// taskPluginVideoRoutes lists the video routes of the current generation. A
// protocol claim may narrow itself with its own `models` list; an empty claim
// binds every model the plugin declares. A disabled plugin system, or a
// generation that carries no openai_video claim, yields nothing, so no model is
// advertised as video-capable.
func taskPluginVideoRoutes(generation *jsplugin.RoutingGeneration) []taskPluginVideoRoute {
	plugins := generation.Plugins()
	if len(plugins) == 0 {
		return nil
	}
	routes := make([]taskPluginVideoRoute, 0, len(plugins))
	for _, plugin := range plugins {
		if plugin == nil || plugin.Meta.Key == "" {
			continue
		}
		videoModels := make(map[string]struct{})
		for _, claim := range plugin.Meta.Protocols {
			if claim.Name != jsplugin.ProtocolOpenAIVideo {
				continue
			}
			declared := claim.Models
			if len(declared) == 0 {
				declared = plugin.Meta.Models
			}
			for _, name := range declared {
				if strings.TrimSpace(name) != "" {
					videoModels[name] = struct{}{}
				}
			}
		}
		if len(videoModels) == 0 {
			continue
		}
		// The same narrowing pinnedTaskPluginChannelTypes applies: a task-plugin
		// channel is matched by its bound key, never by channel type.
		channelTypes := make([]int, 0, len(plugin.Meta.ChannelTypes))
		for _, channelType := range plugin.Meta.ChannelTypes {
			if channelType == 0 || channelType == constant.ChannelTypeTaskPlugin {
				continue
			}
			channelTypes = append(channelTypes, channelType)
		}
		routes = append(routes, taskPluginVideoRoute{
			pluginKey:   plugin.Meta.Key,
			videoModels: videoModels,
			identity: []taskdto.ChannelFilter{{
				Kind:                   taskdto.FilterTaskPluginIdentity,
				TaskPluginKey:          plugin.Meta.Key,
				TaskPluginChannelTypes: channelTypes,
			}},
		})
	}
	return routes
}

// servesVideoModel reports whether a public model name reaches a model THIS
// plugin declares for openai_video. All three hops keep the plugin identity: an
// exact declaration, another spelling of one (ASCII-folded), or a channel
// model_mapping alias whose target is bound to this plugin's key. Resolving to a
// declared name owned by a different plugin is not enough.
func (route taskPluginVideoRoute) servesVideoModel(generation *jsplugin.RoutingGeneration, modelName string) bool {
	if _, served := route.videoModels[modelName]; served {
		return true
	}
	if canonical, ok := generation.CanonicalModel(modelName); ok {
		if _, served := route.videoModels[canonical]; served {
			return true
		}
	}
	if target, ok := ResolveTaskModelAlias(generation, modelName); ok {
		if target.Declared == "" || target.PluginKey != route.pluginKey {
			return false
		}
		_, served := route.videoModels[target.Declared]
		return served
	}
	return false
}

// routableVideoPluginKeys maps each candidate public model to the plugin keys
// that can really be routed to for it: at least one enabled ability whose actual
// channel is enabled and satisfies that plugin's identity filter. Compatibility
// is decided by the shared ChannelSatisfiesFilters matcher, so pricing cannot
// drift from the distributor's own task-plugin selection rule.
//
// The channel status check is deliberately stricter than the rest of updatePricing.
// GetAllEnableAbilityWithChannels filters on abilities.enabled alone, so an
// ability whose channel was disabled afterwards still arrives here as enabled:
// UpdateChannelStatus persists the channel status first and then defers
// UpdateAbilityStatus, only logging if that sync fails and never rolling the
// status back. Such a channel can never be selected by the distributor, so
// advertising openai-video for it would put an unroutable model on the video
// page. Only this Vancine-added task-plugin video inference is tightened; the
// upstream endpoint inference for other endpoint types is left untouched.
//
// Only candidate models are looked up, which keeps the channel reads bounded to
// the models a video plugin declares instead of every priced model.
func routableVideoPluginKeys(routes []taskPluginVideoRoute, enableAbilities []AbilityWithChannel, candidates map[string]struct{}) map[string]map[string]struct{} {
	channelIDs := make([]int, 0, len(routes))
	seenChannel := make(map[int]struct{}, len(routes))
	for _, ability := range enableAbilities {
		if _, isCandidate := candidates[ability.Model]; !isCandidate {
			continue
		}
		if _, exists := seenChannel[ability.ChannelId]; exists {
			continue
		}
		seenChannel[ability.ChannelId] = struct{}{}
		channelIDs = append(channelIDs, ability.ChannelId)
	}
	if len(channelIDs) == 0 {
		return nil
	}

	channelsByID := make(map[int]*Channel, len(channelIDs))
	for _, channelID := range channelIDs {
		channel, err := CacheGetChannel(channelID)
		if err != nil {
			common.SysLog(fmt.Sprintf("load task plugin video channel error: channel_id=%d, error=%v", channelID, err))
			continue
		}
		channelsByID[channelID] = channel
	}

	routable := make(map[string]map[string]struct{})
	for _, ability := range enableAbilities {
		if _, isCandidate := candidates[ability.Model]; !isCandidate {
			continue
		}
		channel := channelsByID[ability.ChannelId]
		if channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		for _, route := range routes {
			ok, _ := ChannelSatisfiesFilters(channel, ability.Model, route.identity)
			if !ok {
				continue
			}
			pluginKeys := routable[ability.Model]
			if pluginKeys == nil {
				pluginKeys = make(map[string]struct{}, len(routes))
				routable[ability.Model] = pluginKeys
			}
			pluginKeys[route.pluginKey] = struct{}{}
		}
	}
	return routable
}

// appendTaskPluginVideoEndpoints adds the openai-video capability to a priced
// model only when both halves line up: an enabled task plugin declares that
// model for openai_video, and the model has at least one enabled ability on a
// channel that plugin can actually take over. Channel-native and models-table
// endpoints are kept and openai-video is never duplicated. This is deliberately
// model- and channel-scoped: it must not widen
// common.GetEndpointTypesByChannelType, which would mark every model of a
// channel type as video-capable.
func appendTaskPluginVideoEndpoints(modelSupportEndpointsStr map[string][]string, generation *jsplugin.RoutingGeneration, enableAbilities []AbilityWithChannel) {
	routes := taskPluginVideoRoutes(generation)
	if len(routes) == 0 {
		return
	}

	candidates := make(map[string]struct{})
	for modelName := range modelSupportEndpointsStr {
		for _, route := range routes {
			if route.servesVideoModel(generation, modelName) {
				candidates[modelName] = struct{}{}
				break
			}
		}
	}
	if len(candidates) == 0 {
		return
	}

	routable := routableVideoPluginKeys(routes, enableAbilities, candidates)
	if len(routable) == 0 {
		return
	}

	videoEndpoint := string(constant.EndpointTypeOpenAIVideo)
	for modelName, pluginKeys := range routable {
		for _, route := range routes {
			if _, ok := pluginKeys[route.pluginKey]; !ok {
				continue
			}
			if !route.servesVideoModel(generation, modelName) {
				continue
			}
			modelSupportEndpointsStr[modelName] = appendPricingEndpoint(modelSupportEndpointsStr[modelName], videoEndpoint)
			break
		}
	}
}

func updatePricing() {
	//modelRatios := common.GetModelRatios()
	enableAbilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		common.SysLog(fmt.Sprintf("GetAllEnableAbilityWithChannels error: %v", err))
		return
	}
	// 预加载模型元数据与供应商一次，避免循环查询
	var allMeta []Model
	_ = DB.Find(&allMeta).Error
	metaMap := make(map[string]*Model)
	prefixList := make([]*Model, 0)
	suffixList := make([]*Model, 0)
	containsList := make([]*Model, 0)
	for i := range allMeta {
		m := &allMeta[i]
		if m.NameRule == NameRuleExact {
			metaMap[m.ModelName] = m
		} else {
			switch m.NameRule {
			case NameRulePrefix:
				prefixList = append(prefixList, m)
			case NameRuleSuffix:
				suffixList = append(suffixList, m)
			case NameRuleContains:
				containsList = append(containsList, m)
			}
		}
	}

	// 将非精确规则模型匹配到 metaMap
	for _, m := range prefixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasPrefix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range suffixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasSuffix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range containsList {
		for _, pricingModel := range enableAbilities {
			if strings.Contains(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}

	// 预加载供应商
	var vendors []Vendor
	_ = DB.Find(&vendors).Error
	vendorMap := make(map[int]*Vendor)
	for i := range vendors {
		vendorMap[vendors[i].Id] = &vendors[i]
	}

	// 初始化默认供应商映射
	initDefaultVendorMapping(metaMap, vendorMap, enableAbilities)

	// 构建对前端友好的供应商列表
	vendorsList = make([]PricingVendor, 0, len(vendorMap))
	for _, v := range vendorMap {
		vendorsList = append(vendorsList, PricingVendor{
			ID:          v.Id,
			Name:        v.Name,
			Description: v.Description,
			Icon:        v.Icon,
		})
	}

	modelGroupsMap := make(map[string]*types.Set[string])

	for _, ability := range enableAbilities {
		groups, ok := modelGroupsMap[ability.Model]
		if !ok {
			groups = types.NewSet[string]()
			modelGroupsMap[ability.Model] = groups
		}
		groups.Add(ability.Group)
	}

	//这里使用切片而不是Set，因为一个模型可能支持多个端点类型，并且第一个端点是优先使用端点
	modelSupportEndpointsStr := make(map[string][]string)
	advancedCustomConfigs := loadPricingAdvancedCustomConfigs(enableAbilities)

	// 先根据已有能力填充原生端点
	for _, ability := range enableAbilities {
		endpoints := modelSupportEndpointsStr[ability.Model]
		channelTypes := getPricingEndpointTypesForAbility(ability, advancedCustomConfigs)
		for _, channelType := range channelTypes {
			if !common.StringsContains(endpoints, string(channelType)) {
				endpoints = append(endpoints, string(channelType))
			}
		}
		modelSupportEndpointsStr[ability.Model] = endpoints
	}

	// 再补充模型自定义端点：若配置有效则追加到已有推断，不再裁剪渠道真实能力
	for modelName, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := common.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			endpoints := modelSupportEndpointsStr[modelName]
			for k, v := range raw {
				switch v.(type) {
				case string, map[string]interface{}:
					endpoints = appendPricingEndpoint(endpoints, k)
				}
			}
			if len(endpoints) > 0 {
				modelSupportEndpointsStr[modelName] = endpoints
			}
		}
	}

	// 最后补充任务插件声明的视频端点：只有当前启用 generation 中确实声明了
	// openai_video 协议的插件模型（含渠道 model_mapping 别名）才追加 openai-video。
	pluginGeneration := jsplugin.DefaultRegistry.Generation()
	appendTaskPluginVideoEndpoints(modelSupportEndpointsStr, pluginGeneration, enableAbilities)

	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	for model, endpoints := range modelSupportEndpointsStr {
		supportedEndpoints := make([]constant.EndpointType, 0)
		for _, endpointStr := range endpoints {
			endpointType := constant.EndpointType(endpointStr)
			supportedEndpoints = append(supportedEndpoints, endpointType)
		}
		modelSupportEndpointTypes[model] = supportedEndpoints
	}

	// 构建全局 supportedEndpointMap（默认 + 自定义覆盖）
	supportedEndpointMap = make(map[string]common.EndpointInfo)
	// 1. 默认端点
	for _, endpoints := range modelSupportEndpointTypes {
		for _, et := range endpoints {
			if info, ok := common.GetDefaultEndpointInfo(et); ok {
				if _, exists := supportedEndpointMap[string(et)]; !exists {
					supportedEndpointMap[string(et)] = info
				}
			}
		}
	}
	// 2. 自定义端点（models 表）覆盖默认
	for _, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := common.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			for k, v := range raw {
				switch val := v.(type) {
				case string:
					supportedEndpointMap[k] = common.EndpointInfo{Path: val, Method: "POST"}
				case map[string]interface{}:
					ep := common.EndpointInfo{Method: "POST"}
					if p, ok := val["path"].(string); ok {
						ep.Path = p
					}
					if m, ok := val["method"].(string); ok {
						ep.Method = strings.ToUpper(m)
					}
					supportedEndpointMap[k] = ep
				default:
					// ignore unsupported types
				}
			}
		}
	}

	pricingMap = make([]Pricing, 0)
	for model, groups := range modelGroupsMap {
		pricing := Pricing{
			ModelName:              model,
			EnableGroup:            groups.Items(),
			SupportedEndpointTypes: modelSupportEndpointTypes[model],
		}

		// 补充模型元数据（描述、标签、供应商、状态）
		if meta, ok := metaMap[model]; ok {
			// 若模型被禁用(status!=1)，则直接跳过，不返回给前端
			if meta.Status != 1 {
				continue
			}
			pricing.Description = meta.Description
			pricing.Icon = meta.Icon
			pricing.Tags = meta.Tags
			pricing.VendorID = meta.VendorID
		}
		modelPrice, findPrice := ratio_setting.GetModelPrice(model, false)
		if findPrice {
			pricing.ModelPrice = modelPrice
			pricing.QuotaType = 1
		} else {
			modelRatio, _, _ := ratio_setting.GetModelRatio(model)
			pricing.ModelRatio = modelRatio
			pricing.CompletionRatio = ratio_setting.GetCompletionRatio(model)
			pricing.QuotaType = 0
		}
		if cacheRatio, ok := ratio_setting.GetCacheRatio(model); ok {
			pricing.CacheRatio = &cacheRatio
		}
		if createCacheRatio, ok := ratio_setting.GetCreateCacheRatio(model); ok {
			pricing.CreateCacheRatio = &createCacheRatio
		}
		if imageRatio, ok := ratio_setting.GetImageRatio(model); ok {
			pricing.ImageRatio = &imageRatio
		}
		if ratio_setting.ContainsAudioRatio(model) {
			audioRatio := ratio_setting.GetAudioRatio(model)
			pricing.AudioRatio = &audioRatio
		}
		if ratio_setting.ContainsAudioCompletionRatio(model) {
			audioCompletionRatio := ratio_setting.GetAudioCompletionRatio(model)
			pricing.AudioCompletionRatio = &audioCompletionRatio
		}
		if billingMode := billing_setting.GetBillingMode(model); billingMode == "tiered_expr" {
			if expr, ok := billing_setting.GetBillingExpr(model); ok && strings.TrimSpace(expr) != "" {
				pricing.BillingMode = billingMode
				pricing.BillingExpr = expr
			}
		} else if target, resolved := ResolveTaskModelAlias(pluginGeneration, model); resolved && target.Declared != "" {
			if tailMode := billing_setting.GetBillingMode(target.Declared); tailMode == "tiered_expr" {
				if expr, ok := billing_setting.GetBillingExpr(target.Declared); ok && strings.TrimSpace(expr) != "" {
					pricing.BillingMode = tailMode
					pricing.BillingExpr = expr
				}
			}
		}
		plugin, ok := pluginGeneration.GetByModel(model)
		if !ok {
			if target, resolved := ResolveTaskModelAlias(pluginGeneration, model); resolved {
				plugin, ok = pluginGeneration.Get(target.PluginKey)
			}
		}
		if ok && plugin != nil && len(plugin.Meta.UsageSchema) > 0 {
			pricing.BillingUsageSchema = make(map[string]jsplugin.UsageFieldSchema, len(plugin.Meta.UsageSchema))
			for key, field := range plugin.Meta.UsageSchema {
				field.Enum = append([]string(nil), field.Enum...)
				field.Description = maps.Clone(field.Description)
				pricing.BillingUsageSchema[key] = field
			}
			if len(plugin.Meta.UsageExamples) > 0 {
				pricing.BillingUsageExamples = make([]jsplugin.UsageExample, len(plugin.Meta.UsageExamples))
				for index, example := range plugin.Meta.UsageExamples {
					facts := make(map[string]any, len(example.Facts))
					for key, value := range example.Facts {
						facts[key] = value
					}
					pricing.BillingUsageExamples[index] = jsplugin.UsageExample{
						Label: example.Label,
						Facts: facts,
					}
				}
			}
		}
		pricingMap = append(pricingMap, pricing)
	}

	// 防止大更新后数据不通用
	if len(pricingMap) > 0 {
		pricingMap[0].PricingVersion = "5a90f2b86c08bd983a9a2e6d66c255f4eaef9c4bc934386d2b6ae84ef0ff1f1f"
	}

	// 刷新缓存映射，供高并发快速查询
	modelEnableGroupsLock.Lock()
	modelEnableGroups = make(map[string][]string)
	modelQuotaTypeMap = make(map[string]int)
	for _, p := range pricingMap {
		modelEnableGroups[p.ModelName] = p.EnableGroup
		modelQuotaTypeMap[p.ModelName] = p.QuotaType
	}
	modelEnableGroupsLock.Unlock()

	lastGetPricingTime = time.Now()
}

// GetSupportedEndpointMap 返回全局端点到路径的映射
func GetSupportedEndpointMap() map[string]common.EndpointInfo {
	return supportedEndpointMap
}

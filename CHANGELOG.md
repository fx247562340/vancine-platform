## 1.10.1 - 2026-08-31

### 修复

- 修正 Pi 动态模型目录中 `doubao-seed-evolving` 的上下文窗口，由错误的 256K 改为 1024K。
- `Doubao-Seed-2.1-pro` 与 `Doubao-Seed-2.1-turbo` 仍保持 256K。
- 最大输出长度仍为 256K。
- Pi Provider 会在目录刷新后取得新值，无需重新发布 npm 包。

## 1.10.0 - 2026-08-31

### Pi Provider 与模型目录

- 新增公开 `GET /api/pi/catalog`，为 Vancine 自维护的 Pi 社区 Provider 提供实时模型目录。该目录不是 npm 已发布包，也不构成与 Pi 的官方合作、认证或背书。
- 目录动态覆盖平台当前启用且具备已验证 Pi 元数据的 Token 计费 OpenAI Chat Completions 模型；首批重点验证元数据包括 hy4-preview、deepseek-v4-flash-vision-exp、glm-5.3-flash 与 qwen3.8-flash。并非所有平台模型都会无条件进入 Pi。
- 启用状态、OpenAI Chat Completions 能力以及 USD/百万 Tokens 价格来自平台实时配置；静态 registry 只维护已验证的 Pi 元数据（名称、模态、上下文窗口、最大输出、reasoning）。
- 目录自动排除未启用、不支持实时 Chat Completions、按次计费、动态/阶梯计费、缺少必要 Pi 元数据或价格非法的模型。缺少可靠元数据时宁可省略，不得猜测。
- 支持 ETag、Last-Modified 和条件请求（304）。模型上下架或价格变化会在下次目录刷新中反映，无需重新发布 npm Provider 包。

## 1.9.5 - 2026-08-31

### 文档与获客

- OpenCode 可通过 Models.dev Provider 目录直接使用 /connect 添加 Vancine，基础接入无需手写 Provider JSON。
- opencode.json 保留为高级配置和兼容后备，用于覆盖 Base URL、模型 whitelist / blacklist，或实时目录异常时的手动配置。
- 用户仍需使用自己的 Vancine API Key；Models.dev 目录收录不构成与 OpenCode 的官方合作或背书。

## 1.9.4 - 2026-08-31

### 文档与获客

- 新增面向 Coding Agent 的快速中国模型英文获客落地页（英文源、七语言支持），canonical 路径为 /guides/fast-coding-models，精确比较 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 与 Qwen3.8 Flash 四个模型。
- 页面接入动态定价与能力信息（价格与能力实时读取自 /api/pricing，缺字段的模型明确降级且不替代）、OpenAI 兼容 Quickstart 示例、固定 owned-media UTM 转化 CTA（未登录指向注册页、已登录指向操练场），并提供服务端与客户端一致的最小化 SEO metadata、固定 canonical 及 Host/查询/UTM 污染防护；sitemap 收录精确 canonical 从 18 条增至 19 条。
- 顶部“API Solutions”菜单新增独立 Guides 小节（分隔线 + 小节标题，桌面与移动导航共用单一数据源），不改变现有四个 API 产品项顺序，也不进入首页 Developer solutions 区块或 Docs 侧边栏。
- 明确与 Pi coding-agent benchmark 的证据边界：该 benchmark 仅包含 glm-5.3-flash 与 qwen3.8-flash，不包含 hy4-preview 与 deepseek-v4-flash-vision-exp（deepseek-v4-flash 为不同模型 ID），不将未测试模型描述为已实测。

## 1.9.3 - 2026-08-30

### 修复

- 恢复待支付充值订单的定时过期清理任务；应用每小时扫描一次，将创建超过一小时且状态仍为 pending 的订单更新为 expired，避免未完成订单长期停留在待支付状态。

## 1.9.2 - 2026-08-30

### 文档与获客

- 新增 Agent 接入中心，以及 OpenCode、Cline 和 Roo Code 的独立接入指南，提供固定 Base URL、占位 API Key、模型配置步骤和常见错误排查。
- OpenCode、Cline 和 Roo Code 的公开状态统一为“配置就绪”；OpenCode v1.18.3 的单次受控连通性实测仅在独立“验证证据”章节中说明，并明确 Vancine 不是这些工具的官方供应商、合作伙伴或内置 Provider。
- 三个接入指南支持七种语言、站内文档搜索、嵌套路由和未知子路径本地化 404；模型能力、上下文限制和价格继续由模型与定价页面统一维护。
- Agent 接入中心及三个详情页已加入 sitemap，并提供独立的服务端与客户端 SEO metadata、固定 canonical，以及 Host、查询参数和 UTM 污染防护。

## 1.9.0 - 2026-08-28

### SEO 与获客

- 新增 `/coding-agent-benchmark` 公开页面，展示 8 个国内 AI 模型完成同一项 Pi 编程智能体任务的实测结果，包括任务通过情况、运行时间、模型请求次数、Token 用量和生产环境实际计费。
- 提供脱敏的公开 JSON 数据、Pi 0.84.3 `models.json` 配置示例和可复制的模型选择命令；明确这是一项单任务、单次运行的记录，不作为模型综合能力排名或长期性能结论。
- 基准结果覆盖 8 个模型、45 次模型请求、94,502 Tokens 和 $0.037618 实际计费；任务工作区未发起网络工具调用，也未创建意外文件，测试目录保持不变。
- 页面已加入 sitemap、首页 Evidence 和 Docs Agents 内部入口，提供服务端 SEO metadata、七种界面语言、公开结果下载及防 Host、查询参数和 UTM 污染的固定 canonical。

## 1.8.1 - 2026-08-28

### 修复

- 修正 `/glm-api` 的 OpenRouter 价格比较口径，明确比较采用 2026 年 8 月 28 日所链接展示的公开价格，并包含当时有效的供应商促销。
- 同步更新七种界面语言的核验日期、价格说明和常见问题，避免页面同时出现“包含促销”和“排除促销”的矛盾表述。
- 六项 Vancine/OpenRouter 展示价格、20% 差价、模型 ID、价格来源链接和 canonical 均保持不变。

## 1.8.0 - 2026-08-28

### SEO 与获客

- 新增 `/glm-api` 获客页面，在一个固定 canonical 页面中同时介绍 GLM-5.3 与 GLM-5.3-Flash，不增加重复的 Flash 独立路由。
- 展示两个模型输入、输出和缓存输入价格与 OpenRouter 公开列价的对比；页面六项 Vancine 价格均为对应 OpenRouter 列价的 80%，并保留价格来源与口径说明。
- 提供 OpenAI-compatible 快速调用示例、模型选择建议以及根据登录状态变化的注册或 Playground 入口。
- 新页面已加入 sitemap 和 OpenRouter Alternative 内部入口，提供服务端 SEO metadata、七种界面语言和移动端可访问布局。

## 1.7.0 - 2026-08-27

### SEO 与获客

- 新增 `/openrouter-alternative` 高意向获客页面，集中展示 Vancine 精选国内旗舰模型与 OpenRouter 对应公开价格的对比。
- qwen3.8-max、kimi-k3、glm-5.3 与 MiniMax-M3 的页面价格对比采用可核查来源和明确口径，展示 Vancine 当前价格为对应 OpenRouter 列价的 80%，不作“全部模型都更便宜”的泛化承诺。
- 提供 OpenAI-compatible SDK、curl 迁移示例和经过核实的模型 ID 映射说明，并根据登录状态引导用户注册或打开 Playground。
- 新页面已加入 sitemap、服务端 SEO metadata 和首页内部入口，支持七种界面语言，并保留外部获客活动的白名单 UTM 归因参数。

## 1.6.0 - 2026-08-27

### SEO 与页面元数据

- 首页、定价页、Kimi K3、Seedance 2.5 与 AI Media 页面现在由客户端路由持续维护各自的 title、description、canonical、Open Graph 和 Twitter metadata。
- 防止异步加载的系统名称覆盖公开营销页面标题；离开营销页面后自动恢复后台配置的系统名称。
- 页面切换、并发挂载、语言更新和普通状态刷新不会串用或残留上一页面的 metadata。
- Kimi K3、Seedance 2.5 与 AI Media 的 Twitter metadata 已覆盖全部七种界面语言，英文内容与服务端预渲染保持一致。

## 1.5.0 - 2026-08-26

### SEO 与获客

- 新增固定的 robots.txt，并完善 sitemap.xml 的 GET/HEAD 响应、缓存策略和公开页面目录。
- 首页、定价、文档、Kimi K3、Seedance 2.5 与 AI Media 营销页现在直接返回服务端可见的 title、description、canonical、Open Graph 和 Twitter metadata。
- canonical 始终固定到 https://vancine.com，不受 Host、Forwarded、Origin、UTM 或其他查询参数影响。
- 保持未知 SPA 路由兼容，并确保 /api、/v1 与 /assets 路径不会错误返回营销页面。

## 1.3.0 - 2026-08-24

### 新功能

- 任务日志支持成功视频任务的站内预览，并提供打开源地址与浏览器原生下载入口。
- 桌面表格和移动端任务卡片统一显示视频结果入口，支持键盘操作及关闭弹窗后焦点恢复。

### 兼容性

- 视频地址按 result_url、历史 fail_reason、data.content.video_url 的顺序解析。
- 跳过需要 Access Token 的 /v1/videos/{task_id}/content 代理地址；直接使用可播放的 HTTP(S) 或合法 data:video 地址。
- 跨域上游地址的原生下载属于浏览器 best-effort 行为，最终表现取决于上游响应头与浏览器策略。

## 1.2.0 - 2026-08-23

### 新功能

- 新增独立图片工作台 `/playground/image`，与原 Chat Playground 的页面、模型目录和请求状态隔离。
- 支持阿里云 Qwen Image 3.0/3.0 Pro、Wan 2.7 Image Pro，以及火山方舟 Seedream 5.0 Lite/Pro 的图片生成、参考图、模型专属参数、预览与下载。
- 图片模型与渠道按用户分组、模型能力和供应商协议在服务端筛选；请求继续复用现有鉴权、分发、计费、日志和图片 Relay。
- 新增按用户隔离的浏览器生成历史；模型切换、刷新和多标签页操作不会丢失已完成的 URL 结果，Base64 和参考图二进制不写入持久存储。

### 可靠性

- 图片参数、参考图格式与大小、上游结果和实际交付数量在计费结算前后进行严格校验，空结果或不可用结果不会被当作成功收费。
- 修复小窗口结果区域无法完整滚动、历史切换丢失、重试快照漂移、下载降级及跨标签活动任务心跳覆盖问题。

## 1.0.26 - 2026-08-04

### 品牌

- Default 主题 footer 去掉 New API 版权与 attribution（双品牌残留），只保留 Vancine 系统名 + 用户协议/隐私政策链接。AGPL 文件头/LICENSE 保留。

## 1.0.25 - 2026-08-04

### 修复

- 个人中心更换邮箱发送验证码失败（"Turnstile token 为空"）：email-bind 弹窗接入 Turnstile 人机验证，发送验证码时带上 token；发送成功后重置一次性 token。

## 1.0.24 - 2026-08-04

### 新功能

- Google OAuth 登录：海外开发者最常用的一键登录。支持登录页 "Continue with Google" 按钮 + 后台 OAuth 配置；走统一 OAuth JSON 流程（对齐 GitHub/Discord），登录后正确进入控制台。回调地址由 SPA 路由 /oauth/google 处理。

## 1.0.23 - 2026-08-03

### 性能

- Default 首屏优化：i18n 各语言包懒加载（resource-loader + 7 个独立 locale chunk），入口从 ~3.14MB 降到 ~745KB（-76%）；首屏仅加载当前语言，切语言按需加载对应 chunk。
- 修复 Default 暗色主题首帧白屏（FOUC）：index.html 注入首帧前同步内联脚本，按 cookie `vite-ui-theme` 解析为 `dark`/`light` 并打 class，匹配 ThemeProvider 解析顺序；移动端 chrome 颜色同步。
- i18n 资源加载策略对齐 Classic：仅加载当前语言，避免 6 个无用语言包拖慢首屏。

# Changelog

All notable Vancine platform release and operations changes are tracked here.

## 1.0.18 - 2026-07-27

### 修复

- 修复部署客户端 SSH 密钥问题：deploy.sh 显式指定专用部署密钥（-i + IdentitiesOnly），不再依赖 ssh-agent 或 ssh_config host 匹配，解决部署时 Permission denied (publickey)。
- 修复 zh-TW 简繁过度转换：修正 22 处字符级误转（控製檯→控制台、控製→控制、平臺→平台、髮卡→發卡），正确繁体转换（系統/重複/發現/關係/檔案 等）未受影响。

## 1.0.17 - 2026-07-27

### Classic 主题多语言完成（7 语言全站支持）

- 修复 i18n 资源双嵌套回归（注册时多包一层 translation 致所有 t() 失效），语言切换器从 2 语言扩展到全部 7 语言。
- isZh 二值语言判断全面重构：About/Waitlist/KimiK3/Seedance/AiMedia 富内容页迁移到独立 i18next namespace（about/waitlist/kimi/seedance/aimedia），可翻译字段进 locale、非翻译字段（icon/color/模型名）留组件。
- 主 namespace 补全：zh-TW（简繁转换+术语修正）、fr、ja、ru、vi 全部对齐 zh-CN，各 4229+ key。
- 补全 131 个孤儿 key（代码引用但从未进任何 locale）及 en 的 39 个支付设置历史缺口。
- 55 个硬编码中文提示（showError/showSuccess/Toast）i18n 化，动态拼接改为 i18next 插值。
- 至此 Classic 主题 7 语言（en/zh-CN/zh-TW/fr/ja/ru/vi）全站支持。

## 1.0.16 - 2026-07-26

### 文档参数补全

- 图片生成参数补全至 8 个（新增 response_format/output_format/image/watermark），并注明 Seedream 高级参数（组图 sequential_image_generation、提示词优化 optimize_prompt_options）需渠道开启 PassThrough 才透传。
- 视频生成参数补全至 7 个（新增 image/images/duration/metadata），附 metadata 扩展参数说明（resolution/ratio/frames/seed/watermark/camera_fixed/generate_audio）。
- 音频 TTS 参数补全至 5 个（新增 response_format 六种格式、speed 语速）。
- 3D 生成明确异步任务流程（提交拿 task_id，轮询 GET /v1/video/generations/{task_id}，从 metadata.url 取 3D 模型文件），注明 Doubao-Seed3D-2.0 需至少一张参考图。

## 1.0.15 - 2026-07-26

### 文档模型清单与生产平台对齐

- 文本模型清单更新为生产实际的 21 个（下线 Doubao-Seed-2.0-lite/mini、MiniMax-M2.5；新增 Seed-2.1 系列、kimi-k3/k2.7-code 系列、glm-5.2、MiniMax-M2.7/M3、LongCat-2.0）。
- 图片模型更新：下线 Seedream-4.0/4.5，新增 Doubao-Seedream-5.0-pro 与 wan2.7-image/wan2.7-image-pro。
- 修正 Seedream 尺寸说明：5.0-pro 最小 921,600 像素（1024x1024 可用、仅支持单图）；5.0-lite 最小 3,686,400 像素（依据火山方舟官方文档）。
- 文本模型标题数量改为动态计数（i18next {{count}} 插值），随清单自动更新。

## 1.0.14 - 2026-07-26

### 文档多页重建

- 文档重建为多页站点：/docs/:slug 路由 + DocsLayout 三栏（sticky 分组侧边栏 + 右侧「在此页面」TOC）+ registry 懒加载 14 个页面。
- i18next docs namespace，7 语言全文翻译（en/zh-CN/zh-TW/fr/ja/ru/vi），正文走 locale JSON。
- 代码块 highlight.js 语法高亮（深浅色作用域主题）+ curl/Python/Node 语言 tab + 复制按钮。
- 14 页内容从原单页完整迁移（模型/音色/状态表等技术细节无丢失）。
- 新增文档搜索（标题优先 + 内容片段）、上下篇导航、页面反馈、public/llms.txt（14 链接英文索引）。
- 修复 3 个交互 bug：sticky 被 .semi-layout-content overflow 破坏、highlight.js 双主题全局冲突、agents 页 baseUrl 插值泄漏。

## 1.0.13 - 2026-07-25

### 注册自动登录 + Dashboard 快速上手引导（P0-1）

- 注册成功后自动登录：`controller/user.go` 的 `Register` 注册成功后改为调用 `setupLogin` 建立 session，返回与登录一致的用户数据；前端 `RegisterForm` 注册成功直接跳 `/console`，不再重定向 `/login` 二次输入密码。
- 新增 `GettingStartedCard` 三步引导卡片（试用 Playground -> 获取 API Key -> 发起第一次请求），仅 role<10 普通用户可见、可关闭、关闭状态按 userId 独立记忆；布局为紧凑等高卡片 + 全宽 curl 代码块（bash 标签 + 复制按钮）。
- curl 示例使用平台实际可用模型 `deepseek-v4-flash`。
- i18n：11 个新 key 补入实际加载的 6 个语言文件（zh-CN/zh-TW/fr/ja/ru/vi）。Classic i18n 用 `load:'currentOnly'`，zh.json 未被 import。
- 注册自动生成初始令牌由 `GENERATE_DEFAULT_TOKEN` 控制，本地开发 compose 已开启；生产需在 .env 手动加 `GENERATE_DEFAULT_TOKEN=true`。

### 首屏性能（P0-2）

- 首页 Hero 背景视频从 4K(3840x2160, 26MB, 10.9Mbps) 压缩到 1080p(1920x1080, 4.8MB, 2.0Mbps, H.264 CRF28 faststart)，-81%。
- 新增首帧 poster `hero-poster.jpg`(102KB) 首屏秒显；`HeroSection` 移除 `autoPlay`，改为浏览器空闲（requestIdleCallback，Safari 降级 setTimeout）后 `play()` 延迟播放；`preload` 改 `metadata`；`prefers-reduced-motion` 时仅显示 poster 不播放。

### Notes

- 主包 9MB 路由级代码分割与 @lobehub/icons 通配符导入治理本次未做，后续迭代。

## 1.0.8 - 2026-07-13

### New Channel: LongCat

- Added LongCat (Meituan) as channel type 58, OpenAI-compatible protocol. Default base URL `https://api.longcat.chat/openai`, Bearer <REDACTED> `/v1/models` for upstream model list fetching.
- Backend: `constant.ChannelTypeLongcat=58`, `ChannelTypeDummy` shifted to 59, `ChannelBaseURLs[58]`, `ChannelTypeNames`. `common/api_type.go` maps LongCat to `APITypeOpenAI` (no relay adaptor change needed).
- Classic: `CHANNEL_OPTIONS` entry, `MODEL_FETCHABLE_CHANNEL_TYPES` includes 58, `getChannelIcon` renders native `LongCat.Color` icon from `@lobehub/icons`.
- Default: `CHANNEL_TYPES[58]`, display order, `MODEL_FETCHABLE_TYPES`, `TYPE_TO_ICON[58]='LongCat'`.
- LongCat-2.0 model metadata: English description and tags `Tools,Agentic,1M`.

### Notes

- LongCat uses standard OpenAI `/v1/models` response format, so `fetchChannelUpstreamModelIDs` and `FetchModels` work via the default branch with no special-casing.
- LongCat is NOT added to `streamSupportedChannels` until `stream_options.include_usage` is verified with a live key.

## 1.0.7 - 2026-07-02

### TTS（火山方舟语音合成全链路修复）

- Fixed `Doubao-tts2.0` returning `resource ID is mismatched with speaker related resource`. Root cause was the voice alias map pairing `alloy` with a 1.0 voice under a 2.0 resource. Split the map into V1/V2 by model version and made `mapVoiceType` passthrough native voice IDs (suffix `_bigtts`) with version-matched alias fallback.
- Discovered (via direct upstream testing) that voice suffixes map to model versions inversely to the initial assumption: `uranus` suffix voices belong to `seed-tts-2.0`, while `mars` suffix and legacy `M392` voices belong to `seed-tts-1.0`. Voice/model mismatches now fail fast with the upstream error rather than silently sending the wrong pairing.
- Added per-request pricing for `doubao-tts` (0.05 USD) and `doubao-tts2.0` (0.08 USD) via `defaultModelPrice`, replacing the punitive default 37.5 ratio. Volcengine TTS billing flows through `PostTextConsumeQuota` → `calculateTextQuotaSummary` `UsePrice` branch; no `DoResponse` change needed.
- Added Playground TTS route `POST /pg/audio/speech` → `PlaygroundAudio` (reuses `playgroundRelay` + `RelayFormatOpenAIAudio`), plus `Path2RelayMode` matching so the route resolves to `RelayModeAudioSpeech`. Previously the Playground sent audio models to `/pg/video/generations` (video task adaptor) with no `voice` field, which always failed.
- Playground now shows a voice dropdown for audio models, version-aware: 12 multilingual 2.0 voices (uranus: zh/en/es/fr/de/ar) for `Doubao-tts2.0`, 12 voices (mars + M392) for `Doubao-tts`. Audio models are no longer filtered out of the Playground model list.
- Removed the broken video-task path for audio models in `Playground/index.jsx`; audio now sends `{model, input, voice, response_format}` to `/pg/audio/speech` and renders the returned MP3 as an inline `<audio>` player.
- Fixed audio links rendering as empty clicks: react-markdown 10's `defaultUrlTransform` strips `data:`/`blob:` protocols, so `MarkdownRenderer` now passes a custom `urlTransform` that allows `data:audio` and `blob:` through. `sendAudioRequest` embeds the audio as a base64 data URL (independent of page lifecycle) and the player is sized to `maxWidth:520px / minWidth:280px`.
- Docs page: TTS examples now use native voice IDs (split into `tts` 1.0 and `tts2` 2.0 groups), `voice` is required, and a multilingual voice list table is added with a Callout explaining the suffix→version rule.

### Notes

- Direct upstream verification confirmed the Volcengine side was never the problem: the channel key has 2.0 access, the service is activated, and voices are public parameters (no console subscription needed). The earlier "voices need subscription" note in memory was corrected.

## 1.0.6 - 2026-06-25

### Hotfix

- Fixed Playground routing for Bailian image models (`wan2.7-image`, `wan2.7-image-pro`) so database endpoint overrides cannot force image models through chat completions.
- Preserved `image-generation` as the first supported endpoint for recognized image models even when model metadata includes custom endpoints.
- Disabled Seedream image watermarks by default in the Playground and Volcengine relay unless callers explicitly request them.
- Kept `3d-generation` for frontend categorization while pointing its default API path to `/v1/video/generations`, matching the actual async task route.

### Light mode

- Adapted homepage, docs, and About pages to support light/dark theme switching.
- Replaced hardcoded dark-only color palettes with Semi Design CSS variable tokens.
- Added `vancine-public-page` semantic CSS token layer for public marketing pages.
- Made homepage hero video overlay, provider logos, pricing cards, and footer theme-aware.
- Made docs page tables, code blocks, callouts, and TOC follow the active theme.
- Made About page cards, model coverage chips, and contact section follow the active theme.

### Motion

- Added aurora soft-light background blobs to the homepage hero (dark mode only).
- Added word-by-word text reveal animation on the hero headline.
- Added count-up number animation on hero stats.
- Added spring hover micro-interactions on hero CTA buttons.
- Added cursor-tracking spotlight glow on feature cards.
- Added icon scale/rotate on feature card hover.
- Added ScrollReveal staggered entrance on About page sections.
- Added spring hover lift on About cards, model chips, and contact card.
- Respected `prefers-reduced-motion` for aurora blobs.

### Branding

- Replaced root and frontend public logos with the new transparent Vancine logo.
- Replaced favicon.ico assets for classic/default/front-end app entry points.
- Added 16x16, 32x32, Apple touch, Android Chrome, and web manifest favicon assets to both frontend public directories.
- Updated both frontend HTML entry points to use `/favicon.ico`, size-specific PNG favicons, `apple-touch-icon`, and `site.webmanifest`.

### Build

- Increased Node heap for frontend Docker build steps with `NODE_OPTIONS=--max-old-space-size=4096` to avoid local Docker OOM during classic Vite build.

### Local verification

- Synced production `.env`, PostgreSQL data, `data/`, and `uploads/` to local Docker.
- Local verification service is running at `http://127.0.0.1:3001` because port 3000 is occupied by another local container.

## 1.0.5 - 2026-06-25

### Homepage

- Updated the classic homepage model category cards to show current connected Chinese models.
- Replaced unavailable overseas provider logos in the connected-provider marquee with connected Chinese provider logos.
- Updated the pricing highlight to compare current overseas models against current Chinese models.
- Fixed homepage model category card heights so the cards align cleanly.

### About

- Rewrote the classic About page with more realistic product-focused copy.
- Removed user-facing GitHub and open-source attribution links from the About page display.
- Cleaned up the About page model coverage card layout so five cards wrap with the final row centered.

### Build and release

- Bumped the Docker Compose runtime `VERSION` environment to `v1.0.5` so `/api/status` reports the release version.

## 1.0.4 - 2026-06-25

### Infrastructure

- Migrated production from `64.83.35.21` (Japan, 2C/2G) to `27.124.22.102` (Hong Kong, 16C/32G).
- Switched production deployment to server-side Docker builds from GitHub.
- Kept the old Japan server as a short-term cold backup with its app container stopped.
- Verified production on `https://vancine.com` with `success:true`, `setup:true`, `system_name:"Vancine"`, `server_address:"https://vancine.com"`, and `version:"v1.0.4"`.

### Build and release

- Standardized both frontend themes on npm and committed `package-lock.json` files.
- Removed `bun.lock` files from the production build path.
- Pinned `web/classic` `react-icons` to `5.3.0` because later `5.x` versions remove `SiLinkedin`.
- Updated Docker builds to use official base images.
- Configured Docker frontend stages to use `registry.npmmirror.com` plus npm retry settings to avoid BuildKit `ECONNRESET` on the new server.

### Documentation

- Added deployment and release process documentation.
- Updated deployment scripts and server documentation for the new production IP.

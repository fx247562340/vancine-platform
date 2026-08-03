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

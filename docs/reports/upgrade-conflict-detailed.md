# Vancine 升级冲突与冗余详细评估

**评估日期**: 2026-08-04
**Vancine 基线**: dd3aa344（2026-05-28，约等于上游 v1.0.0-rc.10）
**Vancine 当前**: v1.0.26（79d9a014）
**目标版本**: 上游 v1.0.0-rc.23（2026-08-01）
**跨度**: 13 个 RC 版本，约 2 个月

---

## 一、最关键的两个结构性变化（决定升级方式）

这两个变化不是行级冲突，而是目录/架构层面的重排，决定了不能用简单的 git merge。

### 1. 前端目录整体上移 + classic 被删除 🔴

已直接验证（GitHub API）：

| | rc.21（2026-07-11） | rc.22（2026-07-26） | rc.23（2026-08-01） |
|---|---|---|---|
| `web/default/` | 存在 | 404（已上移为 `web/`） | 404 |
| `web/classic/` | 存在（431 文件） | 404（整个删除） | 404 |
| `web/src/` | 不存在 | 存在 | 存在 |

- 上游在 **rc.22（PR #6329）** 把 `web/default/` 整体上移为 `web/`，并**整个删除了 `web/classic/`**。
- Vancine 的改动建立在旧结构上：`web/default/src/` 改了 299 个文件（+约 4 万行），`web/classic/src/` 改了 225 个文件（+约 3.1 万行）。
- Go embed 路径也变了：Vancine 是 `//go:embed web/default/dist` + `web/classic/dist`（main.go:38-47），上游 rc.23 只剩 `//go:embed web/dist`（单主题）。

**影响**：
- 不能直接 cherry-pick，所有前端改动的路径都要重写。
- classic 是"决策级"问题，不是代码问题（见第五节）。

### 2. 认证系统从 session 改为无状态 token 🔴

已直接验证：

- 上游 rc.22（PR #6329）**移除了 `gin-contrib/sessions` cookie store**（rc.23 的 main.go 已无 sessions/cookie 引用），改为无状态 dashboard access token + `service.ParseDashboardAccessToken` + `controller/auth_session.go`（新文件）。
- `middleware/auth.go` 从头改写：原来的 `New-Api-User` internal header 分支**整个被删除**，改为 token 解析。
- OAuth state 不再存 session，改走数据库表 `model.CreateAuthFlow`（oauthStateRequest/oauthFlowPayload）。

**Vancine 的对应改动全部冲突**：
- `main.go:186` 给 cookie store 加 `Domain: ".vancine.com"` + SameSite 改 Lax —— 上游整段 store 初始化已删除。
- `middleware/auth.go:95` 把 `New-Api-User` header 改为兼容 `Vancine-User` —— 上游这个分支已删，改动变成死代码。
- `controller/user.go` 的 `setupLogin`（注册后自动登录，commit 798b823d）—— 上游改名 `setupLoginAtAuthVersion`，签名和语义全变，且新增 2FA 分支。
- Google OAuth 依赖 session 存 state —— 上游已不用 session。

---

## 二、后端冲突清单（按严重程度）

### 🔴 P0-1：渠道类型 ID 撞车（数据损坏风险）

已逐行验证。Vancine 新增 LongCat 用了 type 58（commit 94de00f2，把 Dummy 从 58 推到 59）：

| ID | Vancine 当前 | 上游 rc.23 |
|---|---|---|
| 57 | Codex | Codex |
| **58** | **Longcat** | **AdvancedCustom** |
| **59** | Dummy（计数用） | **Sub2API** |
| 60 | — | NewAPI |

**后果**：合并后，数据库里所有 `type=58` 的 LongCat 渠道会被识别成 AdvancedCustom 渠道，行为完全错误。这是静默数据损坏，不会报错。

**合并动作**：
1. LongCat 必须改号到 61（上游已用到 60）。
2. 写数据迁移：`UPDATE channels SET type=61 WHERE type=58 AND name/其他标识属于 LongCat`（需要可靠区分，建议按 LongCat 特有的 base_url 或创建时间）。
3. Dummy 计数常量要相应调整。

### 🔴 P0-2：认证/session 重构（见第一节第 2 点）

跨子域 cookie 需求上游未覆盖，需要在新 token-cookie 机制里重新实现 Domain 配置。

### 🔴 P0-3：Google OAuth（部分冗余）

- Vancine 文件：`oauth/google.go`（新增 200 行）、`controller/google_oauth.go`（74 行）、`model/user.go` 的 `GoogleSub` 字段 + 3 个方法、`common/constants.go` 的 Google 开关、`router/api-router.go` 路由。
- 关键事实：**基线时 `oauth/oidc.go` 就已存在**（通用 OIDC provider），Google 是标准 OIDC，理论上可由配置 OIDC 实现。
- 但 Vancine 走的是后端自管理 `/api/oauth/google` 跳转 + 品牌化按钮，不是标准 OIDC authorize 端点，不能直接复用。
- 上游 rc.22 重写了 `controller/oauth.go`（+154 行），state 改走 `model.CreateAuthFlow`。

**冗余判断**：功能上部分冗余（OIDC 可替代登录），品牌按钮不冗余。
**决策点**：二选一——
- (a) 丢弃自定义 Google provider，引导管理员配 OIDC（省维护，但失去品牌按钮，需迁移已有 google_sub 绑定）；
- (b) 保留 provider，但必须把 session-based state 改成 `model.CreateAuthFlow`，并在重写后的 `controller/oauth.go` 里重新挂 google_sub 绑定。

### 🟡 P1-1：relaykit 模块抽取（import 路径）

已验证上游 rc.23 存在 `relaykit/` 目录（PR #6369）。上游把 `dto`、`types` 抽到独立 `relaykit/` 模块，`constant/endpoint_type.go` 变成别名。

- Vancine 的 `relay/channel/volcengine/adaptor.go` 改了 302 行（TTS v3 重写 + Seedream 水印），`tts.go` 改了 298 行。
- 好消息：上游对这两个文件**只改了 import 路径**（dto→relaykit/dto），无逻辑冲突。
- 合并动作：保留 Vancine 全部 TTS 逻辑，只改 import 路径。
- **3D 端点**：Vancine 加了 `EndpointType3DGeneration = "3d-generation"`，上游把常量挪到 `relaykit/types/endpoint_type.go` 且没有 3D，需在新位置补加。

### 🟡 P1-2：pricing/endpoint 兜底

- Vancine 在 `model/pricing.go` 对图片模型强制 prepend `image-generation`；`common/endpoint_type.go` 加了 VolcEngine/DoubaoVideo 的 seedream/seedance/seed3d 分类。
- 上游 `model/pricing.go` 大改（新增 AdvancedCustom config、`getPricingEndpointTypesForAbility`，import 换 relaykit/dto）；`common/endpoint_type.go` 同 switch 加了 Sub2API/NewAPI/Codex case。
- 合并动作：图片兜底逻辑需在上游新结构的 `updatePricing` 里重新 apply；VolcEngine case 与上游新增 case 并存，无逻辑冲突。

### 🟡 P1-3：响应体捕获中间件

- Vancine 新增 `middleware/response-capture.go`，在 `controller/relay.go:212` 捕获请求体快照（RequestBodySnapshot，10KB），`service/log_info_generate.go` 加 request_body/response_body 日志。
- 上游 rc.21 自己做了"日志流状态可见性"（stream_status），rc.23 继续。两者目标部分重叠（都为可观测性），但实现不同，不直接冲突。
- `controller/relay.go` 因 relaykit 有调整，需轻微 rebase 插入点。
- 注意：Vancine 的 ResponseCaptureMiddleware 包了整个 `/v1` httpRouter，对所有响应做 body 捕获，有性能和内存开销，需确认上游新结构下仍合理。

### 🟢 P2：PayPal 支付（基本无冲突）

- Vancine 新增约 3500 行：`controller/topup_paypal*.go`、`setting/payment_paypal.go`、`model/topup_paypal_settlement.go`（含 CAS 原子结算 + 完整测试）、`model/topup.go` 扩展、路由。
- 上游全树无 PayPal。
- 一个注意点：上游已加 `PaymentProvider` 字段并把 `UpdatePendingTopUpStatus` 第二参从 method 改 provider——Vancine 的 model/topup.go 已基于含 PaymentProvider 的版本扩展，无冲突。但上游若引入通用行锁 helper（"centralize row locking"），可用上游版本替换 Vancine 自写的 `lockTopUpQuery`。
- **运营风险**：`service/waffo_pancake.go` 把 store/product 名从 `new-api-store`/`new-api-charge-product` 改成 `vancine-store`/`vancine-charge-product`。如果生产 Pancake 后台配置的还是旧名字，会对账失败。升级时需核对支付配置（与代码升级无关，但属于 rebrand 遗留运营项）。

### 🟢 P2：品牌替换（机械冲突，琐碎）

- 23 个 Go 文件含 vancine 字符串；`controller/relay.go:463` error type `new_api_error`→`vancine_error`；`relay/channel/openai/adaptor.go:220` OpenRouter HTTP-Referer 改 vancine.com；`setting/operation_setting/general_setting.go` DocsLink 改 `/docs`；Redis namespace `new-api:`→`vancine:`（channel_affinity）。
- 上游这些行可能有变动，属文本级冲突，手动选 Vancine 版本即可。
- **AGPL 合规**：上游 rc.23 footer 用字符串拼接 `['footer','new'+'api',...]` 防 fork 删除归属。按 AGPL-3.0 必须保留 LICENSE/NOTICE 和原始版权声明，UI 层可 Vancine 品牌，但不要删法律文件。

### 🟢 P2：低风险新增（直接保留）

- 火山方舟上游模型拉取（`controller/channel.go` / `channel_upstream_update.go` 的 `/api/v3/models` URL，上游加了 HeaderOverride 分支，需保留 Vancine URL 修正）。
- `model/redemption.go` 兑换码错误消息细分。
- 百炼图片模型（common/model.go 追加 wan2.6/2.7/qwen-image/z-image/cogview）——纯 slice 追加。
- doubao-tts 定价（setting/ratio_setting/model_ratio.go）。
- waitlist/acquisition/image-upload/sitemap 等全新路由和表（WaitlistEntry、AcquisitionTouch、PayPalSettlementEvent 三张新表）。
- `relay/constant/relay_mode.go` 和 `middleware/distributor.go` 的 `/pg/` playground 图片/视频/3D 路由——纯新增，上游未触及同区域。
- `model/task.go` 的 TaskGetByTaskId、router 的 GET /task/:id。


---

## 三、前端冲突清单

### 3.1 web/default（当前生产主题，299 文件 / +4 万行）

#### 🔴 P0：目录上移 + Playground 重组

- 目录 `web/default/` → `web/` 是纯路径问题，用 git mv 级 rebase 先解决路径，再解内容。
- **Playground 是最费力的一块**：Vancine 在旧扁平结构上改了 51 个文件（+4964 行），包括图片粘贴上传、消息媒体渲染、voice-select、use-chat-handler、payload-builder。
- 上游 rc.22 把 Playground 目录重组为 `components/{chat,input,message}/`，rc.10 的 `playground-input.tsx`、`playground-chat.tsx`、`message-actions.tsx`、`use-stream-request.ts`、`message-styles.ts` 等已被删除（-2537 行）。rc.21 还引入新参数面板（#6044）。
- **不能 cherry-pick**，需在新 `components/input/`、`components/message/` 下重新实现图片粘贴（onPaste + /api/upload/image）和媒体渲染。

#### 🔴 P0：Auth hook 重写（#6329 stateless token）

- Vancine 的 `features/auth/hooks/use-oauth-login.ts` 加了 `handleGoogleLogin`/`buildGoogleOAuthLoginUrl`。
- 上游整个 hook 被重写：改用 `createOAuthFlow('github'|...)`、`clearAuthentication()`/`isAuthBundle`、`logout()`、stateless token session control；新增 Telegram login dialog、passkey、otp、secure-verification、legal-consent 模块。
- 合并动作：保留 Google 登录逻辑，但 rebase 到新签名（createOAuthFlow/applyAuthBundle），并同步上游 Telegram dialog 等新组件。

#### 🟡 P1：i18n 懒加载（无冗余，但语言码不兼容）

- Vancine：`i18n/resource-loader.ts`（123 行自定义 BackendModule），首屏 -76%。
- 上游 rc.23 `web/src/i18n/config.ts` **仍静态 import 全部 7 个 JSON，没有做懒加载**。
- **结论：Vancine 优化不冗余，仍然有效**，是领先上游的优化。
- 但语言码不兼容：Vancine 用 `zh`/`zh-TW` + currentOnly，上游用 `zhCN`/`zhTW` + convertDetectedLanguage。需二选一（建议跟随上游 zhCN/zhTW，减少与后端 locale 协商偏差）。

#### 🟡 P1：暗色主题 FOUC + 浏览器翻译防护

- Vancine：`index.html` 内联同步脚本读 `vite-ui-theme` cookie + `lib/theme-bootstrap.ts`。
- 上游 rc.23：index.html 没有 FOUC 脚本，但新增 `<meta name="google" content="notranslate">` + `<div translate="no" class="notranslate">`（rc.21 #5963，防浏览器翻译损坏 React 渲染）。Vancine 缺这两个标记。
- 合并动作：保留 Vancine FOUC 脚本，补上上游 notranslate 标记。

#### 🟡 P1：品牌 footer

- Vancine：`components/layout/components/footer.tsx`（-46 行，去 New API 归属）。
- 上游 rc.23 footer 新增字符串拼接的 attribution（防 fork 删除）。
- 合并动作：手工合入上游新链接结构，UI 层保留 Vancine 品牌，AGPL LICENSE/NOTICE 必须保留。

#### 🟡 P1：PayPal 支付前端

- Vancine：`features/system-settings/integrations/paypal-settings-section.tsx`、`wallet/hooks/use-payment.ts`（+97 行）、`wallet/lib/payment.ts`（+97 行）。
- 上游无 PayPal，但 `wallet/hooks/use-payment.ts`、`wallet/lib/payment.ts` 有新版本（Creem/Waffo/affiliate/billing），且三方支付 URL 校验被重构。
- 合并动作：保留 PayPal 分支，rebase 到上游 wallet 新结构。

#### 🟢 P2：低风险 / 直接采用上游

- **Turnstile**：Vancine 的 `components/turnstile.tsx`、`features/auth/hooks/use-turnstile.ts` 与上游 rc.23 几乎逐字相同（文件头 30 行一致）。**近乎冗余，直接采用上游版本**，Vancine 只保留后端 turnstile_site_key 配置差异。
- **落地页**（Kimi K3/Seedance/AI Media/Waitlist/About/Docs）：Vancine 独有，上游无这些路由。整体照搬，路径平移即可。注意上游 `features/about/` 已存在但内容是空态（"No About Content Set" + New API 链接），需用 Vancine 内容覆盖。
- **Acquisition attribution + Umami 埋点**：Vancine 独有（`lib/acquisition-*`、index.html umami script），无冲突。
- **Legacy console 路由 shim**（routes/console/*.tsx，12-30 行的重定向）：上游已无 console/ 路由组，rebase 后基本可删。

### 3.2 web/classic（225 文件 / +3.1 万行）

**上游已在 rc.22 整个删除 `web/classic/`。** 这是决策级问题，不是代码冲突（见第五节）。

若暂时保留 classic，内部冲突小项：
- i18n 懒加载（`i18n/resource-loader.js`，343 行 7 语言 × 7 命名空间）：上游已不再改 classic，无合并压力，不冗余。🟢
- Playground 图片上传：rc.10→rc.21 期间 classic playground 改动较少，冲突低。🟡
- PayPal 设置页（+301 行）：上游无此文件。🟢
- LogDetailModal（+213 行）：上游 rc.21 仍在改 usage-logs，需对照。🟡
- 首页 Framer 风暗色 hero（`components/home/*` 14 个新组件 +3000 行）、KimiK3/Seedance 落地页、品牌 Footer：纯 Vancine 定制。🟢

---

## 四、冗余清单（Vancine 做了、上游也做了的功能）

这些是"重复造轮子"，合并时可以丢弃 Vancine 版本、采用上游实现，减少长期维护负担：

| 功能 | Vancine 实现 | 上游实现 | 建议 |
|---|---|---|---|
| Turnstile 组件 | `web/default/.../turnstile.tsx` | rc.23 已有逐字相同版本 | 采用上游 |
| Google 登录 | 200 行专用 `oauth/google.go` | `oauth/oidc.go` 通用 OIDC 可覆盖 | 评估迁 OIDC |
| 部分 Telegram 修复 | `IsTelegramIdTakenByActiveUser`/`ClearTelegramIdFromDeletedUsers` | rc.22 "purge authentication data on hard user deletion" | 核对是否已覆盖 |
| 日志请求详情 | RequestBodySnapshot + response-capture 中间件 | rc.21/23 stream_status 日志可见性 | 部分重叠，保留 Vancine 更完整的 body 捕获 |
| 兑换码错误消息 | redemption.go 细分状态 | 需核对上游是否已细分 | 低风险，保留即可 |

**注意**：i18n 懒加载**不是冗余**——上游至今仍静态加载所有语言包，Vancine 的 -76% 首屏优化是领先的，应保留。


---

## 五、Classic 主题去留决策

上游在 rc.22 删除整个 classic，这意味着升级后 Vancine 必须三选一：

1. **冻结 classic（推荐过渡方案）**：classic 停留在 rc.21 等价状态。风险：rc.22 的无状态 token/session control 改了登录态 API，classic 旧的 OAuth2Callback 可能逐渐与新后端不兼容。需要验证 classic 登录在新后端下是否还工作。

2. **移植定制后删除 classic（上游方向，推荐长期）**：把 classic 的 KimiK3/Seedance/Waitlist/Docs/PayPal/首页 hero 等移植到 default（=升级后的 web/），然后删除 classic。Vancine 在 default 上的定制已覆盖 classic 大部分能力，缺口主要是 classic 首页那套 Framer 风 hero 组件和 Docs 页面，可单独移植。**这是上游指的方向，长期维护成本最低。**

3. **长期 fork classic**：作为 Vancine 唯一维护的主题，自行 rebase 后端 API 变更。维护成本最高，不推荐。

**现实约束**：Vancine 当前生产用的是 classic（CLAUDE.md 明确 "classic = 当前生产主题"）。default 虽已大量开发，但切到 default 作为生产主题本身就是一个独立项目（codex/classic-default-parity 分支做了 P0-P3 迁移但未合 main）。所以升级和主题切换这两件事不应同时做。

---

## 六、升级风险矩阵（汇总）

| # | 冲突项 | 级别 | 类型 | 合并成本 | 数据风险 |
|---|---|---|---|---|---|
| 1 | 渠道类型 ID 撞车（LongCat 58 / Dummy 59） | 🔴 极高 | 冲突+冗余 | 中（需迁移脚本） | **静默数据损坏** |
| 2 | 认证改无状态 token（main.go/auth.go/oauth.go） | 🔴 极高 | 冲突 | 高 | 登录态失效 |
| 3 | 前端目录上移 + classic 删除 | 🔴 极高 | 结构 | 极高（路径全改） | 无 |
| 4 | default Playground 重组 | 🔴 高 | 冲突 | 高（重新实现） | 无 |
| 5 | Google OAuth 决策（保留 vs 迁 OIDC） | 🔴 高 | 冲突+冗余 | 中 | 绑定关系迁移 |
| 6 | relaykit 模块抽取（import 路径） | 🟡 中 | 机械 | 中 | 无 |
| 7 | pricing/endpoint 兜底重放 | 🟡 中 | 冲突 | 中 | 计费错误风险 |
| 8 | 响应体捕获中间件 rebase | 🟡 中 | 冲突 | 低-中 | 无 |
| 9 | i18n 语言码统一 | 🟡 中 | 冲突 | 中 | 无 |
| 10 | FOUC + notranslate 合并 | 🟡 中 | 冲突 | 低 | 无 |
| 11 | PayPal 前端 rebase 到新 wallet | 🟡 中 | 冲突 | 中 | 无 |
| 12 | 品牌替换（23 个 Go 文件 + footer） | 🟢 低 | 机械 | 中 | 无 |
| 13 | Turnstile | 🟢 低 | 冗余 | 极低（采用上游） | 无 |
| 14 | 落地页/waitlist/acquisition | 🟢 低 | 无冲突 | 低（路径平移） | 无 |
| 15 | PayPal 后端 | 🟢 低 | 无冲突 | 低 | 无 |

---

## 七、升级策略建议

### 核心判断：不要做"一次性全量升级"

跨度 13 个版本，且涉及 3 个高风险结构性变化（认证、前端目录、渠道 ID），一次性 merge 的冲突量和回归风险都不可控。

### 推荐：分两步，先对齐基础，再处理结构

**第一步：升级到 rc.21（2026-07-11）作为中间站**
- rc.21 仍是 `web/default/` + `web/classic/` 双主题结构，目录不用动。
- 包含 GPT-5.6 计费、Playground 参数面板、unset price models、stream 日志等大部分功能改进。
- 认证还是 session 制，Vancine 的跨子域 cookie 和自动登录不用重写。
- 这一步主要处理：渠道 ID（提前把 LongCat 改号）、relaykit 尚未抽取（rc.23 才抽）、pricing 变更、i18n、品牌。
- **风险显著降低**，可以在现有双主题结构上完成。

**第二步：再评估 rc.22→rc.23**
- 这两个版本的核心是 #6329（无状态 token + 删 classic + 目录上移）和 relaykit 抽取。
- 这一步本质上是"认证迁移 + 主题切换 + 前端重组"三个大项目的叠加，应作为独立里程碑，且要先决定 classic 去留。
- 如果 Vancine 已决定切到 default 生产，这一步和主题切换一起做最经济。

### 合并前必做的准备

1. **数据备份**：渠道表（channels.type）、用户表（users.google_sub / telegram_id）、topup 表。
2. **LongCat 迁移脚本**：升级前先在数据库把 type=58 的 LongCat 渠道标记/迁移，避免合并后被识别为 AdvancedCustom。
3. **计费测试套件**：pricing 变更涉及计费，必须有分层定价/组切换的回归测试。
4. **Staging 环境**：用生产数据副本验证登录（新 token 机制）、所有渠道类型、PayPal 流程。
5. **梳理 Vancine patch 清单**：本文第二、三节即清单，按 P0→P2 顺序逐个 rebase。

### 可以安全丢弃的 Vancine 代码（采用上游）

- `web/default` Turnstile 组件（上游逐字相同）
- `middleware/auth.go` 的 Vancine-User header 兼容（上游已无此分支）
- 评估 Google OAuth 是否迁 OIDC（若迁，丢弃 oauth/google.go + GoogleSub 字段，需迁移绑定）

---

## 八、结论

- **最大风险不是代码冲突量，而是三个静默/结构性问题**：渠道类型 ID 撞车（静默数据损坏）、认证机制重写（影响所有登录态）、前端目录上移+classic 删除（决定主题策略）。
- **好消息**：Vancine 的核心商业定制（PayPal、火山方舟 TTS、落地页、waitlist、acquisition、i18n 懒加载）与上游重叠很少，大部分是纯新增，合并压力小。
- **冗余有限**：真正可丢弃的主要是 Turnstile 和（可选的）Google OAuth；i18n 懒加载是 Vancine 领先上游的优化，必须保留。
- **建议路径**：先升 rc.21（低风险、双主题不动），把 rc.22/23 的认证迁移和主题去留作为独立项目单独排期。

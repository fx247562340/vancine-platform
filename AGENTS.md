# AGENTS.md — Project Conventions for new-api

DO NOT send optional commentary

## Codex 与执行 Agent 协作工作流（全局最高优先级）

本章节是本仓库协作工作流的**唯一权威来源**。任何其他文档（包括
`docs/acquisition/templates/claudecode-task-brief.md`）中的角色分工、阶段限制与审批流程，
与本章节冲突时一律以本章节为准。本章节只规定"谁做什么"，不削弱、也不替代
本文件其余规则、`docs/release-process.md` 以及各子目录 `AGENTS.md` 中更严格的
安全、测试、发布与治理要求；两者同时生效，取更严格者。

### 1. 角色定义

- **范总**：项目负责人。负责在每个任务开始时指定执行 Agent，在 Codex 与执行 Agent
  之间转交指令和报告，并在实现验收通过后逐项批准后续动作。
- **Codex**：只读的调度、分析与验收角色。只出指令、只审核，不碰项目。
- **执行 Agent**：实际操作项目的角色，由范总在每个任务开始时明确指定为
  **Pi Agent** 或 **Claude Code** 之一。Pi Agent 与 Claude Code 是执行 Agent 的两种并列实现，
  地位与权限完全相同。

### 2. 执行 Agent 锁定

- 每个任务开始时，范总必须指定 Pi Agent 或 Claude Code 作为该任务的**唯一执行 Agent**。
- 一个任务从实现、整改、测试、验收整改直到发布闭环，**不得中途切换执行 Agent**：
  不得从 Pi Agent 切换到 Claude Code，也不得从 Claude Code 切换到 Pi Agent。
  整改轮次由同一个执行 Agent 继续承担。
- 若任务开始时未指定执行 Agent，Codex 必须先询问范总并等待答复，**不得自行选择 Agent，
  也不得直接操作项目**。
- 范总按 §6 亲自完成 Layer 3 **人工页面验收**属于保留给项目所有者的人工验收动作，
  **不构成执行 Agent 切换**，也不授权任何其他角色代作验收或代作实现。

### 3. Codex 的允许范围

Codex 只允许：

- 只读检查项目和相关资料
- 分析问题、设计方案、拆解任务
- 输出可直接粘贴给执行 Agent 的完整任务指令
- 阅读执行 Agent 回传的报告
- 使用不会改变项目文件、Git 状态、Docker、数据库、远端或生产状态的只读命令进行审核
- 审查 diff、测试证据、构建证据、发布证据和生产验收结果
- 验收不通过时输出下一轮整改指令，交回**同一个**执行 Agent

### 4. Codex 的禁止范围

Codex **不得**：

- 创建、修改、移动、重命名或删除任何项目文件
- 使用 `apply_patch` 或任何其他方式写入项目
- 执行代码格式化、自动修复或代码生成
- 执行可能生成或修改项目文件的测试、构建或脚本
- 修改 Git 暂存区、提交、分支、标签或远端状态
- 修改 `VERSION` 或 `CHANGELOG.md`
- 执行 commit、push、merge、rebase、deploy
- 操作本地 Docker、数据库、Redis 或生产环境
- 以"完成任务"为由越过执行 Agent
- 在未指定执行 Agent 时自行实施项目改动

Codex 的浏览、只读检查与验收权限**任何情况下都不构成**文件修改权限。
也不得写成"Codex 默认可修改、仅部分任务只读"——Codex 在本项目**永久只读**。

### 5. 执行 Agent 的职责

被范总指定的执行 Agent 负责：

- 代码、文档、测试和配置的修改
- 创建必要的文件
- 运行格式化、lint、测试和构建
- 本地 Docker 及其他开发环境操作
- 根据 Codex 的审核意见进行整改
- 在范总逐项批准后，执行发布元数据准备（VERSION + CHANGELOG.md）、commit、push 和 deploy
- 提供完整、可复核的执行证据

### 6. 标准任务流程

审批粒度先定义清楚（详见 §7）：`VERSION` 与 `CHANGELOG.md` 是一个耦合的**发布元数据准备**
步骤，作为一个审批项一并批准与修改；它与 commit、push、deploy 构成**四个相互独立的审批阶段**。
本节的完整四阶段流程适用于**发布型任务**；符合 §8 定义的**非发布型工作流文档任务**按 §8 执行。

```text
范总指定执行 Agent（Pi Agent 或 Claude Code）
  → Codex 只读分析并输出任务指令
  → 范总将指令粘贴给执行 Agent
  → 执行 Agent 实现并运行实现阶段验证
  → 范总把执行 Agent 的完整报告交给 Codex
  → Codex 只读审核实现结果
  → 不通过：Codex 输出整改指令，交回同一个执行 Agent，重复上两步
  → 实现审核通过：进入发布准备
  → 范总批准「发布元数据准备」（VERSION + CHANGELOG.md，一个审批项）
  → 同一个执行 Agent 修改 VERSION 和 CHANGELOG.md
  → 同一个执行 Agent 按 docs/release-process.md 对最终版本运行完整发布门禁
  → Layer 3 只能按 release-process.md 选择自动化浏览器 smoke 或范总人工页面验收其中一种
  → 选自动化浏览器 smoke：同一个执行 Agent 执行并回传证据
  → 选人工页面验收：范总亲自完成并提供结果，同一个执行 Agent 记录、整理并回传证据
  → 执行 Agent 回传完整门禁证据
  → Codex 只读审核最终版本和发布门禁证据
  → 范总单独批准 commit
  → 同一个执行 Agent 执行 commit
  → Codex 只读审核 commit
  → 范总单独批准 push
  → 同一个执行 Agent 执行 push
  → Codex 只读审核远端结果
  → 范总单独批准 deploy
  → 同一个执行 Agent 执行 deploy
  → Codex 只读审核最终发布结果
```

硬性约束：

- `VERSION` / `CHANGELOG.md` 修改后，必须对**包含最终版本号与变更日志的工作区状态**
  重新完成 `docs/release-process.md` 要求的全部发布门禁（含本地 Docker 门禁与 Layer 3）。
- **不得**使用修改版本号之前的验收结果作为最终发布证据；也不得在发布元数据准备后直接
  进入 commit。
- Layer 3 默认只选一种（自动化浏览器 smoke 或范总人工页面验收），遵守本文件
  「Automated browser release acceptance request budget」与 `docs/release-process.md`：
  - 选**自动化浏览器 smoke**：由本任务锁定的**执行 Agent** 执行并回传证据。
  - 选**人工页面验收**：由**范总亲自**完成并提供验收结果；执行 Agent 负责记录、整理并回传证据。
- 范总亲自完成人工 Layer 3 页面验收**不构成执行 Agent 切换**：它只是保留给项目所有者的人工
  验收动作，不改变本任务锁定的执行 Agent，也不授权任何其他角色代作验收。
- Codex **不运行**构建、Docker、浏览器验收，也**不执行任何一种 Layer 3**（既不跑 smoke，
  也不代替范总做人工验收）；Codex **只做只读审核**两条路线的证据。
- **除**选择范总人工 Layer 3 时由范总亲自执行的**人工验收动作**之外，所有项目操作、
  自动化验收与发布操作（含发布元数据准备、发布门禁、自动化 Layer 3、commit、push、deploy）
  均由本任务锁定的**同一个**执行 Agent 完成。

### 7. 审批边界

- **四个相互独立的审批阶段**：1）发布元数据准备（`VERSION` + `CHANGELOG.md`）2）commit
  3）push 4）deploy。上一阶段获批**不自动授权**下一阶段，每阶段均需范总单独明确批准。
- **发布元数据准备的耦合粒度**：`VERSION` 与 `CHANGELOG.md` 是一个耦合的发布元数据准备
  步骤，**作为一个审批项由范总一并批准**，获批后由本任务锁定的执行 Agent **一并修改**；
  不得要求两者各自单独批准，也不得只改其一。
- 删除文件必须经过范总批准；禁止未经批准的批量删除。
- 生产操作必须经过范总明确批准。
- 外部写操作（发帖、评论、回复、点赞、关注、私信等）必须经过范总明确批准。
- 发布元数据准备、commit、push、deploy 由**执行 Agent** 操作，Codex 不操作。
- 发布元数据准备、commit、push、deploy 均不得因实现验收通过而自动执行，必须遵守
  `docs/release-process.md` 的既有发布门禁与逐项审批规则；最终发布门禁必须针对**包含最终
  `VERSION` 与 `CHANGELOG.md` 的工作区状态**，修改前的验收结果不得作为最终发布证据。
- 本章节不得削弱当前 `AGENTS.md`、`docs/release-process.md` 中更严格的安全、测试、
  发布和治理要求。

### 8. 非发布型工作流文档任务例外

**定义**：仅修改**协作流程、任务模板、项目治理规则**等文档内容，且**不涉及运行时代码、
依赖、配置、构建脚本、部署脚本或生产环境**的任务，定义为**非发布型工作流文档任务**。

对该类任务作如下例外（仅适用于严格符合上述定义的任务）：

1. **不执行发布元数据准备**：不修改 `VERSION` 与 `CHANGELOG.md`，也不将其作为审批阶段。
2. **不要求发布门禁、不执行 deploy**：不要求本地 Docker、Layer 3 页面验收，且**不得在本类
   任务下执行 deploy**；只要求与改动性质匹配的只读校验（如 `git diff --check`、`git status --short`、
   关键词/冲突搜索）。
3. **commit 路径**：Codex 只读验收通过且**范总明确批准 commit** 后，由本任务锁定的
   执行 Agent 直接 commit；无需先走发布元数据准备与完整发布门禁。
4. **审批上限：commit + push，不含 deploy**：commit 获批**不自动授权 push**，push 仍需范总
   **单独批准**；本类任务最多只能执行**获批的 commit** 与**另行获批的 push**，
   **不得在本例外下单独 deploy**（也不得以「文档改动也要上生产」为由临时放宽）。
   如未来确实需要把相关变化随产品部署到生产，必须**另建发布型任务**，按其改动内容执行
   §6 完整四阶段流程与 `docs/release-process.md` 全部门禁。
5. **例外不得泛化**：只要改动**同时涉及**任何产品代码、运行配置、依赖或锁文件、构建
   或部署内容（包括 Dockerfile、docker-compose、CI、部署脚本），**不得使用本例外**，
   仍必须执行 §6 的完整四阶段发布流程。
6. **其余规则全部保留**：本例外只减省发布阶段，**不削弱**任何既有约束——Codex **永久只读**，
   执行 Agent **全程不得切换**，删除文件、生产操作、付费调用与外部写操作仍各需范总明确批准。

任务类型的界定由**范总**在任务开始时确认；未明确界定为非发布型时，一律按发布型任务
执行 §6 完整流程。本例外不改变 `docs/release-process.md` 对**生产发布**的全部要求：
任何进入生产的变化都只能通过发布型任务走完整门禁，**本例外不提供任何 deploy 路径**。

## Overview

This is an AI API gateway/proxy built with Go. It aggregates 40+ upstream AI providers (OpenAI, Claude, Gemini, Azure, AWS Bedrock, etc.) behind a unified API, with user management, billing, rate limiting, and an admin dashboard.

## Tech Stack

- **Backend**: Go 1.22+, Gin web framework, GORM v2 ORM
- **Frontend**: React 19, TypeScript, Rsbuild, Base UI, Tailwind CSS
- **Databases**: SQLite, MySQL, PostgreSQL (all three must be supported)
- **Cache**: Redis (go-redis) + in-memory cache
- **Auth**: JWT, WebAuthn/Passkeys, OAuth (GitHub, Discord, OIDC, etc.)
- **Frontend package manager**: npm with committed `package-lock.json` files

## Architecture

Layered architecture: Router -> Controller -> Service -> Model

```
router/        — HTTP routing (API, relay, dashboard, web)
controller/    — Request handlers
service/       — Business logic
model/         — Data models and DB access (GORM)
relay/         — AI API relay/proxy with provider adapters
  relay/channel/ — Provider-specific adapters (openai/, claude/, gemini/, aws/, etc.)
middleware/    — Auth, rate limiting, CORS, logging, distribution
setting/       — Configuration management (ratio, model, operation, system, performance)
common/        — Shared utilities (JSON, crypto, Redis, env, rate-limit, etc.)
dto/           — Data transfer objects (request/response structs)
constant/      — Constants (API types, channel types, context keys)
types/         — Type definitions (relay formats, file sources, errors)
i18n/          — Backend internationalization (go-i18n, en/zh)
oauth/         — OAuth provider implementations
pkg/           — Internal packages (cachex, ionet)
web/           — Frontend (React 19, Rsbuild, Base UI, Tailwind)
  src/i18n/    — Frontend internationalization (i18next, en/zh/zh-TW/fr/ru/ja/vi)
```

## Internationalization (i18n)

### Backend (`i18n/`)
- Library: `nicksnyder/go-i18n/v2`
- Languages: en, zh

### Frontend (`web/src/i18n/`)
- The current runtime ships a single frontend: the Default frontend in `web/src` (React 19, Rsbuild, Base UI, Tailwind). There is no selectable Classic theme in the current runtime; Classic survives only as historical code and historical-documentation context. Default light and Default dark are the two appearances of this same Default frontend (theme tokens + `.dark` class), not separate frontends.
- Library: `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- Languages: en (base), zh (fallback), zh-TW, fr, ru, ja, vi
- Translation files: `web/src/i18n/locales/{lang}.json` — flat JSON, keys are English source strings
- Usage: `useTranslation()` hook, call `t('English key')` in components
- CLI tools: `bun run i18n:sync` (from `web/`)

## Rules

### Common Code Quality

- New code should stay direct and readable. Prefer early returns, clear branches, and well-named local variables to deep nesting or layered control flow.
- Minimize nested function definitions. Use them only when required by a callback API or when keeping the closure local is clearly simpler than adding another symbol.
- Avoid adding package-level or module-level helper functions that have only one caller and do not express a stable business concept. Inline that logic at the call site instead.
- A separate function is appropriate when it represents reusable behavior, a required interface/framework callback, an exported API, a test fixture, or complex business logic that deserves direct tests.
- If a single-use helper is kept, its name must describe a durable domain concept rather than a mechanical step extracted only to shorten the caller.

### Backend Rules

**relaykit module independence:** The `relaykit/` Go module MUST remain independently buildable.

- Code under `relaykit/` MUST NOT import or depend on packages from the root `new-api` module, or rely on root-only configuration, generated files, or workspace wiring.
- Any change affecting `relaykit/` or its public APIs MUST be verified with `cd relaykit && GOWORK=off go build ./...`; a successful root-module build is not sufficient.

**JSON package:** All JSON marshal/unmarshal operations MUST use the wrapper functions in `common/json.go`:

- `common.Marshal(v any) ([]byte, error)`
- `common.Unmarshal(data []byte, v any) error`
- `common.UnmarshalJsonStr(data string, v any) error`
- `common.DecodeJson(reader io.Reader, v any) error`
- `common.GetJsonType(data json.RawMessage) string`

Do NOT directly import or call `encoding/json` in business code. `json.RawMessage`, `json.Number`, and other type definitions from `encoding/json` may still be referenced as types, but actual marshal/unmarshal calls must go through `common.*`.

**Database compatibility:** All database code MUST work with SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6 simultaneously.

- Prefer GORM methods (`Create`, `Find`, `Where`, `Updates`, etc.) over raw SQL.
- Let GORM handle primary key generation; do not use `AUTO_INCREMENT` or `SERIAL` directly.
- Standard `SELECT ... FOR UPDATE` row locks built with GORM query methods in `model/` MUST use `lockForUpdate(tx)`. Do not use the legacy GORM v1 pattern `tx.Set("gorm:query_option", "FOR UPDATE")`, because GORM v2 silently ignores it and no lock is acquired. Do not duplicate `clause.Locking{Strength: "UPDATE"}` at call sites; the shared helper emits `FOR UPDATE` for MySQL/PostgreSQL and skips it for SQLite, where the syntax is unsupported. Dialect-specific locking with different semantics (for example, a MySQL next-key/gap lock) may use raw SQL only behind explicit database-type branches with valid fallbacks for every supported database.
- When raw SQL is unavoidable, account for dialect differences:
  - PostgreSQL uses `"column"` quoting, while MySQL/SQLite use `` `column` ``.
  - Use `commonGroupCol`, `commonKeyCol` from `model/main.go` for reserved-word columns like `group` and `key`.
  - Use `commonTrueVal`/`commonFalseVal` for boolean values.
  - Use `common.UsingMainDatabase(...)` for primary database branches and `common.UsingLogDatabase(...)` for log database branches.
- Do not use database-specific features without cross-DB fallback, including MySQL-only functions, PostgreSQL-only operators, SQLite-unsupported `ALTER COLUMN`, or database-specific JSON column types without a `TEXT` fallback.
- Migrations must work on all three databases. For SQLite, use `ALTER TABLE ... ADD COLUMN` instead of `ALTER COLUMN` (see `model/main.go` for patterns).
- Avoid GORM boolean default tags such as `gorm:"default:true"` when the default is a business rule already enforced by code. MySQL and PostgreSQL can normalize boolean defaults differently, causing GORM `AutoMigrate` to repeatedly issue `ALTER TABLE` on restart. Prefer setting these defaults in request/model normalization, hooks, constructors, or service logic; do not replace `default:true` with `default:1` unless the behavior is verified across SQLite, MySQL, and PostgreSQL.

**Relay and provider behavior:**

- When implementing a new channel, confirm whether the provider supports `StreamOptions`; if supported, add the channel to `streamSupportedChannels`.
- For request structs parsed from client JSON and re-marshaled to upstream providers, optional scalar fields MUST use pointer types with `omitempty` (for example, `*int`, `*uint`, `*float64`, `*bool`).
- Preserve explicit zero values in upstream relay request DTOs: absent client JSON fields must become `nil` and be omitted, while explicit `0`, `0.0`, or `false` values must remain non-`nil` and be sent upstream.
- Avoid non-pointer scalars with `omitempty` for optional request parameters, because zero values will be silently dropped during marshal.

**Billing expression system:** When working on tiered/dynamic billing (expression-based pricing), MUST read `pkg/billingexpr/expr.md` first. It documents the design philosophy, expression language, full architecture, token normalization rules, quota conversion, and expression versioning. All billing expression changes must follow that document.

**Billing safety invariants:** Quota/billing code MUST never produce a negative charge (a credit) from arithmetic overflow or unvalidated input. Apply defense in depth:

- Every user-controlled quantity that becomes a billing multiplier (image `n`, video `seconds`/`duration`, resolution/quality ratios, batch counts) MUST be bounded before it reaches quota calculation. Reject out-of-range values at request validation with a 400. Existing bounds: `dto.MaxImageN` for image generation count, `relaycommon.MaxTaskDurationSeconds` for task video duration, `maxTokensLimit` (`relay/helper/valid_request.go`) for `max_tokens`-family fields on every relay format (OpenAI, Claude, Gemini, Responses). Reuse these constants instead of introducing new ad hoc limits for the same concepts. When adding a new relay format or request DTO, bound its max-tokens and count fields in its validator from day one.
- Watch for validation bypass paths: passthrough fields (e.g. `Extra["parameters"]`), task `metadata` maps, and multipart form fields can carry the same quantities around the standard DTO validation. Any adaptor that reads a multiplier from such a path must enforce the same bound (or clamp) locally.
- Durations parsed from media metadata are user/upstream-controlled too: audio file headers (transcription token counting, TTS response duration) and upstream deduction numbers (e.g. Kling `FinalUnitDeduction`) can claim absurd values. Convert them with saturation before they become token counts.
- Never convert a computed quota or token count to `int` with a bare cast like `int(float64(quota) * ratio)`, `int(math.Round(...))` on unbounded input, or `int(decimal.IntPart())`. All quota rounding/conversion is centralized in `common/quota_math.go`; use those helpers: `common.QuotaFromFloat` (truncating) for float products, `common.QuotaRound` (half-away-from-zero) where rounding is intended, and `common.QuotaFromDecimal` for decimal products. `billingexpr.QuotaRound` delegates to `common.QuotaRound`. Do not reintroduce local conversion helpers or bare casts. Saturation bounds are int32 because quota columns (user/token/log) are 32-bit integers in the database, and every clamp/NaN fallback is logged via `common.SysError` since a single request should never approach those bounds.
- Saturation events are also audited: each helper has a `*Checked` variant (`common.QuotaFromFloatChecked` / `QuotaRoundChecked` / `QuotaFromDecimalChecked`) that additionally returns a `*common.QuotaClamp` when clamping occurred. Billing paths that compute a charge capture that clamp onto `relayInfo.QuotaClamp` (or thread it into task settlement) and, right before writing the consume/task log, call `attachQuotaSaturation` (in `service/log_info_generate.go`) which nests the marker under the log's `other.admin_info.quota_saturation` and emits a request-correlated `logger.LogWarn`. Nesting under `admin_info` makes it admin-only for free (non-admin log views strip `admin_info`). When adding a new billing path, use the `*Checked` variant and surface the clamp the same way so the anomaly stays auditable in both the admin log UI and backend logs.
- Multiplier maps go through `types.PriceData.AddOtherRatio`, which rejects non-positive, NaN, and +Inf ratios. Do not write to `PriceData.OtherRatios` directly, and do not weaken these guards.
- Pre-consume (预扣费) and settle (结算/差额) must both be safe: a saturated oversized quota must fail pre-consume with insufficient-quota, never silently wrap. When adding a new billing path (new relay format, new task platform, new adjustment hook), trace the full chain — validation → EstimateBilling/OtherRatios → quota conversion → pre-consume → settle/refund — and confirm each step preserves these invariants.
- Fields parsed into unsigned types (`*uint`) accept huge positive JSON numbers (e.g. `18446744073686646784`, a wrapped negative); a `>= 0` check is not sufficient, an upper bound is mandatory.
- Regression tests for these invariants belong with the boundary they protect (request validators, converter helpers). See `relay/helper/openai_image_request_test.go`, `relay/common/relay_utils_test.go`, and `common/quota_math_test.go` for the expected style.

**Backend test quality:** Backend tests must protect real behavior, API contracts, billing/accounting invariants, data compatibility, or regression paths.

- Do not add tests that only improve coverage numbers, prove that code happens to run, or lock in implementation details without a user-visible or cross-module contract.
- Avoid fake fuzz/stress/smoke/performance tests built from random inputs, large loop counts, sleeps, timing comparisons, or log-only assertions.
- Avoid duplicate tests that exercise the same branch with different names but no new invariant.
- Avoid tests that force incorrect provider/protocol semantics into production code.
- Avoid tests that assert private constants, select-field lists, helper internals, or file layout when observable behavior is already covered elsewhere.
- Prefer deterministic table tests with explicit inputs and exact expected outputs.
- When tests need database, request context, user group, settings, or cache state, initialize that state explicitly inside the test fixture.
- New or substantially rewritten Go backend tests MUST use `github.com/stretchr/testify/require` for setup and fatal assertions, and `github.com/stretchr/testify/assert` for non-fatal value checks.
- Avoid hand-written assertion helpers unless they encode a reusable project-specific invariant.
- When cleaning tests, preserve meaningful regression coverage. If a deleted test covered a real contract indirectly, replace it with a smaller test that asserts that contract directly.

### Frontend Rules

- Use `bun` as the preferred package manager and script runner for the frontend (`web/`):
  - `bun install` for dependency installation
  - `bun run dev` for development server
  - `bun run build` for production build
  - `bun run i18n:*` for i18n tooling
- Frontend UI text must support i18n with `i18next`/`react-i18next`. Use flat JSON locale files in `web/src/i18n/locales/{lang}.json`, with English source strings as keys.
- In React components, use `useTranslation()` and call `t('English key')` for user-facing text.
- Follow `web/AGENTS.md` for detailed frontend conventions, including TypeScript, component structure, styling, accessibility, testing, and build checks.

### Automated browser release acceptance request budget

Mandatory budget for any AUTOMATED browser-based release acceptance
(local or production). Browser requests are the scarcest resource in
the verification pipeline; every one of these rules is binding, and a
violation must be justified in the acceptance report.

Layer 3 of the release contract (docs/release-process.md) defaults to
exactly ONE of: this minimal automated browser smoke, or a manual page
acceptance performed personally by the project owner. Do not run both
by default unless the owner explicitly asks. A manual acceptance does
not count against automated browser/context/page tallies and may
substitute for the Layer 3 automated smoke, but never for Layer 1,
Layer 2, or the local Docker gate; it must still not require the owner
to refresh pages repeatedly or issue meaningless duplicate requests.
Production automated smokes follow this same automated budget.

1. **Default UI smoke shape.** A public marketing page UI smoke uses
   one browser, one context, one page; each target page is fully
   loaded AT MOST ONCE; mobile viewports are verified by resizing the
   same page (no reload); at most two screenshots total.
2. **No browser re-proof of settled contracts.** The browser must not
   re-prove the Go router/HTTP contract, pure logic already covered
   by unit/component tests, or the complete sitemap set; those belong
   to the owning tests or one bounded HTTP script (Layer 1/2 in
   `docs/release-process.md`).
3. **Deterministic isolation of unrelated endpoints.** When auth and
   acquisition are OUT of scope of the change under test, a UI-only
   local smoke MAY intercept, browser-side, exactly these two
   endpoints with fixed anonymous-consistent responses:
   - `POST /api/user/auth/refresh`
   - `POST /api/acquisition/touch`
   The report MUST state that the intercepted calls are "not product
   pass evidence". No other endpoint may be intercepted.
4. **No isolation when in scope.** If the change touches auth,
   session, acquisition, or rate limiting, isolating those endpoints
   is forbidden; run a dedicated, bounded integration acceptance with
   the minimum number of requests each scenario needs.
5. **On any 429:** stop browser retries immediately. Do not flush
   Redis, do not change rate-limit config, and do not repeat the full
   acceptance matrix. Save the evidence, classify the failure as
   product failure vs. environment pollution vs. harness failure, and
   re-run ONLY the unfinished minimal gate after the environment
   recovers.
6. **Forbidden harness behavior:** watch/dev servers, fixed long
   sleeps, unbounded polling, multi-round snapshot/eval/click/reload
   loops, repeated requests to prove the same contract, and
   re-launching a long command just because it is temporarily quiet.
7. **Health polling:** hard cap 120 seconds total, polling interval
   at least 2 seconds (no more frequently than once every 2 seconds);
   on timeout, stop and report.
8. **Failure attribution:** product failures and acceptance-tooling
   failures MUST be reported separately; a script bug must never be
   recorded as a product failure (and vice versa).

Do not add Playwright, Puppeteer, or other browser dependencies to the
repository, and do not create permanent agent-browser scripts in the
repo for one-off acceptance; temporary acceptance scripts and evidence
live under `outputs/` and stay untracked.

### Project Governance — Brand and Open-Source Attribution

This project is Vancine, a modified version of the upstream AGPL-3.0 project new-api (https://github.com/QuantumNous/new-api), itself based on one-api (https://github.com/songquanpeng/one-api, MIT). Every occurrence of an upstream identifier belongs to exactly one of the four layers below, and the rules differ per layer. This section replaces the former absolute-protection clause, by explicit project-owner approval (2026-08-08).

**1. Product layer (SHALL be branded "Vancine").** UI display text, HTML title/meta/SEO, marketing and landing pages, README product descriptions, log banners, Electron window/tray labels, and default SystemName. Upstream product naming must not reappear here except inside the required attribution block (layer 3).

**2. Distribution layer (renamable only with migration validation).** Dockerfiles, CI image names, release artifact names, systemd units, compose service/container names, deploy scripts, and database names. Never rename a production database, an image reference consumed by running deployments, or an artifact name that downstream automation depends on without: a checked migration plan, passing tests, `docker compose build` plus local Docker verification, and production deploy acceptance.

**3. Legal layer (preserve verbatim; never rebrand).**

- LICENSE (unmodified AGPL-3.0) and the LICENSE/NOTICE/THIRD-PARTY-LICENSES.md copies shipped in Docker images (`/licenses/`), binaries, frontend bundles, and Electron installers.
- All copyright notices, including `Copyright (C) 2023-2026 QuantumNous` source headers. Vancine copyright lines may be ADDED for new work; upstream lines are never removed or rewritten.
- NOTICE Section 7 obligations: the attribution notice "Frontend design and development by New API contributors." and a visible link to https://github.com/QuantumNous/new-api in a prominent about, legal, footer, or attribution location of every user interface. Keep these strings exact, unobfuscated, and machine-checkable.
- Third-party attributions: one-api (MIT), Apache-2.0 NOTICE entries (AWS SDK, smithy-go, otp), Electron/Chromium notices, and per-file third-party headers.
- AGPL §13: every network-deployed modified version must keep offering its Corresponding Source.

**4. Compatibility layer (no global search-and-replace).** Go module paths (`github.com/QuantumNous/new-api`, `.../relaykit`) and all imports using them: any module-path change requires an explicit approved migration with full build and test, including `cd relaykit && GOWORK=off go build ./...`. Protocol-compatibility names are frozen: `ChannelTypeNewAPI`/`APITypeNewAPI` (persisted channel type 60), the `relay/channel/newapi` adaptor, the `New-Api-User` HTTP header, OpenAPI `new_api_refresh`/`NewApiUser` fields, upstream metadata sync URLs, and historical upstream links in About/footer/license sections.

**Brand-migration acceptance.** Any batch rebranding change ships with green backend tests and frontend checks, local Docker verification, and deploy acceptance before production. Renames use exact-match replacement of verified ASCII identifiers only — never a pattern broad enough to touch layers 3 or 4.

**No obfuscation.** Brand and attribution strings are stored as plain ASCII literals. Homoglyphs, `\u00XX` escapes, and split-string constructions in governance or compliance text are prohibited so audits remain reliable.

**Pull requests:** When creating a pull request:

- First compare the current git user (`git config user.name` / `git config user.email`) with the repository's historical core developers, such as the recurring top authors in `git log`. Do not change git config.
- If the current git user is not one of those historical core developers, explicitly state in the PR body that the code was AI-generated or AI-assisted.
- Always use the repository PR template at `.github/PULL_REQUEST_TEMPLATE.md` when drafting the PR title/body. Preserve the template structure and fill in the relevant sections instead of replacing it with an ad hoc format.

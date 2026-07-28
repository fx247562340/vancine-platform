# Vancine 模型上线与海外获客标准操作流程（SOP）

> **文档版本**：v1.2.1
> **更新时间**：2026-07-28
> **负责人**：范总
> **适用范围**：国内模型供给 → 海外开发者获客的全链路操作
> **关联模板**：[Claude Code 任务简报模板](./templates/claudecode-task-brief.md)

---

## 0. 受保护项目标识（最高优先级）

**new-api** 与 **QuantumNous** 相关的一切引用、品牌、元数据与归属信息**严格受保护，不得修改或删除**（对应 `AGENTS.md` Rule 6）。涵盖：

- README、license header、版权声明、package metadata
- HTML title、meta tag、footer、about 页面
- Go module path、package name、import path
- Docker image name、CI/CD 引用、部署配置
- 注释、文档、changelog 条目

任何获客任务（雷达、开发、发布、渠道）若与上述标识冲突，一律以保护标识为准。如被要求移除/重命名/替换，必须拒绝并说明其为受保护信息。

---

## 1. 战略定位

**Vancine 是第三方 API 聚合平台，不是任何模型厂商的官方服务。**

- 所有对外物料、文档、页面、社媒帖子必须明确身份披露：Vancine 是独立聚合服务，与上游模型厂商无官方关联。
- 不得使用"官方"、"直属"、"独家授权"等误导性措辞。
- 模型名称、商标归属原厂商；Vancine 仅提供 OpenAI 兼容的聚合调用入口。
- 商业转售权限必须经官方来源核验，**不得**仅凭媒体报道或第三方转述判断。

---

## 2. 情报雷达（70% 国内供给 + 30% 海外需求）

### 2.1 国内供给雷达（权重 70%）

以下来源按优先级排列，**必须回到官方来源核验**，国内媒体仅作为线索：

| 类别 | 官方来源 | 关注点 |
|------|---------|--------|
| 阿里云 Qwen / 百炼 / Model Studio | 百炼控制台、Model Studio、Coding Plan、ModelScope | model ID、定价、上下文、Preview 生命周期 |
| DeepSeek | 官方 API Docs、更新日志、开放平台 | 模型版本、rate limit、批量折扣 |
| Kimi / Moonshot | 开放平台、Coding Plan | model ID、tool calling 支持 |
| 智谱 GLM | 开放平台 | 模型版本、定价 |
| MiniMax | 开放平台 | 模型版本、定价 |
| 火山方舟 / Seed / Doubao / TRAE | 火山引擎控制台、方舟 API Docs | endpoint、voice、watermark、region |
| 腾讯混元 | 混元开放平台 | 模型版本、定价 |
| 百度千帆 | 千帆平台 | 模型版本、定价 |
| 阶跃星辰 | 开放平台 | 模型版本、定价 |
| 其他（LongCat、百川、零一万物等） | 各自官方渠道 | 同上 |

**核验要求**：
- 每个候选模型必须能在官方控制台或 API Docs 中找到**精确 model ID**。
- 必须确认 API 可调用（非仅 Web 演示）。
- 必须记录定价、上下文窗口、Preview/GA 状态、生命周期预期。

### 2.2 海外需求雷达（权重 30%）

以下渠道用于判断海外需求、痛点、讨论热度和投放渠道，**不代替国内官方确认**：

| 渠道 | 用途 | 关注指标 |
|------|------|---------|
| X（Twitter） | 开发者讨论、KOL 观点 | 转发、点赞、引用语气 |
| Reddit（r/LocalLLaMA、r/MachineLearning、r/artificial 等） | 社区痛点、需求 | 帖子热度、评论方向 |
| Hacker News | 技术社区关注度 | 点数、讨论深度 |
| GitHub（Issues、Discussions、Trending） | 开发者实际需求 | star、issue 数量、讨论 |
| Hugging Face | 模型下载、社区反馈 | 下载量、讨论 |
| OpenCode、Cline、Roo Code 等社区 | Coding Agent 生态需求 | 插件、模型支持请求 |

**输出要求**：
- 记录具体帖子/讨论链接、热度数据、代表性观点。
- 区分"真实需求"与"猎奇讨论"。
- 识别潜在投放渠道和 KOL。

---

## 3. 情报输出固定格式

每个候选模型的情报输出必须包含以下三部分：

### 3.1 国内官方已确认供给

- 精确 model ID（与官方文档一致）
- API endpoint 和协议（OpenAI 兼容 / 自定义）
- 定价（input/output per token 或 per call）
- 上下文窗口
- 支持能力（tool calling、vision、streaming、structured output）
- 生命周期状态（Preview / GA / Deprecated）
- 官方来源链接（控制台、API Docs、公告）

### 3.2 海外需求 / 讨论信号

- 渠道来源和链接
- 讨论热度和方向
- 开发者痛点和需求表述
- 竞品对比提及

### 3.3 Vancine 商业可售性与行动建议

- 第三方聚合与商业转售权限（已确认 / 待确认 / 不可售）
- Vancine 差异化（速度、成本、稳定性、协议兼容）
- 建议动作（立即接入 / 观察 / 暂缓）
- 风险点（license 限制、region 限制、rate limit）

---

## 4. 门禁（Gate）

门禁分为两类，**消除循环依赖**：

| 类别 | 时机 | 作用 |
|------|------|------|
| **开发前准入门禁（Pre-dev Admission Gate）** | Claude Code 任务启动**前** | 决定是否允许启动开发 |
| **实现后发布门禁（Post-impl Release Gate）** | Claude Code 执行**后**、发布**前** | 决定是否允许发布上线 |

**核心原则**：实现后才能验证的项目（requested/responded model 一致、真实调用、计费正确性）**不得**阻止 Claude Code 开发任务启动；但发布前**必须**全部通过，否则不发布。

### 4.1 开发前准入门禁（Pre-dev）

启动 Claude Code 任务**前**至少确认以下各项：

| # | 门禁 | 验证方式 | 通过标准 |
|---|------|---------|---------|
| P1 | 官方精确 model ID | 官方 API Docs / 控制台 | 与官方完全一致 |
| P2 | 官方提供 API（非仅 Web 演示） | 官方文档 / 控制台确认 | 存在公开 API 入口 |
| P3 | 定价、上下文、Preview 生命周期 | 官方文档 | 记录完整 |
| P4 | 商业聚合 / 转售可行性 | 官方 ToS / 官方销售或商务书面确认 / 具同等效力的官方材料 | 上述官方材料**明确允许**聚合或商业转售 |

- **任一项不满足** → 标记 `PRE_GATE_BLOCKED`，不启动开发任务。
- 记录未通过原因和官方来源。

**P4 证据标准（严格）**：
- P4 的 PASS 证据**只能**是：官方 ToS 条款、官方销售/商务的书面确认，或具有同等效力的官方材料。
- **"有先例"（其他聚合商在售、行业惯例等）只能作为调研线索，不能作为 P4 的 PASS 证据。**
- 无官方书面材料时，P4 记为 `PENDING` 或 `FAIL`，不得以"先例"放行。

### 4.2 实现后发布门禁（Post-impl）

Claude Code 执行完成、**发布前**必须通过以下各项：

| # | 门禁 | 验证方式 | 通过标准 |
|---|------|---------|---------|
| R1 | requested/responded model 一致 | 对比请求与响应中的 model 字段 | 完全一致 |
| R2 | 真实调用成功 | 实测调用（经范总批准的付费实测，或可确认免费的 mock/demo/官方免费额度） | 返回有效响应 |
| R3 | 计费正确性 | 核验批准的 Vancine 销售价、计费表达式/倍率、quota 扣减与实际日志一致 | 四者一致（见下） |
| R4 | 本地 Docker 验证通过 | `docker compose build vancine && docker compose up -d` | 无 error/panic/fatal |

- **任一项不满足** → 不进入发布，标记 `NEEDS_REWORK` 或 `POST_GATE_BLOCKED`。

**R3 计费核验标准**：
- R3 **不要求** Vancine 售价等于上游官方价。
- R3 核验的是以下四者一致：①经范总批准的 Vancine 销售价；②计费表达式 / 倍率配置；③实际 quota 扣减；④请求日志中的计费记录。
- 上游官方价格**仅用于内部成本与利润核算**，不得作为 R3 的比对基准，更**不得公开上游采购成本**。
- Vancine 售价**可以包含合理平台利润**；只要上述四者自洽一致即通过 R3。

### 4.3 付费调用审批

**任何可能产生费用的模型 / API 调用必须先获得范总明确批准**。

- **持有 key 不代表获准产生费用**。拥有上游测试 key、渠道 key 或免费额度，均不构成发起付费调用的授权。
- 未经范总批准，**只允许**确定不会产生费用的调用：mock、demo，或官方明确标注的免费额度。
- **无法确认是否收费时，一律不得调用**。
- Codex / Claude Code 不得自行决定任何可能付费的调用。
- 经批准的付费调用必须在任务简报与最终报告中记录批准依据（`paid_test_approved_by`）。

---

## 5. 机会评分模型

每个候选模型按以下**六项**维度评分，**每项 0–5 分，总分 30 分**：

| # | 维度 | 字段名 | 分值 | 说明 |
|---|------|--------|------|------|
| 1 | 热度与增长速度 | `hotness` | 0–5 | 国内/海外讨论热度与增长趋势 |
| 2 | 海外开发者需求 | `overseas_demand` | 0–5 | 海外开发者真实需求强度 |
| 3 | API/商业可用性 | `api_commercial` | 0–5 | API 稳定性、商业转售可行性 |
| 4 | Vancine 差异化供给 | `vancine_differentiation` | 0–5 | 相比竞品的独特价值与供给差异 |
| 5 | 实证速度与成本 | `speed_cost` | 0–5 | 实测延迟和价格竞争力 |
| 6 | 渠道匹配 | `channel_fit` | 0–5 | 与现有渠道和受众的契合度 |

**校验规则（强制）**：

- 六个维度取值**只能**为整数 `0–5`（含端点）。
- `total` **必须**等于六项之和。
- `total` 合法范围为 `0–30`。
- 唯一合法刻度为六项各 0–5、总分 30；任何历史更高单项上限或更高总分刻度均视为错误，不得沿用。

**决策阈值**：

| 总分 | 决策 |
|------|------|
| ≥ 24 | **Fast Lane**：立即启动接入 |
| 19–23 | **观察/准备**：持续跟踪，准备材料 |
| ≤ 18 | **暂缓**：记录原因，定期复评 |

**门禁优先于总分**：

- **商业可用性门禁（P4）优先于总分**。P4 为 `FAIL` / `PENDING` 时，即使总分 ≥ 24 也**不得**进入 Fast Lane 开发启动。
- 评分达到 Fast Lane **不得**覆盖失败或未通过的硬门禁（Pre-dev P1–P4；发布前还需 Post-impl R1–R4 全部通过）。
- 硬门禁未通过时，决策应记为 `Hold` 或保持 `PRE_GATE_BLOCKED` / `POST_GATE_BLOCKED`，并记录未通过原因。

---

## 6. 标准 Coding Agent 实测

### 6.1 实测环境要求

- **冻结的 OpenCode 版本**：记录具体版本号
- **Docker 环境**：记录镜像和配置
- **代码**：记录 commit SHA
- **提示**：记录完整 prompt
- **测试用例**：记录测试场景
- **预算**：记录 token 消耗上限

### 6.2 实测记录字段

| 字段 | 说明 |
|------|------|
| requested model | 请求的模型 ID |
| responded model | 实际响应的模型 ID |
| 步骤 | 执行步骤序列 |
| 工具调用 | 工具名称和参数 |
| 失败 | 失败步骤和原因 |
| 文件 | 涉及的文件 |
| 测试 | 测试结果 |
| 耗时 | 端到端延迟 |
| tokens | token 消耗量 |
| Vancine 消耗 | Vancine 平台计费 |

### 6.3 成本保密

**上游内部成本不得公开**。实测报告中仅输出 Vancine 平台计费和性能指标，不包含上游采购成本。

---

## 7. 证据资产

每个上线模型必须生成以下证据资产：

| 资产 | 说明 |
|------|------|
| evidence JSON | 结构化证据记录 |
| baseline SHA | 任务启动时工作树基线 commit SHA |
| release commit SHA | 范总批准并 commit 后的发布 SHA（Claude Code 阶段为 null） |
| Starter | 快速开始示例代码 |
| 配置示例 | 配置文件示例 |
| SEO 页面 | 模型详情页 |
| 身份披露 | Vancine 独立聚合服务声明 |
| 限制说明 | 已知限制和注意事项 |
| UTM 参数 | 渠道追踪参数 |

---

## 8. 渠道选择规则

### 8.1 渠道组合

每个模型上线必须包含：
- **一个自有资产**：Vancine 官网页面、博客、文档
- **一个主渠道**：核心投放渠道（如 Reddit、HN、X）
- **一个放大渠道**：辅助放大渠道（如 KOL、Newsletter）

### 8.2 内容规则

- **禁止复制同一 Reddit 文案**到多个 subreddit。
- 发布前**必须实时读取目标社区规则**，确认允许 self-promotion（不依赖旧记忆）。
- 遇到禁止 AI 生成/编辑内容的渠道，不得由 Codex / Claude Code 代写或代发。
- 内容必须真实、有价值，避免纯广告。
- 必须包含身份披露。
- 任何发帖、评论、回复、点赞、关注、私信等**外部写操作**均需范总单独批准（见 §13.2）。

---

## 9. 归因漏斗

```
landing_view
  → signup_started
    → signup_completed
      → api_key_created
        → first_api_call_succeeded(model)
```

每个阶段必须可追踪、可量化。

---

## 10. 数据阈值（默认实验基线）

> 以下为**默认值**，可直接执行，不保留规范性"待填"。单模型任务可在**发布前**覆盖默认阈值，但必须记录理由并经**范总批准**。

### 10.1 24h 有效信号（OR 关系，任一满足即视为有效）

| 指标 | 阈值 |
|------|------|
| UTM `landing_view` | ≥ 10 |
| `signup_completed` | ≥ 1 |
| `first_api_call_succeeded(model)` | ≥ 1 |

任一满足 → 标记 24h 有效，继续观察。

### 10.2 72h 成功线（AND 关系，全部满足才算成功）

| 指标 | 阈值 |
|------|------|
| UTM `landing_view` | ≥ 20 |
| `signup_completed` | ≥ 2 |
| `first_api_call_succeeded(model)` | ≥ 1 |

**全部满足** → 标记 72h 成功，进入 7d 观察。

### 10.3 72h 停止线（AND 关系，全部满足才触发停止）

| 指标 | 阈值 |
|------|------|
| UTM `landing_view` | < 5 |
| `signup_completed` | = 0 |
| `first_api_call_succeeded(model)` | = 0 |
| 有效评论 | 无 |

**全部满足** → 触发停止线，暂停投放，分析原因，决定是否调整或终止。

**重要**：不得因单一低指标自动停止。例如 `landing_view` 高但 `signup` 低，应分析转化漏斗而非直接停止。

### 10.4 7d 留存里程碑（独立判断，不得在 72h 时判断）

| 指标 | 初始参考目标 |
|------|------|
| 7 日留存（7d 后仍有活跃 API 调用的用户占比） | ≥ 20%（**仅初始参考目标**） |

- 7d 留存为**独立里程碑**，在 72h 数据之外单独评估，不得提前到 72h 判断。
- **20% 只是初始参考目标，不得自动成为停止线**；未达 20% 不直接触发停止。
- **样本过小**（如分母用户数过少）时，必须同时报告**分子与分母**（如 `留存 1/3`），并标记 `insufficient_sample`，此时不做达成/未达成结论。
- 首次真实实验后，再经**范总批准**校准为正式阈值；校准前一律按"初始参考目标 + 样本标注"执行。

### 10.5 阈值覆盖

单模型任务如需覆盖上述默认阈值：
1. 在任务简报中记录覆盖项、新阈值、理由。
2. 经范总明确批准后方可生效。
3. 未批准的覆盖一律无效，仍按默认阈值执行。

---

## 11. 调度闭环与任务状态机

### 11.1 调度闭环（端到端）

```
vancine-model-radar（独立只读自动化）
  → 候选模型情报与评分
  → Vancine 获客调度任务
  → 范总批准
  → 创建一个模型一个独立任务
  → Codex 生成 Claude Code 命令
  → 范总调用 Claude Code
  → Codex 只读验收
  → 范总本地验收和发布审批
  → 24h/72h/7d 数据报告
  → 结构化结果回传调度任务
```

**vancine-model-radar（独立只读自动化，状态：ACTIVE）**：

该自动化**当前已存在并运行（ACTIVE）**。本文档只描述其接口与约束，**不创建、不修改**该自动化本身。

- 接口（只读输入 → 结构化输出）：
  - 输入：国内官方来源 + 海外需求渠道的公开只读信息。
  - 输出：候选模型情报（§3 三段式）+ 机会评分（§5）+ 建议动作，回传至获客调度任务。
- 约束（独立只读）：
  - ✅ 只做只读情报收集、评分、输出候选列表。
  - ❌ 不得自动开发、付费调用、发布、评论、私信或修改仓库。
  - 雷达产出仅为**建议**，一切开发与发布动作必须经范总批准。

### 11.2 任务状态机

```
RESEARCHING
  → PRE_GATE_BLOCKED（开发前准入门禁未通过）
  → AWAITING_APPROVAL（等待范总批准启动开发）
  → AWAITING_CLAUDECODE（等待 Claude Code 执行）
  → CLAUDECODE_DONE（Claude Code 执行完成）
  → NEEDS_REWORK（需要整改）
  → POST_GATE_BLOCKED（实现后发布门禁未通过）
  → LOCAL_ACCEPTANCE（本地验收通过）
  → RELEASE_APPROVAL（等待发布审批）
  → MONITORING_24H（24 小时监控中）
  → MONITORING_72H（72 小时监控中）
  → MONITORING_7D（7 日留存观察中）
  → COMPLETED（完成）
  → STOPPED（停止）
```

**状态转换规则**：
- 一个模型一个独立任务。
- 约 60 轮或上下文明显膨胀时 handoff。
- 每个状态转换必须记录原因和时间，并**回传获客调度任务**。

---

## 12. 结构化最终报告字段

每个任务完成后必须输出以下结构化报告，并**回传获客调度任务**：

```json
{
  "task_id": "",
  "dispatch_task_id": "",
  "model_id": "",
  "status": "",
  "gate_results": {
    "pre_dev": {
      "P1_model_id": "PASS|FAIL",
      "P2_api_available": "PASS|FAIL",
      "P3_pricing_lifecycle": "PASS|FAIL",
      "P4_commercial_resale": "PASS|FAIL"
    },
    "post_impl": {
      "R1_model_match": "PASS|FAIL",
      "R2_real_call": "PASS|FAIL",
      "R3_billing_correct": "PASS|FAIL",
      "R4_local_docker": "PASS|FAIL"
    }
  },
  "opportunity_score": {
    "hotness": 0,
    "overseas_demand": 0,
    "api_commercial": 0,
    "vancine_differentiation": 0,
    "speed_cost": 0,
    "channel_fit": 0,
    "total": 0,
    "decision": "Fast Lane|Watch|Hold"
  },
  "benchmark": {
    "requested_model": "",
    "responded_model": "",
    "latency_ms": 0,
    "tokens": 0,
    "vancine_cost": 0,
    "paid_test_approved_by": null
  },
  "evidence": {
    "baseline_sha": "",
    "release_commit_sha": null,
    "evidence_json": "",
    "starter_url": "",
    "seo_url": ""
  },
  "channels": {
    "owned_asset": "",
    "primary_channel": "",
    "amplifier_channel": ""
  },
  "funnel": {
    "landing_view": 0,
    "signup_started": 0,
    "signup_completed": 0,
    "api_key_created": 0,
    "first_api_call_succeeded": 0
  },
  "retention_7d": {
    "numerator": 0,
    "denominator": 0,
    "rate": null,
    "insufficient_sample": true
  },
  "thresholds": {
    "source": "default",
    "override_reason": "",
    "override_approved_by": null
  },
  "stop_go_decision": "GO|STOP|ADJUST",
  "risks": [],
  "notes": ""
}
```

### 12.1 字段语义（解释在此，不写入字段值）

- **`baseline_sha`**：Claude Code 任务启动时的工作树基线 commit SHA（执行时记录）。
- **`release_commit_sha`**：Claude Code 阶段恒为 JSON `null`（Claude Code 禁止 commit）；仅当范总批准并完成 commit 后，发布报告才填入真实 SHA 字符串。
- **`paid_test_approved_by`**：未获付费调用批准时为 JSON `null`；获批准时填批准人（如 `"范总"`）及批准依据。
- **`override_approved_by`**：未覆盖默认阈值时为 JSON `null`；覆盖获批时填批准人。
- **`thresholds.source`**：取值 `"default"` 或 `"overridden"`（枚举字符串）。
- **`retention_7d`**：`numerator`/`denominator` 为留存分子/分母；样本过小时 `rate` 为 `null` 且 `insufficient_sample` 为 `true`（见 §10.4）。
- **`stop_go_decision`**：取值 `GO` / `STOP` / `ADJUST`（枚举字符串）。
- **`opportunity_score`**：必须包含六个独立维度 `hotness` / `overseas_demand` / `api_commercial` / `vancine_differentiation` / `speed_cost` / `channel_fit`（各项整数 `0–5`）、`total`（六项之和，合法范围 `0–30`）与 `decision`（`Fast Lane` / `Watch` / `Hold`）。商业可用性门禁优先于总分；Fast Lane 评分不得覆盖失败硬门禁（见 §5）。
- 所有状态转换与本报告必须能够回传获客调度任务。
- **规范**：`null` 一律使用真正的 JSON `null`，不得用 `"范总 | null"` 或说明文字充当字段值；解释统一写在本节。

---

## 13. 审批边界和凭据保护

### 13.1 内部审批边界

| 阶段 | 审批人 | 审批内容 |
|------|--------|---------|
| 开发前门禁通过后 | 范总 | 是否启动 Claude Code 任务 |
| 付费实测 | 范总 | 是否允许付费模型/API 实测 |
| Claude Code 完成后 | Codex | 只读验收 |
| 验收通过后 | 范总 | 本地验收 |
| 本地验收通过后 | 范总 | commit / push / deploy（**分别**审批） |

### 13.2 外部写操作审批（逐项单独批准）

**以下每一项外部写操作均需范总单独批准**，未批准时只能准备草稿和只读核验：

| 操作类别 | 具体操作 | 审批要求 |
|---------|---------|---------|
| 代码仓库 | commit | 单独批准 |
| 代码仓库 | push | 单独批准 |
| 代码仓库 | deploy | 单独批准 |
| Reddit | 发帖、评论、回复、点赞 | 单独批准 |
| Hacker News | 发帖、评论 | 单独批准 |
| X（Twitter） | 发帖、回复、转推、点赞、关注 | 单独批准 |
| DEV / 其他博客 | 发帖、评论 | 单独批准 |
| 社区 / 论坛 | 发帖、评论、私信 | 单独批准 |
| 私信 / DM | 任何渠道的私信 | 单独批准 |

**渠道规则实时核验**：
- 每次发布前**实时读取目标渠道规则**（不得依赖旧记忆）。
- 遇到**禁止 AI 生成或编辑内容**的渠道，**不得**由 Codex / Claude Code 代写或代发。
- 此类渠道仅可由范总本人按渠道规则手动操作，或放弃该渠道。

### 13.3 凭据保护

- **禁止**在任何文档、代码、commit 中出现**真实凭据**：
  - 真实 API Key、Token、Secret
  - 真实 Cookie、Session
  - 真实数据库连接字符串
  - 上游内部成本信息
- **示例占位符可以存在**（如 `sk-...`、`Bearer <REDACTED> Token>`、`postgres://...`、`$VANCINE_API_KEY`）。
- 所有真实凭据必须通过环境变量或安全配置管理。
- 代码提交前必须扫描真实凭据（见模板 §11）。

---

## 14. Codex / Claude Code / 范总职责边界

### 14.1 Codex 职责（只读 + 调度）

- ✅ 调研候选模型
- ✅ 拆解任务
- ✅ 生成 Claude Code 任务命令
- ✅ 只读验收 Claude Code 输出
- ✅ 调度任务状态
- ❌ 不执行代码
- ❌ 不修改文件
- ❌ 不调用 Claude Code
- ❌ 不 commit/push/deploy
- ❌ 不做任何外部写操作（发帖、评论、回复、点赞、关注、私信等）

### 14.2 范总职责（手动调用 + 审批）

- ✅ 手动调用 Claude Code
- ✅ 审批各阶段转换
- ✅ 本地验收
- ✅ commit / push / deploy（分别审批）
- ✅ 外部写操作（逐项单独批准，见 §13.2）
- ❌ 不直接执行开发任务（通过 Claude Code）

### 14.3 Claude Code 职责（执行）

- ✅ 执行代码开发
- ✅ 执行测试
- ✅ 修改配置（允许清单内）
- ✅ 修改开发文档
- ❌ 不 commit/push/deploy
- ❌ 不调用生产 API
- ❌ 不发起付费上游调用（除非范总明确批准）
- ❌ 不访问凭据
- ❌ 不做任何外部写操作

### 14.4 验收失败处理

- 验收失败时，**Codex 只能生成下一轮 Claude Code 整改任务**
- Codex 不得直接修改代码
- 整改任务必须明确失败原因和修复要求

### 14.5 完整流程

```
雷达情报 → Codex 调研 → 生成任务简报 → 范总审批
  → 范总调用 Claude Code → Claude Code 执行
  → Codex 只读验收 → 验收通过？
    → 是：范总本地验收 → commit/push/deploy 分别审批
    → 否：Codex 生成整改任务 → 范总调用 Claude Code
```

---

## 15. 项目规则对齐与可移植性

### 15.1 本地验收地址

- **项目标准验收地址为 `http://127.0.0.1:3000`**（对应 `AGENTS.md` Rule 4）。
- 通用模板**不得**把本机 `docker-compose.override.yml` 映射的 3001 当作固定端口。
- 如存在经范总认可的本机 override，必须通过以下方式解析并记录实际 `LOCAL_BASE_URL`，不得静默改变标准：

  ```bash
  docker compose config            # 查看合并后的完整配置
  docker compose port vancine 3000 # 解析实际映射端口
  ```

- 任务简报中必须显式写明 `LOCAL_BASE_URL` 及其来源（标准 3000 / override 解析结果）。

### 15.2 受保护标识

new-api、QuantumNous 的引用、品牌、元数据与归属信息严格受保护，不得修改或删除（见 §0，对应 `AGENTS.md` Rule 6）。

### 15.3 既有未提交内容

任务简报中的"既有未提交内容"应写为**执行时记录的全部既有未提交内容**（`git status --short` 实际输出），而非固定写死某个文件。当前 `docs/devlog/2026-07.md` 仅为示例，所有既有未提交内容一律禁止修改、暂存、覆盖或清理。

### 15.4 构建文件保护

`Dockerfile`、`docker-compose.yml` **不默认允许修改**。只有任务明确需要且范总批准时，才能加入允许清单。

### 15.5 前端变更要求

任何前端变更必须明确以下各项，或记录 N/A 理由：
- **Classic / Default parity**：两个主题是否都需要改，各自改了什么。
- **i18n**：是否涉及翻译，涉及哪些语言（default: en/zh/fr/ru/ja/vi；classic 按其规范）。
- **构建验证**：执行对应的 `npm run build`（default）或 classic 构建命令并确认通过。

### 15.6 合规

- 遵守上游模型厂商的 ToS。
- 遵守目标投放社区的规则。
- 遵守 AGPL-3.0 开源协议（保留原始版权声明）。
- 遵守数据隐私法规（GDPR 等）。
- 不得误导用户认为 Vancine 是模型厂商官方服务。

---

## 16. 一个模型一个任务

- 每个模型对应一个独立任务
- 任务上下文约 60 轮或上下文明显膨胀时 handoff
- 每个任务有独立的：
  - 任务 ID
  - 调度任务 ID（回传闭环）
  - 简报文档
  - 证据资产
  - 状态记录

---

## 附录 A：术语表

| 术语 | 说明 |
|------|------|
| Pre-dev Gate | 开发前准入门禁（P1–P4） |
| Post-impl Gate | 实现后发布门禁（R1–R4） |
| Gate | 门禁统称，分 Pre-dev 与 Post-impl 两类 |
| Fast Lane | 六项各 0–5、总分 30 制下总分 ≥ 24，立即启动（硬门禁仍优先） |
| Watch | 总分 19–23，观察准备 |
| Hold | 总分 ≤ 18，暂缓 |
| evidence JSON | 结构化证据记录 |
| handoff | 上下文交接 |
| requested/responded model | 请求/响应模型一致性校验 |
| baseline_sha | 任务启动时工作树基线 commit SHA |
| release_commit_sha | 范总批准并完成 commit 后的发布 SHA（Claude Code 阶段为 null） |
| LOCAL_BASE_URL | 本地验收地址，标准 3000，override 时需 docker compose port 解析 |

## 附录 B：关联文档

- [Claude Code 任务简报模板](./templates/claudecode-task-brief.md)
- [项目 AGENTS.md](../../AGENTS.md)
- [开发日志](../devlog/)
- [发布流程](../release-process.md)
- [部署规范](../deployment.md)

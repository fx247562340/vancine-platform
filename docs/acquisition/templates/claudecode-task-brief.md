# Claude Code 任务简报模板

> **版本**：v1.2.2
> **更新时间**：2026-07-28
> **负责人**：范总
> **关联 SOP**：[模型上线与海外获客 SOP](../model-launch-sop.md)

---

本模板用于生成可执行的单模型任务。每个模型对应一个独立任务实例。

> **模板定位与从属关系**：本文件历史名称为「Claude Code 任务简报」，但其中的「**执行 Agent**」
> 是**通用角色**，由**范总**在每个任务开始时指定为 **Pi Agent** 或 **Claude Code** 之一；
> 两者作为执行 Agent 的两种实现并列，权限与职责完全相同。本模板必须**服从**根
> [`AGENTS.md`](../../../AGENTS.md) 的「Codex 与执行 Agent 协作工作流（全局最高优先级）」章节；
> 与本模板文字冲突时以根 `AGENTS.md` 为准，本模板不产生独立的第二套工作流。
>
> **角色边界（全局）**：
> - **执行 Agent**（Pi Agent 或 Claude Code）：修改允许文件、运行验证、回传证据。
> - **Codex**：只读调度与只读验收，**不修改任何项目文件**。
> - **范总**：指定执行 Agent、在 Codex 与执行 Agent 之间传递任务、验收并批准发布阶段。
>
> **执行 Agent 锁定**：同一任务从实现、整改、测试到发布闭环，**不得中途切换执行 Agent**
> （不得 Pi Agent → Claude Code，也不得 Claude Code → Pi Agent）。

---

## 1. 任务标识

| 字段 | 值 |
|------|------|
| 任务名称 | `[模型名] 接入与上线` |
| 精确 model ID | `[精确 model ID，与官方一致]` |
| 获客调度任务 ID | `[由调度系统生成，用于结果回传闭环]` |
| Codex 调度任务 ID | `[由 Codex 生成，如 VANCINE-2026-001]` |
| 单模型执行任务 ID | `[由 Codex 生成，如 CC-2026-07-20-001]` |
| 项目路径 | `/Users/xin/ClaudeProject/vancine-platform` |
| 本地验收地址 LOCAL_BASE_URL | `[标准 http://127.0.0.1:3000；若有经范总认可的 override，用 docker compose port vancine 3000 解析后填写]` |
| 任务执行 Agent（范总指定） | `[Pi Agent 或 Claude Code]`（本任务唯一执行 Agent，全程锁定） |
| 创建时间 | `[YYYY-MM-DD HH:mm]` |
| 创建人 | 范总 |

---

## 2. AGENTS.md 要求

执行本任务前必须完整读取：

- [ ] 项目根目录 `AGENTS.md`（含「Codex 与执行 Agent 协作工作流」全局最高优先级章节与项目规则）
- [ ] `frontend/AGENTS.md`（如涉及前端）
- [ ] `web/default/AGENTS.md`（如涉及 default 主题）
- [ ] `pkg/billingexpr/expr.md`（如涉及计费表达式）
- [ ] 当月 `docs/devlog/YYYY-MM.md`

---

## 3. Git 基线

| 字段 | 值 |
|------|------|
| 基线分支 | `main` |
| 基线 commit SHA | `[执行时记录]` |
| 工作分支 | `[如创建，记录分支名]` |

### 3.1 既有未提交内容

> **警告**：执行时记录的**全部**既有未提交内容属于范总既有工作，**严禁修改、暂存、覆盖或清理**。

执行任务前运行 `git status --short`，将输出的**所有**既有未提交条目填入下表（不得只写死某个文件）。当前 `docs/devlog/2026-07.md` 仅为示例。

| 文件 | 状态 | 操作 |
|------|------|------|
| `[git status --short 实际输出逐条填入]` | `[状态]` | **禁止触碰** |
| `docs/devlog/2026-07.md`（示例） | 已修改 | **禁止触碰** |

---

## 4. 官方来源和商业门禁状态

### 4.1 官方来源

| 来源 | URL | 核验时间 |
|------|-----|---------|
| 官方 API Docs | `[URL]` | `[时间]` |
| 控制台 | `[URL]` | `[时间]` |
| 定价页 | `[URL]` | `[时间]` |
| 更新日志 | `[URL]` | `[时间]` |

### 4.2 门禁状态

**开发前准入门禁（Pre-dev）** — 启动本任务前必须确认，任一 FAIL 即 `PRE_GATE_BLOCKED`：

| # | 门禁 | 状态 | 证据 |
|---|------|------|------|
| P1 | 官方精确 model ID | PASS / FAIL / PENDING | `[来源]` |
| P2 | 官方提供 API（非仅 Web 演示） | PASS / FAIL / PENDING | `[文档/控制台]` |
| P3 | 定价、上下文、Preview 生命周期 | PASS / FAIL / PENDING | `[文档链接]` |
| P4 | 商业聚合 / 转售可行性 | PASS / FAIL / PENDING | `[官方 ToS / 官方销售或商务书面确认 / 同等效力官方材料]` |

> **P4 证据标准**：PASS 证据只能是官方 ToS、官方销售/商务书面确认或具同等效力的官方材料。**"有先例"只是调研线索，不能作为 PASS 证据**；无官方书面材料时记 PENDING/FAIL。

**实现后发布门禁（Post-impl）** — 执行 Agent 执行后、发布前验证，任一 FAIL 不发布：

| # | 门禁 | 状态 | 证据 |
|---|------|------|------|
| R1 | requested/responded model 一致 | PASS / FAIL / PENDING | `[测试结果]` |
| R2 | 真实调用成功 | PASS / FAIL / PENDING | `[经范总批准的付费实测，或可确认免费的 mock/demo/官方免费额度]` |
| R3 | 计费正确性 | PASS / FAIL / PENDING | `[批准售价 / 计费表达式倍率 / quota 扣减 / 日志 四者一致]` |
| R4 | 本地 Docker 验证通过 | PASS / FAIL / PENDING | `[docker logs 无 error/panic/fatal]` |

> **R3 计费核验**：不要求 Vancine 售价等于上游官方价；核验①批准的 Vancine 销售价、②计费表达式/倍率、③quota 扣减、④请求日志四者一致。上游官方价仅用于内部成本/利润核算，**不得公开上游采购成本**；Vancine 售价可含合理平台利润。

> 实现后才能验证的 R1–R4 **不得**阻止本开发任务启动；但发布前必须全部通过。

---

## 5. 任务目标与非目标

### 5.1 任务目标（In Scope）

- [ ] 接入模型到 Vancine 平台
- [ ] 配置 channel、model mapping、endpoint
- [ ] 配置计费表达式
- [ ] 添加模型元数据（描述、标签、图标）
- [ ] 添加 Starter 示例代码
- [ ] 添加 SEO 页面
- [ ] 本地 Docker 验证
- [ ] 生成 evidence JSON

### 5.2 非目标（Out of Scope）

- ❌ 上游采购成本优化
- ❌ 海外渠道投放（由后续任务执行）
- ❌ 社媒内容创作
- ❌ 多模型批量接入
- ❌ 生产环境配置修改

---

## 6. 允许修改文件

以下文件**允许**修改：

```
# 后端
setting/          # 配置相关
constant/         # 常量定义
relay/            # relay 适配（如需要）
model/            # 数据模型（如需要）
service/          # 业务逻辑（如需要）
controller/       # 控制器（如需要）
router/           # 路由（如需要）
i18n/             # 国际化
pkg/billingexpr/  # 计费表达式（如需要）

# 前端
web/default/src/  # default 主题
web/classic/src/  # classic 主题

# 文档
docs/             # 文档（执行时记录的全部既有未提交内容除外）
```

> **构建文件不默认允许**：`Dockerfile`、`docker-compose.yml` **不在**默认允许清单。只有任务明确需要且范总批准时，才在此处追加列入并记录批准依据。

---

## 7. 禁止修改文件

以下文件**禁止**修改：

```
AGENTS.md                  # 项目规则（含 new-api / QuantumNous 受保护标识）
VERSION                    # 版本号（实现阶段禁止修改；发布阶段经范总批准「发布元数据准备」后，由本任务锁定的执行 Agent 与 CHANGELOG.md 一并修改）
CHANGELOG.md               # 变更日志（实现阶段禁止修改；发布阶段经范总批准「发布元数据准备」后，由本任务锁定的执行 Agent 与 VERSION 一并修改）
Dockerfile                 # 默认受保护，除非范总批准并列入允许清单
docker-compose.yml         # 默认受保护，除非范总批准并列入允许清单
LICENSE                    # 许可证（AGPL-3.0，保留原始版权声明）
README.md                  # 主 README（除非任务明确要求）
[执行时记录的全部既有未提交内容]  # 严禁触碰（如 docs/devlog/2026-07.md）
```

> new-api、QuantumNous 的引用、品牌、元数据与归属信息严格受保护，不得修改或删除（`AGENTS.md` Rule 6）。

> **VERSION / CHANGELOG.md 语义**：两者是**一个耦合的「发布元数据准备」步骤**：实现阶段**一律禁止修改**；
> 进入发布阶段后，作为**一个审批项**由范总一并批准，获批后由**本任务锁定的执行 Agent 一并修改**
> （不存在「两者各自单独批准」，也不得只改其一）。修改顺序与后续重跑发布门禁的要求见 §15.2：**必须
> 先完成发布元数据准备并对最终版本重跑发布门禁，才能进入 commit**。**Codex 不修改任何文件**，
> 只输出指令并做只读审核。若本任务属 §15.3 的**非发布型工作流文档任务**，则**不执行发布元数据准备**，
> 两个文件保持**绝对不修改**。本条不得削弱凭据、禁止文件与执行时记录的既有未提交内容保护规则。

---

## 8. 受保护信息

> **警告**：**真实**凭据**禁止**出现在代码、文档、commit、日志中。**示例占位符可以存在**。

| 类别 | 真实凭据（禁止） | 示例占位符（允许） | 处理方式 |
|------|-----------------|------------------|---------|
| API Key | 真实 `sk-` 开头长串 | `sk-...` | 环境变量 |
| Token | 真实 Bearer <REDACTED> | `Bearer <REDACTED> Token>` | 环境变量 |
| Cookie | 真实 session cookie | `session cookie` | 不记录 |
| 数据库连接字符串 | 含真实账号密码的连接串 | `postgres://...` | 环境变量 |
| 上游内部成本 | 真实采购价 | — | **禁止公开** |
| 用户个人信息 | 真实 email、IP | — | 脱敏 |

**判定原则**：禁止的是**真实凭据**；文档中为说明用途而写的占位符可以保留。不得输出任何真实凭据。

**示例占位符清单**（§11 扫描的正则结构上不会命中这些占位符，仅限以下字面量）：
`sk-...`、`Bearer <REDACTED> Token>`、`$VANCINE_API_KEY`、`postgres://...`、`mysql://...`、`redis://...`、`[model_id]`、`[URL]`、`127.0.0.1`、`session cookie`、`https://api.longcat.chat/docs`、`https://api.longcat.chat/pricing`。
以上均为示意，不构成真实凭据；占位符因含 `<`、`>`、`$` 或长度不足，结构上不会触发 §11 的 Bearer/key 等模式。

---

## 9. 实现要求

### 9.1 后端

- [ ] 新增 channel type（如需要）
- [ ] 配置 `ChannelBaseURLs`
- [ ] 配置 `ChannelTypeNames`
- [ ] 配置 model mapping
- [ ] 配置计费表达式
- [ ] 支持 `StreamOptions`（如上游支持）
- [ ] 添加 i18n 翻译

### 9.2 前端

- [ ] 添加 channel 选项
- [ ] 添加模型图标
- [ ] 添加模型描述（英文）
- [ ] 添加模型标签
- [ ] 适配 light/dark 主题

**前端变更必须逐项确认，或记录 N/A 理由**：

| 项 | Classic | Default | 说明 / N/A 理由 |
|----|---------|---------|----------------|
| parity（两主题是否都需改） | `[改了什么 / N/A]` | `[改了什么 / N/A]` | |
| i18n 翻译 | `[涉及语言 / N/A]` | `[涉及语言 / N/A]` | default: en/zh/fr/ru/ja/vi |
| 构建验证 | `npm run build`（classic 命令） | `npm run build` | 必须通过 |

### 9.3 文档

- [ ] 更新接入文档
- [ ] 添加 Starter 示例
- [ ] 添加配置示例
- [ ] 添加身份披露
- [ ] 添加限制说明

---

## 10. 本地测试命令

> 项目标准验收地址为 `http://127.0.0.1:3000`。**必须先 build、up 启动容器，再解析端口**（容器未启动时 `docker compose port` 无输出）。经范总批准的 override 必须在任务标识中记录。

```bash
# 1. 构建
docker compose build vancine

# 2. 启动
docker compose up -d

# 3. 容器启动后解析本地验收地址（兼容 IPv4/IPv6：取最后一个冒号后的端口）
PORT="$(docker compose port vancine 3000 | head -n1 | awk -F: '{print $NF}')"
if [ -z "$PORT" ]; then
  echo "ERROR: 无法解析 vancine 3000 的映射端口（容器是否已启动？）" >&2
  exit 1
fi
LOCAL_BASE_URL="http://127.0.0.1:${PORT}"   # 标准即 http://127.0.0.1:3000；override 时为解析出的端口
echo "LOCAL_BASE_URL=$LOCAL_BASE_URL"

# 4. 验证状态
curl "$LOCAL_BASE_URL/api/status"

# 5. 查看日志（最近 2 分钟）
docker logs vancine --since 2m

# 6. 测试模型调用（示例，需替换 model_id；任何可能付费的调用须先获范总批准）
curl "$LOCAL_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $VANCINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "[model_id]", "messages": [{"role": "user", "content": "hello"}]}'

# 7. 前端 lint / build（如涉及前端）
cd web/default && npm run lint && npm run build
cd web/classic && npm run lint   # classic 按其构建命令

# 8. 后端 lint
go vet ./...
```

> 解析失败（`PORT` 为空）时**立即报错退出**，不得生成 `http://127.0.0.1:` 这类空地址。

---

## 11. 安全和敏感信息扫描

> **扫描范围**：本次任务**实际新增/修改的全部文件**，覆盖 tracked（工作区改动）、staged（已暂存）、untracked（新增）三类。**不得整体排除 `docs/acquisition/` 或任何目录**；只扫描实际存在的常规文件。
>
> **豁免原则**：只豁免**明确的示例占位符**（见 §8 精确豁免清单，如 `sk-...`、`Bearer <REDACTED> Token>`、`postgres://...`、`$VANCINE_API_KEY`、`127.0.0.1`）。**真实凭据一律不得出现**。

```bash
# 0. NUL-safe 收集变更文件清单（三类来源，去重，仅保留实际存在的常规文件，支持含空格文件名）
#    注意：不要用 `git status --short | awk '{print $2}'`——它会把 untracked 目录折叠成目录名。
files=()
while IFS= read -r -d '' f; do files+=("$f"); done < <(
  {
    git diff --name-only -z;                       # tracked 工作区改动
    git diff --cached --name-only -z;             # 已暂存改动
    git ls-files --others --exclude-standard -z;  # untracked 新增
  } | sort -uz
)

# 仅保留实际存在的常规文件（排除目录、依赖、锁文件）
scan=()
for f in "${files[@]}"; do
  case "$f" in
    *node_modules*|*package-lock*) continue ;;
  esac
  [ -f "$f" ] && scan+=("$f")
done

# scan 为空时明确提示并正常结束，不得等待 stdin
if [ "${#scan[@]}" -eq 0 ]; then
  echo "无文件可扫描"
  exit 0   # 若本块嵌入更大脚本，可改为 return 0
fi

echo "将扫描 ${#scan[@]} 个文件："
printf '  %s\n' "${scan[@]}"

# 统一用 `command grep` 绕过 shell grep 包装函数（如 alias 到 ugrep -G / --ignore-files），确保 ERE 行为一致。
# 所有扫描均为逐文件布尔检查（grep -Eq）：命中只输出"类别 + 文件路径"，绝不打印匹配行/token/连接串/email 原文。
# 用 -e 传 pattern、-- 保护以连字符开头的文件名不被解释为选项。

# Bearer 正则拆成不会被环境自动 REDACT 的安全片段，运行时再拼接（文档中不出现完整模拟 token）：
bearer_prefix='Bearer[[:space:]]+'
bearer_chars='[A-Za-z0-9._~+/=-]'
bearer_quantifier='{20,}'
bearer_pattern="${bearer_prefix}${bearer_chars}${bearer_quantifier}"

key_pattern='sk-[A-Za-z0-9]{20,}|(ghp|gho|xox[baprs])-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}'
conn_pattern='(postgres|mysql|mongodb|redis)://[^/[:space:]]*:[^@[:space:]]+@'
email_pattern='[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# 通用布尔扫描：逐文件 grep -Eq，命中仅输出"类别: 文件"，不输出原文
scan_bool() {
  local label="$1" pattern="$2" f
  for f in "${scan[@]}"; do
    if command grep -Eq -e "$pattern" -- "$f" 2>/dev/null; then
      echo "  [命中] ${label}: ${f}"
    fi
  done
}

echo "凭据扫描结果（仅类别 + 文件，不含原文）："
scan_bool "高熵 key/token"        "$key_pattern"
scan_bool "带凭据的连接串"        "$conn_pattern"
scan_bool "硬编码 Bearer <REDACTED> 长 token" "$bearer_pattern"

# email：排除示例域名。先布尔判断是否含 email，再静默反向判断是否存在"非示例域名"的 email。
# 第二阶段用 -q，原文仅在管道内传递，绝不落到输出。
for f in "${scan[@]}"; do
  command grep -Eq -e "$email_pattern" -- "$f" 2>/dev/null || continue
  if command grep -Eo -e "$email_pattern" -- "$f" 2>/dev/null \
       | command grep -Evq -e '@example\.(com|org)$' -e '@localhost'; then
    echo "  [命中] 真实 email: ${f}"
  fi
done

echo "扫描完成：以上任何 [命中] 一律立即停止并报告范总，不得提交。"
```

**扫描结果处理**：
- 任何类别出现 `[命中]` → **立即停止，报告范总**，不得提交；命中只给出"类别 + 文件路径"，需人工打开该文件定位处置。
- 占位符与环境变量引用因正则结构**不会命中**：`<REDACTED_TOKEN>` 含 `<`、`>`，`$VANCINE_API_KEY` 含 `$`，均不在 Bearer 字符类 `[A-Za-z0-9._~+/=-]` 中；`sk-...` 等短占位符不满足 `{20,}` 长度；示例域名 email 已被排除。
- 不再使用"匹配 REDACTED 占位内容"或 `grep -vF REDACTED` 这类管线，也不使用任何会打印匹配原文的 `grep -nE`。

> 高置信优先：宁可逐文件人工确认，也不得用整体目录排除来掩盖真实凭据；扫描输出严格限定为"类别 + 文件"，绝不回显凭据原文。

---

## 12. 阶段限制（不得逾越）

> 本节服从根 `AGENTS.md`「Codex 与执行 Agent 协作工作流」章节；角色定义见本文件开头「模板定位与从属关系」。
> 下表适用于**发布型任务**；若本任务为**非发布型工作流文档任务**（定义见根 `AGENTS.md` §8），
> 按 §15.3 的例外执行，其余禁止项与审批规则不变。

| 角色 / 阶段 | 允许操作 | 禁止操作 |
|------|---------|---------|
| 执行 Agent（Pi Agent 或 Claude Code）**实现阶段** | 读取、修改允许文件、运行格式化/lint/测试/构建、本地 Docker、本地测试 | commit、push、deploy、生产访问（以上均指取得对应发布审批之前）、修改禁止文件 |
| Codex 验收（全程） | 只读检查、只读命令审核 diff 与证据、输出整改指令 | 修改任何文件、写入项目、改 Git 状态、跑生成文件的构建、commit/push/deploy |
| 范总验收 | 本地验证、用户确认、逐项批准 | 由 Codex 代替范总批准 |
| 发布审批后（按 §15.2 四个独立阶段） | **本任务锁定的执行 Agent** 在范总对**该阶段**明确批准后执行：①发布元数据准备（VERSION + CHANGELOG.md，一个审批项一并修改）→ 重跑最终版本发布门禁 → ②commit → ③push → ④deploy；Codex 只输出指令与只读审核结果 | 未经该阶段批准自动进入下一阶段；上一阶段批准推定授权下一阶段；改完 VERSION/CHANGELOG 不重跑发布门禁就 commit；中途切换执行 Agent |

**执行 Agent（Pi Agent 或 Claude Code）在实现阶段、以及取得对应审批之前，严禁**（非发布型工作流文档任务按 §15.3 例外调整 commit 路径，其余禁止项不变）：
- ❌ `git commit`（仅范总单独批准后，由本任务锁定的执行 Agent 执行）
- ❌ `git push`（仅范总单独批准后，由本任务锁定的执行 Agent 执行）
- ❌ `deploy` / 访问生产服务器（仅范总单独批准后，由本任务锁定的执行 Agent 执行）
- ❌ 调用生产 API
- ❌ 修改 VERSION / CHANGELOG.md（仅作为「发布元数据准备」一个审批项获批后一并修改，见 §15.2）
- ❌ 发起任何可能付费的上游调用，除非范总明确批准（**持有 key 不代表获准产生费用**；未经批准只允许可确认免费的 mock/demo/官方免费额度；无法确认是否收费时一律不得调用）
- ❌ 修改禁止文件
- ❌ 触碰执行时记录的任何既有未提交内容
- ❌ 任何外部写操作（发帖、评论、回复、点赞、关注、私信）

> **批准与执行的对应关系**：发布阶段共**四个相互独立的审批项**——发布元数据准备（VERSION + CHANGELOG.md，
> 两者作为一个审批项）、commit、push、deploy。范总对某一阶段的明确批准
> **只授权本任务锁定的执行 Agent 执行该阶段本身**，不得自动推送下一阶段；付费调用、生产 API
> 调用与外部写操作**各自仍需范总明确批准**，不因 commit/push/deploy 获批而附带授权。
> 发布元数据准备完成后必须按 §15.2 对最终版本重跑发布门禁，**不得直接进入 commit**。
> 本小节只区分阶段，**不削弱**凭据、禁止文件与既有未提交内容的任何保护规则。

---

## 13. 需要回传的证据

任务执行完成后，必须向 Codex 回传以下证据（**实现阶段**）：

> 发布元数据准备（VERSION + CHANGELOG.md）获批并修改后，必须按 §15.2 对**最终版本**重新回传
> 完整发布门禁证据（含本地 Docker 与 Layer 3）；实现阶段的下列证据只能支撑实现审核，
> **不得当作最终发布证据**。

### 13.1 Git 状态

```bash
git status --short --branch
git diff --stat
```

### 13.2 新增/修改文件清单

```bash
# 新增文件
git status --short | grep '^??'

# 修改文件
git status --short | grep '^ M'
```

### 13.3 测试结果

- [ ] `docker compose build vancine` 成功
- [ ] `docker compose up -d` 成功
- [ ] `curl "$LOCAL_BASE_URL/api/status"` 返回 success（标准 3000，override 用解析端口）
- [ ] 模型调用测试通过（付费实测须先获范总批准）
- [ ] 前端 lint / build 通过（如涉及，含 Classic/Default parity）
- [ ] 后端 `go vet` 通过（如涉及）

### 13.4 Docker 证据

```bash
docker logs vancine --since 2m | grep -ciE 'error|panic|fatal'
```

### 13.5 风险证据

- 凭据扫描结果（无命中 / 命中列表及处理）
- 门禁验证结果（全通过 / 未通过项及原因）
- 已知风险和限制

---

## 14. Codex 验收清单

Codex 收到执行 Agent（Pi Agent 或 Claude Code）回传后，进行**只读**验收
（Codex 不得修改任何项目文件，只能输出验收结论与整改指令）。

> **验收分流（按任务类型）**：下方 P1–P4 / R1–R4 与产品类检查项适用于**发布型任务**。
> 对根 `AGENTS.md` §8 / 本文件 §15.3 定义的**非发布型工作流文档任务**，产品功能、真实调用、
> 计费、本地 Docker、Layer 3 等**不适用项一律记 `N/A`**（不得伪造 PASS / true），
> 改用「非发布型专用检查项」（见本节末尾）。未界定类型的任务一律按发布型处理。

- [ ] 开发前门禁 P1–P4 全通过（或明确记录 `PRE_GATE_BLOCKED` 原因）；P4 证据为官方 ToS/书面确认，非"有先例"
- [ ] 实现后门禁 R1（requested/responded model 一致）通过
- [ ] 实现后门禁 R2（真实调用成功；付费调用有范总批准记录，或为可确认免费的 mock/demo/官方免费额度）通过
- [ ] 实现后门禁 R3（批准售价 / 计费表达式倍率 / quota 扣减 / 日志 四者一致；不要求等于上游官方价；未公开上游采购成本）通过
- [ ] 实现后门禁 R4（本地 Docker 验证）通过
- [ ] 代码符合 AGENTS.md 规则
- [ ] 无禁止文件被修改
- [ ] 执行时记录的全部既有未提交内容均未被触碰
- [ ] 凭据扫描无真实凭据命中（占位符已豁免）
- [ ] 前端 Classic/Default parity、i18n、build 已确认或记录 N/A（如涉及）
- [ ] 计费表达式正确（如涉及）
- [ ] 文档示例正确
- [ ] new-api / QuantumNous 受保护标识未被修改或删除

**非发布型工作流文档任务的专用检查项**（取代不适用的产品 / 门禁项，那些项记 `N/A`）：

- [ ] 完整 diff 已逐行阅读，改动**只涉及**流程/模板/治理文档
- [ ] **范围核验**：未触碰代码、配置、依赖/锁文件、构建或部署脚本（否则本例外失效，改走 §15.2）
- [ ] **冲突搜索**：旧角色/阶段/审批表述已清零，两文件描述一致，无第二套工作流残留
- [ ] 凭据扫描无真实凭据命中（占位符已豁免）
- [ ] 工作区状态已核对：`git diff --check` 无输出、`git status --short` 与 `git diff --name-only` 仅含允许文件、无删除/重命名
- [ ] 未执行 VERSION / CHANGELOG.md 修改、未执行发布门禁、未执行 commit/push/deploy

**验收结果（按任务类型分流）**：

- **发布型任务**全部适用项通过（不适用项可记 `N/A` 并说明理由）→ 标记为 IMPL_ACCEPTED，
  进入 **§15.2** 四阶段发布准备（先由范总批准「发布元数据准备」）；最终的范总本地验收在
  **包含最终 VERSION / CHANGELOG 的完整发布门禁完成后**由范总完成或确认
- **非发布型工作流文档任务**专用检查项全部通过 → 标记为 IMPL_ACCEPTED，进入 **§15.3**，
  等待范总对 **commit 的单独批准**（不适用发布元数据准备、不适用发布门禁、**不得 deploy**）
- 未通过 → 标记为 NEEDS_REWORK，生成整改任务（由同一个执行 Agent 承担）

> 不得再将两类任务笼统写成「全部通过后进入 §15.2」；§15.2 仅为发布型任务的出口。

---

## 15. 发布准备、本地验收与逐项审批

> 本节服从根 `AGENTS.md` §6「标准任务流程」与 §7「审批边界」；**四个审批阶段相互独立**：
> ① 发布元数据准备（VERSION + CHANGELOG.md，**一个审批项**）② commit ③ push ④ deploy。
> 本节适用于**发布型任务**；仅修改流程/模板/治理文档且不碰代码、配置、构建、部署的任务，
> 按 §15.3 的例外执行。

### 15.1 本地验收检查项（实现阶段与最终版本均适用）

1. 在本地访问 `LOCAL_BASE_URL`（标准 `http://127.0.0.1:3000`；有 override 时用 `docker compose port vancine 3000` 解析结果）验证功能
2. 确认调用地址显示为 `https://vancine.com/v1`
3. 确认身份披露正确
4. 确认无真实凭据泄露
5. 确认性能可接受

### 15.2 发布流程（四个独立审批阶段，逐项批准）

```
Codex 实现审核通过（IMPL_ACCEPTED）
  → 阶段① 审批：范总批准「发布元数据准备」（VERSION + CHANGELOG.md 作为一个审批项一并批准）
  → 同一个执行 Agent 修改 VERSION 和 CHANGELOG.md（一并修改，不得只改其一）
  → 同一个执行 Agent 按 docs/release-process.md 对**最终版本**完成全部发布门禁
     （代码门禁 → 本地 Docker 健康检查 → Layer 3）
  → Layer 3 按 release-process.md 只选择一种：自动化浏览器 smoke 或范总人工页面验收（默认不两者都跑）
     选自动化 smoke：同一个执行 Agent 执行并回传证据；
     选人工验收：范总亲自完成并提供结果，同一个执行 Agent 记录、整理并回传证据
     （范总亲自做人工验收不构成执行 Agent 切换；Codex 只读审核，不执行任何一种 Layer 3）
  → 执行 Agent 回传完整门禁证据
  → Codex 只读审核最终版本与门禁证据（不跑构建/Docker/浏览器）
  → 范总完成或确认最终本地验收（针对含最终 VERSION / CHANGELOG 的构建）
  → 阶段② 审批：范总单独批准 commit → 同一个执行 Agent 执行 git commit（格式：<type>: <summary>）
  → Codex 只读审核 commit
  → 阶段③ 审批：范总单独批准 push → 同一个执行 Agent 执行 git push origin main
  → Codex 只读审核远端结果
  → 阶段④ 审批：范总单独批准 deploy → 同一个执行 Agent 执行服务器端构建发布
  → Codex 只读审核生产结果
```

> 硬性约束：
> - **禁止在修改 VERSION / CHANGELOG.md 后直接进入 commit**：必须先对包含最终发布元数据的工作区
>   状态重跑 `docs/release-process.md` 的全部发布门禁，并由 Codex 只读审核证据、范总确认最终本地验收。
> - **修改版本号之前的验收结果不得作为最终发布证据**；本地 Docker 与 Layer 3 必须针对最终版本。
> - VERSION 与 CHANGELOG.md 是**一个耦合的发布元数据准备步骤**，**作为一个审批项一并批准与修改**；
>   不存在「两者各自单独批准」。**不得**把发布元数据准备放在 commit / push / deploy 之后。
> - 发布元数据准备、commit、push、deploy 为**四个相互独立的审批阶段**，**不得合并**为一次授权；
>   上一阶段获批不自动授权下一阶段，也不得因实现验收通过而自动执行。
> - **Layer 3 执行主体（默认只选一种）**：选**自动化浏览器 smoke** 时由本任务锁定的执行 Agent 执行并回传证据；
>   选**人工页面验收**时由范总亲自完成并提供验收结果，执行 Agent 负责记录、整理并回传证据。
>   范总亲自执行人工 Layer 3 **不构成执行 Agent 切换**；Codex **只读审核**两条路线的证据，
>   **不执行任何一种 Layer 3**（既不跑 smoke，也不代替范总做人工验收）。
> - 全流程**不得切换执行 Agent**：**除**选择范总人工 Layer 3 时由范总亲自执行的**人工验收动作**之外，
>   所有项目操作、自动化验收与发布操作（含发布元数据准备、发布门禁、自动化 Layer 3、commit、push、deploy）
>   均由本任务锁定的同一个执行 Agent（Pi Agent 或 Claude Code）完成。
> - Codex 全程**永久只读**：只输出指令与只读审核结果，不修改文件、不改 Git 状态、
>   不运行构建/Docker/浏览器验收、**不执行任何一种 Layer 3**、不执行 commit/push/deploy。

### 15.3 非发布型工作流文档任务例外

> 本节完全引用根 `AGENTS.md` §8；与根 `AGENTS.md` 冲突时以根 `AGENTS.md` 为准。

**定义**：仅修改**协作流程、任务模板、项目治理规则**等文档内容，且**不涉及运行时代码、
依赖、配置、构建脚本、部署脚本或生产环境**的任务，定义为**非发布型工作流文档任务**。

| 项 | 发布型任务（§15.2） | 非发布型工作流文档任务（本节） |
|----|-------------------|---------------------------|
| 发布元数据准备 | 阶段①，需范总批准 | **不执行**；VERSION / CHANGELOG.md **不修改** |
| 本地 Docker / Layer 3 | 必须针对最终版本重跑 | **不要求**（本类任务不产生可发布产物） |
| deploy | 阶段④，需范总单独批准 | **不执行、不要求；本例外不提供任何 deploy 路径** |
| 验收方式 | 完整发布门禁 + Layer 3 | 只读校验：`git diff --check`、`git status --short`、范围与冲突搜索、凭据扫描 |
| commit | 阶段②（发布元数据与完整发布门禁之后） | Codex 只读验收通过 + **范总明确批准 commit** 后，由锁定的执行 Agent **直接 commit** |
| push | 阶段③，单独批准 | **commit 批准不自动授权 push**；push 仍需范总**单独批准**（审批上限为 commit + push） |

**使用限制与保留规则**：

- **不得泛化**：改动只要**同时涉及**任何产品代码、运行配置、依赖或锁文件、构建或部署内容
  （Dockerfile、docker-compose、CI、部署脚本等），**立即不得使用本例外**，改走 §15.2 完整四阶段。
- 任务类型由**范总**在任务开始时确认；未明确界定为非发布型时，一律按发布型任务处理。
- **不削弱任何约束**：Codex **永久只读**（不修改文件、不跑生成文件的命令）；执行 Agent
  **全程不得切换**；删除文件、生产操作、付费上游调用、外部写操作仍各需范总明确批准；
  §8 凭据规则、§7 禁止文件、§3.1 既有未提交内容保护全部照旧适用。
- **审批上限**：本类任务最多只能执行**获批的 commit** 与**另行获批的 push**；**不得在本例外下
  单独 deploy**，也不得以「文档改动也要上生产」为由临时放宽。确实需要生产部署时，
  **必须另建发布型任务**，改走 §15.2 完整四阶段与 `docs/release-process.md` 全部门禁，
  **不得沿用本例外**。

### 15.4 外部写操作审批

发布后的渠道投放（Reddit/HN/X/DEV/社区发帖、评论、回复、点赞、关注、私信等）**每一项均需范总单独批准**。发布前实时读取目标渠道规则；禁止 AI 生成/编辑内容的渠道不得由 Codex / 执行 Agent（Pi Agent、Claude Code）代写或代发（见 SOP §13.2）。

---

## 16. 整改任务的填写方式

当验收未通过时，Codex 生成下一轮整改任务，格式如下：

### 16.1 整改任务标识

| 字段 | 值 |
|------|------|
| 整改任务 ID | `[原任务 ID]-REWORK-[序号]` |
| 关联原任务 | `[原任务 ID]` |
| 整改原因 | `[Codex 验收不通过的具体原因]` |

### 16.2 整改要求

- 明确列出不通过项
- 给出修复方向（不直接给代码）
- 复用本模板其余部分

### 16.3 整改执行

- 由**本任务锁定的同一个执行 Agent**（范总指定的 Pi Agent 或 Claude Code）执行整改任务；
  不得中途切换到另一个执行 Agent，Codex 也不得代作整改
- 整改任务同样受本模板的禁止项约束
- 整改完成后重新走验收流程

---

## 17. 最终结构化报告模板

任务完成后输出以下报告（JSON 或 Markdown 表格均可），并**回传获客调度任务**：

```json
{
  "task_id": "",
  "dispatch_task_id": "",
  "model_id": "",
  "status": "COMPLETED|STOPPED|PRE_GATE_BLOCKED|POST_GATE_BLOCKED",
  "executed_at": "",
  "executed_by": "[本任务锁定的执行 Agent：Pi Agent 或 Claude Code]",
  "approved_by": "范总",
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
    "files_changed": [],
    "docker_verified": true,
    "lint_passed": true,
    "secret_scan_passed": true
  },
  "local_base_url": "http://127.0.0.1:3000",
  "thresholds": {
    "source": "default",
    "override_reason": "",
    "override_approved_by": null
  },
  "retention_7d": {
    "numerator": 0,
    "denominator": 0,
    "rate": null,
    "insufficient_sample": true
  },
  "funnel_setup": {
    "landing_page": "",
    "utm_parameters": {},
    "owned_asset": ""
  },
  "risks": [],
  "notes": ""
}
```

> **字段语义（解释在此，不写入字段值）**：
> - `release_commit_sha`（按任务类型分别解释，**不重命名字段**）：实现阶段以及 commit 获批前禁止 commit，故该字段在实现与验收阶段恒为真正的 JSON `null`；`baseline_sha` 始终为任务启动时记录的基线 SHA。
>   - **发布型任务**：仅当发布元数据准备（VERSION + CHANGELOG.md）已获批修改、最终版本发布门禁已重跑并通过、且范总单独批准 commit 并由同一执行 Agent 完成 commit 后，才填入真实 SHA 字符串。
>   - **非发布型工作流文档任务**：Codex 只读验收通过、范总批准 commit、锁定的执行 Agent 完成 commit 后，即可填入真实 SHA 字符串（无发布元数据准备与发布门禁前置条件）。
> - **非发布型任务的 N/A / null 语义**：不适用的字段**不得伪造 `PASS` 或 `true`**。`evidence.docker_verified`、
>   `lint_passed` 等不适用项取真正的 JSON `null`；`gate_results.pre_dev.*` 与 `gate_results.post_impl.*`（含
>   R2 真实调用、R3 计费正确性、R4 本地 Docker）不适用时取 `null`（通过/失败才用 `"PASS"` / `"FAIL"`）；
>   `benchmark` 不适用的数值保持空串/`null` 语义；`local_base_url` 不适用时取 `null`。
>   `secret_scan_passed` 仍按实际扫描结果填 `true` / `false`（凭据扫描对本类任务**仍然适用**）。
> - `paid_test_approved_by`：未获付费调用批准时为 JSON `null`；获批时填批准人及依据。
> - `override_approved_by`：未覆盖默认阈值时为 JSON `null`；覆盖获批时填批准人。
> - `thresholds.source`：取值 `"default"` 或 `"overridden"`（枚举字符串）。
> - `retention_7d`：样本过小时 `rate` 为 `null` 且 `insufficient_sample` 为 `true`，并报告分子/分母（见 SOP §10.4）。
> - `opportunity_score`：必须包含六个独立维度 `hotness` / `overseas_demand` / `api_commercial` / `vancine_differentiation` / `speed_cost` / `channel_fit`（各项整数 `0–5`）、`total`（必须等于六项之和，合法范围 `0–30`）与 `decision`（`Fast Lane` ≥24 / `Watch` 19–23 / `Hold` ≤18）。商业可用性门禁（P4）优先于总分；Fast Lane 评分不得覆盖失败或未通过的硬门禁（见 SOP §5）。唯一合法刻度为六项各 0–5、总分 30；任何历史更高单项上限或更高总分刻度均视为错误。
> - **规范**：`null` 一律使用真正的 JSON `null`，不得用 `"范总 | null"` 或说明文字充当字段值。

---

## 附录：填写示例

以下为填写示例（非真实数据）：

| 字段 | 示例值 |
|------|--------|
| 任务名称 | `LongCat-2.0 接入与上线` |
| 精确 model ID | `LongCat-2.0` |
| 调度任务 ID | `VANCINE-2026-001` |
| 单模型执行任务 ID | `CC-2026-07-20-001`（历史命名沿用 CC 前缀，与执行 Agent 选型无关） |
| 官方 API Docs | `https://api.longcat.chat/docs` |
| 定价页 | `https://api.longcat.chat/pricing` |
| 任务目标 | 接入 LongCat 到 Vancine，配置计费，添加文档 |

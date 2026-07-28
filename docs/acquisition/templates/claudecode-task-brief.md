# Claude Code 任务简报模板

> **版本**：v1.2.2
> **更新时间**：2026-07-28
> **负责人**：范总
> **关联 SOP**：[模型上线与海外获客 SOP](../model-launch-sop.md)

---

本模板用于为 Claude Code 生成可执行的单模型任务。每个模型对应一个独立任务实例。

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
| 创建时间 | `[YYYY-MM-DD HH:mm]` |
| 创建人 | 范总 |

---

## 2. AGENTS.md 要求

执行本任务前必须完整读取：

- [ ] 项目根目录 `AGENTS.md`（8 条项目规则）
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

**实现后发布门禁（Post-impl）** — Claude Code 执行后、发布前验证，任一 FAIL 不发布：

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
VERSION                    # 版本号（发版时由范总统一更新）
CHANGELOG.md               # 变更日志（发版时由范总统一更新）
Dockerfile                 # 默认受保护，除非范总批准并列入允许清单
docker-compose.yml         # 默认受保护，除非范总批准并列入允许清单
LICENSE                    # 许可证（AGPL-3.0，保留原始版权声明）
README.md                  # 主 README（除非任务明确要求）
[执行时记录的全部既有未提交内容]  # 严禁触碰（如 docs/devlog/2026-07.md）
```

> new-api、QuantumNous 的引用、品牌、元数据与归属信息严格受保护，不得修改或删除（`AGENTS.md` Rule 6）。

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

| 阶段 | 允许操作 | 禁止操作 |
|------|---------|---------|
| 执行中 | 读取、修改允许文件、本地测试 | commit、push、生产访问 |
| Codex 验收 | 只读验证 | 修改文件 |
| 范总验收 | 本地验证、用户确认 | push、deploy |
| 发布审批后 | commit、push（范总）、deploy（范总） | — |

**Claude Code 执行期间严禁**：
- ❌ `git commit`
- ❌ `git push`
- ❌ 访问生产服务器
- ❌ 调用生产 API
- ❌ 发起任何可能付费的上游调用，除非范总明确批准（**持有 key 不代表获准产生费用**；未经批准只允许可确认免费的 mock/demo/官方免费额度；无法确认是否收费时一律不得调用）
- ❌ 修改禁止文件
- ❌ 触碰执行时记录的任何既有未提交内容
- ❌ 任何外部写操作（发帖、评论、回复、点赞、关注、私信）

---

## 13. 需要回传的证据

任务执行完成后，必须向 Codex 回传以下证据：

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

Codex 收到 Claude Code 回传后，进行只读验收：

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

**验收结果**：
- 全部通过 → 标记为 LOCAL_ACCEPTANCE，交范总本地验收
- 未通过 → 标记为 NEEDS_REWORK，生成整改任务

---

## 15. 范总本地验收和后续审批

### 15.1 范总验收

1. 在本地访问 `LOCAL_BASE_URL`（标准 `http://127.0.0.1:3000`；有 override 时用 `docker compose port vancine 3000` 解析结果）验证功能
2. 确认调用地址显示为 `https://vancine.com/v1`
3. 确认身份披露正确
4. 确认无真实凭据泄露
5. 确认性能可接受

### 15.2 验收通过后的审批流程（逐项单独批准）

```
范总验收通过
  → commit 审批（单独）：范总执行 git commit（格式：<type>: <summary>）
  → push 审批（单独）：范总执行 git push origin main
  → deploy 审批（单独）：范总执行服务器端构建发布
  → 发版时更新 VERSION 和 CHANGELOG.md
```

> commit、push、deploy **分别**需要范总批准，不得合并为一次授权。

### 15.3 外部写操作审批

发布后的渠道投放（Reddit/HN/X/DEV/社区发帖、评论、回复、点赞、关注、私信等）**每一项均需范总单独批准**。发布前实时读取目标渠道规则；禁止 AI 生成/编辑内容的渠道不得由 Codex / Claude Code 代写或代发（见 SOP §13.2）。

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

- 范总调用 Claude Code 执行整改任务
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
  "executed_by": "Claude Code",
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
> - `release_commit_sha`：Claude Code 禁止 commit，故 Claude Code 阶段恒为真正的 JSON `null`；`baseline_sha` 为任务启动时记录的基线 SHA。仅当范总批准并完成 commit 后，发布报告才填入真实 SHA 字符串。
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
| 单模型执行任务 ID | `CC-2026-07-20-001` |
| 官方 API Docs | `https://api.longcat.chat/docs` |
| 定价页 | `https://api.longcat.chat/pricing` |
| 任务目标 | 接入 LongCat 到 Vancine，配置计费，添加文档 |

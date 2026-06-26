# CLAUDE.md — Project-level Instructions

## MCP: mimo-image-recognition

When the user requests any image understanding task — including but not limited to: reading, describing, comparing, OCR, text extraction, analyzing, classifying, or answering questions about an image — **always** use the `understand_image` tool provided by the `mimo_image_recognition_mcp` MCP server.

Do NOT use the `Read` tool, `cat`, or any file-reading command to open binary image files (.png, .jpg, .webp, etc.). Doing so will crash the session. Use `understand_image` exclusively.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | Yes | Task description (e.g. "提取图中文字", "描述这张图片") |
| `image_path` | No | Single local image path |
| `image_url` | No | Single image URL |
| `image_paths` | No | Array of local image paths (multi-image) |
| `image_urls` | No | Array of image URLs (multi-image) |
| `system_prompt` | No | Optional system prompt |
| `temperature` | No | Default 0.2 |
| `max_tokens` | No | Default 12000 |

### Examples

- Single local image: `image_path: "/Users/xin/test/screenshot.png"`
- Single URL: `image_url: "https://example.com/photo.jpg"`
- Multiple images: `image_paths: ["/Users/xin/a.png", "/Users/xin/b.png"]`

---

## Session Gate — 开发任务前必读

**每次开始涉及代码、配置、部署的任务前，必须确认以下所有条目。违反任何一条 = 任务未完成。**

| # | 检查项 | 详情 |
|---|--------|------|
| 1 | 读 `AGENTS.md` | 8 条项目规则（JSON、DB 兼容、npm、受保护标识等） |
| 2 | 读 `docs/devlog/YYYY-MM.md` | 当月开发日志，了解近期上下文 |
| 3 | 版本确认 | `cat VERSION` — 发版前必须确认当前版本号 |
| 4 | 本地 Docker 验证 | 发版前必须：`docker compose build vancine && docker compose up -d`，用户确认 `http://127.0.0.1:3001`（本地端口因冲突映射到 3001，生产是 3000） |
| 5 | 写 devlog | 任务完成后立即追加 `docs/devlog/YYYY-MM.md`，不写 = 未完成 |
| 6 | commit 格式 | `<type>: <summary>`，不允许 `git add -A` |
| 7 | CHANGELOG 更新 | 发版时同步更新 `CHANGELOG.md` |
| 8 | 预部署检查 | 推生产前运行 `./bin/pre-deploy-check.sh` |

快速验证命令：

```bash
./bin/pre-deploy-check.sh
```

---

## 项目概览

Vancine 是一个面向海外开发者、OpenAI 兼容的中国 AI 模型 API 网关。

- **当前版本**：`v1.0.6`（见 `VERSION` 和 `CHANGELOG.md`）
- **生产域名**：`https://vancine.com`（用户调用 `https://vancine.com/v1`）
- **生产服务器**：`27.124.22.102`（香港）
- **架构**：Go 1.22+ + Gin + GORM，前端 React（classic = 当前生产主题，default = 备用主题）
- **AI 协作规则**：根目录通用规则见 `AGENTS.md`，前端见 `frontend/AGENTS.md`、`web/default/AGENTS.md`

完整架构和规范见 `AGENTS.md`。

---

## 目录结构

仓库目录约定，整理结果如下：

```text
docs/
  deployment.md             # 部署规范，必读
  release-process.md        # 发布流程规范，必读
  devlog/                   # 开发日志（按月组织），必读、必写
    README.md
    2026-06.md
    ...
  reports/                  # 阶段性技术报告
    beta-test-plan.md
    launch-readiness-review.md
    launch-recheck-2026-06-10.md
    launch-remediation-plan.md
    model-comparison.md
    model-test-results.md
    vancine-api-test-report-2026-06-19.md

marketing/                  # 增长 / 推广资料，非应用代码
  promotion-plan.md
  promotion-plan-review.md
  todo-promotion.md
  utm-tracking.md
  overseas-video-growth-workflow.md
  overseas-video-day1-launch-pack.md
  video-tracker-template.csv
  assets/youtube/
  scripts/generate_vancine_day1_videos.py

.agents/skills/             # AI agent 技能定义
deploy/                     # 部署脚本和说明
docker-compose.yml          # 生产/本地 Docker Compose 主文件
CHANGELOG.md                # 版本变更记录
QUICKSTART.md               # 用户快速开始
```

不要把以下内容提交到仓库：

- 本地构建产物：`/vancine` Go 二进制
- 本地生成产物：`/output/`（视频、图片、frames）
- macOS：`.DS_Store`

相关规则在 `.gitignore`。

---

## 强制要求 — 每次会话必读

> 快速检查清单见上方 **Session Gate**。以下为详细规则。

### 1. 开发规范

所有代码、配置、部署相关任务必须严格遵守：

- `AGENTS.md`：项目级 8 条 Rule（JSON 包装、跨数据库兼容、npm 锁文件、本地 Docker 验证、StreamOptions、受保护标识、relay DTO 指针类型、计费表达式）
- `web/default/AGENTS.md`：前端开发规范（仅 default 主题）
- `frontend/AGENTS.md` + `frontend/CLAUDE.md`：frontend 子项目规则
- `pkg/billingexpr/expr.md`：改计费表达式系统前必读

### 2. 发布规范

参考 `docs/deployment.md` 和 `docs/release-process.md`。简化要求：

1. **本地先验证**：先 `docker compose build vancine && docker compose up -d`，让用户验证 `http://127.0.0.1:3001`（本地端口因本机 3000 冲突映射到 3001，生产仍是 3000）。
2. **不允许跳过本地验证直接推生产**。
3. **发布走服务器端构建**，不要再用旧的本地构建 + 二进制上传。
4. 发布步骤：
   ```bash
   git commit -m "fix: ..."
   git push origin main
   ssh root@27.124.22.102 'cd /opt/vancine-platform && \
     git fetch origin main && git reset --hard origin/main && \
     docker compose build vancine && docker compose up -d'
   ```
5. 每次发布后验证：
   - `curl https://vancine.com/api/status` → `success: true`，`version` 对应当前 `VERSION`
   - 检查 `docker logs vancine` 最近 2 分钟无 `error/panic/fatal`
6. 同步更新 `CHANGELOG.md`。

### 3. 提交规范

每次 commit 必须遵守：

- **commit 消息格式**：`<type>: <summary>`，type ∈ `feat` / `fix` / `chore` / `refactor` / `docs` / `build` / `test`
- **正文**：简述问题、根因、改动范围、影响
- **粒度**：一个 commit 只做一件逻辑上完整的事，不要把无关改动塞在一起
- **不允许**：
  - `git add -A` / `git add .` 把无关未跟踪文件一起提交
  - 把本地构建产物、调试文件、`.DS_Store` 提交进仓库
  - 直接 push 未本地验证的改动到 `main`
  - 改动 `AGENTS.md` Rule 6 涉及的受保护项目标识

### 4. 开发日志（强制）

**所有涉及开发的任务必须写入 `docs/devlog/YYYY-MM.md`**，包括但不限于：

- 新功能 / Bug 修复
- 调试过程与根因
- 架构 / 设计决策（包括拒绝的方案）
- 失败的尝试和原因
- 本地验证与生产发布记录
- 目录 / 文档整理
- 用户反馈和应对

写入要求：

- 文件位置：`docs/devlog/YYYY-MM.md`（按月，日期倒序）
- 格式：参考 `docs/devlog/README.md`
- 时机：**任务做完后立即追加**，不要攒到月底
- 关联：提到的提交、版本、报告需链接到 `git commit hash` / `CHANGELOG.md` / `docs/reports/`

**不写开发日志 = 任务未完成。** 哪怕只改一行代码、只移动一个文件，也要在 devlog 中留一条 entry。

---

## 待办事项

近期待办（持续维护，已完成的迁到 `CHANGELOG.md`）：

- 3D 模型浏览器内预览（model-viewer / three.js）
- 消息中视频 / 图片的富媒体渲染
- 需求验证（P0）：waitlist 页面 + 社区投放 + 问卷 + 访谈

历史已完成任务见 `CHANGELOG.md` 和 `docs/reports/` 下的阶段性报告。

---

## 媒体模型 endpoint 风险

接入或更新生图 / 生视频 / 3D / 音频模型时必须确认：

1. `/api/pricing` 的 `supported_endpoint_types` 正确：
   - 图片：`image-generation`
   - 视频：`openai-video`
   - 3D：`3d-generation`
2. `models.endpoints` 自定义配置可能覆盖默认端点。  
   后端 `model/pricing.go` 已对图片模型做兜底，但 Seedream / Seedance / 3D 仍可能被覆盖。
3. 公共 3D 路由实际走视频异步任务端点：`POST /v1/video/generations`。  
   `3d-generation` 默认 path 已改为 `/v1/video/generations`。

详细背景见 Claude 记忆 `vancine_multi_channel_routing.md`。

---

## Seedream 水印

Seedream 图片生成默认带水印（官方默认 `watermark=true`）。  
当前实现：

- 操练场默认传 `watermark: false`
- Volcengine relay 在未显式传 `watermark` 时默认补 `false`
- 显式传 `watermark: true` 不会被覆盖

修改 Volcengine 图片生成路径时不要回退这个默认行为。

---

## gstack

Use `/browse` from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/open-gstack-browser`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/sync-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/pair-agent`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`, `/spec`, `/health`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- 产品想法 / 头脑风暴 → `/office-hours`
- 战略 / scope → `/plan-ceo-review`
- 架构 → `/plan-eng-review`
- 设计系统 / plan review → `/design-consultation` 或 `/plan-design-review`
- 完整 review pipeline → `/autoplan`
- Bug / 错误 → `/investigate`
- QA / 测试站点行为 → `/qa` 或 `/qa-only`
- Code review / diff 检查 → `/review`
- 视觉打磨 → `/design-review`
- 发布 / 部署 / PR → `/ship` 或 `/land-and-deploy`
- 保存进度 → `/context-save`
- 恢复上下文 → `/context-restore`
- 写 backlog 规格 → `/spec`

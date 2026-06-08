# CLAUDE.md — Vancine Project Guide

> This file provides guidance for AI assistants working on the Vancine project.
> Last Updated: 2026-06-05

---

## 1. Project Overview

**Vancine** is a one-stop AI creative API platform that aggregates Chinese AI models (video, image, LLM, music) for international developers and creators.

**Tagline:** "One API, Infinite Creativity."

**Core Value:**
- 3-10x cheaper than international alternatives
- Single API endpoint for all AI generation
- English-first, global developer focus

---

## 2. Documentation Index

### 2.1 Core Documents

| Document | Path | Purpose |
|----------|------|---------|
| **PRD** | `PRD_Vancine_v1.0.md` | Product requirements and specifications |
| **Market Research** | `国产AI_API出海_市场调研与可行性判断_202605.md` | Market analysis and feasibility |
| **Video API Analysis** | `图片视频生成API出海_可行性分析_202605.md` | Video/image API opportunity analysis |
| **TODO List** | `TODO.md` | Master task list |

### 2.2 Technical Documentation

| Document | Path | Purpose |
|----------|------|---------|
| **Tech Specs** | `docs/TECH-SPEC.md` | Architecture, database, security, deployment |
| **API Documentation** | `docs/API-DOCS.md` | API endpoints, parameters, examples |
| **Design System** | `docs/DESIGN-SYSTEM.md` | Colors, typography, components, animations |
| **Deployment Guide** | `docs/DEPLOYMENT.md` | Step-by-step deployment instructions |

### 2.3 Development Logs

| Folder | Purpose |
|--------|---------|
| `dev-logs/` | Daily development logs |
| `dev-logs/YYYY-MM-DD.md` | Individual day logs |

---

## 3. Project Structure

```
mimo_work/
├── CLAUDE.md                    # This file
├── PRD_Vancine_v1.0.md         # Product requirements
├── TODO.md                      # Task list
├── 国产AI_API出海_*.md          # Market research
├── 图片视频生成API出海_*.md     # Video API analysis
├── dev-logs/                    # Daily development logs
│   ├── README.md
│   └── YYYY-MM-DD.md
└── docs/                        # Documentation
    ├── TECH-SPEC.md
    ├── API-DOCS.md
    ├── DESIGN-SYSTEM.md
    └── DEPLOYMENT.md
```

---

## 4. Key Decisions

### 4.1 Technical Foundation

**Base Project:** New-API (Go)
- GitHub: https://github.com/Calcium-Ion/new-api
- License: AGPL-3.0
- Why: Battle-tested, supports video/image interfaces, Stripe integration

**Frontend:** Next.js 14 + Tailwind + shadcn/ui + Framer Motion
- Deployment: Vercel
- Why: Fast, SEO-friendly, modern developer experience

**Backend:** New-API (Go)
- Deployment: Railway or Fly.io
- Why: Simple deployment, good performance

**Database:** PostgreSQL + Redis
- Why: Reliable, scalable, good ecosystem

### 4.2 Business Model

**Pricing:** Pay-as-you-go (NOT subscription)
- Users add credits to balance
- Pay per API call
- $5 minimum top-up
- Credits never expire

**Revenue Model:**
- Video/Image: 1.5-2x markup on upstream cost
- LLM: 1.4x markup (price-sensitive market)
- Music: 1.5x markup

### 4.3 Open Source Strategy

**License:** AGPL-3.0
- Must open-source all modifications
- Strategy: Use as marketing, attract community
- Keep private: API keys, user data, business logic

---

## 5. Development Workflow

### 5.1 Daily Development Log

**When to create/update:**
- At start of each development session
- At end of each session
- When completing significant tasks

**File format:** `dev-logs/YYYY-MM-DD.md`

**Template:**
```markdown
# Development Log — YYYY-MM-DD

## Session Summary
- Duration: X hours
- Focus: [main task]

## Completed Tasks
- [x] Task 1
- [x] Task 2

## In Progress
- [ ] Task 3

## Blockers
- None / [description]

## Tomorrow's Plan
- [ ] Task 4
```

### 5.2 Task Management

**Where to track tasks:** `TODO.md`

**When to update:**
- When starting a task (mark as in-progress)
- When completing a task (move to Completed section)
- When discovering new tasks (add to appropriate phase)

### 5.3 Code Quality

**Before committing:**
- [ ] Code follows project style guide
- [ ] No hardcoded secrets
- [ ] No console.log in production code
- [ ] Tests pass (if applicable)
- [ ] Documentation updated (if needed)

---

## 6. Design Guidelines

### 6.1 UI Style

**Inspiration:** Figma, Linear, Vercel
**Feel:** Playful, colorful, modern, clean

### 6.2 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | #6C5CE7 | Main actions, links |
| Secondary | #00B894 | Success, highlights |
| Accent Pink | #FD79A8 | Notifications |
| Accent Yellow | #FDCB6E | Warnings |
| Background | #FAFAFA | Page background |
| Surface | #FFFFFF | Cards |

### 6.3 Typography

- Font: Inter (sans-serif)
- Code: JetBrains Mono (monospace)
- Headings: Bold (700)
- Body: Regular (400)

### 6.4 Components

- Cards: Rounded corners (16px), subtle shadows
- Buttons: Rounded (12px), gradient background
- Inputs: Rounded (8px), focus ring on focus

### 6.5 Animations

- Hover: Lift effect (translateY(-4px))
- Page load: Fade in + slide up
- Transitions: 0.2s ease

---

## 7. API Guidelines

### 7.1 API Format

- Base URL: `https://api.vancine.ai/v1`
- Authentication: Bearer token in Authorization header
- Format: OpenAI-compatible (JSON)

### 7.2 Endpoints

| Type | Endpoint | Method |
|------|----------|--------|
| Video | /v1/video/generate | POST |
| Video Status | /v1/video/status/{id} | GET |
| Image | /v1/images/generate | POST |
| Chat | /v1/chat/completions | POST |
| Music | /v1/music/generate | POST |
| Credits | /v1/credits | GET |
| Usage | /v1/usage | GET |

### 7.3 Error Format

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type",
    "code": 400
  }
}
```

---

## 8. Upstream Providers

### 8.1 Provider List

| Provider | Base URL | Models |
|----------|----------|--------|
| SiliconFlow | https://api.siliconflow.cn/v1 | Wan, FLUX, Qwen |
| Novita AI | https://api.novita.ai/v3/openai | Wan, Kling, Vidu |
| DeepSeek | https://api.deepseek.com | DeepSeek V4 |

### 8.2 Model Pricing

| Model | Upstream Cost | Our Price | Markup |
|-------|---------------|-----------|--------|
| wan-2.2-t2v | $0.29/video | $0.45/video | 1.55x |
| flux-2.0-pro | $0.03/image | $0.05/image | 1.67x |
| deepseek-v4-flash | $0.14/M | $0.20/M | 1.43x |

---

## 9. Deployment Notes

### 9.1 Environment Variables

**Never commit:**
- API keys
- Database passwords
- JWT secrets
- Stripe keys

**Use:**
- `.env` files (local)
- Environment variables (production)

### 9.2 Deployment Order

1. Deploy backend (New-API) first
2. Configure upstream providers
3. Test API endpoints
4. Deploy frontend (Next.js)
5. Configure DNS
6. Test full flow

### 9.3 Monitoring

- Set up uptime monitoring
- Configure error alerts
- Track API latency
- Monitor credit balance

---

## 10. Common Commands

```bash
# Start development server (frontend)
npm run dev

# Build for production
npm run build

# Start backend (Docker)
docker compose up -d

# View backend logs
docker compose logs -f new-api

# Stop all services
docker compose down

# Database backup
docker compose exec db pg_dump -U user new-api > backup.sql
```

---

## 11. Notes for AI Assistants

### 11.1 Before Making Changes

1. Read the relevant documentation
2. Check TODO.md for current priorities
3. Review recent dev-logs for context
4. Understand the feature's purpose

### 11.2 While Working

- Follow the design system (docs/DESIGN-SYSTEM.md)
- Use the tech stack defined in docs/TECH-SPEC.md
- Write clean, documented code
- Test changes before committing

### 11.3 After Completing

- Update TODO.md (mark task complete)
- Update dev-logs/YYYY-MM-DD.md
- Update documentation if needed
- Commit with clear message

### 11.4 Key Constraints

- **License:** AGPL-3.0 (must open-source modifications)
- **Pricing:** Pay-as-you-go (not subscription)
- **UI:** Playful, colorful, Figma-inspired
- **Language:** English-only (first version)
- **Deployment:** Cloud (Vercel + Railway)

---

## 12. Resources

| Resource | URL |
|----------|-----|
| New-API GitHub | https://github.com/Calcium-Ion/new-api |
| SiliconFlow | https://siliconflow.com |
| Novita AI | https://novita.ai |
| DeepSeek API | https://api-docs.deepseek.com |
| Stripe Docs | https://stripe.com/docs |
| Next.js Docs | https://nextjs.org/docs |
| Tailwind Docs | https://tailwindcss.com/docs |
| Framer Motion | https://www.framer.com/motion/ |

---

## 13. Contact

**Project Owner:** [Your Name]
**Repository:** [GitHub URL]
**Website:** [vancine.ai]

---

*This file is the single source of truth for the Vancine project. Keep it updated as the project evolves.*

---

## 14. Production Deployment

### Server Info

| Item | Value |
|------|-------|
| IP | `64.83.35.21` |
| SSH | `root@64.83.35.21`（密钥认证） |
| Deploy path | `/opt/vancine-platform/` |
| Docker image | `vancine-custom:latest` |
| Domain | `api.vancine.ai` / `vancine.ai` |

### ⚠️ 关键：部署流程（本地构建 + 上传）

**服务器内存小，绝对不能在服务器上 `docker build`，会 OOM 崩溃！**

```bash
# 1. 本地构建（开发机上执行）
cd D:\ClaudeProject\vancine-platform
docker build -t vancine-custom:latest .

# 2. 导出镜像
docker save vancine-custom:latest | gzip > vancine-custom.tar.gz

# 3. 上传到服务器
scp vancine-custom.tar.gz root@64.83.35.21:/opt/vancine-platform/

# 4. 服务器加载并重启
ssh root@64.83.35.21 "cd /opt/vancine-platform && docker load < vancine-custom.tar.gz && docker compose up -d"

# 5. 验证
ssh root@64.83.35.21 "curl -s http://localhost:3000/api/status"
```

### 已知问题

- GitHub Actions `deploy.yml` 的 self-hosted runner **从未成功安装**（35 次全部 queued）
- 服务器 git 仓库需手动 `git pull` 同步（Dockerfile 构建上下文用）
- `docker-compose.yml` 中镜像名为 `vancine-custom:latest`，非 Docker Hub 官方镜像
- **⚠️ `git pull` 会覆盖服务器的 docker-compose.yml**（生产密码被覆盖为默认值），pull 前必须 `git stash`，pull 后 `git stash pop`
- **⚠️ 前端变更部署时必须更新 `middleware/cache.go` 中的 `Cache-Version`**，否则浏览器缓存旧 HTML 引用旧 JS 文件

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

---

## Pending Tasks（待办事项）

> Last Updated: 2026-06-08

### 已完成

| # | 任务 | 说明 |
|---|------|------|
| 1 | ~~**BUG: 操练场分组不可选择**~~ | ✅ group 下拉框无法选择/切换分组 |
| 3 | ~~**BUG: 操练场 Doubao 文本模型调用失败**~~ | ✅ 火山方舟文本模型请求报错，已修复路由 |
| 6 | ~~**图片粘贴上传**~~ | ✅ 后端上传接口 + 前端粘贴上传 + 缩略图预览 + 图生图/图生视频 |
| 7 | ~~**模型标签分类 + 英文描述**~~ | ✅ 全部模型已配置 tags 和英文 description |
| 8 | ~~**3D 供应商信息和图标**~~ | ✅ 新增供应商 数美科技(id=21) 和 影眸科技(id=22) |
| 9 | ~~**模型广场按类型筛选**~~ | ✅ 支持按文本/图片/视频/音频/3D 等类别筛选 |
| 11 | ~~**页签标题显示 "new-api"**~~ | ✅ 已改为 Vancine |
| 12 | ~~**多语言列表裁剪**~~ | ✅ 仅支持简体中文和英语 |
| 13 | ~~**首页 API 地址显示错误**~~ | ✅ 已修正为 `https://api.vancine.com/v1` |
| 14 | ~~**语言切换按钮显示 i18n key**~~ | ✅ 已修复翻译 |
| 15 | ~~**首页中英文切换适配**~~ | ✅ classic 主题首页已做 i18n 适配 |
| — | ~~**隐藏聊天功能**~~ | ✅ 通过 SidebarModulesAdmin 配置关闭 chat 模块，保留操练场 |
| 19 | ~~**使用日志查看请求详情**~~ | ✅ 后端捕获 request/response body 存入 other 字段，前端 LogDetailModal 展示 |

### 待完成

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 2 | **BUG: 音频模型路由错误** | Bug | isAudioModel 被归入视频/3D 分支，需接入音频端点后修复 |
| 4 | **3D 模型浏览器内预览** | Feature | 集成 model-viewer / three.js |
| 5 | **消息中视频/图片的富媒体渲染** | Feature | 在对话消息中直接渲染生成结果 |
| 10 | **需求验证（P0）** | P0 | waitlist 页面 + 社区投放 + 问卷 + 访谈 |
| 16 | **完善平台接入文档** | 文档 | 编写 API 接入指南 |
| 17 | **创建 About 页面** | 页面 | 公司/产品介绍、团队信息 |
| 18 | **网站 UI 整体优化** | 优化 | 提升视觉体验和交互细节 |
| 20 | **BUG: 日期组件未跟随语言切换** | Bug | 切换英文后日期选择器仍显示中文 |
| 21 | **去 new-api 化** | 品牌 | 将项目中所有 "new-api" 引用替换为 Vancine 品牌（数据库名、容器名、代码品牌字符串等），必须遵守 AGPL-3.0 协议，保留原始版权声明和许可证 |

### 当前主题说明

- **当前使用 classic 主题**（`theme.frontend = classic`）
- PayPal 支付在 classic 主题中配置，default 主题不支持 PayPal
- 后续开发基于 classic 主题

---

## 15. Karpathy Coding Guidelines

> Source: [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)

Behavioral guidelines to reduce common LLM coding mistakes.

### 15.1 Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 15.2 Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 15.3 Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 15.4 Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

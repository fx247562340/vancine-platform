# CLAUDE.md — Vancine Project Guide

> This file provides guidance for AI assistants working on the Vancine project.
> Last Updated: 2026-05-29

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

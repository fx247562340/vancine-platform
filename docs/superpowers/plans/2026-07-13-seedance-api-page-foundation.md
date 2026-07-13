# Seedance API Page Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual, conversion-focused `/seedance-api` page in Classic and Default without publishing Starter Kit assets or deploying production.

**Architecture:** Follow each theme's existing `/ai-media-api` pattern. Put destinations, analytics values, metadata, and code examples in dependency-free landing modules tested by Node's native runner. This round ends with an uncommitted source diff for Codex review.

**Tech Stack:** Classic React 18/Vite/Semi Design; Default React 19/Rsbuild/TanStack Router/Tailwind; i18next; Umami helper; Node native tests; npm.

## Global Constraints

- Read `AGENTS.md` and `docs/superpowers/specs/2026-07-13-zero-budget-seedance-acquisition-design.md` first.
- Production uses Classic; Classic and Default must have equivalent content, routes, CTAs, analytics, metadata, code examples, and language behavior.
- Preserve all protected `new-api` and `QuantumNous` references and copyright headers exactly.
- Do not change the existing fork relationship, backend, database, dependencies, or lockfiles.
- Use npm only; keep Classic `react-icons` pinned to `5.3.0`.
- The owner already verified the `$1` activation path. Do not repeat registration or consume more credit.
- Do not fabricate demo output or state an unverified price, latency, partnership, availability guarantee, restriction bypass, testimonial, benchmark, or customer count.
- Do not add GitHub, Postman, or n8n links in this round; those resources are not live.
- Do not delete files, bulk-format locales, edit unrelated files, run Docker, commit, push, publish, or deploy.
- Record the initial `git status --short` and preserve every pre-existing change.

---

## File Map

Classic creates `web/classic/src/pages/SeedanceApi/{landing.js,landing.test.js,index.jsx,SeedanceHeader.jsx,HeroSection.jsx,WorkflowSection.jsx,CodeExamplesSection.jsx,ConversionSections.jsx}`. Modify `web/classic/src/App.jsx` only for one lazy import and the public route. Add page keys only to `web/classic/src/i18n/locales/{en,zh-CN,zh-TW,fr,ja,ru,vi}.json`.

Default creates `web/default/src/features/seedance-api/lib/{landing.ts,landing.test.ts}`, `web/default/src/features/seedance-api/index.tsx`, `web/default/src/features/seedance-api/components/{index.ts,seedance-header.tsx,hero-section.tsx,workflow-section.tsx,code-examples-section.tsx,conversion-sections.tsx}`, and `web/default/src/routes/seedance-api/index.tsx`. Let the configured router generator update `web/default/src/routeTree.gen.ts`. Add page keys only to `web/default/src/i18n/locales/{en,zh,fr,ja,ru,vi}.json`.

## Exact Contract

Both landing modules expose equivalent constants and helpers:

```text
SEEDANCE_CTA_EVENT = get_started_clicked
SEEDANCE_CTA_LOCATIONS = seedance_hero, seedance_pricing, seedance_final_cta
SEEDANCE_RESOURCE_EVENT = developer_resource_clicked
SEEDANCE_RESOURCE_VALUES = docs
SEEDANCE_CANONICAL = https://vancine.com/seedance-api
VANCINE_SEEDANCE_DOCS_URL = https://vancine.com/docs#video
```

CTA destinations are `/register?source=seedance-api` and `/console/playground` in Classic, `/sign-up` and `/playground` in Default.

English metadata is:

```text
title: Seedance API for Video Generation | Vancine
description: Integrate supported Seedance text-to-video and image-to-video workflows with one API key. Start with $1 in free credit and no card required.
ogTitle: Build with Seedance Through One API
ogDescription: Submit an async video task, poll its status, and retrieve the result through Vancine's documented API.
```

Chinese metadata is:

```text
title: Seedance 视频生成 API | Vancine
description: 使用一个 API 密钥接入受支持的 Seedance 文生视频和图生视频工作流。注册即得 1 美元免费额度，无需信用卡。
ogTitle: 通过一个 API 接入 Seedance
ogDescription: 通过 Vancine 文档化的 API 提交异步视频任务、轮询状态并获取结果。
```

Code tabs are exactly `curl`, `python`, `node`. All examples submit to `POST https://vancine.com/v1/video/generations`, poll `GET https://vancine.com/v1/video/generations/{task_id}`, use model `Doubao-Seedance-1.5-pro` and size `1280x720`, and never contain a real key. Python uses `os.environ["VANCINE_API_KEY"]`; Node uses `process.env.VANCINE_API_KEY`; shell uses `$VANCINE_API_KEY`. Python and Node check the submit response, poll every five seconds, stop after 120 attempts, treat `SUCCESS` and `FAILURE` as terminal, read `data.result_url` then `data.data.content.video_url`, surface errors and timeout, and never log the key.

## Exact Page Copy

- Eyebrow: `Seedance API for developers`.
- H1: `Generate Seedance Videos with One API`.
- Hero: `Submit supported text-to-video and image-to-video tasks, poll their status, and retrieve results with one Vancine API key.`
- Offer: `$1 free credit. No credit card required.`
- CTAs: `Start Free with $1 Credit` and `View the Async Workflow`.
- Workflow heading: `From Prompt to Video in One Async Workflow`.
- Steps: `Submit a generation task`, `Save the task ID`, `Poll the status`, `Retrieve the result`; explain the documented request, `task_id`, terminal status, and result URL without new claims.
- Model qualification: `Current documented examples include Doubao-Seedance-1.5-pro, Doubao-Seedance-2.0-fast, and Doubao-Seedance-2.0. Live documentation and pricing remain authoritative.`
- Code heading: `Copy a Complete Seedance Request`.
- Code body: `Choose cURL, Python, or Node.js. Each example submits the task, handles errors, polls with a fixed limit, and prints the result URL.`
- Use-case heading: `Built for Real Video Products`; show AI video applications, creative automation, content production workflows, and developer tools and agents without adoption claims.
- Trust heading: `What Vancine Simplifies`; show one API key, one balance, documented async endpoints, and centralized usage logs.
- Qualification: `Model capabilities, input requirements, availability, and safety behavior still follow their documented requirements.`
- Pricing heading: `Start Testing Before You Add Funds`.
- Pricing body: `Create an account with $1 in free credit, use the Playground or API, and review live pricing before adding funds.`
- FAQ questions: `How does the Seedance API workflow work?`, `Which Seedance models are available?`, `Can I use text and image inputs?`, `Do I need a credit card to start?`, `Where can I see current pricing and limits?`, `Is this an unrestricted or safety-bypass API?`.
- The last FAQ answer must explicitly say Vancine does not bypass model safety requirements.
- Final heading: `Make Your First Seedance Request`.
- Final body: `Start with $1 in free credit and use the documented async workflow when you are ready.`

English strings are i18next keys. `zh-CN`, `zh-TW`, and Default `zh` get natural Simplified Chinese. `fr`, `ja`, `ru`, and `vi` explicitly receive the English values for this release. FAQ questions and answers use separate keys and both switch language.

---

### Task 1: Contract Tests First

**Files:** Create both `landing.test` files.

- [ ] Record `git status --short` and `git diff --name-only`.
- [ ] Write equivalent Classic and Default tests for CTA routes, exact event/location/resource values, English/Chinese/fallback metadata, canonical URL, Vancine docs URL, three-tab order, both endpoints, model/size, absence of embedded keys, bounded polling, terminal states, distinct FAQ answers, Chinese values, and locale parity.
- [ ] Run `node --test src/pages/SeedanceApi/landing.test.js` from Classic and `node --test src/features/seedance-api/lib/landing.test.ts` from Default.
- [ ] Confirm failures are caused by missing implementation, not invalid test syntax.

### Task 2: Pure Contracts and Locales

**Files:** Create both landing modules; modify only the listed locale JSON files.

- [ ] Implement `getSeedanceCtaDestination(isAuthenticated)`, `getSeedanceMetadata(language)`, `getSeedanceDocsUrl()`, constants from Exact Contract, and immutable `SEEDANCE_CODE_EXAMPLES`.
- [ ] Add only the approved page keys. Do not bulk-run i18n rewrite tools.
- [ ] Run both landing tests and obtain zero failures.

### Task 3: Classic Page

**Files:** Create the listed Classic components; modify `web/classic/src/App.jsx` only for import/route.

- [ ] Follow the existing `/ai-media-api` visual system but never reuse its `ai_media_*` values.
- [ ] Compose hero, workflow, accessible code tabs, use cases, trust/qualification, pricing, FAQ, and final CTA.
- [ ] Set and restore title, description, Open Graph fields, URL, and canonical on mount/language change.
- [ ] Fire `get_started_clicked` only with an allowed location; fire `developer_resource_clicked` with `{ resource: 'docs' }` on docs navigation.
- [ ] Support ArrowLeft, ArrowRight, Home, and End in code tabs; announce copy success/failure. FAQ buttons expose `aria-expanded` and `aria-controls`.
- [ ] Add the public route next to `/ai-media-api` without touching any other route.
- [ ] Run `node --test src/pages/SeedanceApi/landing.test.js` and `npm run build` from Classic; both must exit `0`.

### Task 4: Default Page

**Files:** Create the listed Default feature/components/route; generated route tree changes only as required.

- [ ] Implement content, destinations, examples, analytics, keyboard behavior, language behavior, and metadata equivalent to Classic using Default components and Tailwind conventions.
- [ ] Create the TanStack file route for `/seedance-api/` and allow normal route generation.
- [ ] Run the new Default test, `npm run typecheck`, and `npm run build`; all must exit `0`.

### Task 5: Cross-Theme Checks and Stop

**Files:** Change only files already authorized above if a check finds a defect.

- [ ] Run existing plus new landing tests in each theme:

```bash
cd web/classic
node --test src/pages/AiMediaApi/landing.test.js src/pages/SeedanceApi/landing.test.js
cd ../default
node --test src/features/ai-media-api/lib/landing.test.ts src/features/seedance-api/lib/landing.test.ts
```

- [ ] Check only directly changed files without auto-fixing unrelated files:

```bash
cd web/classic
npx prettier --check src/pages/SeedanceApi src/App.jsx src/i18n/locales/*.json
cd ../default
npx prettier --check src/features/seedance-api src/routes/seedance-api src/i18n/locales/*.json
npx eslint src/features/seedance-api src/routes/seedance-api
```

- [ ] From repository root run `git diff --check`, `git status --short`, `git diff --name-only`, and `git diff --stat`.
- [ ] Stop. Do not run Docker, commit, push, publish, or deploy.

## Required ClaudeCode Report

Return:

1. Baseline pre-existing changed files.
2. Complete new/modified file list for this task.
3. Exact commands, exit codes, test counts, build results, typecheck, lint, and format results.
4. English/Chinese page-section summary.
5. Classic/Default parity table for route, guest/auth CTA, event locations, docs event, canonical, and endpoints.
6. Confirmation that no real key, fake demo, external Starter Kit link, unverified claim, dependency, lockfile change, protected-reference edit, Docker action, commit, push, or deployment occurred.
7. Unresolved issues separated into new-code and pre-existing categories.
8. Final `git status --short` output.

## Acceptance Criteria

- Both source routes exist and both production builds pass.
- The whole page, FAQ answers, and metadata switch between English and Chinese; other locales intentionally show English.
- Both themes agree on routes, CTAs, analytics, docs, canonical, model, endpoints, and code behavior.
- Code examples have bounded polling and no embedded secret.
- No external Starter Kit link or unverified media is exposed.
- Existing `/ai-media-api`, `/docs`, acquisition events, and unrelated channel work remain unchanged except locale additions and the two new routes.
- ClaudeCode leaves an uncommitted diff for Codex review.

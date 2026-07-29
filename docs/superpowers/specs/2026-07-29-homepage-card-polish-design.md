# Vancine Homepage Card Polish Design (Available now + Stack)

**Date:** 2026-07-29
**Status:** Design only - awaiting code implementation
**Task ID:** `VANCINE-HOMEPAGE-CARD-POLISH-DESIGN-2026-07-29`
**Dispatch Task ID:** `019f7edc-086d-7182-8a75-eb0270e153a0`
**Owner:** 范总
**Executor:** Claude Code
**Baseline SHA:** `b4b7b363199f7c954b2dffd4208ab59bbb756eb2`
**Scope of this phase:** Design document only. No business code, tests, config, locale files, VERSION, CHANGELOG, production metadata, commit, push, deploy, or PR.

**Form:** Incremental override. Anything not covered below continues to follow the existing parent design `docs/superpowers/specs/2026-07-29-homepage-acquisition-design.md`. This document does not repeat that 1223-line parent; it only changes the two card groups it names.

---

## 1. Background and problem evidence

范总 identified two visual defects on the production (Classic) homepage plus a polish gap:

1. **Available now / 现已上线** renders an unconditional desktop 4-column grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-4` in `web/classic/src/components/home/AvailableNowSection.jsx` line 212; same in `web/default/src/features/home/components/sections/available-now.tsx` line 154). When the public `Featured` set has 3 models, the 4th column is empty and the card group looks off-center.
2. **Works with your stack / 适配你的技术栈** ships 5 cards into a 3-column desktop grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` in `web/classic/src/components/home/StackSection.jsx` line 62; same in `web/default/src/features/home/components/sections/stack.tsx` line 61). Row 2 holds 2 cards and leaves 1 empty slot.
3. Both card groups are visually flat (`--vc-glass-bg` + thin border only); they need restrained layering and interaction without becoming heavy.
4. 范总 selected **Option A: restrained Spotlight Card**. The heavier Magic Bento style was rejected (see §13).

Read-only evidence confirmed during design:
- `selectFeatured` in `homepage-pricing.js` / `.ts` already splits tags on comma, trims, lowercases, matches the exact token `featured`, sorts case-insensitively by `model_name`, and caps at 4. This algorithm is **frozen**, not changed.
- `skeletonCountForWidth` already returns 1 (<768px) / 2 (<1280px) / 4 (>=1280px). Skeleton counts stay on this scale.
- Dark-theme tokens already exist in `web/classic/src/index.css`: `--vc-page-bg: #090909`, `--vc-accent: #a78bfa`, `--vc-glass-bg`, `--vc-glass-border`, `--vc-card-bg`, `--vc-card-bg-hover`, `--vc-border`, `--vc-text-strong/muted/subtle`.
- Classic locale root JSON files (8): `en, fr, ja, ru, vi, zh, zh-CN, zh-TW`. Default locale JSON files (6): `en, fr, ja, ru, vi, zh`. The `OpenCode` stack key already exists in every one of them, confirming the English-source-string key pattern the new Pi card must follow.

---

## 2. Decision: Option A - restrained Spotlight Card

| ID | Decision | Choice | Why |
|----|----------|--------|-----|
| C1 | Visual direction | Restrained Spotlight Card (Option A) | 范总 selected; matches existing dark glass language |
| C2 | Rejected alternative | Magic Bento | Too heavy for the acquisition page; not chosen |
| C3 | New motion deps | None | No gsap / framer-motion / motion / React Bits npm install |
| C4 | Featured source | Unchanged: public `GET /api/pricing` + exact `featured` tag | Parent design §5 frozen |
| C5 | Featured count | Still capped at 4; no fabricated 4th model | Honesty rule |
| C6 | Stack count | 6 cards (add Pi Coding Agent) | Fills the 3×2 desktop grid exactly |
| C7 | Pi qualification | Configuration-ready only | No Vancine live-agent verification claimed |

React Bits Spotlight Card (`https://reactbits.dev/components/spotlight-card`) is an **interaction reference only**, not a dependency. Implementers build a small local card primitive in each theme; they do not copy the component library wholesale.

---

## 3. Available now - dynamic centered grid

### 3.1 Data source and selection (unchanged)

- Read only public `GET /api/pricing`; reuse the single shared pricing state the parent design §6 mandates.
- `selectFeatured` algorithm, sort, and 4-card cap are frozen. No hardcoded allowlist. No invented 4th model.
- Card fields, endpoint chip rule (first 2 + `+N`), vendor resolution, card click destination (plain `/pricing`), and analytics (`featured_model_clicked` `{ location: 'available_now', model: model_name }`) are unchanged from parent §4.2.

### 3.2 Desktop layout by actual Featured count

Replace the unconditional `xl:grid-cols-4` with a count-driven centered grid. The grid container is centered as a block; column count tracks the real `featured.length` (1–4). Content max-width shrinks for fewer cards so the group reads as centered, not stretched.

| Featured count | Desktop (>=1280px) columns | Content max-width | Behavior |
|----------------|---------------------------|-------------------|----------|
| 1 | 1 | ~360–380px | Single card centered |
| 2 | 2 | ~740–780px | Two cards centered |
| 3 | 3 | ~940–980px | Three cards centered (fixes today's empty 4th column) |
| 4 | 4 | ~1200px (existing) | Four cards, unchanged |

Rules:
- The 1/2/3-card rows must **not** keep occupying 4 equal columns. Implementation chooses any of: a `grid-template-columns: repeat(N, minmax(0,1fr))` with a count-keyed max-width on the inner wrapper; or `inline-grid` + `justify-content: center`. The mechanism is theme-specific; the centered, count-matched result is the binding contract.
- Cards stay equal-height within a row (`h-full` on the card and `grid` + `items-stretch` on the wrapper, as today).
- Text clamp, endpoint chips, and vendor rules are unchanged.

### 3.3 Tablet and mobile

| Breakpoint | Columns |
|------------|---------|
| Tablet (768–1279px) | At most 2, centered. 1 card -> 1 column centered; 2/3/4 cards -> 2 columns centered. |
| Mobile (<768px) | 1 column. |

### 3.4 Loading / empty / error (unchanged semantics)

- Loading skeleton grid stays desktop 4 / tablet 2 / mobile 1 via `skeletonCountForWidth`. The skeleton wrapper uses a fixed 4-column desktop reserve to prevent CLS; it does **not** adopt the count-driven centering (count is unknown during load). This is intentional: stable reserved height beats centered skeletons.
- Empty / error fallback link `Explore all available models ->` -> plain `/pricing` is unchanged.
- Model-count caption (`{{count}} models available`) semantics unchanged: shown only when `status === 'ready'` and `count >= 1`.

---

## 4. Works with your stack - six cards

### 4.1 Card set (v2)

| # | Title | Qualification label |
|---|-------|---------------------|
| 1 | OpenCode | Live-verified |
| 2 | Cline | Configuration-ready |
| 3 | Roo Code | Configuration-ready |
| 4 | Claude Code | Configuration-ready |
| 5 | OpenAI SDK | Configuration-ready |
| 6 | Pi Coding Agent | Configuration-ready |

OpenCode keeps its existing Live-verified qualification and existing body copy. Cline, Roo Code, Claude Code, and OpenAI SDK keep their existing bodies; only the explicit qualification chip is standardized. The sixth card is new.

### 4.2 Sixth card: Pi Coding Agent

**Title (English source of truth, not translated):**

```text
Pi Coding Agent
```

**English public description:**

```text
Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.
```

**Qualification label:** `Configuration-ready`

### 4.3 Pi official basis and strict boundary

- Official basis: Pi supports a custom OpenAI-compatible provider configuration (Pi docs `https://pi.dev/docs/latest/models`; Pi project `https://github.com/earendil-works/pi`). This justifies a **configuration-ready** label only.
- **Strict boundary:** The homepage must **not** claim Pi has completed a Vancine live coding-agent verification. There is no approved evidence asset for Pi. The label is `Configuration-ready`, never `Live-verified`.
- No external Pi logo or unverified brand asset is added. The card uses the same generic card chrome as the other stack cards.
- This matches the parent design's honesty rule and the SOP's independent-aggregator positioning. It does **not** add any "not affiliated with…" disclaimer (forbidden by parent §2.2 and §4.8).

### 4.4 Stack grid

| Breakpoint | Layout |
|------------|--------|
| Desktop (>=1024px / `lg`) | 3 × 2 (six cards fill exactly, no empty slot) |
| Tablet (640–1023px / `sm`–`md`) | 2 × 3 |
| Mobile (<640px) | 1 × 6 |

- All six cards equal-height within each row.
- The existing `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5` already yields this; it is retained. No count-driven centering is needed for the stack group because six divides evenly into 3 and 2.
- Stack cards do **not** navigate externally and do **not** fire new analytics events (see §9).

---

## 5. Spotlight Card visual states

Both card groups share one local visual language. Tokens below use Classic `--vc-*` variables; Default maps the same intent to its Tailwind tokens (`bg-muted/10`, `border-border/40`, `text-muted-foreground`, accent via the existing accent token). Default must not clone Classic inline styles; it uses `cn()` + Tailwind per `web/default/AGENTS.md` §3.10.

### 5.1 Default state

- Semi-transparent dark card face: Classic `var(--vc-glass-bg)`; Default `bg-muted/10`.
- Thin border: Classic `var(--vc-glass-border)`; Default `border-border/40`.
- Light inner highlight: a subtle top-edge `inset 0 1px 0 rgba(255,255,255,0.06)` (Classic) / equivalent Tailwind shadow (Default). Restrained, not a glow.
- Clear but quiet layer separation from the page background.

### 5.2 Hover (fine-pointer desktop only)

- A soft purple radial spotlight follows the pointer near the card, using the accent color (`--vc-accent` / `#a78bfa`) at low alpha. Implemented as a `radial-gradient` positioned via two CSS custom properties (`--spot-x`, `--spot-y`) updated from a `pointermove` listener on the card element.
- Border lifts slightly (Classic: `--vc-glass-border` -> a brighter `rgba(255,255,255,0.20)`; Default: `hover:border-border`).
- Card translates up at most ~4px. Classic already has `hover:-translate-y-1` (4px); keep that magnitude. Default adds an equivalent `hover:-translate-y-1` via Tailwind.
- **No** visible scale. **No** 3D tilt. **No** particles, magnet, lightning, or large sweep.

### 5.3 Keyboard focus

- A visible focus ring / accent border independent of pointer position: `:focus-visible` outline using `--vc-accent` (Classic) / `focus-visible:ring` accent (Default), 2px, offset 2px.
- Focus is **not** conveyed by color alone; the ring is a shape change.
- Cards are links (`<a>`/`<Link>`), so they receive native tab focus; only Available-now cards are focusable (they navigate). Stack cards are static containers and are **not** made focusable (no role/link added) unless a future task adds navigation.

### 5.4 Coarse pointer / touch

- On `@media (pointer: coarse)` the spotlight `pointermove` listener is **not** registered. Cards keep the high-quality static default face. No hover-only state is reachable on touch.
- Detection: register the listener only when `window.matchMedia('(pointer: fine)').matches` is true at mount.

### 5.5 prefers-reduced-motion

- Under `@media (prefers-reduced-motion: reduce)`: disable the 4px translate and all transition timing (set `transition: none` / `motion-reduce: transition-none`). The spotlight radial may be omitted or rendered static.
- Content, border, focus state, and all text remain fully visible. Reduced motion never hides information.

---

## 6. Performance and accessibility

**Performance (binding):**
- The `pointermove` handler must **not** call `setState`/React re-render. It writes only to CSS custom properties on the card DOM node via a ref (`el.style.setProperty('--spot-x', …)`).
- If throttling is needed, use `requestAnimationFrame` and cancel the pending frame on cleanup. No `setInterval`.
- The listener is attached per-card on mount and removed on unmount. No global/window-level permanent listener is added by this feature; no listener leak across navigations.
- No new npm dependency (no gsap, framer-motion, motion, or React Bits install). Reuse existing `ScrollReveal`/`AnimateInView` for entrance only.

**Accessibility (binding):**
- Spotlight is decorative; it does not encode information. Status (Live-verified vs Configuration-ready) is conveyed by visible text label, not color alone.
- `:focus-visible` ring required on all focusable cards.
- `prefers-reduced-motion` honored (§5.5).
- Card titles remain real headings/text; no AT-only change.
- Existing `aria-hidden` skeleton behavior is preserved.

---

## 7. Classic / Default parity

| Aspect | Classic (production) | Default (parity) |
|--------|----------------------|------------------|
| Available-now centering | Count-driven centered grid, `--vc-*` inline + Tailwind classes | Same count-driven contract, Tailwind `cn()` tokens |
| Stack 6th card | Pi Coding Agent added to `STACK_ITEMS` | Pi Coding Agent added to `STACK_ITEMS` |
| Spotlight primitive | Local `--vc-*` + CSS custom properties + ref | Local Tailwind + CSS custom properties + ref |
| Motion deps | None added | None added |
| Qualification labels | Same six labels | Same six labels |
| Analytics | Unchanged events | Unchanged events |

Both themes ship the same six stack cards, the same Available-now count-driven centering contract, and the same Spotlight state matrix. Visual technique differs per each theme's existing system (Classic inline `--vc-*`; Default Tailwind), as the parent design §8.3 allows.

---

## 8. i18n impact

### 8.1 Keys and translation policy

Four English-source keys are added to every maintained locale file. The parent §9 permission "value must be the English source string when no human translation exists" is **revoked for the keys introduced by this design**: every non-English locale must carry an actual target-language translation, never an English fallback value.

1. `Pi Coding Agent` - title. Product name; **not translated** in any locale (value equals the key in every file, like the existing `OpenCode` key).
2. `Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.` - Pi body. Translated per §8.2.
3. `Configuration-ready` - qualification chip label (Cline, Roo Code, Claude Code, OpenAI SDK, Pi). Translated per §8.3.
4. `Live-verified` - qualification chip label (OpenCode). Translated per §8.3.

Proper nouns kept verbatim inside translated strings: `Pi`, `OpenAI` (and the `OpenAI-compatible` compound, e.g. `OpenAI 兼容`), `Vancine`, `API`. The word `provider` uses the same term each locale already uses for "Connected providers" (verified: fr `fournisseur`, ja `プロバイダー`, ru `поставщик`, vi `nhà cung cấp`, zh `供应商`, zh-TW `供應商`).

| Theme | Locale files to update |
|-------|------------------------|
| Classic | `en, fr, ja, ru, vi, zh, zh-CN, zh-TW` (8 root JSON under `web/classic/src/i18n/locales/`) |
| Default | `en, fr, ja, ru, vi, zh` (6 JSON under `web/default/src/i18n/locales/`) |

Classic and Default carry **identical** values for the same language. The existing stack-body translations already match across the two themes; the values below were derived from those existing translations so terminology stays consistent.

### 8.2 Frozen Pi body translations

The Pi body values below are frozen and binding for the implementation. They keep the proper nouns `Pi`, `OpenAI`, `Vancine` verbatim inside the translated strings.

| Locale | Pi body value |
|--------|---------------|
| en | Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage. |
| fr | Compatible via la prise en charge par Pi des fournisseurs personnalisés compatibles OpenAI. La page d'accueil ne prétend pas qu'un test réel de l'agent de codage via Vancine a été effectué. |
| ja | Pi のカスタム OpenAI 互換プロバイダー設定に対応。ホームページでは、Vancine を通じたコーディングエージェントの実環境検証が完了したとは主張していません。 |
| ru | Поддерживается настройка через пользовательского OpenAI-совместимого провайдера в Pi. На главной странице не заявляется о завершённой проверке агента программирования через Vancine в реальных условиях. |
| vi | Sẵn sàng cấu hình thông qua hỗ trợ nhà cung cấp tùy chỉnh tương thích OpenAI của Pi. Trang chủ không tuyên bố đã hoàn tất xác minh thực tế agent lập trình của Vancine. |
| zh / zh-CN | 通过 Pi 自定义的 OpenAI 兼容供应商支持，配置已就绪。首页并未声称已完成 Vancine 编程智能体的真实运行验证。 |
| zh-TW | 透過 Pi 自訂的 OpenAI 相容供應商支援，設定已就緒。首頁並未聲稱已完成 Vancine 程式設計智慧體的真實執行驗證。 |

### 8.3 Frozen qualification chip translations

| Locale | `Configuration-ready` | `Live-verified` |
|--------|-----------------------|------------------|
| en | Configuration-ready | Live-verified |
| fr | Compatible via configuration | Vérifié en conditions réelles |
| ja | 設定対応 | 実環境検証済み |
| ru | Поддерживается настройка | Проверено на практике |
| vi | Sẵn sàng cấu hình | Đã xác minh thực tế |
| zh / zh-CN | 配置已就绪 | 实测验证 |
| zh-TW | 設定已就緒 | 實測驗證 |

### 8.4 Rules and acceptance

- `Pi Coding Agent` value equals the key in every locale (not translated).
- No English fallback is permitted for the Pi body, `Configuration-ready`, or `Live-verified` in any non-English locale; the frozen values in §8.2/§8.3 are binding for the implementation.
- Implementation acceptance: aside from the proper nouns `Pi Coding Agent`, `Pi`, `OpenAI`, `Vancine`, `API`, no standalone English qualification chip and no whole-sentence English body text introduced by this design may remain on a non-English homepage.
- Never leave a missing key or a blank value.
- Do **not** modify the protected footer key `footer.newapi.projectAttributionSuffix`.
- Do **not** modify About page copy.
- Do **not** add any "not affiliated with…" disclaimer.
- Do **not** touch Hero, CTA, Kimi K3 evidence, Marketplace, or any other homepage section.

---

## 9. Analytics

Unchanged from parent §13. No new events, no new locations, no new payloads:

- Available-now card click -> `featured_model_clicked` `{ location: 'available_now', model: model_name }`.
- Available-now fallback -> `explore_models_clicked` `{ location: 'available_now_fallback' }`.
- Stack cards: **no** new external navigation and **no** new analytics event. They remain informational. No `explore_models_clicked` or `featured_model_clicked` is fired from stack cards.

---

## 10. Allowed and forbidden modification scope

**Allowed in the implementation phase (not this design phase):**
- `web/classic/src/components/home/AvailableNowSection.jsx`
- `web/classic/src/components/home/StackSection.jsx`
- `web/classic/src/components/home/SpotlightCard.jsx` (new local primitive, no external dependency)
- `web/default/src/features/home/components/sections/available-now.tsx`
- `web/default/src/features/home/components/sections/stack.tsx`
- `web/default/src/features/home/components/spotlight-card.tsx` (new local primitive, no external dependency)
- `web/classic/src/components/home/homepage-pricing.js` and `web/default/src/features/home/lib/homepage-pricing.ts` (add only the count-driven `featuredGridColumns` helper)
- The Classic (8) and Default (6) locale JSON files listed in §8
- New co-located tests: `web/classic/src/components/home/StackSection.test.js`, `web/classic/src/components/home/SpotlightCard.test.js`, `web/default/src/features/home/components/sections/stack.test.ts`, `web/default/src/features/home/components/spotlight-card.test.ts`; the existing tests (`AvailableNowSection.test.js`, `homepage-pricing.test.js`, `homepage-wiring.test.js`, `homepage-i18n.test.js`, and the Default equivalents) are extended, not replaced

**Forbidden (this phase and implementation phase):**
- Parent design file, AGENTS.md (root, `frontend/`, `web/default/`), VERSION, CHANGELOG, README.md, LICENSE, Dockerfile, docker-compose.yml, go.mod, go.sum, both `package-lock.json` files
- `docs/devlog/2026-07.md` and any other existing file
- Production Featured metadata; no 4th fabricated Featured model
- Hero, CTA, Kimi K3 evidence, Marketplace, About, footer protected key
- New third-party motion dependency (gsap / framer-motion / motion / React Bits npm install)
- Any file deletion, move, or rename
- Any commit, push, deploy, PR, tag, branch, or worktree

**Protected identifiers:** new-api and QuantumNous references, copyright headers (including the QuantumNous AGPL headers already present on Default theme files), brand, metadata, and attributions remain at zero changes (`AGENTS.md` Rule 6).

---

## 11. Implementation-phase test and browser acceptance matrix

### 11.1 Unit tests (required)

1. `homepage-pricing` count-driven grid helper (existing `homepage-pricing.test.js` / `homepage-pricing.test.ts`): for `featured.length` 1/2/3/4, `featuredGridColumns` returns 1/2/3/4 and the matching max-width bucket; never returns 4 for 1–3.
2. `StackSection.test.js` / `stack.test.ts` (new): renders exactly six cards including `Pi Coding Agent`; qualification labels match §4.1; no card claims Pi is `Live-verified`; Pi body contains the configuration-ready boundary sentence.
3. `SpotlightCard.test.js` / `spotlight-card.test.ts` (new): `pointermove` writes CSS custom properties and never calls setState; listener not registered when `(pointer: coarse)`; `rAF` frame is canceled on cleanup; `:focus-visible` ring is present.
4. `homepage-i18n.test.js` / `i18n.test.ts` (existing, extended): every Classic (8) and Default (6) locale file contains the four new keys with non-blank values; for every non-English locale, the Pi body, `Configuration-ready`, and `Live-verified` values are **not** equal to the English source string (no English fallback).

### 11.2 Test / lint / build (no `test` script exists in either package.json)

Neither theme defines a `test` npm script (verified: Classic has `dev/build/lint/eslint/preview/i18n:*`; Default has `dev/build/build:check/typecheck/lint/preview/format/copyright/i18n:sync/knip`). Run tests with Node's built-in runner against explicit file paths. The first four files in each list already exist in the repo; the last two in each list are the new files mandated in §10. Every test path is final; no implementation-phase file slot is left unspecified.

```bash
# Classic
cd web/classic
npm install --legacy-peer-deps --no-audit --no-fund
node --test \
  src/components/home/AvailableNowSection.test.js \
  src/components/home/homepage-pricing.test.js \
  src/components/home/homepage-wiring.test.js \
  src/components/home/homepage-i18n.test.js \
  src/components/home/StackSection.test.js \
  src/components/home/SpotlightCard.test.js
npm run lint
npm run build

# Default
cd web/default
npm install --no-audit --no-fund
node --test \
  src/features/home/components/sections/available-now.test.ts \
  src/features/home/lib/homepage-pricing.test.ts \
  src/features/home/wiring.test.ts \
  src/features/home/i18n.test.ts \
  src/features/home/components/sections/stack.test.ts \
  src/features/home/components/spotlight-card.test.ts
npm run typecheck
npm run lint
npm run build
```

No new test framework or package script is added; `package.json` and `package-lock.json` are not modified.

### 11.3 Local Docker acceptance (implementation phase)

```bash
docker compose build vancine
docker compose up -d
PORT="$(docker compose port vancine 3000 | head -n1 | awk -F: '{print $NF}')"
LOCAL_BASE_URL="http://127.0.0.1:${PORT}"   # standard 3000; override-resolved otherwise
curl -sS "$LOCAL_BASE_URL/api/status"
curl -sS "$LOCAL_BASE_URL/api/pricing" | head -c 200
docker logs vancine --since 2m
```

### 11.4 Browser acceptance matrix

| Dimension | Values to cover |
|-----------|-----------------|
| Featured count | 1, 2, 3, 4 cards (via local/dev metadata or mocked `/api/pricing`) |
| Pricing states | loading, empty (0 featured), error |
| Widths | 1536px, 1280px, 768px, 390px |
| Theme mode | dark, light |
| Interaction | mouse hover (spotlight follows pointer, 4px lift), keyboard focus (visible accent ring) |
| Motion | `prefers-reduced-motion: reduce` (no translate, content visible) |
| Pointer | coarse pointer / touch (no spotlight listener, static card) |
| Theme skin | Classic, Default |

Pass criteria: Available-now group is visually centered for 1/2/3/4 cards with no empty trailing column; stack shows six equal-height cards filling 3×2 on desktop; spotlight appears only on fine-pointer hover; focus ring visible; reduced-motion and coarse-pointer paths degrade gracefully; no console errors; both themes behave with parity.

### 11.5 No model inference / no paid API

Implementation and acceptance must **not** call any model inference or paid API. Local/dev metadata or mocked `/api/pricing` fixtures cover all Featured-count cases. This is explicit: **N/A** for any real model call.

---

## 12. Non-goals

- No change to production Featured metadata; no fabricated 4th Featured model.
- No Hero redo; no CTA, Kimi K3 evidence, Marketplace, About, or footer changes.
- No model price, ratio, description, or tag edits.
- No new third-party motion dependency.
- No commit, push, deploy, PR, tag, branch, or worktree.
- No file deletion, move, or rename.
- No production admin access; no model inference or paid API call.

---

## 13. Conflict scan (forbidden decisions verified absent)

This design explicitly does **not** adopt any of the following; an implementation diff that introduces any of them is out of scope and must be rejected:

- Magic Bento as the selected visual direction (rejected; Option A Spotlight chosen - §2).
- gsap, framer-motion, motion, or React Bits added as a new npm dependency (forbidden - §6, §10).
- A fabricated 4th Featured model (forbidden - §3.1, §12).
- Pi marked `Live-verified` (forbidden; Pi is `Configuration-ready` only - §4.3, §11.1).
- About page edits or any "not affiliated with…" affiliation disclaimer (forbidden - §8, §10).
- Protected new-api / QuantumNous identifier edits (forbidden - §10).

---

## 14. Design-phase execution record

| Field | Value |
|-------|-------|
| Baseline branch | `main` |
| Baseline HEAD | `b4b7b363199f7c954b2dffd4208ab59bbb756eb2` |
| origin/main | `b4b7b363199f7c954b2dffd4208ab59bbb756eb2` |
| Initial working tree | clean |
| Files added in this phase | `docs/superpowers/specs/2026-07-29-homepage-card-polish-design.md` only |
| Files modified in this phase | none |
| Commit / push / deploy | not performed |
| Production access | not performed |
| Paid API / model inference calls | not performed |
| External write operations (posts, comments, likes, DMs) | not performed |

---

## 15. References

- Parent design: `docs/superpowers/specs/2026-07-29-homepage-acquisition-design.md` (§4.2 Available now, §4.3 Stack, §5 Featured data contract, §6 fetch flow, §8 parity, §9 i18n, §13 analytics)
- `AGENTS.md` Rule 4 (local Docker), Rule 6 (protected identifiers)
- `docs/acquisition/model-launch-sop.md` v1.2.1 (§1 positioning, §13.3 credentials)
- `docs/acquisition/templates/claudecode-task-brief.md` v1.2.2 (§10 local test commands, §11 secret scan)
- `web/default/AGENTS.md` §3.4 performance, §3.10 styling, §3.12 a11y, §3.14 testing
- Classic tokens: `web/classic/src/index.css` (`--vc-page-bg: #090909`, `--vc-accent: #a78bfa`)
- Spotlight interaction reference: `https://reactbits.dev/components/spotlight-card` (reference only, not a dependency)
- Pi official basis: `https://pi.dev/docs/latest/models`, `https://github.com/earendil-works/pi`

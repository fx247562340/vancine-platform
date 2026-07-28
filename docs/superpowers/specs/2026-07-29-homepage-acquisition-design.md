# Vancine Homepage Acquisition Optimization Design

**Date:** 2026-07-29
**Status:** Design complete — REWORK-1 applied; awaiting Codex read-only acceptance
**Task ID:** `VANCINE-HOMEPAGE-ACQUISITION-DESIGN-2026-07-29`
**Rework Task ID:** `VANCINE-HOMEPAGE-ACQUISITION-DESIGN-2026-07-29-REWORK-1`
**Dispatch Task ID:** `019f7edc-086d-7182-8a75-eb0270e153a0`
**Owner:** 范总
**Baseline SHA:** `f359dd3259378e0f1fe3e7b1d8d75b99b838e1a3`
**Scope of this phase:** Design document only. No business code, tests, config, VERSION, CHANGELOG, production metadata, commit, push, deploy, or PR.

---

## 1. Background and current problems

### 1.1 Product context

Vancine is an OpenAI-compatible API gateway that gives overseas developers access to China’s frontier AI models through one endpoint (`https://vancine.com/v1`). Production currently serves the **Classic** theme. Default theme remains a maintained parity target, not the live production skin.

The homepage is the highest-intent owned surface for organic, direct, and campaign traffic that is not already on a model-specific landing page (`/kimi-k3-api`, `/seedance-api`, `/ai-media-api`). It must convert anonymous developers into registered users who create an API key and complete a first successful call.

### 1.2 Current-state evidence (read-only)

| Area | Current behavior | Problem |
|------|------------------|---------|
| Classic Hero primary CTA | `Link to='/console'` + `get_started_clicked` | Unauthenticated `/console` access hits protected APIs; axios 401 handler sends users to `/login?expired=true`. New visitors see a session-expiry dead end instead of registration. |
| Classic Final CTA | Same `/console` path | Same broken first-touch conversion path. |
| Default Hero primary CTA | Guest → `/sign-up`; authenticated → `/dashboard` | Conversion path is healthier, but production is Classic, so Default alone does not fix live acquisition. |
| Model count | Classic `Home/index.jsx` initializes `modelCount` to `20`, then does `Object.keys(res.data.data)` | Public `GET /api/pricing` returns `data` as a **JSON array** of `Pricing` objects (`controller/pricing.go`). `Object.keys` on an array yields index strings; length can coincidentally match, but the default `20` and any parse failure produce a fake “20+” stat. Desktop/mobile share state only if both render the same tree; the default still risks showing a fabricated number before load. |
| Featured / live models | Features and Pricing sections hardcode model families and comparison rows (e.g. Kimi K2.6, GLM-5.1, MiniMax M2.5, Qwen 3.7 Max, fixed saving %) | Marketing content drifts from live catalog; no `Featured` tag consumption; risk of stale or incorrect claims. |
| Hero copy | “One API, Infinite Creativity” + generic multimedia cost message | Brand-stable but weak on OpenAI-compatible China-frontier positioning; no durable developer job-to-be-done. |
| Custom home content gate | Built-in sections render only when `homePageContentLoaded && homePageContent === ''` | Until `/api/home_page_content` resolves, visitors can see a blank main area (or only chrome). Slow network amplifies first-paint emptiness. |
| Mobile nav (Classic) | Horizontal `overflow-x-auto` nav; Register button is `hidden md:block` in `UserArea` | At ~390px, nav items clip/scroll awkwardly and the primary acquisition control (Register) is hidden on small screens. |
| Pricing claims | Hero stat “10x Cheaper”; PricingHighlight fixed % savings | Not continuously verifiable against live public pricing; conflicts with acquisition honesty rules. |
| About / identity | About page already exists; SOP requires independent-aggregator positioning | Homepage must not add “not affiliated with…” negative disclaimer copy, and must not rewrite About. |
| Attribution | First-touch system shipped (`acquisition_touches`, `vancine_ft`, client helpers in Classic + Default) | Homepage must reuse it; must not invent a second attribution store or write raw UTM into new client storage. |
| Providers marquee | Classic `ProvidersSection.jsx` hardcodes a static vendor icon array and an “11+” label | Static vendor marketing drifts from the live public catalog and invents a count. |

### 1.3 Conversion goal (single primary)

```text
Anonymous visitor lands on /
  → clicks primary CTA
  → /register
  → signup_started / signup_completed (existing first-touch + Umami)
  → create API key
  → first successful API call
```

Secondary goals (explore models, read docs, open evidence) must not outrank registration.

---

## 2. Goals and non-goals

### 2.1 Goals

1. Reposition the homepage as an overseas-developer acquisition page while **preserving** the existing Vancine visual language (colors, glass cards, typography scale, hero video/poster system).
2. Make the **only first conversion target** “new visitor → `/register` → API key → first call.”
3. Keep Hero copy **evergreen**: no hardcoded model names in the Hero.
4. Add a dynamic **Available now** strip fed exclusively by public `GET /api/pricing` and the exact `Featured` tag.
5. Replace stale hardcoded marketplace/comparison marketing with a live public catalog model list.
6. Surface one verified agent-workflow evidence block based on the existing Kimi K3 OpenCode run (historical single-run facts only).
7. Fix guest CTA routing so unauthenticated users never hit `/console` → `/login?expired=true` as the primary path.
8. Fix mobile navigation so registration remains reachable at 390px.
9. Unblock first paint from slow `/api/home_page_content`.
10. Reuse first-touch attribution and existing analytics helpers with explicit homepage event locations.
11. Define Classic production implementation plus Default conversion-semantics parity.
12. Define test, local Docker, staged release, and rollback plans for the future implementation phase.

### 2.2 Non-goals (explicit exclusions)

- No modification of the About page.
- No “Vancine is not affiliated with the model providers…” (or near-equivalent) negative disclaimer on the homepage or footer.
- No model onboarding, channel routing, billing expression, or upstream adapter changes.
- No real or paid model/API calls in design or implementation verification unless 范总 separately approves.
- No production Featured-tag writes as part of this design or its default implementation authority.
- No production admin/console access from this task.
- No new homepage admin dashboard.
- No algorithm that invents “latest models” from names, timestamps, or version-like strings.
- No second attribution system; no new client storage of raw UTM strings.
- No channel publishing (Reddit/X/HN/etc.).
- No commit, push, deploy, or PR in this design phase.
- No VERSION / CHANGELOG updates in this phase.
- **No file deletion in the default homepage implementation task.** Old section components may leave the homepage composition, but their source files stay in the repo unless 范总 later approves deletion of each exact path in a separate request. This rule binds design and implementation, not only this design phase.
- No changes to protected **new-api** / **QuantumNous** identifiers, copyright headers, license text, or related metadata (`AGENTS.md` Rule 6).
- No pricing deep-link query parameters invented for Featured or marketplace cards.
- No sessionStorage, localStorage, or module-level TTL cache for `/api/pricing` homepage data.
- No independent static Providers marquee or hardcoded “11+” vendor count.

---

## 3. Information architecture

Homepage section order (top → bottom), built-in path only:

| # | Section ID | Role |
|---|------------|------|
| 1 | `hero` | Evergreen brand claim, OpenAI-compatible promise, primary `/register` CTA, secondary `/pricing` CTA, weak docs text link, API base URL, honest live model count |
| 2 | `available-now` | Up to 4 models with exact `Featured` tag from public pricing; safe empty/error fallback |
| 3 | `works-with-your-stack` | Agent/SDK compatibility with verified vs config-only qualifications |
| 4 | `verified-agent-workflows` | Single historical OpenCode evidence card (Kimi K3 run) + starter/evidence links |
| 5 | `why-developers` | Four durable value props (no ephemeral model list) |
| 6 | `live-model-marketplace` | Dynamic top-6 public model list + Connected providers row from the same pricing response → `/pricing` |
| 7 | `final-cta` | Register again with qualified free-credit line |
| 8 | `footer` | Existing footer structure + approved positive positioning line only; no About rewrite; no negative disclaimer |

There is **no** independent Providers marquee section.

Custom home content (`/api/home_page_content` non-empty HTML or external URL) remains an **operator override**. When override content is active, built-in acquisition sections do not render. Design requires that the override path must not blank the viewport during loading (see §11).

---

## 4. Section copy (English source of truth)

English is the acquisition source language. All user-visible strings go through each theme’s i18n system. Model names, product names, API paths, HTTP verbs, JSON keys, code identifiers, `Vancine`, `OpenAI`, currency amounts, and evidence numbers are not translated.

### 4.1 Hero

**Eyebrow**

```text
OpenAI-compatible access to China’s frontier AI
```

**H1**

```text
China’s frontier AI models. One API.
```

H1 rendering note: keep two visual lines if the layout benefits, but the semantic heading is the single sentence above. Do **not** insert model names into either line.

**Subheadline**

```text
Build with leading Chinese models through one OpenAI-compatible endpoint. Use the SDKs and agent tools you already know.
```

**Primary CTA**

- Label: `Start building free`
- Destination (Classic guest): `/register`
- Destination (Default guest): `/sign-up` (Default’s existing register route; equivalent conversion intent)
- Destination (authenticated, either theme): `/console` (Classic) or `/dashboard` (Default) — console entry only after auth is known
- Analytics: `get_started_clicked` with `location: 'hero'` (see §13)

**Secondary CTA**

- Label: `Explore live models`
- Destination: `/pricing`
- Analytics: `explore_models_clicked` with `location: 'hero'`

**Docs link (tertiary, text-only)**

- Label: `Documentation`
- Destination: configured docs route/link already used by the app (`docs_link` / `/docs`)
- Visual weight: plain text or ghost link under/beside secondary CTA; never equal to primary button mass
- If docs link is empty, omit the control entirely

**API base URL row (retain)**

- Label: `API Base URL`
- Value: `{serverAddress}/v1` with copy control (existing behavior)
- Do not present deprecated hostnames as the primary call address

**Hero stats (revised)**

| Stat | Source | Display rules |
|------|--------|---------------|
| Live model count | `GET /api/pricing` successful parse → `models.length` | Show only after success. Format `{n}` when `n >= 1`. Never default to `20`. Never invent a trailing `+` from incomplete data. On loading: skeleton or omit the number. On error/empty: omit the count stat entirely rather than inventing a figure. |
| OpenAI-compatible | Constant | Label: `OpenAI-compatible` / value presentation as check or `1` endpoint — **not** a fake multiplier |
| One API | Constant | Label: `One API` |

**Removed from Hero stats**

- `10x` / `Cheaper` and any unverifiable savings multiplier.

**Hero must not contain**

- Any concrete model name (including Kimi, GLM, MiniMax, Qwen, DeepSeek, Seedance, Seedream, Doubao, etc.).
- Hardcoded featured allowlists.
- “No credit card required” (see §4.7).

### 4.2 Available now

**Eyebrow / title**

```text
Available now
```

**Supporting line (when featured models exist)**

```text
Featured models live on the public catalog. Open a model or browse the full marketplace.
```

**Card fields (per model) — frozen**

| Field | Rule |
|-------|------|
| `model_name` | Required. Card title. |
| `description` | Show when non-empty after trim; omit the description node entirely when missing/blank. Clamp to about 2 lines in CSS. Never invent description text. |
| vendor | Resolve `vendor_id` against the same response’s `vendors[]`. Show vendor `name` only when resolution succeeds. Omit vendor UI when `vendor_id` is missing or not found. |
| `supported_endpoint_types` | Show at most **2** chips in response order. If more than 2 exist, show the first 2 plus a `+N` chip where `N = total - 2`. If the array is missing or empty, omit chips. |
| Price numbers | **Omit** on Featured cards. Detail lives on `/pricing`. |

**Card click / CTA — frozen**

- Entire card (and any explicit card CTA) navigates to plain `/pricing`.
- Do **not** append, invent, or depend on pricing query parameters in this phase.
- Do **not** invent model-detail deep links that 404.

**Analytics on card click**

- `featured_model_clicked` with `{ location: 'available_now', model: model_name }`
- Also acceptable to fire `explore_models_clicked` only on the section-level “Explore live models” control, not required on every card.

**Empty / error fallback (no model names)**

```text
Explore all available models →
```

Destination: plain `/pricing`.
Do not render placeholder cards named after any model.

**Count caption under the strip**

- Only when pricing loaded successfully and `publicModelCount >= 1`: `{{count}} models available` using the full public list length.
- Loading: no numeric caption.
- Error or zero models: no numeric caption.

### 4.3 Works with your stack

**Title**

```text
Works with your stack
```

**Intro**

```text
Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.
```

**Items (fixed set for v1)**

| Client | Public qualification (required) |
|--------|----------------------------------|
| OpenCode | Live-verified with Kimi K3 in a controlled coding-agent run (link evidence section) |
| Cline | Configuration-ready OpenAI-compatible setup; not claimed as a completed Vancine live coding-agent verification on the homepage |
| Roo Code | Configuration-ready OpenAI-compatible setup; not claimed as a completed Vancine live coding-agent verification on the homepage |
| Claude Code | Compatible via OpenAI-compatible / documented gateway usage patterns; homepage must not claim a Vancine-owned end-to-end coding-agent benchmark unless a separate approved evidence asset exists |
| OpenAI SDK | First-class: standard OpenAI SDK against `https://vancine.com/v1` |

**Copy rules**

- Do not fabricate badges like “Official partner.”
- Do not imply every agent was live-benchmarked.
- Prefer short chip/card UI with the qualification as secondary text.

### 4.4 Verified in real agent workflows

**Title**

```text
Verified in real agent workflows
```

**Intro**

```text
One controlled historical run — not a promise that every request will match these numbers.
```

**Evidence card (facts frozen from existing Kimi K3 assets)**

Source of truth already in repo:

- Classic: `web/classic/src/pages/KimiK3Api/landing.js` (`KIMI_K3_OPENCODE_VERIFICATION`, `KIMI_K3_MEASURED_USAGE`)
- Public pages: `https://vancine.com/kimi-k3-api`
- Starter: `https://github.com/VancineAI/kimi-k3-api-starter`

Display facts:

| Fact | Value |
|------|-------|
| Client | OpenCode v1.18.3 |
| Model under test (evidence only; not Hero) | `kimi-k3` |
| Model steps | 6 |
| Tool calls | 7 (5 read + 1 edit + 1 bash) |
| Tests | passed |
| Duration | 84.3 seconds (`durationMs: 84345`) |
| Agent telemetry tokens | 28,707 |
| Vancine measured usage | `$0.19` USD |

**Disclaimer (required, adjacent to numbers)**

```text
Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.
```

**Links**

- `View Kimi K3 page` → same-origin `/kimi-k3-api` (canonical public URL `https://vancine.com/kimi-k3-api`)
- `View starter & verified evidence` → starter repo and evidence JSON URL already used by the Kimi page (`KIMI_K3_EVIDENCE_STARTER_REPO`, `KIMI_K3_EVIDENCE_URL`)

**Forbidden**

- Publishing upstream procurement cost.
- Presenting the run as average, median, or SLA.
- Expanding into multi-model fake benchmarks.

### 4.5 Why developers use Vancine

**Title**

```text
Why developers use Vancine
```

Four cards (icons may reuse existing visual language):

1. **Fast access to new Chinese models**
   `New Chinese model releases can be added to one endpoint instead of a new vendor integration each time.`

2. **One compatible API**
   `OpenAI-compatible requests, streaming, and tooling patterns you already use.`

3. **Unified balance and billing**
   `One account, one balance, and one usage log across supported models.`

4. **Tested integration examples**
   `Public starters and measured agent evidence for supported workflows.`

No model-name laundry lists in this section.

### 4.6 Live model marketplace

**Title**

```text
Live model marketplace
```

**Body**

```text
Browse the full public catalog with live endpoint types and pricing metadata. What you see is served from the same public pricing API developers can query.
```

**Primary content — frozen: dynamic model list only**

1. Use the same successful normalized `/api/pricing` payload as Available now / Hero count.
2. Sort all public models by `model_name` with case-insensitive ascending order (`localeCompare(undefined, { sensitivity: 'base' })`).
3. Take the first **6** models after sort.
4. Each row shows:
   - `model_name` (required)
   - at most **2** `supported_endpoint_types` chips; if more than 2, show first 2 plus `+N`
5. Entire row click target → plain `/pricing` (no query parameters).
6. Section primary button: `Explore live models` → plain `/pricing` + `explore_models_clicked` with `location: 'marketplace'`.

**Explicitly removed from marketplace**

- Vendor/endpoint summary as an alternative to the model list.
- Hardcoded Kimi K2.6 / GLM-5.1 / MiniMax M2.5 / Qwen 3.7 Max.
- Hardcoded prices.
- Cross-vendor saving percentages.
- “10x Cheaper” or any unverifiable multiplier.

**Connected providers row — frozen (replaces Providers marquee)**

Placement: bottom of the Live model marketplace section.

Label:

```text
Connected providers
```

Rules:

1. Data comes **only** from the same pricing response’s `vendors` array.
2. If `vendors` is missing, not an array, or empty after normalization → omit the Connected providers row entirely.
3. Display each vendor’s `name`.
4. Sort vendor names case-insensitively ascending.
5. Show only vendors actually returned in the current response. No hardcoded vendor array. No “11+” label. No filler icons for absent vendors.
6. This row is informational; it does not replace the top-6 model list.

**Empty/error**

- Same safe link pattern as Available now: `Explore all available models →` → plain `/pricing`.
- No Connected providers row on error.

### 4.7 Final CTA

**Headline**

```text
Start building with China’s frontier models
```

**Primary button**

- Label: `Get $1 in free API credit`
- Destination: Classic guest `/register`; Default guest `/sign-up`; authenticated users go to console/dashboard
- Analytics: `get_started_clicked` with `location: 'final_cta'`

**Required qualifier (subtext)**

```text
New accounts may receive $1 in promotional API credit when the current signup bonus is enabled. Credit, eligibility, and availability can change; usage depends on model and workload.
```

**Explicit decision on “No credit card required”**

- **Do not** print `No credit card required` on the homepage in this redesign.
- Reason: code default `common.QuotaForNewUser = 0`; bonus amount and payment-gate behavior are operator-configurable. Several landing pages historically claimed no card + $1 credit, but homepage acquisition copy must stay accurate without a pre-implementation production config audit in this design phase.
- If a later implementation task verifies production signup still grants credit without collecting a card, that claim may be added under a separate 范总-approved copy change. It is not part of the default homepage copy set.

### 4.8 Footer positioning

- Do **not** modify About page content or structure.
- Do **not** add negative disclaimers of the form “Vancine is not affiliated with the model providers listed on this site.”
- Allowed positive, low-noise line (homepage footer area or existing footer tagline slot when rendering the built-in home footer):

```text
Independent API infrastructure for China’s frontier AI models.
```

- Preserve all existing new-api / QuantumNous copyright, license, and related-project links already present in footer components. Those identifiers are protected and must remain untouched.

---

## 5. Dynamic Featured models — data contract

### 5.1 Endpoint

```http
GET /api/pricing
```

Public, no auth required for anonymous homepage use. Existing response shape (`controller/pricing.go`):

```json
{
  "success": true,
  "data": [ { "model_name": "...", "description": "...", "tags": "...", "vendor_id": 1, "supported_endpoint_types": ["..."], "model_ratio": 0, "model_price": 0, "quota_type": 0, "enable_groups": ["..."] } ],
  "vendors": [ { "id": 1, "name": "...", "description": "...", "icon": "..." } ],
  "group_ratio": {},
  "usable_group": {},
  "supported_endpoint": {},
  "auto_groups": [],
  "pricing_version": "..."
}
```

Relevant `model.Pricing` fields used on the homepage:

- `model_name` (string, required for display)
- `description` (string, optional)
- `tags` (string, optional, comma-separated)
- `vendor_id` (int, optional)
- `supported_endpoint_types` (array)

Homepage Featured cards and marketplace rows **do not** display price numbers in this phase. Users inspect pricing detail on `/pricing`.

### 5.2 Client normalization rules

Implemented once per theme in the pure helper module (`homepage-pricing.js` / `homepage-pricing.ts`):

1. Require `success === true`.
2. Require `Array.isArray(data)`.
3. If `data` is a non-array object, treat as **invalid** (do not `Object.keys` to fake a model list). This explicitly retires the Classic home bug.
4. Keep only items whose `model_name` is a non-empty string after trim.
5. Build `vendorsById` map from `vendors` only when `vendors` is an array; ignore malformed vendor entries without `id`/`name`.
6. `publicModelCount = normalizedModels.length` only after successful normalization.

### 5.3 Featured selection algorithm (deterministic)

Pure function; unit-testable; no IO inside the filter besides the already-fetched payload.

```text
input: pricingItems[]
1. featured = []
2. for item in pricingItems:
     if !item or typeof item.model_name != string or model_name.trim() == '': skip
     tags = split item.tags by comma
     normalize each tag: trim + lowercase
     if tags includes exact token "featured":  # case-insensitive via lowercase
        featured.push(item)
3. sort featured by model_name localeCompare(undefined, { sensitivity: 'base' }) ascending
4. return featured.slice(0, 4)
```

**Rules frozen by this design**

1. Only models present in the public pricing response may appear.
2. Tag match is comma-split, trim, case-insensitive, **exact token** `featured` (so `Featured`, `featured`, `FEATURED` match; `not-featured` does not).
3. Maximum **4** cards.
4. Operational guidance: keep ≤ 4 models tagged `Featured` in production metadata (enforced by process, not by automatic tag writes from this feature).
5. Sort is deterministic: case-insensitive `model_name` ascending. No reliance on API order.
6. Never infer “latest” from `model_name`, `updated_time`, version-like substrings, or release dates.
7. Never ship a code allowlist of Kimi/GLM/MiniMax/etc. defaults.
8. Names, descriptions, vendors, endpoint chips, and counts always come from the public response at render time.
9. Card navigation is always plain `/pricing` with no query string.

### 5.4 Marketplace selection algorithm (deterministic)

```text
input: normalizedModels[]
1. sorted = sort by model_name localeCompare(undefined, { sensitivity: 'base' }) ascending
2. return sorted.slice(0, 6)
```

### 5.5 Connected providers algorithm (deterministic)

```text
input: vendors[]
1. if vendors is not an array: return []
2. names = vendors with non-empty name strings
3. sort names by localeCompare(undefined, { sensitivity: 'base' }) ascending
4. return names (no cap required; render as a wrapping chip/text row)
```

### 5.6 Production Featured tag changes

Adding or removing the `Featured` tag on production model metadata is a **separate production metadata write**. It requires explicit 范总 approval in its own change window. This design and the subsequent homepage code implementation do **not** grant automatic authority to mutate production tags.

---

## 6. Fetch, filter, sort, and fallback flow

```text
Home mount (built-in path)
  ├─ render Hero shell immediately (evergreen copy, CTAs, URL row)
  ├─ pricingState = { status: 'loading', count: null, featured: [], marketplace: [], vendors: [], items: [] }
  ├─ GET /api/pricing  — exactly one shared in-flight request per homepage instance
  │    shared by Hero stats, Available now, Marketplace, Connected providers
  │    ├─ success + array → status=ready; count=length; featured=selectFeatured(items); marketplace=selectTop6(items); vendors=selectVendors(vendors)
  │    ├─ success + empty array → status=empty; count=0; featured=[]; marketplace=[]; vendors=[]; fallback links only
  │    └─ network/HTTP/shape error → status=error; count=null; featured=[]; marketplace=[]; vendors=[]; fallback links only
  └─ GET /api/home_page_content  (parallel, non-blocking for built-in shell — see §11)
```

**Single shared pricing state — frozen**

- Classic: one React state (or equivalent page-local store) owned by the Classic Home page instance.
- Default: one React state (or equivalent page-local store) owned by the Default Home page instance.
- Desktop and mobile breakpoints consume the **same** page-instance state. Forbidden: separate mobile hardcode `20+` vs desktop live count.
- Exactly **one** `/api/pricing` network request per homepage mount/instance. Child sections must not each fire their own pricing request.

**Caching — frozen**

- Reuse the in-flight Promise only for the lifetime of the current homepage instance (component state / ref).
- **Do not** add:
  - `sessionStorage` cache for pricing
  - `localStorage` cache for pricing or featured model names
  - module-level TTL cache shared across navigations
- Existing `home_page_content` localStorage behavior remains only for operator override HTML/URL, unrelated to pricing.

**Fallback matrix**

| Condition | Available now | Marketplace | Connected providers | Hero count |
|-----------|---------------|-------------|---------------------|------------|
| loading | fixed skeleton slots (see §7.1) | skeleton rows (up to 6 slots) or reserved list height | omit | omit number / skeleton |
| ready + featured ≥ 1 | up to 4 cards | top 6 rows | vendors row if any | real count |
| ready + featured = 0 | fallback link only | top 6 rows if items ≥ 1 else fallback | vendors row if any | real count (0 → omit stat) |
| error | fallback link only | fallback link only | omit | omit stat |

Fallback link label always:

```text
Explore all available models →
```

---

## 7. Loading, empty, and error UI states

### 7.1 Pricing-powered sections

**Available now loading skeletons — frozen**

Reserve a fixed card grid to limit CLS:

| Breakpoint | Skeleton count |
|------------|----------------|
| Desktop (≥1280px, and md+ 4-col layout) | **4** skeleton cards |
| Tablet (768px, 2-col layout) | **2** skeleton cards |
| Mobile (390px, 1-col layout) | **1** skeleton card |

Skeleton cards contain no model names, no fake counts, and no “20+”.

**Available now empty/error**

- Section title stays visible.
- Body is only the fallback link `Explore all available models →`.
- No alarm banner required.

**Marketplace loading**

- Reserve list height for up to 6 rows (skeleton rows acceptable).
- No fake model names.

**Marketplace empty/error**

- Fallback link only.
- No Connected providers row.

**Ready**

- Render real cards/rows.
- Vendor/model icons only when URLs already exist on the payload and fail soft (broken icon → omit icon or neutral placeholder without inventing a vendor).

### 7.2 Evidence section

- Static facts from checked-in constants (same values as Kimi landing). No runtime upstream call.
- i18n keys exist in every maintained locale file; non-English locales without human translation store the English source string as the value.

### 7.3 Custom home override

See §11.2. Override content has its own loading path and must not blank the viewport. Soft timeout before preferring built-in home is **1500ms** when no cached override exists.

---

## 8. Classic / Default parity decision

### 8.1 Decision

| Theme | Role | Homepage acquisition redesign |
|-------|------|-------------------------------|
| **Classic** | Production theme | **Full visual + conversion implementation** of this design |
| **Default** | Secondary theme / future switch | **Conversion-semantics parity** required; visual restyle follows Default’s existing landing system rather than cloning Classic pixel-for-pixel |

### 8.2 Parity checklist (must match across themes)

1. Guest primary CTA → theme register route (`/register` vs `/sign-up`).
2. Guest secondary CTA → plain `/pricing`.
3. Authenticated primary CTA → theme console/dashboard home.
4. No guest primary path to a protected console that 401-bounces to login expired.
5. Shared featured selection algorithm, marketplace top-6 algorithm, vendor sort, and fallback copy.
6. Shared evidence facts and disclaimers.
7. Shared analytics event names and location vocabulary (§13), including mandatory header `get_started_clicked`.
8. Shared first-touch behavior (already global).
9. Shared prohibition on hardcoded featured allowlists, static provider marquees, and negative affiliation disclaimer.
10. Shared i18n English source meanings; every maintained locale file receives keys (English fallback values where no human translation exists).

### 8.3 Allowed differences

- Component library (Semi vs Base UI/Tailwind).
- Hero visual treatment (Classic video/poster vs Default terminal demo) **as long as** evergreen copy, CTA graph, and motion rules are met.
- Exact file paths under each theme’s directory conventions, provided the implementation units in §14 exist with equivalent responsibility.

### 8.4 Rationale

Production traffic uses Classic today; shipping Classic fully maximizes acquisition impact. Default must not regress guest signup routing or invent divergent claims, but forcing pixel parity would churn protected Default structure without production upside. Conversion semantics parity is the binding constraint.

### 8.5 Default Header modification gate — frozen

Default public header carrier (read-only located for this design):

```text
web/default/src/components/layout/components/public-header.tsx
```

Read-only baseline in that file: guest chrome currently exposes **Sign in → `/sign-in`** only; there is no `get_started_clicked` with `{ location: 'header' }`. This design phase does not edit that business file.

Two distinct modification classes:

1. **Analytics-only Header change (allowed when the event is missing)**
   - Allowed regardless of the 390px layout result.
   - Scope: edit the exact Header file that carries the guest registration / Sign up control — currently `web/default/src/components/layout/components/public-header.tsx` — solely to ensure a guest registration control reaches `/sign-up` and fires `get_started_clicked` with `{ location: 'header' }`.
   - If the file already has a guest registration control but lacks the event, add only the event wiring.
   - If the file currently has only Sign in and no guest registration control, the homepage conversion task may add the minimum guest Sign up / Start building control to `/sign-up` **plus** the required header analytics event. That addition is still analytics/conversion wiring, not a layout redesign.
   - Forbidden under analytics-only: restyling, spacing redesign, breakpoint refactor, new drawer system, or other visual/layout work unrelated to attaching the registration control and event.

2. **Structural / layout Header change (gated)**
   - Allowed **only after** the 390px guest acceptance check fails.
   - Failure means: guest cannot see or reach the registration control without horizontal page scroll, or the control is clipped/unusable at 390px.
   - Scope when gated open: visibility logic, collapse/menu behavior, sizing, mobile structural adjustments required to pass 390px.
   - If 390px passes after analytics-only wiring, record structural Header work as **N/A**.

3. Classic public mobile nav work (`PublicMobileNav.jsx` + header wiring) remains in scope regardless, because current Classic evidence shows Register hidden below `md` and horizontal nav clipping.

---

## 9. i18n strategy — frozen

1. English strings in §4 are the canonical keys/source.
2. **Classic — every existing maintained root locale file receives the new homepage keys:**
   - `web/classic/src/i18n/locales/en.json`
   - `web/classic/src/i18n/locales/zh-CN.json`
   - `web/classic/src/i18n/locales/zh-TW.json`
   - `web/classic/src/i18n/locales/zh.json`
   - `web/classic/src/i18n/locales/fr.json`
   - `web/classic/src/i18n/locales/ja.json`
   - `web/classic/src/i18n/locales/ru.json`
   - `web/classic/src/i18n/locales/vi.json`
3. **Default — every maintained locale file receives the new homepage keys:**
   - `web/default/src/i18n/locales/en.json`
   - `web/default/src/i18n/locales/zh.json`
   - `web/default/src/i18n/locales/fr.json`
   - `web/default/src/i18n/locales/ru.json`
   - `web/default/src/i18n/locales/ja.json`
   - `web/default/src/i18n/locales/vi.json`
4. Human translation priority for this pass: English source + Simplified Chinese where already practical. For every other listed locale file, if no human translation is prepared in the implementation task, the key’s value **must** be the English source string (explicit English fallback value in the JSON file). Never leave a missing key. Never leave a blank value.
5. Follow each theme’s existing i18n conventions (`t('English source')` on Classic where that is the local pattern; Default key style as already used in that theme).
6. Do not translate: model names, `OpenAI`, `Vancine`, endpoint paths, evidence numerals, repository URLs.
7. Word-reveal / entrance animations must treat language switches as instant text replacement (Classic already fixed this class of bug in `word-reveal.js` — keep that contract).
8. No locale-prefixed homepage routes in this project (`/` stays canonical).

---

## 10. Responsive and mobile navigation design

### 10.1 Breakpoints (acceptance targets)

| Surface | Width | Requirements |
|---------|-------|--------------|
| Mobile | 390px | No horizontal page scroll; Hero CTAs stack; Featured shows 1 skeleton/card column; nav acquisition path works; Sign up visible for guests |
| Tablet | 768px | 2-column Featured cards; nav usable |
| Desktop | 1280px+ | Full layout; up to 4 Featured cards in one row; marketplace 6 rows comfortable |

### 10.2 Classic mobile nav problem and fix

**Current issues**

- `Navigation.jsx` uses a horizontal scrolling flex row for Home / Console / Pricing / Docs / About.
- `UserArea` hides Register with `hidden md:block`, so phones only show Login.

**Design (implementation-phase behavior)**

1. **Public pages (including `/`) at mobile widths:** replace inline scrolling link row with a **compact menu button** (hamburger or “Menu”) implemented as `PublicMobileNav.jsx` that opens a full-width panel/drawer containing:
   - Home
   - Models (`/pricing`)
   - Docs (if configured)
   - About
   - Console (only if authenticated; if guest, label as `Log in` → `/login` rather than dumping guests into `/console`)
2. **Persistent acquisition controls in the header chrome on mobile:**
   - Primary: `Sign up` → `/register` (always visible when guest and not self-use mode)
   - Secondary: `Log in` → `/login`
   - Sign up click **must** fire `get_started_clicked` with `{ location: 'header' }`
3. Desktop (≥ md): keep inline nav; Register button remains visible; Register/Sign up also fires `get_started_clicked` with `{ location: 'header' }`
4. Console-route mobile drawer behavior can remain for authenticated console IA; public-page menu is the acquisition fix.
5. Focus trap + Esc close + restore focus for the mobile menu.
6. Do not rely on `overflow-x-auto` as the only way to reach Pricing/About on 390px.

### 10.3 Default mobile nav

- Reuse Default’s existing public Header at `web/default/src/components/layout/components/public-header.tsx`.
- Mandatory acceptance: at 390px, guest can reach `/sign-up` without horizontal clipping of the primary registration control.
- **Analytics-only** Header edits are allowed whenever `get_started_clicked` with `{ location: 'header' }` is missing on the guest registration control (§8.5 class 1).
- **Structural/layout** Header edits are allowed only after the 390px check fails (§8.5 class 2).
- Guest Sign up / Start building in the Default header must fire `get_started_clicked` with `{ location: 'header' }` once the homepage acquisition work lands.

### 10.4 Section responsiveness

- Hero: type scale already clamps; primary/secondary buttons full-width on mobile.
- Featured: 1 col mobile, 2 col tablet, 4 col desktop; skeleton counts match §7.1.
- Evidence metrics: wrap into a 2×2 or stacked list on mobile; no table overflow.
- Marketplace rows: stack endpoint chips under title on narrow screens.
- Connected providers: wrapping chip/text row; no horizontal page scroll.

---

## 11. Performance, first paint, and motion

### 11.1 First paint principles

1. Built-in Hero shell must render without waiting on `/api/pricing` **or** `/api/home_page_content`.
2. Pricing and home-content requests run in parallel after first paint work is scheduled.
3. Avoid full-page “Loading…” gates for the built-in path (Default currently gates on home content load — redesign requires Default built-in path to show Hero shell with section-level placeholders instead of a centered full-page loader whenever override content is empty/unknown).

### 11.2 `/api/home_page_content` state machine

```text
status: boot
  → read localStorage cache of override (if any) as speculative hint only
  → start network fetch immediately
  → render built-in shell optimistically UNLESS cached override is a non-empty HTML/URL
      (if cached override exists, show cached override immediately to avoid flicker for operators who set custom homes)
  → on network result:
       empty string → commit built-in home; clear stale cache if network says empty
       html/url → commit override
       error → if cache existed, keep cache; else built-in home
  → timeout soft budget: 1500ms
       if still pending and no cache → keep built-in shell (do not blank)
       when late response arrives empty → stay built-in
       when late response arrives non-empty override → switch to override (acceptable rare swap for operator custom homes)
```

**Decision:** Prefer **never blank**. Built-in acquisition home is the safe default for Vancine production. Operator custom homes still work; they may replace built-in content when confirmed.

### 11.3 Video / poster (Classic Hero)

- Keep `poster='/hero-poster.jpg'`, `preload='metadata'`, idle-deferred `play()`, `muted` + `playsInline` + `loop`.
- `prefers-reduced-motion: reduce` → do not play video; poster/static background only.
- If video errors (`error` event) or `play()` rejects: remain on poster/static layers; no console-spamming retries.
- Aurora/blob animations disabled under reduced motion (already patterned).

### 11.4 Motion and copy visibility

- Respect `prefers-reduced-motion` for WordReveal, ScrollReveal, and hover spotlights.
- Under reduced motion: all Hero text opacity 1 with no stagger delay.
- Under normal motion: cap Hero entrance so primary CTA reaches full visibility within **1.2s** wall time after mount (shorten current multi-second stagger during implementation). Main headline must not remain at opacity 0 long enough to look broken on slow devices.
- No Providers marquee animation remains on the homepage; Connected providers is a static wrapping row (still honor reduced motion for any entrance fade if used).

### 11.5 CLS budget

- Reserve height for Hero full viewport block (keep existing `min-h-[600px]`).
- Featured skeletons reserve card height with the fixed counts in §7.1.
- Marketplace reserves list height for up to 6 rows while loading.
- Avoid inserting late banners above Hero after paint.
- Fonts: rely on existing font loading; do not add new webfont blocking requests for this project.

### 11.6 Bundle discipline

- No new heavy chart libraries.
- Reuse existing `framer-motion` on Classic only where already depended.
- Pure helpers live in `homepage-pricing.js` / `homepage-pricing.ts` for unit tests and tiny surface area.

---

## 12. Accessibility requirements

1. Semantic landmarks: one `h1` in Hero; section `h2`s thereafter.
2. Buttons/links keyboard operable; visible focus rings retained.
3. Mobile menu: `aria-expanded`, `aria-controls`, Escape to close, focus return.
4. Color contrast maintains existing Vancine tokens; do not place muted-on-muted body copy.
5. Evidence numbers announced as text, not only color.
6. Fallback link text must be descriptive (`Explore all available models`).
7. Decorative aurora/video: `aria-hidden` where appropriate; video no auto-audio.
8. Do not convey featured status by color alone — use the section title + card structure.
9. `prefers-reduced-motion` honored (§11.4).
10. External evidence/starter links: `rel="noopener noreferrer"` when `target="_blank"`.
11. Skeleton cards use `aria-hidden` or an polite loading label on the section; do not expose fake names to AT.

---

## 13. First-touch attribution and analytics

### 13.1 Reuse existing system only

- Client helpers: Classic `web/classic/src/helpers/acquisition.js`; Default `web/default/src/lib/acquisition.ts`.
- Server: `POST /api/acquisition/touch`, cookie `vancine_ft`, table `acquisition_touches`.
- Global landing capture already records `landing_view` on page load (including `/`).
- Register pages already record `signup_started` before submit.

**Homepage must not**

- Introduce a parallel touch table, cookie, or localStorage UTM dump.
- Send email, username, raw cookie, or full query string to analytics.
- Write raw UTM strings into new client storage keys.

### 13.2 Event map

| User action | First-party acquisition | Umami/GA `trackEvent` |
|-------------|-------------------------|------------------------|
| Land on `/` | existing automatic `landing_view` | none required beyond existing global |
| Click primary Hero CTA | none extra | `get_started_clicked` `{ location: 'hero' }` |
| Click Final CTA | none extra | `get_started_clicked` `{ location: 'final_cta' }` |
| Click header Sign up / guest registration control | none extra | `get_started_clicked` `{ location: 'header' }` (**required**; Default: analytics-only edit of `public-header.tsx` when missing — §8.5) |
| Arrive register + interact | existing `signup_started` on form/OAuth | existing register events |
| Click Explore live models (Hero) | none | `explore_models_clicked` `{ location: 'hero' }` |
| Click Explore live models (Marketplace) | none | `explore_models_clicked` `{ location: 'marketplace' }` |
| Click Available now fallback | none | `explore_models_clicked` `{ location: 'available_now_fallback' }` |
| Click Featured card | none | `featured_model_clicked` `{ location: 'available_now', model: model_name }` (model id only; no PII) |
| Click marketplace row | none | `explore_models_clicked` `{ location: 'marketplace' }` or `featured_model_clicked` is **not** used; use `explore_models_clicked` `{ location: 'marketplace' }` for row clicks as well |
| Click evidence / starter links | none | `evidence_link_clicked` `{ location: 'homepage', resource: 'kimi_k3_page' \| 'starter_repo' \| 'verified_json' }` |

### 13.3 Location vocabulary (normalized)

Allowed `location` values for homepage CTAs:

`hero` | `final_cta` | `header` | `marketplace` | `available_now` | `available_now_fallback`

Keep existing `get_started_clicked` event name for funnel continuity with prior dashboards and tests.

Header Sign up / guest registration analytics is **mandatory**, not discretionary. Missing Default header event authorizes analytics-only edits to `web/default/src/components/layout/components/public-header.tsx` under §8.5 class 1. Structural Default Header edits remain 390px-gated under §8.5 class 2.

### 13.4 Privacy

- Payload values limited to enums, model public ids, and resource tokens.
- No IP, email, authorization headers, or cookie contents in event props.
- Production host allowlists in existing analytics helpers remain enforced.

---

## 14. Implementation units and file list (do not modify in this phase)

Final paths must follow each theme’s existing directory conventions. The **implementation units below are mandatory**; implementers map them onto the conventional folders but must not invent an open-ended component set beyond this list.

### 14.1 Classic (production) — mandatory units

| Unit | Responsibility |
|------|----------------|
| `homepage-pricing.js` | Normalize `/api/pricing`; Featured select; marketplace top-6; vendor sort; endpoint chip helper (`first 2 + +N`); pure and unit-tested. Preferred path: `web/classic/src/components/home/homepage-pricing.js` (or `web/classic/src/helpers/homepage-pricing.js` if helpers co-location matches nearby patterns). |
| `AvailableNowSection.jsx` | Featured grid, skeletons, fallback link |
| `StackSection.jsx` | Works with your stack |
| `EvidenceSection.jsx` | Kimi K3 OpenCode historical evidence |
| `WhySection.jsx` | Why developers use Vancine |
| `MarketplaceSection.jsx` | Top-6 model list + Connected providers row + explore CTA |
| `PublicMobileNav.jsx` | Public-page mobile menu panel for acquisition nav |
| `Home/index.jsx` | Own shared pricing state; home content gate; compose sections |
| `HeroSection.jsx` | Evergreen Hero copy, CTAs, stats wired to shared pricing state |
| `CTASection.jsx` | Final CTA routing + qualified credit copy |
| Header wiring | `headerbar/Navigation.jsx`, `UserArea.jsx`, `headerbar/index.jsx` integrate `PublicMobileNav` and mandatory header analytics |
| `Footer.jsx` | Positive tagline only; preserve protected links |
| Locale files | All Classic root locale JSON files listed in §9 |
| Tests | Colocated with `homepage-pricing.js` and critical wiring |

**Classic composition changes (no file deletion)**

Default homepage implementation **must not delete any file**. 范总 must separately approve any later deletion of an exact path.

- `FeaturesSection.jsx`: leave the homepage composition. Content responsibilities move to `StackSection` / `WhySection`. **Do not delete** the file in the default implementation task.
- `PricingHighlight.jsx`: leave the homepage composition’s old comparison behavior. Allowed options only:
  1. Refactor the **existing** `PricingHighlight.jsx` file in place into the Marketplace implementation; or
  2. Keep `PricingHighlight.jsx` as a compatibility re-export that points at the new `MarketplaceSection` unit.
  Behavior must match §4.6 Marketplace. **Do not delete** `PricingHighlight.jsx`.
- `ProvidersSection.jsx`: remove the static marquee from the homepage composition only. No hardcoded vendor array and no “11+” remain on `/`. **Do not delete** the file in the default implementation task.
- Any later desire to remove unused source files requires a separate 范总 approval naming each exact path. The homepage implementation task has no deletion authority.

### 14.2 Default (parity) — mandatory units

| Unit | Responsibility |
|------|----------------|
| `homepage-pricing.ts` | Same pure algorithms as Classic helper. Preferred path: `web/default/src/features/home/lib/homepage-pricing.ts`. |
| Available now section | Semantic parity with Classic Available now |
| Stack section | Semantic parity with Works with your stack |
| Evidence section | Same facts and disclaimers |
| Why section | Same four value props |
| Marketplace section | Top-6 list + Connected providers row |
| `features/home/index.tsx` | Shared pricing state; non-blocking home content gate; compose sections |
| Hero / CTA sections | Evergreen copy + guest `/sign-up` + final CTA parity |
| Locale files | All Default locale JSON files listed in §9 |
| Header file | `web/default/src/components/layout/components/public-header.tsx` — analytics-only edits allowed when `get_started_clicked` `{ location: 'header' }` is missing; structural/layout edits only after failed 390px acceptance (§8.5) |
| Tests | Unit tests for `homepage-pricing.ts` and critical wiring |

No Default source file is deleted in the default implementation task.

### 14.3 Out of scope unless separately approved

- Backend pricing schema changes
- Production DB model tag updates
- About page
- Attribution backend (already shipped)
- Pricing page query-parameter deep links
- Deletion of any source file (including retired composition units such as Classic `FeaturesSection.jsx`, `PricingHighlight.jsx`, `ProvidersSection.jsx`)

---

## 15. Test and local Docker acceptance plan

### 15.1 Unit tests (required)

1. **`homepage-pricing` Featured selection**
   - splits tags on comma; trims; case-insensitive exact `featured`
   - excludes `not-featured`, empty tags, missing names
   - sorts case-insensitively by `model_name`
   - caps at 4
2. **Marketplace top-6**
   - case-insensitive name sort
   - slice length 6
3. **Vendor sort**
   - case-insensitive name sort
   - empty/malformed vendors → empty list
4. **Endpoint chip helper**
   - 0 types → empty
   - 1–2 types → those types
   - 5 types → first 2 + `+3`
5. **Pricing response normalization**
   - array success
   - object-shaped `data` → invalid/error path (guards against `Object.keys` regression)
   - `success: false` → error path
6. **CTA destination helper**
   - guest → register route
   - authenticated → console/dashboard
7. **Copy/contract tests**
   - Hero source does not include banned model-name substrings in static evergreen strings
   - fallback string present; no hardcoded featured default array of model ids
8. **Analytics wiring smoke**
   - primary CTA fires `get_started_clicked` with `location: 'hero'`
   - header guest registration / Sign up fires `get_started_clicked` with `location: 'header'` (Default carrier: `web/default/src/components/layout/components/public-header.tsx`; analytics-only edit authorized when missing)
   - explore fires `explore_models_clicked`
9. **File-deletion guard**
   - implementation diff contains no deleted paths unless 范总 issued a separate exact-path deletion approval for that change set

### 15.2 Frontend tests / lint / build

```bash
# Classic
cd web/classic
npm install --legacy-peer-deps --no-audit --no-fund
npm test
npm run build

# Default
cd web/default
npm install --no-audit --no-fund
npm run test
npm run typecheck
npm run build
```

### 15.3 Local Docker acceptance (implementation phase)

Project standard base URL is `http://127.0.0.1:3000` per `AGENTS.md` Rule 4. If a Fan-approved compose override is present, resolve with:

```bash
docker compose build vancine
docker compose up -d
PORT="$(docker compose port vancine 3000 | head -n1 | awk -F: '{print $NF}')"
LOCAL_BASE_URL="http://127.0.0.1:${PORT}"
curl -sS "$LOCAL_BASE_URL/api/status"
curl -sS "$LOCAL_BASE_URL/api/pricing" | head -c 200
docker logs vancine --since 2m
```

**Manual browser checks at `$LOCAL_BASE_URL`**

| # | Check |
|---|-------|
| 1 | Guest clicks Hero primary → lands on register route, **not** `/login?expired=true` |
| 2 | Guest clicks Final CTA → register route |
| 3 | Guest clicks Explore live models → plain `/pricing` with no required query string |
| 4 | Hero has no concrete model names |
| 5 | With zero Featured tags: fallback link only; no ghost models |
| 6 | With 1–4 Featured tags (local metadata): cards match API; order by name; click → `/pricing` |
| 7 | Featured cards show ≤2 endpoint chips and `+N` when needed; vendor only when resolvable |
| 8 | Marketplace shows up to 6 models sorted by name; click → `/pricing` |
| 9 | Connected providers lists only API vendors, sorted; no “11+”; no static marquee |
| 10 | Model count matches `data.length` after load; never flashes a committed fake `20` |
| 11 | Only one `/api/pricing` request per homepage load (network panel) |
| 12 | Loading skeletons: 4 desktop / 2 tablet / 1 mobile in Available now |
| 13 | 390px: Sign up / guest registration visible; menu exposes Pricing/About; no page-level horizontal scroll. Failed 390px is the only gate for Default structural Header layout work |
| 14 | Header Sign up / guest registration emits `get_started_clicked` with `location: 'header'` (Default via `public-header.tsx`; analytics-only wiring allowed when missing even if 390px passes) |
| 15 | `prefers-reduced-motion`: Hero text visible immediately; video not required to play |
| 16 | Disconnect network after load: video failure still shows poster |
| 17 | Evidence shows 6 steps / 7 tools / 84.3s / 28,707 / $0.19 + disclaimer |
| 18 | Footer shows approved positive line; no negative affiliation sentence; About unchanged |
| 19 | first-touch cookie still set on `/` visit (`vancine_ft`) without console errors |
| 20 | Default theme guest primary still reaches sign-up route with equivalent events |
| 21 | All Classic and Default locale files listed in §9 contain the new keys (English fallback values acceptable) |

### 15.4 Explicit non-tests for this feature

- No paid upstream model calls.
- No production admin login requirement for homepage QA.
- No requirement to mutate production Featured tags during code QA; local/dev metadata or mocked `/api/pricing` fixtures suffice.

---

## 16. Phased release and rollback

### 16.1 Phases

| Phase | Content | Gate |
|-------|---------|------|
| P0 Design | This document | Codex read-only acceptance + 范总 approval to implement |
| P1 Implementation | Classic full + Default parity code, tests, i18n | Local Docker + checklist §15.3 |
| P2 Staging/local sign-off | 范总 visual/UX acceptance | Explicit approval |
| P3 Production deploy | Server-side git pull + `docker compose build/up` per release docs | 范总 separate deploy approval |
| P4 Metadata (optional, separate) | Production `Featured` tags on ≤4 models | **Separate** 范总 approval; not bundled as silent side effect of P3 |
| P5 Monitor | 24h/72h funnel via existing acquisition funnel API + Umami | SOP thresholds |

### 16.2 Rollback

1. **Code rollback:** redeploy previous known-good image/commit on production host; homepage returns to prior Classic home.
2. **Metadata rollback:** remove `Featured` tags if a tag experiment misbehaves; homepage falls back to safe link without code rollback.
3. **Override escape hatch:** operator may set `home_page_content` to a temporary URL/HTML only if necessary; prefer code rollback for acquisition integrity.
4. Attribution backend left untouched during homepage rollback (orthogonal system).

### 16.3 Release hygiene

- Implementation commits follow `<type>: <summary>`; no `git add -A`.
- VERSION/CHANGELOG only when 范总 opens a release window.
- `./bin/pre-deploy-check.sh` before production push/deploy when that phase starts.
- Protected identifiers remain unchanged.
- **No file deletion** in the default homepage implementation commit set. Composition may stop importing old sections; source files stay unless 范总 separately approves deletion of each exact path.

---

## 17. Production Featured tag change policy

1. Homepage code **reads** tags only.
2. Any production write to model `tags` to add/remove `Featured` needs a dedicated request to 范总 with model list, rationale, and rollback tag plan.
3. Recommended steady state: **0–4** Featured models, each actually callable on the public catalog.
4. Tag token must be exactly `Featured` (case-insensitive match on read); avoid synonyms like `highlight` unless the read algorithm is explicitly extended in a later design.
5. This design phase performs **zero** production metadata writes.

---

## 18. Known risks and trade-offs

| Risk | Mitigation |
|------|------------|
| Production has zero `Featured` models at code ship | Safe fallback link; still improves CTA routing and copy; schedule separate tag approval |
| Operator custom `home_page_content` hides acquisition home | Documented; optimistic built-in when empty; custom homes are intentional overrides |
| Classic vs Default visual divergence | Accepted; conversion parity enforced |
| Developers distrust single-run evidence | Strong historical disclaimer; link full Kimi page |
| Free-credit copy vs actual `QuotaForNewUser` | Qualified language; no “no credit card” claim without verification |
| Pricing API shape misuse returns wrong counts | Normalization + unit tests ban `Object.keys` on array mistake |
| Mobile menu implementation touches shared header | Limit Classic changes to public/guest behavior; regression-check console routes |
| Default Header churn | Split gate: analytics-only when header event missing; structural only after failed 390px (§8.5) |
| Accidental source-file deletion during composition cleanup | Default implementation forbids all deletes; require separate 范总 exact-path approval |
| Motion still hides CTA on low-end phones | Hard cap entrance timing + reduced-motion path |
| Marketing pressure to restore “10x cheaper” | Rejected in §4; marketplace stays honest |
| Accidental About or protected-identifier edits | Explicit exclusions; review diff for Rule 6 |

**Trade-off accepted:** Evergreen Hero + manual Featured tags (human-in-the-loop) beats automatic “latest model” heuristics that will eventually showcase the wrong model with high confidence.

**Trade-off accepted:** Marketplace shows a deterministic top-6 name-sorted preview rather than a curated editorial list, so the section stays truthful without new backend ranking fields.

---

## 19. Acceptance criteria (design phase)

Design phase is complete only if all are true:

1. Only file present for this work is `docs/superpowers/specs/2026-07-29-homepage-acquisition-design.md`.
2. Hero evergreen copy contains **no** concrete model names.
3. Featured models specified as `/api/pricing` + exact `Featured` tag only.
4. No hardcoded fallback model names.
5. Primary CTA specified as Classic `/register` (Default `/sign-up`) for guests.
6. About page explicitly untouched.
7. No negative “not affiliated with…” disclaimer in designed copy.
8. Footer uses only the approved positive positioning line for new homepage identity text.
9. Mobile nav, blank home, and model-count consistency are specified.
10. Classic/Default parity decision and rationale are recorded.
11. Attribution/events reuse first-touch + explicit event map, including mandatory header location.
12. Tests, Docker, release, and rollback are specified.
13. Document contains **no** unresolved placeholder markers and no deferred-decision wording.
14. new-api / QuantumNous zero-change commitment recorded.
15. No real credentials in the document.
16. Mandatory implementation units are named; no unbounded component decision remains.
17. Featured cards, marketplace top-6, Connected providers, pricing fetch, and i18n file lists are fully frozen.
18. `git diff --no-index --check /dev/null` against this file reports no whitespace errors.

### 19.1 Implementation-phase acceptance (forward-looking)

Tracked for the next Claude Code execution task; not executed now:

- Guest primary CTA never yields `/login?expired=true` as the happy path.
- Featured/marketplace unit tests pass; build passes for themes touched.
- Local Docker manual checklist §15.3 passes.
- Diff avoids protected identifier edits and About page edits.
- Secret scan clean on touched files.
- Diff contains **no deleted files** unless 范总 separately approved each exact path.
- Default header guest registration fires `get_started_clicked` `{ location: 'header' }` from `web/default/src/components/layout/components/public-header.tsx` (analytics-only edits authorized when missing).
- Default structural/layout Header changes appear only when 390px acceptance failed and the report records that failure.

---

## 20. Decisions log (no open items)

| ID | Decision | Choice | Why |
|----|----------|--------|-----|
| H1 | Primary guest CTA | `/register` (Classic), `/sign-up` (Default) | Stops console 401 → expired login loop |
| H2 | Secondary CTA | `/pricing` labeled Explore live models | Catalog exploration without stealing primary conversion |
| H3 | Docs weight | Tertiary text link | Prevents docs from competing with signup |
| H4 | Featured source | Public pricing + exact tag `Featured` | Honest, operable, testable |
| H5 | Featured sort | Case-insensitive `model_name` | Deterministic without new API fields |
| H6 | Featured cap | 4 | Fits mobile/desktop without dilution |
| H7 | Latest-model algorithm | None | Avoids wrong high-confidence marketing |
| H8 | Hardcoded model fallback | None | Prevents stale ghosts |
| H9 | Model count default | null/omit until success | Kills fake 20+ |
| H10 | Savings claims on home | Removed | Not continuously verifiable |
| H11 | Evidence | Existing Kimi K3 OpenCode single run | Real, already public, qualified |
| H12 | Free credit CTA wording | `Get $1 in free API credit` + eligibility qualifier | Strong offer without unconditional permanence |
| H13 | “No credit card required” | Omitted on homepage | Not verified against current configurable signup gates in this phase |
| H14 | About page | No edits | Task boundary |
| H15 | Negative disclaimer | Forbidden on home/footer | Task boundary; use positive positioning |
| H16 | Footer line | Independent API infrastructure… | Approved positive identity |
| H17 | Parity | Classic full UI; Default conversion semantics | Production is Classic |
| H18 | Home content loading | Never blank; prefer built-in shell | Fixes first-visit empty page |
| H19 | Mobile register | Always visible for guests | Fixes hidden CTA at 390px |
| H20 | Attribution | Reuse first-touch only | Already shipped; SOP aligned |
| H21 | Production Featured tags | Separate approval | Prevents silent prod metadata writes |
| H22 | Providers area | Remove static Providers marquee from homepage composition only (do not delete source file); show Connected providers from live `vendors[]` under Marketplace | Removes hardcoded vendors/“11+”; stays truthful to public API |
| H23 | Protected identifiers | Zero modification | AGENTS.md Rule 6 |
| H24 | Featured card destination | Plain `/pricing` only; no query params | Avoids inventing unstable deep links |
| H25 | Featured card fields | name required; description/vendor conditional; ≤2 endpoint chips + `+N` | Complete, testable card contract |
| H26 | Pricing fetch | One shared request per homepage instance; no session/local/module TTL cache | Simple, consistent desktop/mobile state |
| H27 | Featured skeletons | 4 desktop / 2 tablet / 1 mobile | Predictable CLS reserve |
| H28 | Marketplace content | Dynamic top-6 model list only (plus Connected providers row) | Removes either/or ambiguity |
| H29 | Header analytics | `get_started_clicked` `{ location: 'header' }` required | Funnel completeness |
| H30 | i18n files | All Classic root locales + Default en/zh/fr/ru/ja/vi get keys; English values as fallback | No missing-key leakage |
| H31 | Implementation units | Named Classic/Default units in §14 | Removes open-ended component-set ambiguity |
| H32 | Default Header edits | Analytics wiring allowed when missing on `public-header.tsx`; structural Header changes only after failed 390px acceptance | Resolves required header event vs layout-gate conflict |
| H33 | File deletion | Forbidden in default homepage implementation; keep or re-export old section files; any delete needs separate 范总 exact-path approval | Prevents silent cleanup deletes |

---

## 21. Design-phase execution record

| Field | Value |
|-------|-------|
| Baseline branch | `main` |
| Baseline HEAD | `f359dd3259378e0f1fe3e7b1d8d75b99b838e1a3` |
| origin/main | `f359dd3259378e0f1fe3e7b1d8d75b99b838e1a3` |
| Initial working tree | clean except this design file |
| Files modified in REWORK-1 / REWORK-2 | `docs/superpowers/specs/2026-07-29-homepage-acquisition-design.md` only |
| Commit/push/deploy | not performed |
| Production access | not performed |
| Paid API calls | not performed |

---

## 22. References

- `AGENTS.md` Rule 4 (local Docker), Rule 6 (protected identifiers)
- `docs/acquisition/model-launch-sop.md` v1.2.1
- `docs/acquisition/templates/claudecode-task-brief.md` v1.2.2
- `docs/superpowers/specs/2026-07-28-acquisition-first-touch-attribution-design.md`
- Classic home: `web/classic/src/pages/Home/index.jsx` and `web/classic/src/components/home/*`
- Pricing API: `controller/pricing.go`, `model/pricing.go`
- Kimi evidence constants: `web/classic/src/pages/KimiK3Api/landing.js`
- Auth bounce: `web/classic/src/helpers/utils.jsx` 401 → `/login?expired=true`

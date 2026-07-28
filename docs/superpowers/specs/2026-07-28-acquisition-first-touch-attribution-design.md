# Vancine First-Touch Acquisition Attribution Design

**Date:** 2026-07-28
**Status:** Approved for design freeze (REWORK-1 + REWORK-2 applied)
**Task ID:** `VANCINE-ACQUISITION-ATTRIBUTION-DESIGN-2026-07-28`
**Rework Task ID:** `VANCINE-ACQUISITION-ATTRIBUTION-DESIGN-2026-07-28-REWORK-2`
**Dispatch Task ID:** `019f7edc-086d-7182-8a75-eb0270e153a0`
**Approver:** 范总
**Baseline SHA:** `7a23ec2c26c73e37ad2445d8d57e12797ae25990`
**Scope:** First-touch acquisition attribution chain (backend + Default/Classic frontend parity + admin read-only funnel API). No dashboard UI. No production config changes in this design phase.

---

## 1. Background and current-state evidence

### 1.1 Business need

Vancine overseas acquisition SOP defines a five-step funnel:

```text
landing_view
  → signup_started
    → signup_completed
      → api_key_created
        → first_api_call_succeeded(model)
```

Channel experiments (Kimi K3, Seedance, AI Media landings, Reddit/X/HN posts) already emit UTM-bearing links. Without a durable first-touch record bound to the eventual user, 24h/72h/7d thresholds in `docs/acquisition/model-launch-sop.md` cannot be measured from first-party data. Umami/GA pageviews alone cannot answer:

- which UTM campaign produced a completed signup;
- whether that user later created an API key;
- whether that user made a successful paid/consume call for a specific model ID.

### 1.2 What already exists

| Layer | Evidence | Capability | Gap |
|-------|----------|------------|-----|
| Server HTML inject | `main.go` `InjectUmamiAnalytics` / `InjectGoogleAnalytics` | Injects Umami + GA4 scripts into Default and Classic `index.html` when env IDs are set | Third-party only; no first-party touch persistence |
| Default analytics helper | `web/default/src/lib/analytics.ts` | `trackEvent`; production host allowlist `vancine.com` / `www.vancine.com`; never throws; never identifies users | Events die if Umami blocked; not bound to user_id |
| Classic analytics helper | `web/classic/src/helpers/analytics.js` | Same contract as Default | Same gap |
| Playground funnel | `playground-analytics.ts` / `.js` | Per-request started/succeeded with `{model, endpoint_type}` only | Not acquisition attribution; not user-bound first-touch |
| Landing UTM passthrough | Default/Classic Kimi K3 / Seedance / AI Media `landing` modules | CTA destinations retain only `utm_source/medium/campaign/content/term` | UTM survives one navigation hop in the URL; not stored server-side; lost after OAuth round-trip or manual navigation |
| Password signup events | Default `sign-up-form.tsx`, Classic `RegisterForm.jsx` | Client `trackEvent('signup_started')` before API; `trackEvent('signup_completed')` on success | Client-only; no server touch_id; no UTM binding |
| Password register backend | `controller/user.go` `Register` | Creates user via `User.Insert`; optional default token when `GENERATE_DEFAULT_TOKEN=true` | No attribution hook |
| OAuth register backend | `controller/oauth.go` `findOrCreateOAuthUser`; also legacy `github.go` / `discord.go` / `oidc.go` | Distinguishes existing user login vs new user create; uses session `aff` for inviter | Distinguishes new vs existing (good); no first-touch bind |
| Tokens | `model/token.go` | `user_id`, `created_time`, soft-delete via `gorm.DeletedAt` | Can derive first API key time per user; historical milestone must use Unscoped so soft-deleted keys still count |
| Consume logs | `model/log.go` on `LOG_DB` | `LogTypeConsume=2`, `user_id`, `model_name`, `created_at`; gated by `common.LogConsumeEnabled` | Separate DB possible; must not JOIN across DBs |
| Affiliate | `User.AffCode` / session `aff` | Invite rewards only | Not UTM acquisition attribution |
| Waitlist | `model/waitlist.go` | Email + source + IP + UA | Intentionally heavier PII than acquisition touch; **not** reused |
| Migrations | `model/main.go` `migrateDB` and `migrateDBFast` | Two AutoMigrate entry paths | New model must be registered in **both** lists |

### 1.3 Constraints from project rules

- `AGENTS.md` Rule 2: SQLite + MySQL >= 5.7.8 + PostgreSQL >= 9.6 via GORM; no DB-specific JSON/JSONB operators or SQL that only one engine supports.
- `AGENTS.md` Rule 6: do not modify protected new-api / QuantumNous identifiers.
- SOP §9–§10: funnel metrics and null-safe rates when sample is empty.
- SOP §13: no secrets in docs; no paid upstream calls for this design task.
- Frontend: Default and Classic must stay at parity for acquisition behavior.
- Session cookies today (`main.go`): `HttpOnly`, `Secure: true`, `SameSite=Lax`, path `/`. Local HTTP testing of a new attribution cookie must still be possible (Secure conditional).

### 1.4 Problem statement

There is no first-party, privacy-preserving, first-touch attribution store that:

1. captures the first landing snapshot (UTM fields may be empty for direct/unknown) before signup;
2. freezes that snapshot permanently so later visits cannot rewrite it;
3. survives password registration and OAuth redirects;
4. binds exactly once to a newly created user;
5. powers an admin-only funnel report without a dashboard;
6. derives later funnel stages from existing tokens and consume logs without cross-database JOINs;
7. reports data completeness instead of lying with zeros when logs or token queries fail;
8. produces stable historical snapshots for a fixed `[from, to)` window.

---

## 2. Goals and non-goals

### 2.1 Goals

1. **First-touch only.** The first landing snapshot is immutable once recorded.
2. **Full registration coverage.** Password register + GitHub / Discord / OIDC / LinuxDO / WeChat / Telegram / custom OAuth new-user paths all bind the same way.
3. **No double-count on login.** Existing-user OAuth login / bind must never create a second signup_completed attribution.
4. **One user ≤ one first-touch bind.** Enforce with unique constraints and idempotent writes.
5. **Admin read-only API only** for v1: `GET /api/acquisition/funnel`.
6. **Default + Classic parity** for client capture and milestone signals.
7. **Privacy by design:** no IP, email, username, token, cookie plaintext, prompts, full external referrer, or full query string stored in the attribution table.
8. **Honest completeness:** when consume logs are off or LOG_DB/token queries fail, return structured completeness flags and JSON nulls; never invent zeros that look like “no conversions.”
9. **Cross-DB compatible** GORM model and migrations for SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6.
10. **Stable time-window snapshots:** repeating the same `from`/`to` must not include conversions that happened at or after `to`.
11. **Testable without paid calls:** all verification uses mocks/fixtures.

### 2.2 Non-goals

- Visual admin dashboard or chart UI.
- Last-touch, multi-touch, or time-decay attribution.
- Storing PII or full marketing referrer URLs.
- Calling production APIs or paid upstream models.
- Changing production env, Umami, or GA configuration as part of implementation of this design’s first code drop (config keys may be *documented* for later deploy).
- models.dev integration.
- k3-256k model onboarding.
- Replacing Umami/GA; both remain for product analytics.
- Historical backfill from Umami/GA or access logs.
- Changing affiliate (`aff`) semantics.
- User-facing settings or consent UI beyond existing legal consent on signup.

---

## 3. Options considered and decision

### 3.1 Option A — Put UTM columns on `users`

Add `utm_*` and `landing_path` directly on `users`.

- Pros: simple join; one row per user.
- Cons: cannot count `landing_view` or `signup_started` before user exists; pollutes core user table; harder to keep pre-signup touch separate from post-signup bind; OAuth existing login has nothing to attach pre-user events to.

**Rejected.**

### 3.2 Option B — localStorage / sessionStorage only + send UTM on register body

- Pros: no cookie; easy frontend.
- Cons: lost across OAuth third-party redirect in some browsers/ITP scenarios less reliably than first-party cookie; register body can be forged/overwritten by client at submit time without a server-issued touch_id; no durable `landing_view` count server-side; Classic/Default duplication of fragile storage keys.

**Rejected as sole mechanism.** Client may still *display* nothing UTM-related; server must own the source of truth via `touch_id`.

### 3.3 Option C — Independent attribution table + random `touch_id` + signed HttpOnly cookie (selected)

- Pre-signup: public endpoints create/update milestones on `acquisition_touches` keyed by `touch_id`.
- Browser holds only a signed `touch_id` cookie (not UTM plaintext).
- On new-user creation (password or OAuth), server reads cookie, validates signature, binds `user_id` once.
- Funnel later stages join in application code: touches (main DB) + tokens (main DB) + consume logs (LOG_DB).

- Pros: matches first-touch; works before user exists; OAuth-safe; forge-resistant touch identity; clear privacy boundary; admin API can aggregate without PII.
- Cons: more moving parts than Option A; requires careful idempotency and cookie Secure handling on local HTTP.

**Selected.**

### 3.4 Option D — Reuse Waitlist table

- Cons: waitlist stores email/IP/UA; different product purpose; unique on email not touch.

**Rejected.**

### 3.5 Key decisions (frozen, no open items)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Attribution model | First-touch only |
| D2 | Mutability | **First landing snapshot** never overwritten (UTM may be empty = direct/unknown; later UTM cannot fill or replace) |
| D3 | Storage | Table `acquisition_touches` on main `DB` |
| D4 | Browser state | Signed HttpOnly cookie with `touch_id` only |
| D5 | Cookie flags | `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` when request is HTTPS (incl. `X-Forwarded-Proto=https`); plain HTTP local allowed with `Secure=false` |
| D6 | Cookie lifetime | 180 days |
| D7 | Cookie name | `vancine_ft` |
| D8 | Signing | HMAC-SHA256 over `touch_id` using existing `common.CryptoSecret` (same family as `common.GenerateHMAC`) |
| D9 | Public write API | `POST /api/acquisition/touch` with `event` field |
| D10 | Who may create a touch | **Only** public `event=landing_view` creates rows; `signup_started` never creates rows |
| D11 | Admin API | `GET /api/acquisition/funnel` behind `AdminAuth` |
| D12 | Rate limit | Public endpoints use `CriticalRateLimit` (default 20 / 20 min / IP) |
| D13 | Signup bind points | Password `Register` success path; OAuth `findOrCreateOAuthUser` only when a **new** user row is created; mirror legacy GitHub/Discord/OIDC insert paths |
| D14 | Existing OAuth user | No bind attempt that creates signup_completed; leave any prior bind untouched; do not attach a new anonymous touch to an old account on mere login |
| D15 | api_key_created | Earliest token `created_time` per bound user via **Unscoped** query (includes soft-deleted tokens and auto initial token); irreversible historical milestone |
| D16 | first_api_call_succeeded | First `logs` row with `type=LogTypeConsume`, `created_at >= signup_completed_at`, `created_at < to`, and exact `model_name` when `model` filter set; query `LOG_DB` separately |
| D17 | Cross-DB | Application-level multi-step query; **never** SQL JOIN main DB ↔ LOG_DB |
| D18 | Time window | Cohort on `first_seen_at ∈ [from, to)`; every later milestone additionally requires its own timestamp `< to` so historical queries are stable snapshots |
| D19 | History | No backfill; `coverage_started_at` written once via compare-and-set on `options` **only after** both `Option` and `AcquisitionTouch` tables are ready and **all** migration errors for that path have been checked; CAS runs **outside** any parallel migration goroutine; CAS failure returns migrate error; never overwrite existing value; `historical_backfill_available=false` |
| D20 | Dashboard | Not in v1 |
| D21 | Umami | Keep existing client events; add first-party calls alongside, not instead |
| D22 | i18n | No new user-visible strings in v1 → i18n work is N/A |
| D23 | Rates when denominator 0 | JSON `null`, never `0` |
| D24 | Admin response PII | Counts and filter echoes only; no user ids, emails, touch ids in funnel aggregate |
| D25 | Migration registration | `AcquisitionTouch` added to **both** `migrateDB` AutoMigrate list and `migrateDBFast` migrations list; coverage CAS is sequential post-barrier work on each path (see §5.4–5.5), never inside a fast-path goroutine |
| D27 | Password `signup_completed` bind point | Server-side bind runs only after durable account provisioning succeeds and **immediately before** `setupLogin`; default Token failure does not bind (see §9.2) |
| D26 | DB support matrix | SQLite, MySQL >= 5.7.8, PostgreSQL >= 9.6 only |

---

## 4. Architecture and data flow

### 4.1 Components

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser (Default or Classic)                                │
│  - global capture on every page (marketing + register)      │
│  - POST /api/acquisition/touch  event=landing_view          │
│  - receive Set-Cookie: vancine_ft=<touch_id>.<sig>          │
│  - on register form valid: event=signup_started (no create) │
│  - on OAuth button click: event=signup_started (no create)  │
│  - existing Umami trackEvent(...) unchanged                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────┐
│ Go API                                                      │
│  Public:                                                    │
│    POST /api/acquisition/touch  (CriticalRateLimit)         │
│  Admin:                                                     │
│    GET  /api/acquisition/funnel (AdminAuth)                 │
│  Bind hooks:                                                │
│    controller.Register                                      │
│    controller.findOrCreateOAuthUser (new user only)         │
│    legacy OAuth Insert paths (new user only)                │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                v                             v
        main DB                         LOG_DB (optional same)
   acquisition_touches                    logs (consume)
   tokens (Unscoped for first-key)
   users (read id only at bind)
   options (coverage_started_at)
```

### 4.2 End-to-end sequence

**Anonymous landing (only creator of touches)**

1. User opens `/kimi-k3-api?utm_source=reddit&utm_campaign=kimi_k3_launch&utm_medium=post&foo=1`.
2. Global app boot calls shared helper `captureAndReportFirstTouch()` on marketing pages, home, and register/sign-up routes.
3. Helper extracts allowlisted UTM + `landing_path=/kimi-k3-api` (path only). Empty UTM is valid (direct/unknown first touch).
4. If cookie `vancine_ft` absent or invalid: `POST` with `event=landing_view` → server creates **first landing snapshot** row, sets cookie.
5. If cookie valid and touch exists: server **does not** change UTM fields or `landing_path`; landing_view is idempotent no-op for field mutation; may refresh cookie expiry.
6. Umami pageview continues independently.

**Password signup**

1. User opens `/sign-up` or `/register`. Global capture runs first so a touch usually already exists before form submit.
2. On client-side validation pass, before register API:
   - Umami `signup_started` (existing).
   - First-party `event=signup_started` (updates `signup_started_at` only if a valid existing touch is present).
3. If capture failed and there is no valid cookie/touch: `signup_started` is a soft success / safe no-op (no row created, no fake landing_view). Registration proceeds normally; attribution may be missing.
4. `POST /api/user/register` runs the existing durable provisioning sequence in `controller.Register` (evidence at baseline):
   1. `cleanUser.Insert` succeeds;
   2. `insertedUser` is loaded successfully by username;
   3. if `constant.GenerateDefaultToken == true`, default Token key generation **and** `token.Insert` both succeed (any failure returns register error and **must not** bind);
   4. **only then**, with default Token success (or `GenerateDefaultToken=false`), call `BindTouchToUser(c, insertedUser.Id)` **immediately before** `setupLogin(&insertedUser, c)`;
   5. `setupLogin` establishes the session.
5. Server `signup_completed` means: durable account provisioning finished and the handler is about to establish the login session — **not** “session already saved,” and **not** “User.Insert just returned.” See §9.2 for the frozen definition.
6. Client Umami `signup_completed` remains (client-side success signal; independent of server bind soft-fail).

**OAuth signup**

1. On OAuth button click (GitHub/Discord/OIDC/…): fire `signup_started` first-party against existing touch only + keep any existing client analytics.
2. OAuth redirect leaves site and returns; cookie `vancine_ft` must survive (first-party, Lax, 180d).
3. Callback `findOrCreateOAuthUser`:
   - **Existing user:** login only → **no** attribution bind for signup_completed.
   - **New user:** after successful insert/finalize → bind touch to new `user_id` if cookie/touch valid.

**Later funnel (query time, not event-time writers)**

- `api_key_created`: for completed cohort users whose bind is eligible under the window rules, Unscoped-query earliest token `created_time` and require `created_time < to`.
- `first_api_call_succeeded(model)`: for those users, query LOG_DB for earliest consume log with exact model id (when provided), requiring `created_at >= signup_completed_at` and `created_at < to`.

### 4.3 Trust boundary

| Input | Trusted? | Handling |
|-------|----------|----------|
| Cookie `touch_id` + sig | Yes if HMAC valid and row exists | Lookup key |
| Cookie without valid sig | No | Ignore; mint new touch only on next `landing_view` |
| Client-supplied UTM on **create** (`landing_view` only) | Partially | Allowlist + sanitize; written once into first landing snapshot |
| Client-supplied UTM on existing touch | No | Discard entirely; snapshot frozen |
| Client `signup_started` without valid touch | No create | Soft success / safe no-op; no new row |
| Client-supplied `user_id` | Never accepted | Bind only from authenticated register/OAuth server path |
| Admin filters | Yes after AdminAuth | Validate dates/lengths |

---

## 5. Data model

### 5.1 Table `acquisition_touches`

GORM model name: `AcquisitionTouch`.
Table name: `acquisition_touches`.
Database: **main `DB` only** (not LOG_DB).

| Column | Go type | GORM / SQL | Notes |
|--------|---------|------------|-------|
| `id` | `int` | primary key, auto | Internal only |
| `touch_id` | `string` | `type:varchar(64);uniqueIndex;not null` | Public random id (UUID hex via `common.GetUUID()`, 32 chars) |
| `user_id` | `*int` | nullable unique — see §5.2 | `NULL` until bind; pointer so unset ≠ 0 |
| `utm_source` | `string` | `type:varchar(64);index;default:''` | Sanitized; frozen after create |
| `utm_medium` | `string` | `type:varchar(64);default:''` | Sanitized; frozen after create |
| `utm_campaign` | `string` | `type:varchar(128);index;default:''` | Sanitized; frozen after create |
| `utm_content` | `string` | `type:varchar(128);default:''` | Sanitized; frozen after create |
| `utm_term` | `string` | `type:varchar(128);default:''` | Sanitized; frozen after create |
| `landing_path` | `string` | `type:varchar(255);default:''` | First landing path only; frozen after create |
| `first_seen_at` | `int64` | `bigint;index;not null` | Unix seconds; set on create |
| `signup_started_at` | `*int64` | `bigint` | Nil until milestone |
| `signup_completed_at` | `*int64` | `bigint;index` | Nil until bind |
| `created_at` | `int64` | `bigint` | Row insert time |
| `updated_at` | `int64` | `bigint` | Last milestone/bind update |

**Explicitly absent columns:** IP, user agent, email, username, raw cookie, raw referrer, raw query string, headers, geo.

### 5.2 Uniqueness and idempotency constraints

1. `uniqueIndex` on `touch_id` — one row per touch.
2. Nullable `user_id` uniqueness (one bound user → at most one touch), compatible with **SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6**:
   - Prefer a plain unique index on nullable `user_id`. In MySQL >= 5.7.8, PostgreSQL, and SQLite, UNIQUE allows multiple NULL values and rejects duplicate non-NULL values. That is the required three-engine behavior.
   - Do **not** require engine versions above the supported MySQL floor, or MySQL-only, partial indexes that only one engine supports, or JSON/JSONB operators.
   - Application guard remains mandatory: before bind, `SELECT` any row with this `user_id`; if exists, no-op success. On unique-violation race, treat same-user as success.
   - Tests must cover: many rows with `user_id IS NULL` allowed; two rows with the same non-NULL `user_id` rejected.
3. Milestone timestamps use “set if null” updates only (`WHERE signup_started_at IS NULL`, etc.).
4. Attribution field writes after create are forbidden for UTM and `landing_path` (first landing snapshot freeze).

### 5.3 First landing snapshot rule (authoritative; replaces any “first effective UTM fill-later” wording)

This design uses a **true first-touch / first landing snapshot**:

1. The **only** public event that may **create** an `acquisition_touches` row is `landing_view`.
2. On create, the server stores the sanitized UTM five-tuple and `landing_path` from that request as the permanent snapshot.
3. **Empty UTM is valid.** A first visit with no UTM parameters is stored as direct/unknown first touch (`utm_*` all `""`) with the observed `landing_path`.
4. After the row exists, **no subsequent request may modify** `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, or `landing_path` — including a later visit that finally carries UTM.
5. Marketing links that need credit must include UTM on the **first** URL the user hits (or accept direct/unknown credit).
6. There is no “fill empty UTM later” path. Any earlier draft language that allowed patching blanks after create is void.

### 5.4 Migration (both paths required)

`AcquisitionTouch` **must** be registered in **both** migration entry points in `model/main.go`. Coverage CAS (§5.5) is sequential post-migration work on each path and **must never** run inside a parallel AutoMigrate goroutine.

#### 5.4.1 `migrateDB` (serial AutoMigrate)

Evidence today: one `DB.AutoMigrate(...)` call already includes `&Option{}` among many models, then optional `SubscriptionPlan` work, then `return nil`.

Required addition and order:

1. Add `&AcquisitionTouch{}` to the same `DB.AutoMigrate(...)` argument list that already includes `&Option{}` (and peers such as `WaitlistEntry`).
2. If that `AutoMigrate` returns error → **return error immediately**; do **not** run coverage CAS.
3. Keep existing post-list `SubscriptionPlan` handling as today; if it fails → return error; do **not** run coverage CAS.
4. Only after the full serial migrate path has succeeded with **Option table ready** and **AcquisitionTouch table ready**, call coverage CAS (§5.5).
5. If CAS returns error → **`migrateDB` must return that error** (startup must not pretend migrate succeeded while marker init failed).

#### 5.4.2 `migrateDBFast` (parallel AutoMigrate + barrier)

Evidence today: `Option` is one entry in the `migrations` slice; each entry runs in its own goroutine; after the loop the path does `wg.Wait()`, `close(errChan)`, then drains `errChan` and returns on any error; `SubscriptionPlan` is handled after that barrier.

Required addition and **race-free** order:

1. Add `{&AcquisitionTouch{}, "AcquisitionTouch"}` to the **same** `migrations` slice (so it migrates in parallel with `Option` and peers). `WaitlistEntry` is only on the slow path today; acquisition must not copy that omission.
2. Launch goroutines exactly as today — each goroutine only runs `DB.AutoMigrate` for its model. **Coverage CAS is forbidden inside any of these goroutines.**
3. After the launch loop: **`wg.Wait()`** (mandatory barrier).
4. **`close(errChan)`**, then drain/check **all** migration errors from `errChan`. If **any** parallel migration failed → **return error**; do **not** run coverage CAS.
5. Keep existing post-barrier `SubscriptionPlan` handling; failure → return error; no CAS.
6. Only when the Option table is ready, the AcquisitionTouch table is ready, and **all migration errors have been checked with none remaining**, run coverage CAS (§5.5) on the **main migrate goroutine** (CAS outside migration goroutines).
7. If CAS returns error → **`migrateDBFast` must return that error**.

#### 5.4.3 Shared migration rules

- Add dialect-safe unique enforcement verified for SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6.
- Do not use JSON/JSONB columns or engine-only SQL.
- Do not alter `users`, `tokens`, or `logs` schemas.
- Any migration failure on either path ⇒ coverage marker is **not** written.

### 5.5 Coverage start marker (single rule)

Option key: `acquisition.coverage_started_at`
Storage: existing `options` table (`model.Option`), value = decimal Unix seconds string or int-compatible string.

**Unique rule (no alternatives):**

1. **Preconditions (both paths):** `Option` table ready **and** `AcquisitionTouch` table ready **and** all migration errors for that path already checked with zero failures. CAS runs only after those preconditions (see §5.4.1–5.4.2). CAS is never started from inside a `migrateDBFast` parallel migration goroutine.
2. **Operation:** compare-and-set **insert-if-absent** into `options` for key `acquisition.coverage_started_at` only. Implementation must **not** call ordinary Update/Save helpers that would overwrite an existing row/value for this key.
3. **Value written (first time only):** current Unix time at that successful init.
4. **Idempotent concurrent / restart behavior:**
   - If the key **already exists** (prior boot, concurrent process, unique-key race): treat as **success**; **read and keep the original value**; **never overwrite** `coverage_started_at`.
   - Other database errors (connection, permission, unexpected constraint failures that are not “row already exists for this key”) → **return error** to the migrate function.
5. Subsequent process starts, re-migrations, or touch inserts **must not** overwrite the key.
6. Migration failure on the path ⇒ skip writing the key entirely (no CAS attempt).
7. CAS failure after a clean migrate ⇒ migrate function returns error (startup surfaces the failure).
8. Admin funnel API reads this fixed value; if somehow missing after feature enable (should not happen after a successful migrate that includes CAS), return API error rather than inventing a timestamp at read time.
9. `historical_backfill_available` is always JSON `false`.

---

## 6. Cookie specification

### 6.1 Format

```text
vancine_ft=<touch_id>.<hmac_hex>
```

- `touch_id`: 32-char hex from `common.GetUUID()` (no dashes).
- `hmac_hex`: `hex(HMAC_SHA256(CryptoSecret, touch_id))` via existing crypto helpers.
- No UTM values in cookie.
- No user id in cookie.

### 6.2 Attributes

| Attribute | Value |
|-----------|--------|
| Name | `vancine_ft` |
| Path | `/` |
| Max-Age | `15552000` (180 days) |
| HttpOnly | `true` |
| SameSite | `Lax` |
| Secure | `true` when request is HTTPS: `c.Request.TLS != nil` **or** `X-Forwarded-Proto` / `X-Forwarded-Protocol` is `https` (same idea as passkey origin detection in `service/passkey/service.go`); else `false` for local HTTP |
| Domain | host-only (do not set Domain attribute) |

### 6.3 Validation

1. Split on single `.` separator into id + sig.
2. Constant-time compare of expected HMAC.
3. Reject if `touch_id` fails charset/length check (`^[a-f0-9]{32}$`).
4. Invalid cookie → treat as missing (do not error the UX).
5. Valid signature but missing DB row → treat as missing for milestone/bind; `landing_view` may mint a replacement touch and rotate cookie.

### 6.4 Rotation

- CryptoSecret rotation invalidates old cookies; users get new touches on next landing_view; old unbound touches remain for aggregate landing counts but will not bind. Acceptable; document in ops notes at deploy time. No dual-key window in v1.

---

## 7. UTM and path sanitization

### 7.1 Allowlisted keys

Only: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.

### 7.2 Value rules

Applied server-side (client may pre-trim; server is authority):

1. Trim whitespace.
2. UTF-8 valid; strip control characters (U+0000–U+001F, U+007F).
3. Max length: source/medium 64; campaign/content/term 128. Truncate hard at max after trim.
4. Char allowlist decision: convert runs of whitespace to single `_`; drop any character outside `[A-Za-z0-9._%-]`.
5. Empty after sanitize → store `""`.
6. Do not URL-decode repeatedly; decode once if client sent raw query values through JSON strings.

### 7.3 `landing_path` rules

1. Must be a site-relative path starting with `/`.
2. Reject scheme-relative `//`, `http:`, `https:`, backslashes, whitespace, CR/LF.
3. Strip query and fragment if present.
4. Normalize: collapse duplicate slashes; maximum 255 chars; default `""` if invalid.
5. No open-redirect use; path is analytics only.
6. Stored value is the **first** landing path only.

### 7.4 What is never stored

- Full `document.referrer` or external hostnames.
- Full `window.location.href` or query string.
- `fbclid`, `gclid`, `msclkid`, or any non-allowlisted param (silently dropped).
- Affiliate `aff` code (separate system).

---

## 8. API contract

All JSON responses use existing helpers: `{ "success": bool, "message": string, "data": ... }` via `common.ApiSuccess` / `ApiError*`.

### 8.1 Public: `POST /api/acquisition/touch`

**Middleware:** `GlobalAPIRateLimit` (router group) + `CriticalRateLimit`.
**Auth:** none.
**Body:**

```json
{
  "event": "landing_view",
  "utm_source": "reddit",
  "utm_medium": "post",
  "utm_campaign": "kimi_k3_launch",
  "utm_content": "thread_a",
  "utm_term": "",
  "landing_path": "/kimi-k3-api"
}
```

| `event` | Behavior |
|---------|----------|
| `landing_view` | **Only creator of touches.** If no valid cookie/row: create first landing snapshot, set cookie. If valid existing touch: idempotent; do not mutate UTM/`landing_path`. |
| `signup_started` | **Never creates a touch.** If cookie signature valid **and** DB row exists: set `signup_started_at` iff currently null. If cookie missing, invalid, or row missing: soft success / safe no-op (`ok: true`, `touch_present: false`); no insert; no fake landing_view. |
| `signup_completed` | **Not accepted from public client.** Bind only on server register/OAuth paths. Public call with this event returns `success:false` without leaking internals. |

**Response `data` (minimal):**

```json
{
  "ok": true,
  "touch_present": true
}
```

Do not echo UTM back. Do not return `touch_id` in JSON (cookie is enough); avoids XSS exfiltration convenience. (Cookie still HttpOnly so JS cannot read it — intentional; client does not need id.)

**Errors:**

- Invalid event → `success:false`, generic message.
- Rate limited → HTTP 429 from middleware (existing behavior).
- Internal errors on landing_view create → generic failure; log server-side without cookie raw values.
- Internal errors on signup_started update → prefer soft no-op success for client UX stability, with server warning logs (must not break register page). Attribution absence is acceptable; forged funnel rows are not.

**Idempotency:**

- Repeat `landing_view` with same cookie: `ok: true`, no snapshot change, no second row.
- Repeat `signup_started` with valid touch: `ok: true`, timestamp unchanged after first set.
- Repeat `signup_started` without touch: `ok: true`, still no row.

### 8.2 Admin: `GET /api/acquisition/funnel`

**Middleware:** `AdminAuth()` (role ≥ `RoleAdminUser`).
**Query parameters:**

| Param | Required | Format | Semantics |
|-------|----------|--------|-----------|
| `from` | yes | Unix seconds or `YYYY-MM-DD` (UTC day start) | Inclusive lower bound for cohort `first_seen_at` |
| `to` | yes | Unix seconds or `YYYY-MM-DD` (UTC day start) | Exclusive upper bound for cohort and for **all** milestone eligibility timestamps |
| `utm_source` | no | sanitized string | Exact match filter on frozen snapshot |
| `utm_campaign` | no | sanitized string | Exact match filter on frozen snapshot |
| `model` | no | exact model id string | When provided, `first_api_call_succeeded` requires exact `logs.model_name` match. When omitted, any consume model counts |

Max range span: 366 days per request; longer → error. Require `from < to`.

**Response `data`:**

```json
{
  "landing_view": 120,
  "signup_started": 40,
  "signup_completed": 25,
  "api_key_created": 18,
  "first_api_call_succeeded": 7,
  "landing_to_signup": 0.20833333333333334,
  "signup_to_first_call": 0.28,
  "filters": {
    "from": 1753651200,
    "to": 1756330000,
    "utm_source": "reddit",
    "utm_campaign": "kimi_k3_launch",
    "model": "kimi-k3"
  },
  "coverage_started_at": 1753720000,
  "consume_logs_enabled": true,
  "historical_backfill_available": false,
  "from_before_coverage": false,
  "data_completeness": {
    "touches": "complete",
    "tokens": "complete",
    "consume_logs": "complete"
  }
}
```

All nullable numeric metrics and rates use pointer types (or equivalent) so JSON encodes explicit `null` (never omit to fake absence incorrectly, and never coerce missing data to `0`).

**Rate fields:**

- `landing_to_signup` = `signup_completed / landing_view` when `landing_view > 0` **and** both counts are non-null numbers; else JSON `null`.
- `signup_to_first_call` = `first_api_call_succeeded / signup_completed` when `signup_completed > 0` **and** `first_api_call_succeeded` is a non-null number; else JSON `null`.
- If `api_key_created` is null due to token query error, do not invent dependent rates that pretend keys were zero; v1 does not expose a separate key-conversion rate field beyond the raw count.

**Authorization failures:** existing AdminAuth behavior (401/403 as today).

### 8.3 Funnel metric definitions (authoritative) and time-window stability

Let half-open window be `[from, to)` with unix seconds.

**Cohort (stable base):**

```text
cohort = acquisition_touches WHERE
  first_seen_at >= from
  AND first_seen_at < to
  AND optional exact utm_source / utm_campaign filters
```

| Metric | Definition |
|--------|------------|
| `landing_view` | `COUNT(*)` of cohort |
| `signup_started` | cohort rows where `signup_started_at IS NOT NULL` **and** `signup_started_at < to` |
| `signup_completed` | cohort rows where `user_id IS NOT NULL` **and** `signup_completed_at IS NOT NULL` **and** `signup_completed_at < to` |
| `api_key_created` | among `signup_completed` eligible users, count users whose **earliest** token `created_time` (see §8.4) satisfies `created_time < to`. If token subsystem query fails → metric JSON `null` + `data_completeness.tokens=error` |
| `first_api_call_succeeded` | among `signup_completed` eligible users, count users with ≥1 `LOG_DB.logs` row where `type = LogTypeConsume`, `created_at >= signup_completed_at`, `created_at < to`, and (`model` omitted OR `model_name = model` exact). If logs disabled → null + `consume_logs=unavailable`. If logs query fails → null + `consume_logs=error` |

**Stable snapshot rule (mandatory):**

- Historical queries are point-in-time stable relative to `to`.
- Re-running the same `from`/`to` after additional conversions occur at timestamp `>= to` must **not** change any metric.
- Therefore every post-landing milestone used for counting must itself be strictly before `to`, even if the touch’s `first_seen_at` is inside the cohort window.
- Example: touch first seen on day 1 (`in` window), signup completed on day 40 (`>= to` of a 7-day window) → counted in `landing_view` only, not in `signup_completed` for that window.

Ordering of filters: UTM filters apply to touch rows first; token/log stages only see bound user ids from the filtered completed set that also satisfies `signup_completed_at < to`.

### 8.4 Token milestone semantics (`api_key_created`)

`api_key_created` is an **irreversible historical milestone**, not a live “user currently has a key” gauge.

Rules:

1. For each eligible completed user, compute `MIN(created_time)` over that user’s tokens.
2. Query **must** use GORM `Unscoped()` (or equivalent project pattern already used in `model/token.go` for token cache invalidation) so soft-deleted tokens (`DeletedAt` set) **remain included**.
3. If the user later deletes all tokens, `api_key_created` **must not decrease** for past windows: the historical first creation still counts when `created_time < to`.
4. Includes system/auto initial token created at registration when `GENERATE_DEFAULT_TOKEN` produced one.
5. Includes manually created tokens; earliest wins.
6. Does not require the token to still be enabled/active.
7. Cross-user leakage forbidden: always filter `user_id IN (...)` from completed cohort.

### 8.5 Data completeness and error semantics (authoritative)

| Condition | HTTP / success envelope | Metric fields | `data_completeness` |
|-----------|-------------------------|---------------|---------------------|
| Touches query fails | Entire funnel API returns error (`success: false`); **no** partial funnel `data` that could mislead | N/A | N/A (no success payload) |
| Touches OK, tokens query fails | `success: true` with partial honesty | `api_key_created: null`; rates that would depend on pretending keys=0 stay honest (raw null count) | `tokens=error`; touches complete |
| Touches OK, `LogConsumeEnabled=false` | `success: true` | `first_api_call_succeeded: null`, `signup_to_first_call: null`, `consume_logs_enabled: false` | `consume_logs=unavailable` |
| Touches OK, logs query fails | `success: true` | `first_api_call_succeeded: null`, `signup_to_first_call: null` | `consume_logs=error` |
| All OK | `success: true` | numeric counts; rates null only on zero denominators | all `complete` |

Never encode “unknown” as integer `0`. Use `*int` / `*float64` (or custom JSON) so missing/unavailable values serialize as JSON `null`.

---

## 9. Server bind flows

### 9.1 Shared service

Package sketch (implementation phase):

- `model/acquisition_touch.go` — struct + CRUD + bind + sanitize + coverage CAS helper (insert-if-absent; never overwrite).
- `service/acquisition` or functions on model — `RecordLandingView`, `MarkSignupStarted`, `BindTouchToUser(c, userId)`, `GetFunnel(filter)`.
- `controller/acquisition.go` — HTTP handlers.
- `router/api-router.go` — route registration.
- `controller/user.go` — password Register bind call site only at the frozen point in §9.2.
- `model/main.go` — register `AcquisitionTouch` on **both** `migrateDB` and `migrateDBFast`; run coverage CAS only per §5.4–5.5 (serial success path / after `wg.Wait` + all migration errors checked; CAS outside migration goroutines; CAS failure returns error).

`MarkSignupStarted(c)`:

1. Parse + verify cookie; if missing/invalid → return soft ok, no DB write.
2. Load touch by `touch_id`; if missing → return soft ok, no insert.
3. If `signup_started_at` null → set to now; else no-op.
4. Never creates rows.

`BindTouchToUser(c *gin.Context, userId int)`:

1. Parse + verify cookie; if missing/invalid → return nil (registration still succeeds).
2. Load touch by `touch_id`; if missing → return nil.
3. If touch.user_id already equals userId → ensure `signup_completed_at` set; return.
4. If touch.user_id non-null and different → log anomaly; do not rebind; return.
5. If another touch already bound to userId → leave both; do not steal; return (one-user-one-touch invariant prefers earlier bind).
6. Else transaction: set `user_id`, `signup_completed_at=now`, set `signup_started_at` if still null (OAuth user might skip client milestone).
7. All errors soft-fail relative to signup success: attribution must not block registration. Log warnings only.

### 9.2 Password registration (frozen bind point)

Baseline evidence (`controller/user.go` `Register`): after validation, the durable path is `cleanUser.Insert` → load `insertedUser` → optional default Token (`GenerateKey` + `token.Insert` when `constant.GenerateDefaultToken`) → `setupLogin(&insertedUser, c)`. Default Token generation or insert failure returns a register error **before** `setupLogin`. `setupLogin`/session save failure does **not** roll back the already-created user (or default Token).

**Frozen server-side `signup_completed` semantics for password register (v1):**

> `signup_completed` is recorded when durable account provisioning has succeeded and the handler is about to establish the login session — i.e. after Insert + `insertedUser` load + (if enabled) default Token success, and **immediately before** `setupLogin`. It is **not** defined as “session cookie already persisted,” and it is **not** allowed immediately after `User.Insert` alone.

**Exact call site (only allowed placement):**

```text
// REQUIRED order inside controller.Register — do not reorder:
// 1) cleanUser.Insert success
// 2) insertedUser query success
// 3) if GenerateDefaultToken:
//      GenerateKey success AND token.Insert success
//      (any failure → ApiError return; MUST NOT bind)
// 4) BindTouchToUser  ← HERE ONLY, immediately before setupLogin
// 5) setupLogin(&insertedUser, c)
_ = acquisition.BindTouchToUser(c, insertedUser.Id)
setupLogin(&insertedUser, c)
```

Hard rules:

1. **Do not** call `BindTouchToUser` immediately after `User.Insert` / before default Token work when `GenerateDefaultToken=true`.
2. If `GenerateDefaultToken=true` and default Token key generation **or** `token.Insert` fails and Register returns error → **must not** bind touch; **must not** write `signup_completed_at`.
3. If `GenerateDefaultToken=false` → after Insert + `insertedUser` load success, bind **immediately before** `setupLogin` (no Token step).
4. If default Token path runs and succeeds → bind **once**, still **immediately before** `setupLogin`.
5. Cookie missing/invalid still soft-fails inside `BindTouchToUser`; Register API success does not require a cookie.
6. Attribution errors inside bind remain soft-fail relative to Register HTTP success (existing soft-fail rule); the **ordering** constraint above is about when bind is *attempted*, not about failing the whole register on attribution DB errors.

### 9.3 OAuth (unified path)

In `findOrCreateOAuthUser`:

- When provider id already taken → return existing user **without** bind.
- When new user created (both generic and built-in branches after InsertWithTx + Finalize) → `BindTouchToUser(c, user.Id)`.

### 9.4 Legacy OAuth controllers

`controller/github.go`, `discord.go`, `oidc.go` (and any parallel LinuxDO/WeChat/Telegram paths that still insert users directly): on **new user Insert success only**, call the same bind helper. On existing user fill/login, skip.

### 9.5 Admin-created users

`CreateUser` admin API: **no** acquisition bind (not a marketing signup).

---

## 10. Frontend design

### 10.1 Shared behavior (Default + Classic parity)

| Concern | Default | Classic |
|---------|---------|---------|
| Module | `web/default/src/lib/acquisition.ts` | `web/classic/src/helpers/acquisition.js` |
| Tests | `acquisition.test.ts` | `acquisition.test.js` |
| Boot capture (`landing_view`) | Root layout / app init once per full page load; **must include register/sign-up routes and marketing landings** | Same |
| Password signup_started | Existing point in `sign-up-form.tsx` plus first-party POST (no create) | Existing point in `RegisterForm.jsx` plus first-party POST (no create) |
| OAuth signup_started | OAuth provider click handlers (no create) | `onGitHubOAuthClicked` / Discord / OIDC / LinuxDO / custom wrappers (no create) |
| Umami | Keep `trackEvent('signup_started'|'signup_completed')` | Same |
| User-visible copy | None added | None added |
| i18n | N/A | N/A |

### 10.2 Client helper responsibilities

1. `extractUtm(search: string): UtmFields` — allowlist only.
2. `extractLandingPath(): string` — `window.location.pathname` sanitized client-side (server re-validates).
3. `reportAcquisitionEvent(event, fields?)` — `fetch('/api/acquisition/touch', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body })`.
4. Never throws to callers; catch all network errors (same philosophy as `trackEvent`).
5. Does not read the HttpOnly cookie (cannot); relies on browser automatic cookie send.
6. Deduplicate in-tab double mount (React StrictMode): in-memory Promise lock per event type for the current page lifetime is enough; server idempotency is the real guarantee.
7. `landing_view` is the only client event that may carry UTM/path payload for creation. `signup_started` sends `{event:"signup_started"}` only.
8. If global capture fails, client still allows register/OAuth; missing attribution is acceptable; client must not invent a local-only funnel story.

### 10.3 Where global capture runs

- **Default:** a tiny effect in the public/app shell that mounts on all pages users can land on, including `/sign-up` and marketing routes.
- **Classic:** equivalent top-level `App` or layout `useEffect` once, including `/register`.

Landing-specific UTM passthrough helpers (`getKimiK3CtaDestination` etc.) **remain** so CTAs keep UTM in the next URL if the user navigates before cookie round-trip completes. They are complementary, not replaced. They do not bypass first landing snapshot freeze once a touch exists.

### 10.4 Build / lint

Implementation phase must pass:

- `web/default`: `npm run lint`, `npm run typecheck`, `npm run build`
- `web/classic`: lint + build per project scripts (`npm install --legacy-peer-deps` rules unchanged)

---

## 11. Privacy and security

### 11.1 Data minimization

Stored: touch id, optional user id (internal integer), five UTM dims, landing path, three timestamps.
Not stored: IP, email, username, display name, OAuth subject, token keys, cookie raw header, prompts, request bodies, payment ids, full referrer, full URL.

### 11.2 Security controls

| Control | Detail |
|---------|--------|
| Cookie HttpOnly | Blocks JS exfiltration of touch_id |
| HMAC signature | Blocks forged touch_ids without CryptoSecret |
| No touch_id in JSON | Reduces accidental logging in frontend error beacons |
| Public rate limit | `CriticalRateLimit` default 20/20min/IP |
| Admin auth | `AdminAuth` role gate |
| Soft-fail bind | Cannot DoS registration by breaking attribution DB |
| signup_started no-create | Cannot inflate landing_view via register spam without prior landing_view |
| Input allowlist | Limits poison/log injection via UTM |
| Path allowlist shape | Blocks storing external URLs |
| Aggregate admin API | No per-user dump in v1 |
| Secrets | Use existing `CryptoSecret`; never log secrets or full cookies |

### 11.3 Abuse cases and handling

| Abuse | Handling |
|-------|----------|
| Flood landing_view | Rate limit; many touches possible but costly to attacker; no PII growth |
| Flood signup_started without cookie | Soft no-op; no rows; no landing inflation |
| Bind fixation (attacker sets cookie then victim registers) | Same class as session fixation lite: attacker learns victim converted under attacker’s UTM. Mitigations: HttpOnly+HTTPS; Lax blocks most cross-site set; accept residual risk for v1 analytics (not authz). Do not elevate touch to session auth |
| Victim registers with attacker UTM in URL | Inherent to first-touch ads; acceptable |
| Replay signup_started | Idempotent |
| Client sends signup_completed | Rejected |
| Admin enum users via funnel | Aggregate only; no ids returned |

### 11.4 Compliance notes

- Purpose: first-party product analytics for acquisition experiments.
- Retention: v1 keeps rows indefinitely; future ops task may add TTL — **out of scope**, not a blocker; document as follow-up outside this design freeze.
- No change to Umami/GA privacy posture beyond existing production-host gating.

---

## 12. Exception and idempotency matrix

| Scenario | Result |
|----------|--------|
| First landing with UTM | Create touch; set cookie; store first landing snapshot including UTM |
| First landing without UTM | Create touch; empty UTM snapshot = direct/unknown; store landing_path |
| Second landing different UTM same cookie | Keep original snapshot; no overwrite |
| Landing no cookie | New touch (new first landing snapshot) |
| Invalid cookie sig on landing_view | New touch + new cookie |
| signup_started with valid existing touch | Set `signup_started_at` once |
| signup_started without valid cookie/touch | Soft success / safe no-op; **no row created**; not counted as landing_view |
| Double signup_started | No timestamp change |
| Password register: Insert + insertedUser OK, GenerateDefaultToken=false, cookie valid | Bind once immediately before setupLogin |
| Password register: Insert + insertedUser + default Token generate+insert all OK, cookie valid | Bind once immediately before setupLogin |
| Password register: default Token generate or insert fails (Register returns error) | **No bind**; no `signup_completed_at`; touch stays unbound |
| Password register: bind attempted only after durable provisioning; never immediately after User.Insert alone | Enforced by §9.2 call-site order |
| Password register without cookie (provisioning OK) | User (+ optional default Token) created; no touch bind; registration unaffected |
| Password register: setupLogin/session fails after bind attempt | User/Token rows remain (no rollback today); touch may already be bound — accepted v1 semantics (signup_completed = durable provisioning done, about to establish session) |
| OAuth new user with cookie | Bind once |
| OAuth existing user with cookie | No bind; no signup_completed |
| OAuth bind account (logged-in link) | No acquisition signup_completed |
| User already bound, new cookie present | Do not move user_id; leave new touch unbound |
| Token created at register (default token) | Counted in api_key_created via Unscoped earliest created_time |
| User deletes all tokens later | Historical api_key_created still counts (Unscoped) |
| Consume log disabled | Funnel returns null + `consume_logs: unavailable` |
| Token query error | `api_key_created: null` + `tokens: error`; touches still returned |
| Touches query error | Whole funnel API error; no partial success body |
| LOG_DB != DB | Separate Go queries; no JOIN |
| DB unique race on bind | Catch duplicate; treat as success if same user |
| Same from/to re-query after late conversion | Unchanged metrics (milestones require timestamp `< to`) |

---

## 13. Data completeness (summary)

| Field | Values |
|-------|--------|
| `data_completeness.touches` | `complete` only on success payload (failure aborts entire API) |
| `data_completeness.tokens` | `complete` \| `error` |
| `data_completeness.consume_logs` | `complete` \| `unavailable` \| `error` |
| `consume_logs_enabled` | mirror `common.LogConsumeEnabled` at request time |
| `historical_backfill_available` | always `false` |
| `coverage_started_at` | fixed int64 from options CAS after Option + AcquisitionTouch ready, all migration errors checked, CAS outside migration goroutines; never overwrite |

When `from < coverage_started_at`, still run the query (with window rules unchanged) and set `from_before_coverage: true` so operators notice incomplete early history. API does not silently shift `from`.

---

## 14. Testing strategy

### 14.1 Unit tests (Go)

| Case | Assertion |
|------|-----------|
| UTM sanitize | drops bad chars, truncates, allowlist keys only |
| landing_path sanitize | rejects `//evil`, schemes, strips query |
| First landing snapshot freeze | second landing with new UTM ignored; empty-then-UTM does not fill |
| Cookie sign/verify | valid passes; tampered fails; wrong secret fails |
| landing_view creates row | only creator path |
| signup_started with valid touch | sets timestamp once |
| signup_started without cookie | no-op; zero new rows; not counted in landing_view |
| Bind password path — GenerateDefaultToken=false | after Insert + insertedUser OK, bind once immediately before setupLogin; user_id + signup_completed_at set |
| Bind password path — default Token success after | after Insert + insertedUser + default Token generate+insert all OK, bind once immediately before setupLogin |
| Bind password path — default Token failure does not bind | GenerateKey failure or token.Insert failure returns Register error; touch unbound; signup_completed_at remains null |
| Bind password path — never immediately after User.Insert alone | static/order test or controller test proves no bind between Insert and default Token block when GenerateDefaultToken=true |
| Bind OAuth new user | counted |
| OAuth existing user | not bound / not double counted |
| Repeat bind | idempotent |
| Public signup_completed | rejected |
| Funnel window stability | conversion at `t >= to` excluded even if touch in cohort |
| signup_started_at / signup_completed_at `< to` filters | enforced |
| Funnel rates | denominator 0 → Go `nil` pointer → JSON null |
| Funnel model filter | exact model id; `created_at < to` and `>= signup_completed_at` |
| Token first created Unscoped | includes soft-deleted token; deleting tokens does not drop historical count; min created_time; `created_time < to` |
| Auto initial token | counted when created_time exists |
| Logs unavailable | null metrics + completeness unavailable |
| Logs query error | null + error flag |
| Tokens query error | api_key_created null + tokens error; success body still has touch counts |
| Touches query error | entire API error |
| Admin auth | non-admin denied |
| Rate limit wiring | middleware present on route (router test) |
| Nullable user_id unique | many NULLs ok; duplicate non-NULL rejected (SQLite tests required; MySQL >= 5.7.8 and PG >= 9.6 documented/verified in implementation evidence) |
| migrate registration | both migrateDB and migrateDBFast lists include AcquisitionTouch (code review / static test) |
| migrateDB coverage order | full serial AutoMigrate (Option table ready + AcquisitionTouch ready) succeeds, then CAS; AutoMigrate failure skips CAS; CAS failure returns error |
| migrateDBFast coverage order | AcquisitionTouch in migrations slice; CAS outside migration goroutines; after wg.Wait; all migration errors checked; only then CAS when Option table ready and AcquisitionTouch ready |
| migrateDBFast parallel failure | any parallel migration error ⇒ marker not written; migrate returns error |
| coverage CAS failure returns error | insert-if-absent helper error (non–already-exists) fails migrateDB / migrateDBFast |
| coverage never overwrite | restart or concurrent init: existing coverage_started_at kept; already-exists treated success; original value retained |
| coverage dialect parity | insert-if-absent / unique-key semantics consistent for SQLite, MySQL >= 5.7.8, PostgreSQL >= 9.6 |
| fresh DB fast migration marker | on empty DB, marker written only after Option and AcquisitionTouch migrations have both completed successfully post-barrier |

### 14.2 Frontend tests

| Case | Default | Classic |
|------|---------|---------|
| extractUtm | yes | yes |
| reportAcquisitionEvent no-throw | yes | yes |
| landing_view vs signup_started payloads | yes | yes |
| parity of event names and payload keys | shared fixture expectations | same |

### 14.3 Integration / manual local

- Docker local app: create touch via curl without Secure requirement on HTTP.
- Register test user with cookie when GenerateDefaultToken path succeeds; verify DB row bound (local DB only) and bind occurred as durable provisioning success immediately before setupLogin.
- With GenerateDefaultToken forced failure in a unit/integration harness: default Token failure does not bind.
- With GenerateDefaultToken=false: bind still occurs immediately before setupLogin after Insert + insertedUser success.
- signup_started without cookie creates no row.
- Soft-delete token still counts in funnel Unscoped path (fixture).
- Admin funnel with admin session cookie; freeze `to` and confirm late events excluded.
- Fresh DB / restart: coverage_started_at written once; never overwrite on second boot.
- **No** real model inference; token/log rows inserted via test fixtures or SQL in tests.

### 14.4 Quality gates (implementation phase)

- `go test` for touched packages
- `go vet ./...` (or package scope used by project)
- Frontend lint/typecheck/build both themes
- `docker compose build vancine && docker compose up -d` + `/api/status`
- Secret scan on changed files per task brief template
- No paid upstream calls
- Design-doc format check for untracked files uses `git diff --no-index --check /dev/null <file>` (ordinary `git diff --check` ignores untracked files)

### 14.5 Out of scope for tests

- Live Umami delivery
- Production OAuth provider calls (mock OAuth bind unit-wise)

---

## 15. Phased implementation plan

Implementation is a **later** Claude Code task after this design file is accepted. Suggested phases:

### Phase 0 — Design freeze (this task / REWORK-1 + REWORK-2)

- Only this document may change.
- No business code, no commit, no deploy.

### Phase 1 — Backend core

1. Model + sanitize + cookie helpers.
2. Dual migrate registration:
   - `migrateDB`: after full serial AutoMigrate success (Option table ready + AcquisitionTouch ready), run coverage CAS; CAS failure returns error; never overwrite.
   - `migrateDBFast`: add AcquisitionTouch to migrations slice; **CAS outside migration goroutines**; after `wg.Wait`, close/drain errChan so **all migration errors checked**; only then CAS; any migration failure skips CAS; CAS failure returns error.
3. Public touch endpoint + rate limit (`landing_view` create; `signup_started` no-create).
4. Bind helper + wire password Register **only** at frozen point (default Token success after / GenerateDefaultToken=false path; immediately before setupLogin; default Token failure does not bind) + OAuth new-user paths.
5. Go unit tests: Unscoped token milestone, window stability, password bind ordering, migrateDBFast barrier/CAS ordering, never overwrite marker.

### Phase 2 — Admin funnel

1. Funnel query service with split DB access and `[from,to)` milestone filters.
2. Completeness + null rates + touches-fatal error semantics.
3. Admin route + tests.

### Phase 3 — Frontend parity

1. Default `acquisition.ts` + global capture on marketing **and** register routes + signup/OAuth hooks.
2. Classic mirror.
3. Keep Umami events.
4. Lint/typecheck/build.

### Phase 4 — Local verification

1. Docker build/up.
2. Curl funnel with admin.
3. Devlog entry + evidence for release approval.
4. Stop before commit/push/deploy unless 范总 approves each step separately.

### Phase 5 — Production enablement (separate approvals)

1. Deploy code.
2. Confirm `coverage_started_at` fixed once.
3. Use admin API for 24h/72h SOP reports.
4. No dashboard required.

---

## 16. Acceptance criteria

Design phase acceptance (this rework):

1. Only file present as change: `docs/superpowers/specs/2026-07-28-acquisition-first-touch-attribution-design.md`.
2. No business code modified.
3. No unresolved placeholder markers remain in the document body.
4. `git diff --no-index --check /dev/null` on this file produces no whitespace diagnostics (nonzero exit only from file ≠ `/dev/null` is acceptable).
5. REWORK-1 rules remain explicit; REWORK-2 freezes password bind ordering and migrateDBFast CAS barrier ordering with no residual ambiguity phrases.
6. Baseline SHA recorded; working tree otherwise untouched.

Implementation phase acceptance (future task — listed here as the design’s exit criteria for build):

1. First landing snapshot immutable under tests (including empty-UTM then later UTM).
2. Cookie signed HttpOnly Lax; Secure conditional.
3. Password + OAuth new user bind; existing OAuth not counted as new signup.
4. Password Register bind only after durable provisioning: Insert + insertedUser success; if GenerateDefaultToken=true then default Token success after; call **immediately before setupLogin**; **default Token failure does not bind**.
5. Idempotent public milestones; signup_started without touch creates no row.
6. Funnel API matches §8 field list including null rates, completeness, and stable `[from,to)` filters (`first_seen_at`, `signup_started_at < to`, `signup_completed_at < to`, token `created_time < to`, log `created_at < to`).
7. `api_key_created` uses Unscoped earliest token and does not drop after soft-delete.
8. Tokens and logs queried without cross-DB JOIN.
9. Touches query failure fails the whole funnel API; token/log failures null out only their metrics.
10. Default/Classic parity; global capture covers register routes.
11. Umami events preserved.
12. i18n N/A documented in PR/evidence.
13. go test / vet / frontend build / docker local green.
14. No real paid model calls in tests.
15. Protected identifiers untouched.
16. `historical_backfill_available === false`.
17. `AcquisitionTouch` registered in both `migrateDB` and `migrateDBFast`.
18. Coverage CAS: Option table ready + AcquisitionTouch ready; migrateDBFast waits `wg.Wait`, all migration errors checked, CAS outside migration goroutines; CAS failure returns error; never overwrite existing marker; SQLite / MySQL >= 5.7.8 / PostgreSQL >= 9.6 semantics aligned.

---

## 17. Risks and rollback

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cookie blocked by aggressive privacy browser | Med | Lost bind for some users | Still have Umami; path-only/direct touches; accept under-count; no fake rows |
| Global capture fails on register page | Med | Missing attribution | Allowed; signup still works; no empty-touch inflation |
| CryptoSecret rotation drops bind rate | Low | Temporary | Ops note; dual-key later if needed |
| Attribution bug blocks signup | Low | High | Soft-fail bind; never return error to register from attribution |
| Inflated landing_view via bot traffic | Med | Noisy ratios | Rate limit; later bot filter out of scope |
| LOG_DB lag/disable misread as 0 conversions | Med | Bad stop/go | completeness + null metrics |
| Nullable unique dialect drift | Med | Double bind edge | App-level guard + tests; target SQLite / MySQL >= 5.7.8 / PG >= 9.6 only |
| OAuth legacy vs unified path miss | Med | Missing binds | Explicit wire list + tests per controller entry |
| Fixation-style UTM theft | Low | Skewed channel credit | Accepted analytics residual risk |
| Operators forget dual migrate path | Med | Missing table on fast migrate | Design + implementation checklist + static test |
| CAS inside migrateDBFast goroutine before Option ready | Med | options write race / missing table | Forbidden by §5.4.2; CAS only after wg.Wait + all migration errors checked |
| Bind before default Token success | Med | signup_completed without durable Token when GenerateDefaultToken=true | Frozen §9.2 order; default Token failure does not bind tests |
| CAS overwrite on restart | Low | Moves coverage window | insert-if-absent only; already-exists = success keep original; never overwrite |
| CAS failure ignored after migrate | Med | Silent missing coverage_started_at | CAS failure returns error from migrateDB / migrateDBFast |

**Rollback:**

1. Feature is additive. Emergency: stop routing public/admin acquisition endpoints (comment routes) and remove frontend helper imports in a hotfix.
2. Table may remain empty-safe; dropping table is optional and requires separate approval (data loss).
3. No migration down required for safety; unused table is harmless.
4. Cookies may linger 180d; without server routes they are ignored.
5. `coverage_started_at` option may remain; harmless if endpoints disabled.

---

## 18. File touch list (implementation phase only)

Predicted paths (not modified in design phase):

```text
model/acquisition_touch.go
model/acquisition_touch_test.go
model/main.go                          # migrateDB + migrateDBFast; CAS after barriers per §5.4–5.5
controller/acquisition.go
controller/acquisition_test.go
controller/user.go                     # BindTouchToUser immediately before setupLogin only
controller/oauth.go                    # new-user bind
controller/github.go                   # legacy new-user bind if still live
controller/discord.go
controller/oidc.go
# other OAuth insert controllers as needed for parity
service/acquisition/                   # optional package split
router/api-router.go
web/default/src/lib/acquisition.ts
web/default/src/lib/acquisition.test.ts
web/default/src/features/auth/...      # hooks
web/classic/src/helpers/acquisition.js
web/classic/src/helpers/acquisition.test.js
web/classic/src/components/auth/RegisterForm.jsx
web/classic/src/helpers/api.js         # OAuth click wrappers if centralized
docs/devlog/YYYY-MM.md                 # after implementation
```

**Must not touch:** `AGENTS.md` protected identity strings, `VERSION`/`CHANGELOG` until release approval, production secrets, Umami env, Dockerfile/compose unless separately approved.

---

## 19. Relation to SOP thresholds

Admin funnel output maps directly to SOP §10:

| SOP field | API field |
|-----------|-----------|
| UTM `landing_view` | `landing_view` filtered by campaign/source |
| `signup_completed` | `signup_completed` (with `signup_completed_at < to`) |
| `first_api_call_succeeded(model)` | `first_api_call_succeeded` with `model` query and `created_at < to` |
| rates with empty sample | JSON `null` + raw counts as numerator/denominator |

24h/72h automation can curl the admin API with an admin session or token as ops tooling; building that reporter is outside this design.

---

## 20. Explicit exclusions checklist

- [x] No dashboard UI
- [x] No last-touch
- [x] No PII columns in `acquisition_touches`
- [x] No production API calls in design/implementation tests
- [x] No production config mutation in design phase
- [x] No models.dev
- [x] No k3-256k onboarding
- [x] No unreliable historical backfill
- [x] No cross-database SQL JOIN
- [x] No replacement of Umami/GA
- [x] No user-visible i18n strings in v1
- [x] No signup_started-created empty touches
- [x] No post-create UTM backfill into an existing first landing snapshot

---

## 21. Summary decision record

Vancine will implement **first-touch acquisition attribution** using an **independent `acquisition_touches` table** registered in **both `migrateDB` and `migrateDBFast`**, a **signed HttpOnly `vancine_ft` cookie carrying only `touch_id`**, **first landing snapshot freeze** (empty UTM allowed as direct/unknown; never overwritten), **public create only via `landing_view`**, **`signup_started` as no-create idempotent milestone or safe no-op**, **server-side bind on new password/OAuth users only** with password `signup_completed` frozen as durable account provisioning success **immediately before setupLogin** (default Token success after when enabled; **default Token failure does not bind**), and an **admin-only `GET /api/acquisition/funnel`** with **stable `[from, to)` snapshot semantics**, **Unscoped irreversible `api_key_created`**, honest **data completeness / JSON nulls**, and **`coverage_started_at` compare-and-set only after Option table ready + AcquisitionTouch ready**, with **migrateDBFast CAS outside migration goroutines after `wg.Wait` and all migration errors checked**, **CAS failure returns error**, and **never overwrite**. Default and Classic frontends stay at parity with global capture on marketing and register routes; Umami events remain; no backfill; SQLite + MySQL >= 5.7.8 + PostgreSQL >= 9.6 only.

This document freezes the design (including REWORK-1 and REWORK-2 corrections) for subsequent implementation tasks under separate 范总 approvals for code execution, commit, push, and deploy.

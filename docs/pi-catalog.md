# Vancine Pi catalog

`GET /api/pi/catalog` is the live model list for the Vancine Pi provider.
It covers every currently enabled, token-billed OpenAI Chat Completions
model that has verified Pi metadata. The original four models are an
initial validation set, not a catalog cap.

The npm package `pi-provider-vancine` must not maintain a realtime model
inventory. After install, Pi loads `/model` from this endpoint. Model
listing, delisting, and base USD/1M token price changes are picked up on
the next catalog refresh. They do not require a new npm release.

## Contract

- Public JSON. No login, cookie, or API key.
- Top-level Pi catalog schema (`provider`, `schemaVersion`, `generatedAt`,
  `models`). Not the dashboard `{success, data}` envelope.
- `provider` is always `vancine`. `schemaVersion` is always `1`.
- Models are sorted by `id`.
- Conditional requests: `ETag` / `If-None-Match` and `Last-Modified` /
  `If-Modified-Since`. Matching requests return `304` with an empty body.
  `If-None-Match` wins over `If-Modified-Since`.
- `Cache-Control: public, max-age=60, must-revalidate`.
- `generatedAt` and `ETag` change only when the normalized model list
  changes.

## Live data versus registry

Two layers:

1. **Realtime status and price** come from current platform pricing
   (`model.GetPricing()`), including enabled abilities. Token USD/1M
   prices have two sources:

   **Legacy ratio** (`billing_mode` is not `tiered_expr`):

   - `input = model_ratio * 2`
   - `output = input * completion_ratio`
   - `cacheRead = input * cache_ratio`, or `0` when absent
   - `cacheWrite = input * create_cache_ratio`, or `0` when absent

   **Standard single-tier token expression** (`billing_mode=tiered_expr`)
   that maps losslessly onto Pi's four static prices. The only accepted
   shape is one `tier("base", <sum>)` whose sum multiplies each of `p`,
   `c`, and optionally `cr` / `cc` by a non-negative numeric literal at
   most once, with `p` and `c` required:

   - `p` → `input`
   - `c` → `output`
   - `cr` → `cacheRead` when present. If `cr` is omitted, cache-read
     tokens stay inside `p`, so `cacheRead` falls back to `input`.
   - `cc` → `cacheWrite` when present. If `cc` is omitted, cache-write
     tokens stay inside `p`, so `cacheWrite` falls back to `input`.
   - `cc1h` cannot map onto Pi's single `cacheWrite` field and is
     excluded.

   Coefficients are copied from the expression literals. They are not
   recomputed from ratios. Example:
   `tier("base", p * 0.12 + c * 0.4 + cr * 0.024)` publishes
   `input=0.12`, `output=0.4`, `cacheRead=0.024`, `cacheWrite=0.12`.

   User-group multipliers, recharge discounts, and display-currency
   conversion are not applied.

2. **Stable Pi metadata** lives in `service/pi_catalog_registry.go`.
   That file is the only source for display name, kind, api, endpoint,
   input modalities, reasoning, contextWindow, and maxTokens.

A model appears in the catalog only when all of the following hold:

- It is currently enabled and has available platform ability (present in
  `GetPricing()`).
- The registry provides verified Pi static metadata: `kind=chat`,
  `api=openai-completions`, `endpoint=chat.completions`, text input,
  contextWindow, maxTokens, and reasoning. Registry api/endpoint is
  necessary but not sufficient.
- Live `GetPricing()` `supported_endpoint_types` contains `openai`
  (`constant.EndpointTypeOpenAI`, `/v1/chat/completions`). An empty
  list, or only Responses / embeddings / rerank / image / video / other
  non-chat endpoints, omits the model (`no live chat completions endpoint`).
- Token prices convert to finite USD/1M values (`>= 0`).

Otherwise the model is omitted. Missing contextWindow, maxTokens,
modalities, or reasoning must never be guessed. Capability is never
inferred from model id, name, or marketing copy.

`supported_endpoint_types` containing `openai` is not by itself proof of
Pi chat; the registry must also declare chat completions metadata.
TTS, video, image generation, embeddings, rerank, async task, and
per-request prices are excluded. Complex expression prices are also
excluded when they cannot map losslessly onto Pi's four static token
prices: multiple tiers, `len` conditions, request probes (`header`,
`param`, `u`), media/task variables (`img`, `img_cr`, `img_o`, `ai`,
`ao`, `cc1h`, `image_count`), `fixed()` per-request leaves, and any
illegal or otherwise non-standard expression.

## Adding a model

1. Confirm the model is listed, enabled, token-billed, and advertised with
   live `openai` Chat Completions (`/v1/chat/completions`) in `GetPricing()`.
2. Confirm Chat Completions use, with verified contextWindow, maxTokens,
   input modalities, and reasoning. Do not copy unverified marketing copy.
3. Add a `PiModelMeta` row to the registry. Keep prices out of the
   registry.
4. `supportsDeveloperRole` stays `false`. Set
   `supportsReasoningEffort` only from a verified Chat Completions fact.

## Current coverage

The published catalog is the intersection of live `GetPricing()` and the
verified registry. New listings and price changes appear on the next
refresh. A brand-new model ID still needs trusted Pi metadata
(contextWindow, maxTokens, modalities, reasoning) before it can appear.

- Registry: verified Chat Completions metadata for current live candidates
  plus the original validation set (`hy4-preview`, `glm-5.3-flash`,
  `qwen3.8-flash`). Those are not a maximum; they are omitted when they are
  not live. Retired Pi catalog IDs are no longer in the registry, so they
  stay out of the Pi catalog even while platform pricing still lists them:
  `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp`,
  and `deepseek-flash`. Their removal is scoped to this Pi agent provider
  catalog; it does not mean the IDs were deleted from the platform, its
  pricing list, or the routing layer.
  The current Vancine Pi catalog ID is `deepseek-v4.1-flash` (display name
  `DeepSeek V4.1 Flash`). `deepseek-flash` is a retired former ID and is
  not a current alias.
- Runtime output is every registry model that is currently enabled,
  token-priced, and advertised with a live OpenAI Chat Completions
  endpoint. Media, per-request, task, fixed, multi-tier, request-
  conditional, and other non-lossless expression rows are omitted.
  Platform models do not enter Pi unconditionally.

The provider refreshes on startup and on its catalog interval using
`ETag` / `Last-Modified`. A `304` keeps the last successful cache.

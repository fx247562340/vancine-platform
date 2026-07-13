# Zero-Budget Seedance Developer Acquisition Design

## Status

Approved in conversation on 2026-07-13. The owner has also confirmed that a fresh user can complete the `$1` Seedance activation path, so that gate will not be repeated. This document replaces social-post-only acquisition as the primary first-customer strategy. The earlier campaign remains historical evidence and is not deleted.

## Objective

Acquire Vancine's first qualified overseas developers without paid advertising by helping developers complete a real Seedance API integration faster than they could from a general product landing page.

The first implementation cycle should prove one complete path:

```text
High-intent Seedance search or developer resource
-> Vancine Seedance page
-> registration with $1 credit and no card
-> API key creation
-> first successful Seedance request
-> checkout intent
```

The strategy is successful only when it produces successful API requests, not merely page views or GitHub stars.

## Current Constraints

- Advertising budget is `$0`.
- The market is overseas; English is the primary acquisition language and Chinese remains available for site consistency.
- The current X, Reddit, and GitHub accounts do not have established distribution.
- Reddit promotional content has already been filtered, and the first X launch post received no meaningful exposure.
- New accounts receive a fixed `$1` credit and do not require a credit card.
- Production uses the Classic frontend. Default and Classic must expose equivalent public content, links, analytics semantics, and language behavior.
- `fx247562340/vancine-platform` is a public fork of `QuantumNous/new-api`. Its fork relationship and protected upstream references must remain unchanged.
- No mass posting, unsolicited direct messages, engagement manipulation, fabricated social proof, or unverified product claims are allowed.

## Strategic Decision

Use an asset-led, high-intent acquisition system centered on Seedance rather than waiting for followers or repeatedly publishing broad product announcements.

The system has three distinct jobs:

1. The Vancine website captures search intent and converts visitors.
2. A standalone, non-fork GitHub repository proves that the integration is usable and hosts importable developer assets.
3. Existing discovery platforms distribute those assets to developers who are already looking for Seedance API help.

GitHub is not expected to generate traffic from followers. It is a code host and trust layer reached from the website, Postman, n8n, search results, and relevant resource directories.

## Why This Approach

### Selected: Seedance developer resource wedge

Advantages:

- Matches existing demand around API access, async video workflows, pricing, and automation.
- Gives developers a useful result before asking them to trust an unfamiliar platform.
- Produces assets that can be indexed and reused across the website, GitHub, Postman, and n8n.
- Can be copied to Seedream, Qwen Image, and Doubao TTS only after the first funnel works.

Trade-off:

- It requires accurate examples, importable assets, and a verified first-use experience before distribution.

### Rejected as the primary path: social-only launch

This is fast to publish but depends on account authority and algorithmic distribution that Vancine does not currently have. Social remains a supporting channel for useful technical replies, not the acquisition foundation.

### Deferred: broad SEO library

Publishing many model pages may compound over time, but it is slower to validate and risks thin or inaccurate content. The first cycle focuses on one strong Seedance page and one complete integration package.

## Phase 0: Activation Readiness Gate (Satisfied)

The owner confirmed on 2026-07-13 that the fresh-user journey has already been verified and works with the fixed `$1` credit. Do not create another account or consume more credit merely to repeat this gate.

The completed verification covered:

1. Registration works without a payment card.
2. The account visibly receives the promised `$1` credit.
3. The user can create or locate an API key without administrator assistance.
4. The user can submit a documented Seedance request.
5. The async task can be polled to a terminal state.
6. At least one successful Seedance generation can be completed within the signup credit.
7. Usage and remaining balance are understandable after the request.
8. The top-up path is reachable and emits `checkout_started` only after a valid payment destination is returned.

Implementation still has to validate that every published endpoint, model identifier, request field, response field, and polling state matches the current application contract. Do not publish a measured price, latency, or output-specific claim unless that exact value is separately evidenced during developer-asset verification. Do not record or commit real API keys, user credentials, payment details, or personal data.

## Website Acquisition Page

### Route and purpose

Add a focused public page at:

```text
https://vancine.com/seedance-api
```

The existing `/ai-media-api` page remains the broad multimedia product overview. `/seedance-api` answers one high-intent question: how a developer can make a working Seedance API request through Vancine.

The route must exist in both Classic and Default. English is the default language; Simplified Chinese is supported in the same manner as the existing bilingual AI Media API page. No locale-prefixed routes are introduced in this cycle.

### Required content

The page contains:

1. A direct Seedance API value proposition.
2. The verified `$1` signup-credit offer and no-card requirement.
3. A real Seedance output generated during Phase 0 and owned or licensed for public marketing use; no fabricated demo.
4. A concise explanation of text-to-video, image-to-video, supported parameters, async submission, polling, and terminal states based on the live implementation.
5. Copyable cURL, Python, and Node.js examples.
6. Links to the Postman collection, n8n workflow, complete GitHub starter repository, pricing, and authoritative documentation.
7. Common errors and model-specific limitations.
8. A primary registration/start CTA and a final CTA after the technical proof.

### Claims policy

Allowed after verification:

- Vancine provides access to supported Seedance workflows through its documented API.
- New accounts receive `$1` in credit and no card is required to register.
- The exact request, polling flow, and measured test result from Phase 0.
- Public pricing and documentation are available.

Forbidden:

- Cheapest, official partner, unrestricted, unlimited, guaranteed uptime, worldwide availability, safety-filter bypass, or guaranteed output claims.
- Unverified latency or price comparisons.
- Claims that `$1` completes a generation unless Phase 0 proves it with the published example.
- Fabricated customer counts, testimonials, logos, benchmarks, or output.

## Standalone GitHub Starter Repository

Create a new public, non-fork repository under the current GitHub account:

```text
fx247562340/vancine-seedance-starter
```

This repository is separate from `vancine-platform`. Do not detach, rename, rewrite, or remove the existing platform repository's fork relationship or protected upstream attribution.

The starter repository contains only developer-facing integration assets:

```text
README.md
.env.example
examples/
  curl/
  node/
  python/
postman/
  Vancine-Seedance.postman_collection.json
n8n/
  vancine-seedance-workflow.json
LICENSE
```

Requirements:

- Every example uses environment variables or obvious placeholders for secrets.
- No real API key, credential, account ID, payment data, or private endpoint is committed.
- cURL, Python, and Node.js demonstrate the same submit-and-poll lifecycle.
- The Postman collection imports cleanly and exposes base URL, API key, model, and task ID as variables.
- The n8n workflow imports cleanly, uses standard HTTP Request nodes, and does not require a custom Vancine node.
- All endpoints, model identifiers, parameters, terminal states, and error examples are copied from verified production behavior or authoritative project documentation.
- README links back to the Vancine Seedance page using the approved GitHub UTM URL.

Creating the external repository and publishing its first commit are representational external actions. Prepare and verify the files locally first, then obtain final confirmation immediately before creating or publishing the public GitHub repository.

## Discovery and Distribution

Distribution starts only after the website page and starter assets pass verification.

### Priority 1: Postman

Publish the verified collection to a public Vancine workspace so developers can discover and run the API without assembling requests manually.

Website destination:

```text
https://vancine.com/seedance-api?utm_source=postman&utm_medium=api_network&utm_campaign=seedance_starter_kit&utm_content=collection
```

### Priority 2: Existing Seedance resource repositories

Submit a transparent, narrowly scoped pull request to relevant maintained Seedance resource lists only when their contribution rules permit developer tools. The contribution must describe Vancine accurately and disclose that it is the project's own submission.

Website destination:

```text
https://vancine.com/seedance-api?utm_source=github&utm_medium=developer_resource&utm_campaign=seedance_starter_kit&utm_content=directory
```

Do not mass-submit, open duplicate pull requests, or pressure maintainers.

### Priority 3: n8n workflow discovery

Publish or submit the verified workflow where n8n users look for templates, subject to the platform's current contribution requirements.

Website destination:

```text
https://vancine.com/seedance-api?utm_source=n8n&utm_medium=workflow_template&utm_campaign=seedance_starter_kit&utm_content=workflow
```

### Supporting channels

- Use X only for specific technical replies where the resource directly answers the question. Answer first; link only when relevant.
- Do not resume Reddit promotion during the new-account cooldown period. Later participation must be helpful without depending on promotional links.
- Product Hunt is a later launch amplifier after the onboarding path is proven.
- Hacker News, paid ads, cold-email automation, and broad directory blasting are out of scope for the first cycle.

Every external post, pull request, template submission, or public workspace publication requires final confirmation immediately before publication.

## Analytics

Keep Umami privacy behavior unchanged, including Do Not Track handling and no user identity tracking.

Reuse the established acquisition events where their semantics match:

- `get_started_clicked` with `location: seedance_hero` or `location: seedance_final_cta`.
- `signup_started`.
- `signup_completed`.
- `playground_request_started`.
- `playground_request_succeeded`.
- `checkout_started`.

Add one resource-link event consistently in both themes: `developer_resource_clicked`, with a bounded `resource` value of `github`, `postman`, `n8n`, or `docs`.

Use these outbound links:

```text
GitHub README:
https://vancine.com/seedance-api?utm_source=github&utm_medium=developer_resource&utm_campaign=seedance_starter_kit&utm_content=readme

Postman collection:
https://vancine.com/seedance-api?utm_source=postman&utm_medium=api_network&utm_campaign=seedance_starter_kit&utm_content=collection

n8n workflow:
https://vancine.com/seedance-api?utm_source=n8n&utm_medium=workflow_template&utm_campaign=seedance_starter_kit&utm_content=workflow

Direct technical reply on X:
https://vancine.com/seedance-api?utm_source=x&utm_medium=community&utm_campaign=seedance_starter_kit&utm_content=technical_reply
```

## Error Handling and Safety

- Examples must surface non-2xx responses and task failure states instead of looping indefinitely.
- Polling examples use a bounded interval and a maximum wait time.
- Examples distinguish submission errors, authentication errors, insufficient balance, task failure, and timeout.
- Logs must never print full API keys.
- Demo media must be owned by Vancine or licensed for public marketing use.
- Model limitations and safety requirements remain visible rather than being described as restrictions Vancine can bypass.
- External assets must not expose internal deployment details, administrative routes, private infrastructure, or provider credentials.

## Verification and Release Gates

### Activation verification

- Treat the owner's completed fresh-user `$1` Seedance journey as satisfying Phase 0; do not repeat it.
- Confirm all published request and response examples match the actual API.

### Website verification

- Add focused contract tests for route, metadata, CTA destinations, language parity, examples, UTM destinations, and analytics payloads.
- Run the relevant Default and Classic unit tests.
- Run lint and production builds for both themes, distinguishing new failures from unrelated pre-existing failures.
- Build and run the full local Docker application with `docker compose build vancine && docker compose up -d`.
- Have the user verify production-theme behavior at `http://127.0.0.1:3000` before any push or production deployment.

### Starter asset verification

- Scan the repository for secret-like values before publication.
- Run cURL, Python, and Node.js examples against the approved test account.
- Import and run the Postman collection.
- Import and run the n8n workflow.
- Verify every public link and UTM parameter.

### Publication gate

After local Docker and developer-asset verification, obtain user approval before:

- pushing the platform changes,
- creating or publishing the standalone GitHub repository,
- publishing the Postman workspace or collection,
- submitting the n8n workflow,
- opening external pull requests,
- publishing public posts or replies,
- deploying production.

## Success Metrics and Decision Rules

Evaluate the first seven days after distribution.

Targets:

- `30-50` qualified visits to `/seedance-api`.
- `5-10` completed registrations.
- `3-5` successful first API requests.
- At least `1` checkout start or direct pricing inquiry.

Diagnosis:

- Visits below `30`: distribution or discoverability is the problem; improve placements and search intent before redesigning checkout.
- Registration rate below `10%`: message, trust, pricing clarity, or CTA is the problem.
- Fewer than half of registrants produce a successful request: onboarding, documentation, model availability, or the free-credit experience is the problem.
- Successful users do not start checkout: price, product value, reliability, or continued-use need is the problem.

Do not expand to other model-specific starter kits until Seedance produces either three successful external users or enough evidence to identify and fix the blocking stage.

## Explicit Non-Goals

- Detaching or changing the existing `vancine-platform` fork relationship.
- Modifying or removing protected `new-api` or `QuantumNous` references.
- Building a custom n8n node.
- Building a ComfyUI plugin.
- Publishing a full SDK for any language.
- Creating multiple model SEO pages in the first cycle.
- Paid advertising, automated cold outreach, mass community posting, or engagement manipulation.
- Redesigning the homepage or replacing `/ai-media-api`.

## Implementation Order

1. Build and verify `/seedance-api` in Classic and Default.
2. Prepare the standalone starter repository locally.
3. Verify code examples, Postman, and n8n imports end to end.
4. Run both frontend checks and the local Docker release gate.
5. Obtain user approval, then push and deploy the website changes.
6. Obtain confirmation immediately before creating and publishing external developer resources.
7. Distribute through Postman, eligible Seedance resource repositories, and n8n.
8. Review Umami results after 24 hours, 72 hours, and seven days.

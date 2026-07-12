# AI Media API Landing Page Design

## Status

Approved conversational design, pending written-spec review.

## Objective

Create a focused English acquisition page at `/ai-media-api` for overseas AI product developers. The page should convert qualified visitors into registered and activated users by presenting Vancine's real multimedia API capabilities, developer experience, and fixed `$1` signup credit.

This page is additive. It does not replace or redesign the current homepage.

## Audience and Positioning

Primary users:

- Overseas indie developers building AI products.
- Small AI SaaS teams.
- Developers building video, image, speech, text, or 3D workflows.
- Developers who want access to models such as Seedance, Seedream, Doubao TTS, and Qwen Image without maintaining separate provider accounts and integrations.

Primary job to be done:

> Access leading Chinese generative-media models through one developer-friendly API, one account, and unified billing.

Primary message:

> Access Leading Chinese AI Media Models Through One API

Supporting message:

> Generate videos, images, speech, text, and 3D assets without integrating every provider separately. Use one API key, unified billing, and developer-friendly endpoints.

Offer:

> Get $1 in free credits. No credit card required.

The page must not claim unsupported savings percentages, guaranteed worldwide availability, fabricated customer counts, fabricated testimonials, or unverified model capabilities.

## Route and Theme Scope

- Public route: `/ai-media-api`.
- The route must exist in both `web/default` and `web/classic`.
- Both themes must expose equivalent content, destinations, analytics semantics, privacy behavior, and responsive behavior.
- Each theme uses its established components and styling patterns; source code need not be identical.
- Production remains on the Classic theme.
- No backend business-logic or database changes are required.

## Conversion Path

```text
View /ai-media-api
-> click primary CTA
-> complete registration
-> create or use an API key
-> complete a successful Playground or API request
-> enter checkout
```

CTA behavior:

- Logged-out visitor: `/register?source=ai-media-api`.
- Logged-in visitor: `/console/playground`.
- Documentation CTA: the relevant English media API documentation section.
- Pricing CTA: `/pricing`.

## Page Structure and Copy

### 1. Hero

Eyebrow:

```text
Built for AI product developers
```

H1:

```text
Access Leading Chinese AI Media Models Through One API
```

Body:

```text
Generate videos, images, speech, text, and 3D assets without integrating every provider separately. Use one API key, unified billing, and developer-friendly endpoints.
```

Offer:

```text
Get $1 in free credits. No credit card required.
```

Actions:

- Primary: `Start Free with $1 Credit`.
- Secondary: `Explore the API` -> the landing page's `#api` section.

Desktop uses a two-column hero with copy on the left and a real copyable API example on the right. Mobile stacks the content and uses a full-width primary CTA.

### 2. Model Capability Strip

Use text labels rather than unapproved provider logos:

- Seedance
- Seedream
- Doubao TTS
- Qwen Image
- Text Models
- 3D Generation

Supporting line:

```text
Video, image, audio, text, and 3D generation—available with one API key.
```

The live pricing and documentation pages remain authoritative for current availability.

### 3. Problem and Solution

Heading:

```text
Stop Rebuilding the Same Integration
```

Body:

```text
Every model provider comes with its own authentication, request format, billing system, and operational quirks. Vancine gives your product one consistent integration layer.
```

Cards:

1. `One API Key` — Connect once and access supported media and text models from one account.
2. `Unified Billing` — Manage one balance instead of separate provider accounts and payment methods.
3. `Consistent Developer Experience` — Use documented request patterns, centralized usage logs, and async task workflows.

### 4. Model Categories

Heading:

```text
One Integration Across the AI Media Stack
```

Categories:

- Video Generation — text-to-video and image-to-video async task workflows.
- Image Generation — image generation and editing through documented endpoints.
- Text to Speech — binary MP3 output with OpenAI-compatible request shapes.
- Text Models — OpenAI-compatible chat and reasoning workflows.
- 3D Generation — text- or image-guided async asset generation.

Action: `Browse Models and Live Pricing` -> `/pricing`.

### 5. API Proof

Heading:

```text
Make Your First Request in Minutes
```

Body:

```text
Use the OpenAI SDK for compatible text workflows or call the documented media endpoints with any HTTP client.
```

Tabs:

- Image
- Video
- Text to Speech

Examples must match the existing English documentation and use real endpoints:

```text
POST /v1/images/generations
POST /v1/video/generations
GET  /v1/video/generations/{task_id}
POST /v1/audio/speech
```

Requirements:

- Copy button.
- Keyboard-accessible tabs.
- Horizontally scrollable code on small screens.
- Documentation link to the corresponding section.

### 6. Use Cases

Heading:

```text
Built for Products That Generate More Than Text
```

Cards:

- AI Video Platforms
- Creative Automation Tools
- AI SaaS Products
- Developer Tools and Agents

Each card describes a concrete outcome without fabricated adoption metrics.

### 7. Comparison

Heading:

```text
One Integration Instead of Many
```

| Direct integrations | Vancine |
| --- | --- |
| Multiple provider accounts | One account |
| Different authentication methods | One API key |
| Separate balances | Unified billing |
| Provider-specific request formats | Documented common endpoints |
| Scattered usage records | Centralized usage logs |
| Repeated maintenance | One integration layer |

Qualification:

```text
Model-specific capabilities still follow their documented requirements. Vancine simplifies access without hiding important model differences.
```

### 8. Pricing and Trial

Heading:

```text
Start Building Before You Commit
```

Body:

```text
Create an account and receive $1 in free credits. Explore supported models, test requests in the Playground, and review public pricing before adding funds.
```

Facts:

- `$1 free credit`
- `No credit card required`
- `Public model pricing`
- `Pay only for actual usage`

Actions:

- Primary: `Start Free`.
- Secondary: `View Live Pricing` -> `/pricing`.

Exact model prices must not be hard-coded. Version one does not fetch or render a pricing preview; it links to the existing live pricing page.

### 9. FAQ

Questions:

1. Is Vancine OpenAI compatible?
2. Which models can I access?
3. How does video generation work?
4. Do I need a credit card to start?
5. Where can I see pricing?
6. Can I test models before integrating?

Answers must remain consistent with the English documentation. Availability and pricing answers direct users to live sources.

### 10. Final CTA

Heading:

```text
Build Your First AI Media Request Today
```

Body:

```text
Create your account, claim $1 in free credits, and test supported models in the Playground.
```

Actions:

- Primary: `Start Free with $1 Credit`.
- Secondary: `View Documentation`.

## Visual Design

Extend the current Vancine Classic visual language:

- Dark background.
- Purple, blue, and teal gradient accents.
- Large readable English typography.
- Developer-tool code cards.
- Text model badges instead of provider logos.
- Existing Vancine logo, navigation, button, and footer patterns.

Visual qualities:

```text
Developer-first
Premium
Technical
Fast
Trustworthy
```

Avoid stock people photography, AI faces, fake customer logos, aggressive popups, countdowns, autoplay media, and heavy parallax effects.

Allowed interactions:

- API example tabs.
- Copy code.
- Anchor navigation.
- Small hover and entrance transitions that respect `prefers-reduced-motion`.

No new heavyweight animation dependency is allowed.

## Navigation

Use reduced public navigation:

- Models
- API
- Pricing
- Docs
- Sign In
- Start Free

Internal section links may use anchors. Existing global destinations should be reused.

## SEO and Sharing Metadata

URL:

```text
https://vancine.com/ai-media-api
```

Title:

```text
Chinese AI Media APIs for Developers | Vancine
```

Description:

```text
Access Seedance, Seedream, Doubao TTS, Qwen Image, and more through one developer-friendly API. Start with $1 in free credits.
```

Open Graph title:

```text
Build AI Media Products with One API
```

Open Graph description:

```text
Video, image, speech, text, and 3D generation with one API key and unified billing.
```

Canonical:

```text
https://vancine.com/ai-media-api
```

Both themes must set route-specific title, description, canonical, and Open Graph values while the route is active and restore previous values on exit. Version one uses client-side metadata only. Server-rendered crawler metadata is outside scope and requires a separate design if later needed.

## Analytics

Automatic page view:

```text
/ai-media-api
```

Primary CTAs reuse:

```text
get_started_clicked
```

Allowed locations:

```text
ai_media_hero
ai_media_pricing
ai_media_final
```

Version one adds no supporting docs or pricing events. Page views, the existing primary CTA event, and downstream funnel events are sufficient for the first acquisition test.

Existing downstream events remain unchanged:

```text
signup_started
signup_completed
playground_request_started
playground_request_succeeded
checkout_started
```

Funnel:

```text
Viewed page /ai-media-api
-> get_started_clicked
-> signup_completed
-> playground_request_succeeded
-> checkout_started
```

Analytics must remain privacy-preserving and non-blocking. Never record prompts, responses, emails, user IDs, API keys, payment links, or order identifiers.

## UTM Convention

Example:

```text
https://vancine.com/ai-media-api?utm_source=reddit&utm_medium=community&utm_campaign=ai_media_launch
```

Initial source vocabulary:

```text
reddit
x
github
discord
producthunt
hackernews
```

Initial constants:

```text
utm_medium=community
utm_campaign=ai_media_launch
```

## Accessibility and Performance

- Exactly one H1 and semantic heading order.
- Keyboard-accessible tabs and actions.
- Visible focus states and sufficient contrast.
- Descriptive labels for copy buttons.
- Usable code blocks on small screens.
- Respect `prefers-reduced-motion`.
- No page-blocking pricing request.
- Target Lighthouse Performance score of at least 90 in a representative production test.

## Error and Fallback Behavior

- Copy failure shows a small non-blocking message.
- Missing analytics must not block navigation.
- Existing authentication routing remains authoritative.

## Verification

Both themes require:

- Route renders at `/ai-media-api`.
- CTA destinations are correct for logged-in and logged-out visitors.
- Route-specific metadata is set and restored.
- API examples match existing documentation.
- Each main CTA sends exactly one `get_started_clicked` with the correct location.
- Analytics failure does not block navigation.
- Desktop and mobile layouts are visually checked.
- Keyboard navigation and copy actions work.
- Relevant tests cover CTA destination selection and analytics location values.
- Theme-specific lint or formatting checks and production builds pass.
- Full Docker build embeds both themes.
- Local app remains `theme=classic` and is user-verified before push or production deployment.

## Initial Success Criteria

Evaluate after at least 100 external visitors; internal testing does not count.

| Metric | Initial decision threshold |
| --- | ---: |
| Landing page to primary CTA | at least 8% |
| CTA to completed registration | at least 35% |
| Completed registration to successful first request | at least 30% |
| Successful first request to checkout start | at least 10% |

These are internal iteration thresholds, not public marketing claims.

## Non-Goals

- Replacing or redesigning the homepage.
- Creating multiple model-specific landing pages in this phase.
- Fabricated testimonials or customer logos.
- Hard-coded model prices.
- Changing the `$1` signup-credit policy.
- Backend billing, authentication, or database changes.
- Changing the active production theme.
- Deployment before local Docker and user verification.

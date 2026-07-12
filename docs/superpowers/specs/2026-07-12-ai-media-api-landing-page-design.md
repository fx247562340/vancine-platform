# AI Media API Landing Page Design

## Status

Approved bilingual design, ready for implementation.

## Objective

Create a focused English-and-Chinese acquisition page at `/ai-media-api` for overseas AI product developers. The page should convert qualified visitors into registered and activated users by presenting Vancine's real multimedia API capabilities, developer experience, and fixed `$1` signup credit.

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

## Language Scope

Version one supports English and Chinese immediately in both themes.

- English is the default language.
- Simplified Chinese is provided for `zh`, `zh-CN`, and Classic's existing `zh-TW` locale in version one. A dedicated Traditional Chinese editorial pass is deferred to the later site-wide localization project.
- Existing French, Japanese, Russian, and Vietnamese site locales display the English landing-page copy through explicit English fallback values until those languages are restored in a later project.
- Every visible string, accessibility label, metadata value, FAQ answer, and non-code button label must be internationalized.
- Model names, API paths, HTTP verbs, JSON keys, code samples, `Vancine`, `OpenAI`, and `$1` are not translated.
- Language changes must update the rendered page and route metadata without reloading.
- Missing landing-page translations must fall back to English, never to an empty string or untranslated key.

Implementation follows each theme's current i18next conventions. English source strings remain translation keys. Default locale files are `web/default/src/i18n/locales/{en,zh,fr,ja,ru,vi}.json`. Classic locale files are `web/classic/src/i18n/locales/{en,zh-CN,zh-TW,fr,ja,ru,vi}.json`.

This phase does not introduce locale-prefixed URLs. `/ai-media-api` remains the only route and the English metadata remains canonical. A later site-wide international SEO project may add routes such as `/ja/ai-media-api` and `hreflang` metadata.

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

- Default logged-out visitor: `/sign-up`.
- Default logged-in visitor: `/playground`.
- Classic logged-out visitor: `/register?source=ai-media-api`.
- Classic logged-in visitor: `/console/playground`.
- Documentation CTA: the relevant media API documentation destination configured by the application.
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

## Approved Chinese Copy

The Chinese version uses the following product copy. English text remains the i18next key; the Chinese text is its value. Technical identifiers and code remain unchanged.

| English source | Chinese value |
| --- | --- |
| Built for AI product developers | 为 AI 产品开发者打造 |
| Access Leading Chinese AI Media Models Through One API | 通过一个 API 接入领先的中国 AI 多媒体模型 |
| Generate videos, images, speech, text, and 3D assets without integrating every provider separately. Use one API key, unified billing, and developer-friendly endpoints. | 无需逐个集成模型服务商，即可生成视频、图片、语音、文本和 3D 资产。一个 API 密钥、统一计费，以及开发者友好的接口。 |
| Get $1 in free credits. No credit card required. | 注册即得 1 美元免费额度，无需信用卡。 |
| Start Free with $1 Credit | 领取 1 美元额度，免费开始 |
| Explore the API | 查看 API |
| Video, image, audio, text, and 3D generation—available with one API key. | 一个 API 密钥，即可使用视频、图片、音频、文本和 3D 生成能力。 |
| Stop Rebuilding the Same Integration | 无需重复开发同一种集成 |
| Every model provider comes with its own authentication, request format, billing system, and operational quirks. Vancine gives your product one consistent integration layer. | 每个模型服务商都有不同的认证方式、请求格式、计费系统和运行规则。Vancine 为你的产品提供统一的接入层。 |
| One API Key | 一个 API 密钥 |
| Unified Billing | 统一计费 |
| Consistent Developer Experience | 一致的开发体验 |
| Connect once and access supported media and text models from one account. | 一次接入，即可通过一个账户使用支持的多媒体和文本模型。 |
| Manage one balance instead of separate provider accounts and payment methods. | 只需管理一个余额，无需维护多个服务商账户和支付方式。 |
| Use documented request patterns, centralized usage logs, and async task workflows. | 使用清晰的请求规范、集中的用量日志和异步任务工作流。 |
| One Integration Across the AI Media Stack | 一次接入，覆盖完整 AI 多媒体能力 |
| Video Generation | 视频生成 |
| Image Generation | 图片生成 |
| Text to Speech | 文本转语音 |
| Text Models | 文本模型 |
| 3D Generation | 3D 生成 |
| Browse Models and Live Pricing | 查看模型与实时价格 |
| Make Your First Request in Minutes | 几分钟内完成第一次调用 |
| Use the OpenAI SDK for compatible text workflows or call the documented media endpoints with any HTTP client. | 文本工作流可以使用 OpenAI SDK，多媒体接口也可以通过任意 HTTP 客户端调用。 |
| Image | 图片 |
| Video | 视频 |
| Copy code | 复制代码 |
| Code copied | 代码已复制 |
| Unable to copy code | 无法复制代码 |
| Read API Documentation | 阅读 API 文档 |
| Built for Products That Generate More Than Text | 为不止生成文本的产品而生 |
| AI Video Platforms | AI 视频平台 |
| Creative Automation Tools | 创意自动化工具 |
| AI SaaS Products | AI SaaS 产品 |
| Developer Tools and Agents | 开发者工具与智能体 |
| One Integration Instead of Many | 一次集成，替代多次对接 |
| Direct integrations | 直接集成多个服务商 |
| Multiple provider accounts | 多个服务商账户 |
| One account | 一个账户 |
| Different authentication methods | 不同的认证方式 |
| Separate balances | 分散的账户余额 |
| Provider-specific request formats | 各不相同的请求格式 |
| Documented common endpoints | 统一且有文档的接口 |
| Scattered usage records | 分散的用量记录 |
| Centralized usage logs | 集中的用量日志 |
| Repeated maintenance | 重复维护 |
| One integration layer | 一个接入层 |
| Model-specific capabilities still follow their documented requirements. Vancine simplifies access without hiding important model differences. | 各模型的能力仍以对应文档为准。Vancine 简化接入，同时保留重要的模型差异。 |
| Start Building Before You Commit | 先开始构建，再决定投入 |
| Create an account and receive $1 in free credits. Explore supported models, test requests in the Playground, and review public pricing before adding funds. | 创建账户即可获得 1 美元免费额度。充值前，你可以先查看支持的模型、在 Playground 测试请求并了解公开价格。 |
| $1 free credit | 1 美元免费额度 |
| No credit card required | 无需信用卡 |
| Public model pricing | 公开的模型价格 |
| Pay only for actual usage | 仅按实际用量付费 |
| Start Free | 免费开始 |
| View Live Pricing | 查看实时价格 |
| Build Your First AI Media Request Today | 今天就完成你的第一次 AI 多媒体调用 |
| Create your account, claim $1 in free credits, and test supported models in the Playground. | 创建账户，领取 1 美元免费额度，并在 Playground 中测试支持的模型。 |
| View Documentation | 查看文档 |

FAQ copy:

| English question | Chinese question | Chinese answer |
| --- | --- | --- |
| Is Vancine OpenAI compatible? | Vancine 兼容 OpenAI API 吗？ | 对于支持的文本和语音工作流，Vancine 提供 OpenAI 兼容的请求方式。视频、图片和 3D 能力请使用文档中对应的多媒体接口。 |
| Which models can I access? | 我可以使用哪些模型？ | 你可以使用平台当前支持的视频、图片、语音、文本和 3D 模型。具体可用模型请以实时价格页和 API 文档为准。 |
| How does video generation work? | 视频生成如何工作？ | 视频生成采用异步任务流程：提交生成请求、获得任务 ID，然后查询任务状态并获取结果。 |
| Do I need a credit card to start? | 开始使用需要信用卡吗？ | 不需要。注册后可获得 1 美元免费额度，无需绑定信用卡即可开始测试。 |
| Where can I see pricing? | 在哪里查看价格？ | 请查看实时价格页。模型价格可能调整，因此落地页不会写死具体价格。 |
| Can I test models before integrating? | 正式接入前可以测试模型吗？ | 可以。注册后可先在 Playground 中测试支持的模型，再开始代码集成。 |

The English FAQ answers must express the same facts as the approved Chinese answers. Chinese accessibility labels and metadata use natural Chinese equivalents rather than leaving English-only UI text.

## Visual Design

Extend the current Vancine Classic visual language:

- Dark background.
- Purple, blue, and teal gradient accents.
- Large readable typography for both English and Chinese.
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

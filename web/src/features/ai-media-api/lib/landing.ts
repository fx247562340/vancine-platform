/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'
import { extractUtm } from '@/lib/acquisition'

/**
 * Pure business logic for the AI Media API landing page: CTA resolution,
 * SEO metadata, API examples, and the page content contract. Everything here
 * is deterministic and unit-testable; nothing reads request headers, user
 * input, or live configuration. Claims stay restrained and verifiable — no
 * signup credits, no fixed prices, no market superlatives.
 */

// ---------------------------------------------------------------------------
// Anonymous analytics event contract (shared event names)
// ---------------------------------------------------------------------------

export const AI_MEDIA_CTA_EVENT = 'get_started_clicked'

export const AI_MEDIA_CTA_LOCATIONS = [
  'ai_media_hero',
  'ai_media_examples',
  'ai_media_final',
] as const

export type AiMediaCtaLocation = (typeof AI_MEDIA_CTA_LOCATIONS)[number]

export const AI_MEDIA_RESOURCE_EVENT = 'developer_resource_clicked'

export const AI_MEDIA_RESOURCE_VALUES = ['docs', 'pricing'] as const

export type AiMediaResourceValue = (typeof AI_MEDIA_RESOURCE_VALUES)[number]

export const AI_MEDIA_RESOURCE_LOCATIONS = [
  'hero',
  'categories',
  'examples',
  'pricing_note',
  'faq',
  'final',
] as const

export type AiMediaResourceLocation =
  (typeof AI_MEDIA_RESOURCE_LOCATIONS)[number]

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** Fixed canonical URL for the landing page, identical across languages. */
export const AI_MEDIA_CANONICAL = 'https://vancine.com/ai-media-api'

/**
 * Resolve the internal CTA destination for the current auth state. The path
 * is fixed by the auth state; only the shared acquisition UTM allowlist is
 * retained from the page query — redirect/return_to and every other
 * parameter are dropped, so no open redirect can be produced.
 */
export function getAiMediaCtaDestination(
  isAuthenticated: boolean,
  search = ''
): string {
  const destination = isAuthenticated ? '/playground' : '/sign-up'
  const utm = extractUtm(search)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(utm)) {
    query.set(key, value)
  }
  const queryString = query.toString()
  return queryString ? `${destination}?${queryString}` : destination
}

export interface AiMediaCtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

/**
 * Split a resolved CTA destination into a TanStack Link-ready target so
 * internal navigation keeps the allowlisted UTM parameters without building
 * hrefs by string concatenation in components.
 */
export function getAiMediaCtaTarget(
  isAuthenticated: boolean,
  search = ''
): AiMediaCtaTarget {
  const destination = getAiMediaCtaDestination(isAuthenticated, search)
  const [path, query = ''] = destination.split('?')
  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(query)) {
    params[key] = value
  }
  return {
    to: path === '/playground' ? '/playground' : '/sign-up',
    search: params,
  }
}

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface AiMediaLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
}

const AI_MEDIA_METADATA: Record<
  InterfaceLanguageCode,
  AiMediaLanguageMetadata
> = {
  en: {
    title: 'AI Media API: Image, Video, Speech & 3D | Vancine',
    description:
      'Access Chinese AI media models through one API. Image, video, speech, and 3D generation with one API key and unified billing.',
    ogTitle: 'Chinese AI Media Models Through One API',
    ogDescription:
      'Generate images, videos, speech, and 3D assets with one API key and documented endpoints.',
  },
  zhCN: {
    title: 'AI 多媒体 API：图片、视频、语音与 3D | Vancine',
    description:
      '通过一个 API 接入中国 AI 多媒体模型。一个 API 密钥、统一计费，即可使用图片、视频、语音和 3D 生成能力。',
    ogTitle: '一个 API 接入中国 AI 多媒体模型',
    ogDescription:
      '一个 API 密钥，使用文档化的接口生成图片、视频、语音和 3D 资产。',
  },
  zhTW: {
    title: 'AI 多媒體 API：圖片、影片、語音與 3D | Vancine',
    description:
      '透過一個 API 接入中國 AI 多媒體模型。一個 API 金鑰、統一計費，即可使用圖片、影片、語音和 3D 生成能力。',
    ogTitle: '一個 API 接入中國 AI 多媒體模型',
    ogDescription:
      '一個 API 金鑰，使用文件化的介面生成圖片、影片、語音和 3D 資產。',
  },
  fr: {
    title: 'API IA médias : image, vidéo, voix et 3D | Vancine',
    description:
      "Accédez aux modèles multimédias d'IA chinoise via une seule API. Génération d'images, de vidéos, de voix et de 3D avec une clé API et une facturation unifiée.",
    ogTitle: "Les modèles multimédias d'IA chinoise via une seule API",
    ogDescription:
      'Générez images, vidéos, voix et assets 3D avec une seule clé API et des endpoints documentés.',
  },
  ru: {
    title: 'AI Media API: изображения, видео, речь и 3D | Vancine',
    description:
      'Доступ к китайским мультимедийным ИИ-моделям через один API. Генерация изображений, видео, речи и 3D с одним API-ключом и единым биллингом.',
    ogTitle: 'Китайские мультимедийные ИИ-модели через один API',
    ogDescription:
      'Создавайте изображения, видео, речь и 3D-ассеты с одним API-ключом и документированными эндпоинтами.',
  },
  ja: {
    title: 'AI メディア API：画像・動画・音声・3D | Vancine',
    description:
      '中国の AI メディアモデルに単一の API でアクセス。1 つの API キーと統一課金で、画像・動画・音声・3D 生成を利用できます。',
    ogTitle: '中国の AI メディアモデルを単一の API で',
    ogDescription:
      '1 つの API キーとドキュメント化されたエンドポイントで、画像・動画・音声・3D アセットを生成できます。',
  },
  vi: {
    title: 'API AI Media: Ảnh, Video, Giọng nói & 3D | Vancine',
    description:
      'Truy cập các mô hình AI truyền thông Trung Quốc qua một API. Tạo ảnh, video, giọng nói và 3D với một khóa API và thanh toán thống nhất.',
    ogTitle: 'Mô hình AI truyền thông Trung Quốc qua một API',
    ogDescription:
      'Tạo ảnh, video, giọng nói và tài nguyên 3D với một khóa API và các điểm cuối có tài liệu.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is normalized
 * (zhCN / zhTW / BCP-47 variants), and any unknown language falls back to
 * English. Canonical and og:url are fixed constants — never derived from
 * host headers or user input.
 */
export function getAiMediaPageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = AI_MEDIA_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    ogUrl: AI_MEDIA_CANONICAL,
    canonical: AI_MEDIA_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// API example contract — endpoints and models mirror the live Docs
// ---------------------------------------------------------------------------

export const AI_MEDIA_API_BASE_URL = 'https://vancine.com/v1'
export const AI_MEDIA_API_KEY_ENV_VAR = 'VANCINE_API_KEY'

export interface AiMediaApiExample {
  id: 'image' | 'video' | 'speech'
  /** i18n key of the tab label. */
  labelKey: string
  /** Docs slug the example links to. */
  docsSlug: 'image' | 'video' | 'audio'
  code: string
}

/**
 * Quickstart examples. Endpoints and model IDs mirror the current Docs
 * (image/video/audio pages); the API key is read exclusively from the
 * VANCINE_API_KEY environment variable — never a hardcoded secret. Video is
 * an async task workflow (submit, then poll by task id).
 */
export const AI_MEDIA_API_EXAMPLES: readonly AiMediaApiExample[] = [
  {
    id: 'image',
    labelKey: 'Image',
    docsSlug: 'image',
    code: `curl -X POST https://vancine.com/v1/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -d '{
    "model": "qwen-image-2.0",
    "prompt": "a red apple on a wooden table",
    "n": 1,
    "size": "1024x1024"
  }'`,
  },
  {
    id: 'video',
    labelKey: 'Video',
    docsSlug: 'video',
    code: `# 1. Submit the async task
curl -X POST https://vancine.com/v1/video/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -d '{
    "model": "Doubao-Seedance-2.5",
    "prompt": "a cat walking on a beach"
  }'

# 2. Poll the task status with the returned task_id
curl -X GET https://vancine.com/v1/video/generations/$TASK_ID \\
  -H "Authorization: Bearer $VANCINE_API_KEY"`,
  },
  {
    id: 'speech',
    labelKey: 'Speech',
    docsSlug: 'audio',
    code: `curl -X POST https://vancine.com/v1/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -d '{
    "model": "Doubao-tts2.0",
    "voice": "en_female_nadia_uranus_bigtts",
    "input": "Welcome to Vancine. One API for AI media.",
    "response_format": "mp3"
  }' \\
  --output speech.mp3`,
  },
]

// ---------------------------------------------------------------------------
// Page content contract (i18n key registries for data-driven sections)
// ---------------------------------------------------------------------------

export interface AiMediaTitledEntry {
  titleKey: string
  descriptionKey: string
}

/** Capability strip items — capability labels, no provider logos. */
export const AI_MEDIA_CAPABILITIES: readonly AiMediaTitledEntry[] = [
  {
    titleKey: 'Image generation',
    descriptionKey: 'Generation and editing through documented endpoints.',
  },
  {
    titleKey: 'Video generation',
    descriptionKey: 'Text-to-video and image-to-video async task workflows.',
  },
  {
    titleKey: 'Text to Speech',
    descriptionKey: 'Speech synthesis with OpenAI-compatible request shapes.',
  },
  {
    titleKey: '3D generation',
    descriptionKey: 'Async 3D asset workflows documented in the Docs.',
  },
]

/** One-integration benefits. */
export const AI_MEDIA_BENEFITS: readonly AiMediaTitledEntry[] = [
  {
    titleKey: 'One API key',
    descriptionKey:
      'Connect once and use supported media models from one account.',
  },
  {
    titleKey: 'Unified account and balance',
    descriptionKey:
      'Manage one balance instead of separate provider accounts and payment methods.',
  },
  {
    titleKey: 'Documented workflows',
    descriptionKey:
      'Use documented request patterns, centralized usage logs, and async task workflows.',
  },
]

/** Media category cards; each links to its Docs page. */
export interface AiMediaCategory extends AiMediaTitledEntry {
  docsSlug: 'image' | 'video' | 'audio' | 'td'
}

export const AI_MEDIA_CATEGORIES: readonly AiMediaCategory[] = [
  {
    titleKey: 'Video generation',
    descriptionKey: 'Text-to-video and image-to-video async task workflows.',
    docsSlug: 'video',
  },
  {
    titleKey: 'Image generation',
    descriptionKey: 'Generation and editing through documented endpoints.',
    docsSlug: 'image',
  },
  {
    titleKey: 'Text to Speech',
    descriptionKey: 'Speech synthesis with OpenAI-compatible request shapes.',
    docsSlug: 'audio',
  },
  {
    titleKey: '3D generation',
    descriptionKey: 'Async 3D asset workflows documented in the Docs.',
    docsSlug: 'td',
  },
]

/** Use case cards — concrete outcomes, no adoption metrics. */
export const AI_MEDIA_USE_CASES: readonly AiMediaTitledEntry[] = [
  {
    titleKey: 'AI video platforms',
    descriptionKey:
      'Assemble generation, polling, and delivery flows for video products.',
  },
  {
    titleKey: 'Creative automation tools',
    descriptionKey:
      'Batch image and speech generation inside creative pipelines.',
  },
  {
    titleKey: 'AI SaaS products',
    descriptionKey:
      'Offer media features without maintaining provider integrations.',
  },
  {
    titleKey: 'Developer tools and agents',
    descriptionKey: 'Give tools and agents media capabilities through one API.',
  },
]

// ---------------------------------------------------------------------------
// FAQ contract
// ---------------------------------------------------------------------------

export interface AiMediaFaqEntry {
  questionKey: string
  answerKey: string
}

export const AI_MEDIA_FAQ: readonly AiMediaFaqEntry[] = [
  {
    questionKey: 'Is Vancine OpenAI compatible?',
    answerKey:
      'For supported text and speech workflows, Vancine provides OpenAI-compatible request shapes. For video, image, and 3D capabilities, use the documented media endpoints.',
  },
  {
    questionKey: 'Which media models can I access?',
    answerKey:
      'You can use the video, image, speech, and 3D models currently listed in the platform. The live Docs and Pricing are authoritative for availability.',
  },
  {
    questionKey: 'How does video generation work?',
    answerKey:
      'Video generation uses an async task workflow: submit a generation request, receive a task ID, then poll the task status and retrieve the result.',
  },
  {
    questionKey: 'Where can I see pricing?',
    answerKey:
      'Check the live Pricing page. Model pricing can change, so this page does not hardcode prices.',
  },
  {
    questionKey: 'Can I test models before integrating?',
    answerKey:
      'Yes. After signing up, test supported models in the Playground before writing integration code.',
  },
]

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the AI Media landing page passes to t(). Locale
 * completeness tests iterate this list; product-name literals that are
 * intentionally not localized are excluded.
 */
export const AI_MEDIA_I18N_KEYS = [
  'Built for AI product developers',
  'Access Chinese AI media models through one API.',
  'Generate images, videos, speech, and 3D assets with one API key, one account, and documented endpoints.',
  'Explore the API',
  'Image, video, speech, and 3D generation—available with one API key.',
  'One integration, one account',
  'One integration across the AI media stack',
  'Make your first request in minutes',
  'Call the documented media endpoints with any HTTP client. Availability and pricing follow the live Docs and Pricing.',
  'API examples',
  ...AI_MEDIA_API_EXAMPLES.map((example) => example.labelKey),
  'Built for products that generate more than text',
  'Models and pricing are live',
  'Model lineups, availability, and pricing can change. The live Docs model catalog and Pricing page are authoritative.',
  'Build your first AI media request today',
  'Create an account, generate an API key, and test supported models in the Playground.',
  ...AI_MEDIA_CAPABILITIES.flatMap((entry) => [
    entry.titleKey,
    entry.descriptionKey,
  ]),
  ...AI_MEDIA_BENEFITS.flatMap((entry) => [
    entry.titleKey,
    entry.descriptionKey,
  ]),
  ...AI_MEDIA_USE_CASES.flatMap((entry) => [
    entry.titleKey,
    entry.descriptionKey,
  ]),
  ...AI_MEDIA_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
] as const

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
/**
 * Pure, dependency-free landing-page contract for the Default theme.
 *
 * Holds the conversion-path destinations, the allowed analytics locations,
 * the static API code examples, and the localized SEO/social metadata.
 *
 * Kept free of React/DOM so the Node native test runner can verify the
 * acquisition contract without a browser. Components consume these helpers;
 * they never hard-code destinations, locations, or metadata strings.
 */

/** Primary CTA event name shared with the analytics layer. */
export const AI_MEDIA_CTA_EVENT = 'get_started_clicked'

/**
 * Ordered, immutable list of the only analytics location values this page
 * may send. Every primary CTA must use one of these. The order matches the
 * page flow: hero -> pricing -> final.
 */
export const AI_MEDIA_CTA_LOCATIONS = Object.freeze([
  'ai_media_hero',
  'ai_media_pricing',
  'ai_media_final',
] as const)

export type AiMediaCtaLocation = (typeof AI_MEDIA_CTA_LOCATIONS)[number]

/** Default-theme CTA destinations, keyed by authentication state. */
const DEFAULT_CTA_DESTINATION: Record<'authenticated' | 'guest', string> = {
  guest: '/sign-up',
  authenticated: '/playground',
}

/**
 * Returns the primary CTA destination for the Default theme.
 *
 * @param isAuthenticated whether a user session is active
 */
export function getAiMediaCtaDestination(isAuthenticated: boolean): string {
  return isAuthenticated
    ? DEFAULT_CTA_DESTINATION.authenticated
    : DEFAULT_CTA_DESTINATION.guest
}

/** Canonical landing URL, identical across languages in version one. */
const AI_MEDIA_CANONICAL = 'https://vancine.com/ai-media-api'

/**
 * Vancine's own documentation base URL. All user-facing docs entry points
 * on this page resolve here — never directly to the upstream provider docs
 * (which remain referenced in non-navigational attribution text only).
 */
export const VANCINE_DOCS_URL = 'https://vancine.com/docs'

const AI_MEDS_DOCS_SECTION: Record<string, string> = {
  image: '#image',
  video: '#video',
  speech: '#audio',
}

/**
 * Returns a Vancine docs URL for the given media section.
 *
 * @param section `'image'` | `'video'` | `'speech'`, or omit for the docs home
 * @returns a `vancine.com/docs[...]` URL, never the upstream docs domain
 */
export function getAiMediaDocsUrl(
  section?: 'image' | 'video' | 'speech'
): string {
  const anchor = section ? (AI_MEDS_DOCS_SECTION[section] ?? '') : ''
  return `${VANCINE_DOCS_URL}${anchor}`
}

interface AiMediaMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  canonical: string
}

interface AiMediaLocalizedMetadata {
  en: AiMediaMetadata
  zh: AiMediaMetadata
}

const AI_MEDIA_METADATA: AiMediaLocalizedMetadata = {
  en: {
    title: 'Chinese AI Media APIs for Developers | Vancine',
    description:
      'Access Seedance, Seedream, Doubao TTS, Qwen Image, and more through one developer-friendly API. Start with $1 in free credits.',
    ogTitle: 'Build AI Media Products with One API',
    ogDescription:
      'Video, image, speech, text, and 3D generation with one API key and unified billing.',
    canonical: AI_MEDIA_CANONICAL,
  },
  zh: {
    title: '面向开发者的中国 AI 多媒体 API | Vancine',
    description:
      '通过一个开发者友好的 API 接入 Seedance、Seedream、Doubao TTS、Qwen Image 等模型，注册即得 1 美元免费额度。',
    ogTitle: '使用一个 API 构建 AI 多媒体产品',
    ogDescription:
      '一个 API 密钥，统一使用视频、图片、语音、文本和 3D 生成能力。',
    canonical: AI_MEDIA_CANONICAL,
  },
}

/**
 * Returns the route-specific SEO/social metadata for the given language.
 *
 * Chinese is selected for `zh` and any `zh-*` tag (e.g. `zh-CN`, `zh-TW`).
 * Every other language falls back to English so that fr/ja/ru/vi never
 * render an empty or key-only metadata string.
 *
 * @param language an i18next language tag (e.g. 'en', 'zh', 'zh-CN')
 */
export function getAiMediaMetadata(language: string): AiMediaMetadata {
  const normalized = (language ?? '').trim().toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return AI_MEDIA_METADATA.zh
  }
  return AI_MEDIA_METADATA.en
}

export interface AiMediaCodeExample {
  /**
   * Stable id, also selects the docs section via `getAiMediaDocsUrl(id)`
   * ('image' | 'video' | 'speech').
   */
  id: 'image' | 'video' | 'speech'
  /** i18next key for the tab label (e.g. 'Image'). */
  labelKey: string
  /** The copyable example body. Uses $VANCINE_API_KEY as a placeholder. */
  code: string
}

/**
 * Static, dependency-free API code examples. These mirror the existing
 * English documentation and use documented endpoints only. No real
 * credential, prompt, user data, or fixed model price appears here.
 */
export const AI_MEDIA_CODE_EXAMPLES: readonly AiMediaCodeExample[] =
  Object.freeze([
    {
      id: 'image',
      labelKey: 'Image',
      code: `curl https://vancine.com/v1/images/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedream",
    "prompt": "A friendly robot watering plants in a sunlit greenhouse",
    "response_format": "url"
  }'`,
    },
    {
      id: 'video',
      labelKey: 'Video',
      code: `# 1. Create a video generation task
curl https://vancine.com/v1/video/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance",
    "prompt": "A timelapse of a flower blooming at sunrise"
  }'

# 2. Poll the task status and fetch the result
curl https://vancine.com/v1/video/generations/{task_id} \\
  -H "Authorization: Bearer $VANCINE_API_KEY"`,
    },
    {
      id: 'speech',
      labelKey: 'Text to Speech',
      code: `curl https://vancine.com/v1/audio/speech \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-tts",
    "input": "Hello from Vancine. One API for video, image, speech, and text.",
    "voice": "zh_female_cancan_mars",
    "response_format": "mp3"
  }' \\
  --out speech.mp3`,
    },
  ])

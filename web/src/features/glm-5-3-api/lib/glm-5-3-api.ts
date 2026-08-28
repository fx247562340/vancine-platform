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

For commercial licensing, please contact support@quantumnous.com.
*/
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * Pure business logic for the /glm-api acquisition page.
 *
 * ONE canonical page covers BOTH model ids (glm-5.3 and glm-5.3-flash);
 * there is deliberately no /glm-5-3-flash-api sibling route. Claims stay
 * restrained and verifiable:
 *   - the comparison covers exactly the two standard paid listings
 *     verified on August 27, 2026, never "all models";
 *   - every displayed figure satisfies Vancine/OpenRouter = 0.8 with
 *     three-decimal display accuracy ($0.012 / $0.015 / $0.075);
 *   - compatibility promises are limited to the OpenAI-compatible chat
 *     completions request, response, and streaming formats, and the page
 *     always discloses that provider-specific errors may differ.
 *
 * Prices, database state, ModelRatio, CompletionRatio, cache billing,
 * and billing expressions are NOT touched by this page — it is display
 * and copy only.
 */

// ---------------------------------------------------------------------------
// Anonymous analytics event contract
// ---------------------------------------------------------------------------

export const GLM53_API_CTA_EVENT = 'get_started_clicked'

export const GLM53_API_RESOURCE_EVENT = 'developer_resource_clicked'

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** The fixed canonical origin for every public link on this page. */
export const GLM53_API_CANONICAL = 'https://vancine.com/glm-api'

/** The fixed API base URL referenced in every quickstart example. */
export const GLM53_API_API_BASE_URL = 'https://vancine.com/v1'

/** CTA paths by auth state; the target is never user-controlled. */
export const GLM53_API_CTA_DESTINATION_AUTH = {
  guest: '/sign-up',
  authenticated: '/playground',
} as const

/** Only standard UTM attribution parameters survive CTA URL building. */
const ALLOWED_UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

/**
 * Resolve the internal CTA destination for the current auth state while
 * retaining only allowlisted UTM parameters. The path is fixed by the
 * auth state; email, phone, token, api_key, redirect, and unknown
 * parameters are dropped, so no sensitive value and no open redirect
 * can ride along.
 */
export function getGlm53ApiCtaDestination(
  isAuthenticated: boolean,
  search = ''
): string {
  const destination = isAuthenticated
    ? GLM53_API_CTA_DESTINATION_AUTH.authenticated
    : GLM53_API_CTA_DESTINATION_AUTH.guest
  const source = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  )
  const allowed = new URLSearchParams()

  for (const [key, value] of source) {
    if (ALLOWED_UTM_KEYS.has(key)) {
      allowed.append(key, value)
    }
  }

  const query = allowed.toString()
  return query ? `${destination}?${query}` : destination
}

export interface Glm53ApiCtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

/**
 * Split a resolved CTA destination into a TanStack Link-ready target so
 * internal navigation keeps the allowlisted UTM parameters without
 * building hrefs by string concatenation in components.
 */
export function getGlm53ApiCtaTarget(
  isAuthenticated: boolean,
  search = ''
): Glm53ApiCtaTarget {
  const destination = getGlm53ApiCtaDestination(isAuthenticated, search)
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
// CTA label / destination parity
// ---------------------------------------------------------------------------

export type Glm53ApiCtaLabelKey = 'Create an API key' | 'Open Playground'

/**
 * The English-source CTA label for the current auth state. Components
 * pass the result to t() so the rendered string follows the active
 * language; tests and metadata use the returned literal directly.
 */
export function getGlm53ApiCtaLabelKey(
  isAuthenticated: boolean
): Glm53ApiCtaLabelKey {
  return isAuthenticated ? 'Open Playground' : 'Create an API key'
}

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface Glm53ApiLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const GLM53_API_METADATA: Record<
  InterfaceLanguageCode,
  Glm53ApiLanguageMetadata
> = {
  // The English block is pinned byte-for-byte against
  // router/web_metadata.go's /glm-api entry.
  en: {
    title: 'GLM-5.3 & GLM-5.3 Flash API Pricing | Vancine',
    description:
      'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
    ogTitle: 'GLM-5.3 & GLM-5.3 Flash API Pricing',
    ogDescription:
      'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
    twitterTitle: 'GLM-5.3 & GLM-5.3 Flash API Pricing',
    twitterDescription:
      'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
  },
  zhCN: {
    title: 'GLM-5.3 和 GLM-5.3 Flash API 价格 | Vancine',
    description:
      '通过一个 OpenAI 兼容 API 使用 GLM-5.3 和 GLM-5.3 Flash。比较 Vancine 与 OpenRouter 价格：这两项标准付费列表低 20%。',
    ogTitle: 'GLM-5.3 和 GLM-5.3 Flash API 价格',
    ogDescription:
      '通过一个 OpenAI 兼容 API 使用 GLM-5.3 和 GLM-5.3 Flash。比较 Vancine 与 OpenRouter 价格：这两项标准付费列表低 20%。',
    twitterTitle: 'GLM-5.3 和 GLM-5.3 Flash API 价格',
    twitterDescription:
      '通过一个 OpenAI 兼容 API 使用 GLM-5.3 和 GLM-5.3 Flash。比较 Vancine 与 OpenRouter 价格：这两项标准付费列表低 20%。',
  },
  zhTW: {
    title: 'GLM-5.3 與 GLM-5.3 Flash API 價格 | Vancine',
    description:
      '透過一個 OpenAI 相容 API 使用 GLM-5.3 與 GLM-5.3 Flash。比較 Vancine 與 OpenRouter 價格：這兩項標準付費列表低 20%。',
    ogTitle: 'GLM-5.3 與 GLM-5.3 Flash API 價格',
    ogDescription:
      '透過一個 OpenAI 相容 API 使用 GLM-5.3 與 GLM-5.3 Flash。比較 Vancine 與 OpenRouter 價格：這兩項標準付費列表低 20%。',
    twitterTitle: 'GLM-5.3 與 GLM-5.3 Flash API 價格',
    twitterDescription:
      '透過一個 OpenAI 相容 API 使用 GLM-5.3 與 GLM-5.3 Flash。比較 Vancine 與 OpenRouter 價格：這兩項標準付費列表低 20%。',
  },
  fr: {
    title: 'Tarifs API GLM-5.3 et GLM-5.3 Flash | Vancine',
    description:
      'Accédez à GLM-5.3 et GLM-5.3 Flash via une API compatible OpenAI. Comparez les tarifs Vancine et OpenRouter : 20 % moins cher sur ces deux offres standard payantes.',
    ogTitle: 'Tarifs API GLM-5.3 et GLM-5.3 Flash',
    ogDescription:
      'Accédez à GLM-5.3 et GLM-5.3 Flash via une API compatible OpenAI. Comparez les tarifs Vancine et OpenRouter : 20 % moins cher sur ces deux offres standard payantes.',
    twitterTitle: 'Tarifs API GLM-5.3 et GLM-5.3 Flash',
    twitterDescription:
      'Accédez à GLM-5.3 et GLM-5.3 Flash via une API compatible OpenAI. Comparez les tarifs Vancine et OpenRouter : 20 % moins cher sur ces deux offres standard payantes.',
  },
  ru: {
    title: 'Цены на API GLM-5.3 и GLM-5.3 Flash | Vancine',
    description:
      'Доступ к GLM-5.3 и GLM-5.3 Flash через один OpenAI-совместимый API. Сравните цены Vancine и OpenRouter: на 20 % ниже по этим двум стандартным платным предложениям.',
    ogTitle: 'Цены на API GLM-5.3 и GLM-5.3 Flash',
    ogDescription:
      'Доступ к GLM-5.3 и GLM-5.3 Flash через один OpenAI-совместимый API. Сравните цены Vancine и OpenRouter: на 20 % ниже по этим двум стандартным платным предложениям.',
    twitterTitle: 'Цены на API GLM-5.3 и GLM-5.3 Flash',
    twitterDescription:
      'Доступ к GLM-5.3 и GLM-5.3 Flash через один OpenAI-совместимый API. Сравните цены Vancine и OpenRouter: на 20 % ниже по этим двум стандартным платным предложениям.',
  },
  ja: {
    title: 'GLM-5.3 および GLM-5.3 Flash API 料金 | Vancine',
    description:
      '1 つの OpenAI 互換 API で GLM-5.3 と GLM-5.3 Flash を利用。Vancine と OpenRouter の料金を比較：これら 2 つの標準有料リスティングで 20% 低価格。',
    ogTitle: 'GLM-5.3 および GLM-5.3 Flash API 料金',
    ogDescription:
      '1 つの OpenAI 互換 API で GLM-5.3 と GLM-5.3 Flash を利用。Vancine と OpenRouter の料金を比較：これら 2 つの標準有料リスティングで 20% 低価格。',
    twitterTitle: 'GLM-5.3 および GLM-5.3 Flash API 料金',
    twitterDescription:
      '1 つの OpenAI 互換 API で GLM-5.3 と GLM-5.3 Flash を利用。Vancine と OpenRouter の料金を比較：これら 2 つの標準有料リスティングで 20% 低価格。',
  },
  vi: {
    title: 'Giá API GLM-5.3 và GLM-5.3 Flash | Vancine',
    description:
      'Truy cập GLM-5.3 và GLM-5.3 Flash qua một API tương thích OpenAI. So sánh giá Vancine và OpenRouter: thấp hơn 20% trên hai danh sách trả phí chuẩn này.',
    ogTitle: 'Giá API GLM-5.3 và GLM-5.3 Flash',
    ogDescription:
      'Truy cập GLM-5.3 và GLM-5.3 Flash qua một API tương thích OpenAI. So sánh giá Vancine và OpenRouter: thấp hơn 20% trên hai danh sách trả phí chuẩn này.',
    twitterTitle: 'Giá API GLM-5.3 và GLM-5.3 Flash',
    twitterDescription:
      'Truy cập GLM-5.3 và GLM-5.3 Flash qua một API tương thích OpenAI. So sánh giá Vancine và OpenRouter: thấp hơn 20% trên hai danh sách trả phí chuẩn này.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is
 * normalized (zhCN / zhTW / BCP-47 variants), and any unknown language
 * falls back to English. The canonical URL and og:url are fixed
 * constants — they are never derived from host headers, query
 * parameters, or user input.
 */
export function getGlm53ApiPageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = GLM53_API_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: GLM53_API_CANONICAL,
    canonical: GLM53_API_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// Price comparison (USD per 1M tokens, input / output / cache read)
// ---------------------------------------------------------------------------

/** One row of the GLM-5.3 Vancine vs. OpenRouter price comparison. */
export interface Glm53ApiComparisonRow {
  /** The model id as Vancine lists it; the table renders this verbatim. */
  modelId: string
  /** Vancine input price, USD per 1M tokens. */
  vancineInputUsd: number
  /** Vancine output price, USD per 1M tokens. */
  vancineOutputUsd: number
  /** Vancine cache-read price, USD per 1M tokens. */
  vancineCacheReadUsd: number
  /** OpenRouter input price, USD per 1M tokens. */
  openrouterInputUsd: number
  /** OpenRouter output price, USD per 1M tokens. */
  openrouterOutputUsd: number
  /** OpenRouter cache-read price, USD per 1M tokens. */
  openrouterCacheReadUsd: number
  /** Public OpenRouter URL where the listed price was verified. */
  openrouterSourceUrl: string
}

/**
 * Approved comparison rows — exactly the two standard paid listings
 * verified on August 27, 2026. Every Vancine figure is exactly 0.8×
 * the OpenRouter figure on all three dimensions. The set is closed:
 * adding rows requires re-running the verification. These values are
 * display-only and are NOT wired to ModelRatio / CompletionRatio or
 * any billing code.
 */
export const GLM53_API_COMPARISON_ROWS: readonly Glm53ApiComparisonRow[] = [
  {
    modelId: 'glm-5.3',
    vancineInputUsd: 1.12,
    vancineOutputUsd: 3.52,
    vancineCacheReadUsd: 0.208,
    openrouterInputUsd: 1.4,
    openrouterOutputUsd: 4.4,
    openrouterCacheReadUsd: 0.26,
    openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3',
  },
  {
    modelId: 'glm-5.3-flash',
    vancineInputUsd: 0.06,
    vancineOutputUsd: 0.2,
    vancineCacheReadUsd: 0.012,
    openrouterInputUsd: 0.075,
    openrouterOutputUsd: 0.25,
    openrouterCacheReadUsd: 0.015,
    openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3-flash',
  },
]

/**
 * Price formatter used by the comparison table. Shows up to three
 * decimals so the cache-read figures ($0.208 / $0.012 / $0.015) and
 * the flash input ($0.075) render exactly; trailing zeros are trimmed
 * for two-decimal figures ($1.12, $0.06).
 */
export function formatGlm53Usd(value: number): string {
  const fixed = value.toFixed(3)
  const trimmed = fixed.endsWith('000')
    ? fixed.slice(0, -3)
    : fixed.replace(/0$/, '')
  return `$${trimmed}`
}

// ---------------------------------------------------------------------------
// Verification and mandatory disclaimers (i18n keys, byte-stable)
// ---------------------------------------------------------------------------

/** The date both listings were last verified, in the en-US long form. */
export const GLM53_API_VERIFIED_DATE_KEY = 'Last verified: August 27, 2026.'

/**
 * Mandatory disclaimers rendered next to the comparison table. The two
 * sentences after the verified date are REQUIRED copy; do not shorten
 * or reorder them.
 */
export const GLM53_API_PRICING_DISCLAIMER_KEYS = [
  GLM53_API_VERIFIED_DATE_KEY,
  'Prices may change. Vancine live pricing is authoritative. The OpenRouter comparison uses the linked standard paid listings; free variants, promotions, and temporary provider discounts are excluded.',
] as const

// ---------------------------------------------------------------------------
// API quickstart examples (curated, no real API key)
// ---------------------------------------------------------------------------

/** The default model id used by every quickstart example. */
export const GLM53_API_DEFAULT_MODEL_ID = 'glm-5.3'

/** The alternate model id shown for the one-line switch. */
export const GLM53_API_FLASH_MODEL_ID = 'glm-5.3-flash'

export interface Glm53ApiCodeExample {
  id: 'curl' | 'python'
  label: string
  code: string
}

/**
 * Quickstart examples. Every example targets https://vancine.com/v1,
 * defaults to glm-5.3, and reads the API key exclusively from the
 * VANCINE_API_KEY environment variable — never a hardcoded secret.
 * The comment lines show that switching to glm-5.3-flash only changes
 * the model id.
 */
export const GLM53_API_CODE_EXAMPLES: readonly Glm53ApiCodeExample[] = [
  {
    id: 'python',
    label: 'Python',
    code: `import os
from openai import OpenAI

# OpenAI-compatible endpoint: https://vancine.com/v1
client = OpenAI(
    api_key=os.environ["VANCINE_API_KEY"],
    base_url="https://vancine.com/v1",
)

# Default model: glm-5.3. Switch to glm-5.3-flash by
# changing only the model id below.
completion = client.chat.completions.create(
    model="glm-5.3",
    messages=[
        {"role": "user", "content": "Explain cache pricing in one sentence."}
    ],
)
print(completion.choices[0].message.content)`,
  },
  {
    id: 'curl',
    label: 'cURL',
    code: `# Default model: glm-5.3. Switch to glm-5.3-flash by
# changing only the "model" field below.
curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "glm-5.3",
    "messages": [{"role": "user", "content": "Explain cache pricing in one sentence."}]
  }'`,
  },
]

// ---------------------------------------------------------------------------
// FAQ contract
// ---------------------------------------------------------------------------

export interface Glm53ApiFaqEntry {
  /** i18n key of the question. */
  questionKey: string
  /** i18n key of the answer. */
  answerKey: string
}

/**
 * Frequently asked questions. Restrained: every answer is verifiable
 * and avoids absolute pricing or performance promises.
 */
export const GLM53_API_FAQ: readonly Glm53ApiFaqEntry[] = [
  {
    questionKey: 'What is the difference between GLM-5.3 and GLM-5.3 Flash?',
    answerKey:
      'glm-5.3 is the flagship listing for complex coding and long-context work. glm-5.3-flash is the lower-token-cost listing for high-frequency calls and multimodal input. Both are served through the same OpenAI-compatible endpoint and billed per token.',
  },
  {
    questionKey: 'How do I switch between GLM-5.3 and GLM-5.3 Flash?',
    answerKey:
      'Both models share one OpenAI-compatible endpoint at https://vancine.com/v1. Switching is a one-line change: set the model field to "glm-5.3" or "glm-5.3-flash" in your existing request. Nothing else in the request structure changes.',
  },
  {
    questionKey: 'What exactly does the 20% comparison cover?',
    answerKey:
      'The 20% figure compares Vancine with the OpenRouter standard paid listings for glm-5.3 and glm-5.3-flash only, on input, output, and cache read, as verified on August 27, 2026. Free variants, promotions, and temporary provider discounts are excluded, and no claim is made about other models.',
  },
  {
    questionKey: 'Can the prices change?',
    answerKey:
      'Yes. Prices may change. Vancine live pricing is authoritative. The OpenRouter comparison uses the linked standard paid listings; free variants, promotions, and temporary provider discounts are excluded.',
  },
  {
    questionKey: 'Do I need to change my OpenAI SDK request structure?',
    answerKey:
      'No. Vancine supports the OpenAI-compatible chat completions request, response, and streaming formats, so your existing request structure works after you point it at https://vancine.com/v1 and set the VANCINE_API_KEY environment variable. Provider-specific errors may differ.',
  },
]

// ---------------------------------------------------------------------------
// Model guidance copy
// ---------------------------------------------------------------------------

export interface Glm53ApiModelCard {
  modelId: string
  titleKey: string
  bodyKey: string
}

/**
 * Model selection guidance. The flash copy deliberately avoids any
 * speed or latency claim — only token cost, call frequency, and
 * multimodal input are asserted.
 */
export const GLM53_API_MODEL_CARDS: readonly Glm53ApiModelCard[] = [
  {
    modelId: 'glm-5.3',
    titleKey: 'glm-5.3 for flagship capability',
    bodyKey:
      'Choose glm-5.3 for flagship capability: complex coding tasks and long-context work.',
  },
  {
    modelId: 'glm-5.3-flash',
    titleKey: 'glm-5.3-flash for lower token cost',
    bodyKey:
      'Choose glm-5.3-flash for a lower token cost on high-frequency calls, with multimodal input support.',
  },
]

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the /glm-api page passes to t(). Locale
 * completeness tests iterate this list. Product-name literals that are
 * intentionally not localized (model ids, prices, code) are excluded.
 */
export const GLM53_API_EVIDENCE_KEYS = [
  'GLM-5.3 and GLM-5.3 Flash share one OpenAI-compatible endpoint at https://vancine.com/v1. Switch between them by changing only the model id.',
  'Vancine is 20% lower than OpenRouter on these two standard paid model listings.',
  'Create an API key',
  'Open Playground',
  'GLM-5.3 and GLM-5.3 Flash API',
  'Choose your model',
  'glm-5.3 for flagship capability',
  'Choose glm-5.3 for flagship capability: complex coding tasks and long-context work.',
  'glm-5.3-flash for lower token cost',
  'Choose glm-5.3-flash for a lower token cost on high-frequency calls, with multimodal input support.',
  'Provider note',
  'Provider-specific errors may differ between models and providers.',
  'Exact pricing',
  'Exact pricing: Vancine vs. OpenRouter',
  'USD per 1M tokens, verified against the linked OpenRouter standard paid listings. Vancine live pricing is authoritative.',
  'Model',
  'Dimension',
  'Vancine',
  'OpenRouter',
  'Saving',
  'Source',
  'View',
  'Input',
  'Output',
  'Cache read',
  'Saving: 20%',
  'Quickstart',
  'Point your OpenAI SDK or curl at https://vancine.com/v1, set the VANCINE_API_KEY environment variable, and use model glm-5.3 — or glm-5.3-flash when you want the lower token cost. Vancine supports the OpenAI-compatible chat completions request, response, and streaming formats. Provider-specific errors may differ.',
  'Default model glm-5.3 — switch to glm-5.3-flash by changing only the model id.',
  'Python',
  'cURL',
  'Quickstart languages',
  'Copy example code to clipboard',
  'Code copied',
  'Unable to copy code',
  'Read API documentation',
  'View pricing',
  'OpenRouter Alternative for Chinese AI Models',
  'Frequently asked questions',
  ...GLM53_API_PRICING_DISCLAIMER_KEYS,
  ...GLM53_API_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
] as const

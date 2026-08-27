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
 * Pure business logic for the /openrouter-alternative developer landing
 * page: CTA resolution, SEO metadata, the price comparison contract, FAQ,
 * evidence copy, and the API quickstart example.
 *
 * The page positions Vancine as "a curated OpenRouter alternative for the
 * latest flagship Chinese AI models". Claims stay restrained and
 * verifiable: the comparison table only covers the four flagship paid
 * model listings explicitly approved by product, the OpenRouter scope
 * is its standard paid model listing, and the live /api/pricing is the
 * authoritative source for Vancine's current rates.
 */

// ---------------------------------------------------------------------------
// Anonymous analytics event contract
// ---------------------------------------------------------------------------

// The page emits two analytics events: the auth-aware primary CTA
// (`get_started_clicked`) and the secondary resource links
// (`developer_resource_clicked`). The event NAME is the only
// declared contract; the location and resource payload keys are
// spelled inline at every call site so a future change has a single
// call site to update and there is no chance for the declared enum
// to drift from the actual call site.
//
// UTM note: the page NEVER injects UTM parameters. The CTA
// destination resolver below only retains inbound UTM parameters
// from a fixed allowlist (utm_source / utm_medium / utm_campaign /
// utm_content / utm_term) so external campaigns that arrive at the
// landing page keep their attribution; sensitive, routing, and
// unknown parameters are dropped.

export const OPENROUTER_ALTERNATIVE_CTA_EVENT = 'get_started_clicked'

export const OPENROUTER_ALTERNATIVE_RESOURCE_EVENT =
  'developer_resource_clicked'

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** The fixed canonical origin for every public link on this page. */
export const OPENROUTER_ALTERNATIVE_CANONICAL =
  'https://vancine.com/openrouter-alternative'

/** The fixed API base URL referenced in every quickstart example. */
export const OPENROUTER_ALTERNATIVE_API_BASE_URL = 'https://vancine.com/v1'

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
 * retaining only allowlisted UTM parameters. The path itself is fixed by
 * the auth state; everything else is dropped, so no sensitive value and
 * no user-controlled target can ride along — there is no open redirect
 * because the path is fixed by the auth state.
 */
export function getOpenRouterAlternativeCtaDestination(
  isAuthenticated: boolean,
  search = ''
): string {
  const destination = isAuthenticated ? '/playground' : '/sign-up'
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

export interface OpenRouterAlternativeCtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

/**
 * Split a resolved CTA destination into a TanStack Link-ready target so
 * internal navigation keeps the allowlisted UTM parameters without
 * building hrefs by string concatenation in components.
 */
export function getOpenRouterAlternativeCtaTarget(
  isAuthenticated: boolean,
  search = ''
): OpenRouterAlternativeCtaTarget {
  const destination = getOpenRouterAlternativeCtaDestination(
    isAuthenticated,
    search
  )
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

/**
 * The two possible CTA label keys, kept as a literal union so the
 * label and the destination cannot drift. Components render the
 * translated string by passing the key to t().
 */
export type OpenRouterAlternativeCtaLabelKey =
  | 'Create an API key'
  | 'Open Playground'

/**
 * Convenience helper that returns the English-source label without a
 * t() lookup. Tests and the seo metadata layer use this directly;
 * components pass the result to t() so the rendered string follows
 * the active language.
 */
export function getOpenRouterAlternativeCtaLabelKey(
  isAuthenticated: boolean
): OpenRouterAlternativeCtaLabelKey {
  return isAuthenticated ? 'Open Playground' : 'Create an API key'
}

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface OpenRouterAlternativeLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const OPENROUTER_ALTERNATIVE_METADATA: Record<
  InterfaceLanguageCode,
  OpenRouterAlternativeLanguageMetadata
> = {
  // The English twitter pair is pinned byte-for-byte against
  // router/web_metadata.go's /openrouter-alternative entry.
  en: {
    title: 'OpenRouter Alternative for Chinese AI Models | Vancine',
    description:
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.',
    ogTitle: 'OpenRouter Alternative for Chinese AI Models',
    ogDescription:
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.',
    twitterTitle: 'OpenRouter Alternative for Chinese AI Models',
    twitterDescription:
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.',
  },
  zhCN: {
    title: '中国 AI 模型 OpenRouter 替代方案 | Vancine',
    description:
      '通过一个 OpenAI 兼容 API 接入最新中国旗舰模型。比较 Vancine 与 OpenRouter，在选定的付费模型列表上节省 20%。',
    ogTitle: '中国 AI 模型的 OpenRouter 替代方案',
    ogDescription:
      '通过一个 OpenAI 兼容 API 接入最新中国旗舰模型。比较 Vancine 与 OpenRouter，在选定的付费模型列表上节省 20%。',
    twitterTitle: '中国 AI 模型 OpenRouter 替代方案',
    twitterDescription:
      '通过一个 OpenAI 兼容 API 接入最新中国旗舰模型。比较 Vancine 与 OpenRouter，在选定的付费模型列表上节省 20%。',
  },
  zhTW: {
    title: '中國 AI 模型 OpenRouter 替代方案 | Vancine',
    description:
      '透過一個 OpenAI 相容 API 接入最新中國旗艦模型。比較 Vancine 與 OpenRouter，在選定的付費模型列表上節省 20%。',
    ogTitle: '中國 AI 模型的 OpenRouter 替代方案',
    ogDescription:
      '透過一個 OpenAI 相容 API 接入最新中國旗艦模型。比較 Vancine 與 OpenRouter，在選定的付費模型列表上節省 20%。',
    twitterTitle: '中國 AI 模型 OpenRouter 替代方案',
    twitterDescription:
      '透過一個 OpenAI 相容 API 接入最新中國旗艦模型。比較 Vancine 與 OpenRouter，在選定的付費模型列表上節省 20%。',
  },
  fr: {
    title: 'Alternative à OpenRouter pour les modèles chinois | Vancine',
    description:
      'Une API compatible OpenAI pour les derniers modèles phares chinois. Comparez Vancine à OpenRouter et économisez 20 % sur certaines offres payantes sélectionnées.',
    ogTitle: 'Alternative à OpenRouter pour les modèles chinois',
    ogDescription:
      'Une API compatible OpenAI pour les derniers modèles phares chinois. Comparez Vancine à OpenRouter et économisez 20 % sur certaines offres payantes sélectionnées.',
    twitterTitle: 'Alternative à OpenRouter pour les modèles chinois',
    twitterDescription:
      'Une API compatible OpenAI pour les derniers modèles phares chinois. Comparez Vancine à OpenRouter et économisez 20 % sur certaines offres payantes sélectionnées.',
  },
  ru: {
    title: 'Альтернатива OpenRouter для китайских моделей | Vancine',
    description:
      'Один OpenAI-совместимый API для новейших флагманских китайских моделей. Сравните Vancine с OpenRouter и сэкономьте 20 % на выбранных платных предложениях.',
    ogTitle: 'Альтернатива OpenRouter для китайских моделей',
    ogDescription:
      'Один OpenAI-совместимый API для новейших флагманских китайских моделей. Сравните Vancine с OpenRouter и сэкономьте 20 % на выбранных платных предложениях.',
    twitterTitle: 'Альтернатива OpenRouter для китайских моделей',
    twitterDescription:
      'Один OpenAI-совместимый API для новейших флагманских китайских моделей. Сравните Vancine с OpenRouter и сэкономьте 20 % на выбранных платных предложениях.',
  },
  ja: {
    title: '中国系 AI モデルの OpenRouter 代替 | Vancine',
    description:
      '最新の中国系フラッグシップモデルを 1 つの OpenAI 互換 API で。利用対象の一部の有料モデルで Vancine は OpenRouter より 20% 安くなります。',
    ogTitle: '中国系 AI モデルの OpenRouter 代替',
    ogDescription:
      '最新の中国系フラッグシップモデルを 1 つの OpenAI 互換 API で。利用対象の一部の有料モデルで Vancine は OpenRouter より 20% 安くなります。',
    twitterTitle: '中国系 AI モデルの OpenRouter 代替',
    twitterDescription:
      '最新の中国系フラッグシップモデルを 1 つの OpenAI 互換 API で。利用対象の一部の有料モデルで Vancine は OpenRouter より 20% 安くなります。',
  },
  vi: {
    title: 'Phương án thay thế OpenRouter cho mô hình Trung Quốc | Vancine',
    description:
      'Một API tương thích OpenAI cho các mô hình Trung Quốc hàng đầu mới nhất. So sánh Vancine với OpenRouter và tiết kiệm 20% trên một số danh sách mô hình trả phí được chọn.',
    ogTitle: 'Phương án thay thế OpenRouter cho mô hình Trung Quốc',
    ogDescription:
      'Một API tương thích OpenAI cho các mô hình Trung Quốc hàng đầu mới nhất. So sánh Vancine với OpenRouter và tiết kiệm 20% trên một số danh sách mô hình trả phí được chọn.',
    twitterTitle: 'Phương án thay thế OpenRouter cho mô hình Trung Quốc',
    twitterDescription:
      'Một API tương thích OpenAI cho các mô hình Trung Quốc hàng đầu mới nhất. So sánh Vancine với OpenRouter và tiết kiệm 20% trên một số danh sách mô hình trả phí được chọn.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is
 * normalized (zhCN / zhTW / BCP-47 variants), and any unknown language
 * falls back to English. The canonical URL and og:url are fixed
 * constants — they are never derived from host headers, query
 * parameters, or user input.
 */
export function getOpenRouterAlternativePageMetadata(
  language: string
): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = OPENROUTER_ALTERNATIVE_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: OPENROUTER_ALTERNATIVE_CANONICAL,
    canonical: OPENROUTER_ALTERNATIVE_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// Comparison table (USD per 1M tokens, input / output)
// ---------------------------------------------------------------------------

/** One row of the public Vancine vs. OpenRouter price comparison. */
export interface OpenRouterAlternativeComparisonRow {
  /** The model id as Vancine lists it; the table renders this verbatim. */
  modelId: string
  /** Vancine input price, USD per 1M tokens. */
  vancineInputUsd: number
  /** Vancine output price, USD per 1M tokens. */
  vancineOutputUsd: number
  /** OpenRouter input price, USD per 1M tokens. */
  openrouterInputUsd: number
  /** OpenRouter output price, USD per 1M tokens. */
  openrouterOutputUsd: number
  /** Public OpenRouter URL where the comparator's published price was verified. */
  openrouterSourceUrl: string
}

/**
 * Approved comparison rows. The set is intentionally closed: every
 * row is a flagship paid model listing the product team has
 * validated, and the savings on every row is exactly 20%. Adding
 * more rows requires re-running the verification and updating the
 * Last-verified string in OPENROUTER_ALTERNATIVE_PRICING_DISCLAIMER_KEYS.
 */
export const OPENROUTER_ALTERNATIVE_COMPARISON_ROWS: readonly OpenRouterAlternativeComparisonRow[] =
  [
    {
      modelId: 'qwen3.8-max',
      vancineInputUsd: 1.6,
      vancineOutputUsd: 4.8,
      openrouterInputUsd: 2.0,
      openrouterOutputUsd: 6.0,
      openrouterSourceUrl: 'https://openrouter.ai/qwen/qwen3.8-max',
    },
    {
      modelId: 'kimi-k3',
      vancineInputUsd: 2.4,
      vancineOutputUsd: 12.0,
      openrouterInputUsd: 3.0,
      openrouterOutputUsd: 15.0,
      openrouterSourceUrl: 'https://openrouter.ai/moonshotai/kimi-k3',
    },
    {
      modelId: 'glm-5.3',
      vancineInputUsd: 1.12,
      vancineOutputUsd: 3.52,
      openrouterInputUsd: 1.4,
      openrouterOutputUsd: 4.4,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3',
    },
    {
      modelId: 'MiniMax-M3',
      vancineInputUsd: 0.24,
      vancineOutputUsd: 0.96,
      openrouterInputUsd: 0.3,
      openrouterOutputUsd: 1.2,
      openrouterSourceUrl: 'https://openrouter.ai/MiniMax/MiniMax-M3',
    },
  ]

// ---------------------------------------------------------------------------
// Pricing disclaimers (i18n keys, byte-stable)
// ---------------------------------------------------------------------------

/**
 * Mandatory public pricing disclaimers. Every key is rendered next to the
 * comparison table so the page is honest about scope, verification date,
 * and the authoritative live pricing source.
 */
export const OPENROUTER_ALTERNATIVE_PRICING_DISCLAIMER_KEYS = [
  'Last verified: August 27, 2026.',
  'OpenRouter comparison uses its standard paid model listing. Free variants, promotional routes, and temporary provider discounts are excluded.',
  'Prices may change. Vancine live pricing is authoritative at /api/pricing.',
] as const

// ---------------------------------------------------------------------------
// Model catalog copy
// ---------------------------------------------------------------------------

/**
 * Short, restrained copy describing the catalog family breadth. Kept as a
 * list (not a hardcoded count) so the catalog can refresh without the page
 * drifting out of sync.
 */
export const OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS = [
  'Qwen',
  'Kimi',
  'GLM',
  'MiniMax',
  'DeepSeek',
  'Image',
  'Video',
  'Audio',
  '3D',
] as const

// ---------------------------------------------------------------------------
// API quickstart example (curated, no real API key)
// ---------------------------------------------------------------------------

export const OPENROUTER_ALTERNATIVE_MODEL_ID = 'qwen3.8-max'

export interface OpenRouterAlternativeCodeExample {
  id: 'curl' | 'python' | 'node'
  label: string
  code: string
}

/**
 * Quickstart examples. Every example targets the public Vancine endpoint,
 * uses a single model id, and reads the API key exclusively from an
 * environment variable — never a hardcoded secret.
 *
 * The Python example uses the official `openai` SDK; the curl and Node
 * examples target the same chat completions endpoint.
 */
export const OPENROUTER_ALTERNATIVE_CODE_EXAMPLES: readonly OpenRouterAlternativeCodeExample[] =
  [
    {
      id: 'curl',
      label: 'cURL',
      code: `curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.8-max",
    "messages": [{"role": "user", "content": "Hello from the Vancine OpenAI-compatible endpoint."}]
  }'`,
    },
    {
      id: 'python',
      label: 'Python',
      code: `import os
from openai import OpenAI

# POST https://vancine.com/v1/chat/completions via the official openai SDK.
client = OpenAI(
    api_key=os.environ["VANCINE_API_KEY"],
    base_url="https://vancine.com/v1",
)

completion = client.chat.completions.create(
    model="qwen3.8-max",
    messages=[
        {"role": "user", "content": "Hello from the Vancine OpenAI-compatible endpoint."}
    ],
)
print(completion.choices[0].message.content)`,
    },
    {
      id: 'node',
      label: 'Node.js',
      code: `// POST https://vancine.com/v1/chat/completions
const response = await fetch('https://vancine.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.VANCINE_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'qwen3.8-max',
    messages: [{ role: 'user', content: 'Hello from the Vancine OpenAI-compatible endpoint.' }],
  }),
})
console.log(await response.json())`,
    },
  ]

// ---------------------------------------------------------------------------
// FAQ contract
// ---------------------------------------------------------------------------

export interface OpenRouterAlternativeFaqEntry {
  /** i18n key of the question. */
  questionKey: string
  /** i18n key of the answer. */
  answerKey: string
}

/**
 * Frequently asked questions. Restrained: every answer is verifiable
 * and avoids absolute pricing promises that would rot when the catalog
 * changes.
 */
export const OPENROUTER_ALTERNATIVE_FAQ: readonly OpenRouterAlternativeFaqEntry[] =
  [
    {
      questionKey: 'Is the Vancine API OpenAI-compatible?',
      answerKey:
        'Yes. The Vancine API follows the OpenAI chat completions contract, and your existing OpenAI SDK or curl request works once you point it at https://vancine.com/v1 and set the VANCINE_API_KEY environment variable.',
    },
    {
      questionKey: 'Does Vancine charge a top-up platform fee?',
      answerKey:
        'No platform fee is added to Vancine top-ups. The amount you pay is the amount you can spend on the Vancine catalog; the live /api/pricing endpoint is the authoritative source for the per-model rates.',
    },
    {
      questionKey: 'Why is the Vancine catalog smaller than OpenRouter?',
      answerKey:
        'Vancine is intentionally curated: the catalog only keeps the latest flagship models from each supported Chinese provider, and superseded versions are retired as new releases ship. This keeps the developer surface small, the prices current, and the integration story honest.',
    },
    {
      questionKey: 'How often does Vancine update its pricing?',
      answerKey:
        'Pricing follows the live /api/pricing endpoint. The page above shows a 20% saving on four flagship paid listings as of the verification date; free variants, promotional routes, and temporary provider discounts are not part of the comparison.',
    },
    {
      questionKey:
        'Does Vancine also cover image, video, speech and 3D models?',
      answerKey:
        'Yes. In addition to flagship text models, Vancine exposes Chinese providers for Image, Video, Audio, and 3D, all behind the same OpenAI-style API key.',
    },
  ]

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the /openrouter-alternative landing page passes
 * to t(). Locale completeness tests iterate this list. Product-name
 * literals that are intentionally not localized (e.g. "OpenRouter",
 * "Vancine", model ids, prices, code) are excluded.
 */
export const OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS = [
  'A curated OpenRouter alternative for the latest flagship Chinese AI models',
  'One OpenAI-compatible API, one API key, one balance. No top-up platform fee.',
  'Create an API key',
  'Open Playground',
  'OpenRouter Alternative for Chinese AI Models',
  'View live pricing',
  'What you get',
  '20% lower on four flagship paid listings',
  'On four flagship paid listings — qwen3.8-max, kimi-k3, glm-5.3, and MiniMax-M3 — Vancine is 20% lower than the OpenRouter standard paid model listing as of the verified date.',
  'No top-up platform fee',
  'Vancine does not add a platform fee to top-ups. The amount you pay is the amount you can spend on the Vancine catalog.',
  'OpenAI-compatible',
  'A single OpenAI-compatible chat completions endpoint at https://vancine.com/v1. Your existing OpenAI SDK, agent, and curl workflows work after you swap the base URL and the API key.',
  'Curated and continuously refreshed catalog',
  'The catalog keeps only the latest flagship models from each supported Chinese provider. Superseded versions are retired as new releases ship, so the directory stays small and the prices stay current.',
  'Price comparison',
  'Price comparison: Vancine vs. OpenRouter',
  'USD per 1M tokens. Input / output. Vancine is 20% lower on these four flagship paid listings; free variants, promotional routes, and temporary provider discounts are excluded.',
  'Model',
  'Vancine input / output',
  'OpenRouter input / output',
  'Saving',
  'OpenRouter source',
  'View',
  'Last verified',
  'Why a smaller catalog',
  'Why a smaller catalog body',
  'OpenRouter optimizes for catalog breadth. Vancine focuses on a curated set of the latest flagship Chinese models and retires superseded versions as new releases arrive.',
  'Current flagship coverage',
  'Image, Video, Audio, 3D',
  'GLM spotlight',
  'GLM-5.3 and GLM-5.3 Flash pricing',
  'Vancine exposes the latest flagship text models from Qwen, Kimi, GLM, MiniMax, and DeepSeek through one OpenAI-compatible API. The same key and balance also reach Chinese providers for Image, Video, Audio, and 3D generation, so a single integration covers your text and media workloads.',
  'Migrate from OpenRouter today',
  'Migrate from OpenRouter today body',
  'Point your OpenAI SDK, agent, or curl at https://vancine.com/v1, set the VANCINE_API_KEY environment variable, and remap OpenRouter’s provider-prefixed model ids to Vancine ids — for example, replace "qwen/qwen3.8-max" with "qwen3.8-max". Vancine supports the OpenAI-compatible chat completions request, response, and streaming formats. Provider-specific errors may differ.',
  'cURL',
  'Python',
  'Node.js',
  'Quickstart languages',
  'Copy example code to clipboard',
  'Code copied',
  'Unable to copy code',
  'Frequently asked questions',
  'Try the Vancine catalog today',
  'Create an API key in under a minute, then point your existing OpenAI-compatible client at https://vancine.com/v1.',
  'Sign up',
  'View pricing',
  'Read API documentation',
  ...OPENROUTER_ALTERNATIVE_PRICING_DISCLAIMER_KEYS,
  ...OPENROUTER_ALTERNATIVE_FAQ.flatMap((entry) => [
    entry.questionKey,
    entry.answerKey,
  ]),
] as const

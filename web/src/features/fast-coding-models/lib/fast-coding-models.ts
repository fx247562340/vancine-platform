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
import { selectFast } from '@/features/home/lib/homepage-pricing'
import { QUOTA_TYPE_VALUES } from '@/features/pricing/constants'
import { formatPrice } from '@/features/pricing/lib/price'
import type { ModelCapability, PricingModel } from '@/features/pricing/types'
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * Pure business logic for the /guides/fast-coding-models acquisition
 * guide. The page lists every model whose `tags` carry the exact
 * "fast" token, in stable case-insensitive `model_name` order. There
 * is no per-id whitelist, no fixed count, and no fallback to a
 * different model when a tag is missing.
 *
 * This page is display and copy only: it does not change pricing,
 * billing, model ratios, channels, or any database state. Live prices
 * and capabilities are always read from the /api/pricing payload via
 * the shared pricing helpers; nothing here synthesizes data when the
 * API lacks a field.
 */

// ---------------------------------------------------------------------------
// Canonical identity
// ---------------------------------------------------------------------------

export const FAST_CODING_MODELS_CANONICAL =
  'https://vancine.com/guides/fast-coding-models'

/** The fixed API base URL referenced in every example on this page. */
export const FAST_CODING_MODELS_API_BASE_URL = 'https://vancine.com/v1'

/** The only API-key placeholder ever shown on the page. */
export const FAST_CODING_MODELS_API_KEY_PLACEHOLDER = '$VANCINE_API_KEY'

// ---------------------------------------------------------------------------
// Selection — derived from the live /api/pricing "fast" tag
// ---------------------------------------------------------------------------

/**
 * The list of models shown on the guide. The source of truth is the
 * `tags` field on each entry in /api/pricing: the exact token "fast"
 * is required, so the list is data-driven, not code-driven. The
 * selection is reused for every section (cards, comparison, quickstart,
 * evidence) and is sorted case-insensitive by `model_name`.
 *
 * Generic over the input element type T — callers pass `PricingModel`
 * for live catalog rows, and the function returns `PricingModel[]`
 * without an unsafe `as` cast.
 */

/**
 * Select the guide's models from a live /api/pricing list. The
 * generic `selectFast` from the homepage lib is reused so the input
 * element type T is preserved end-to-end without an unsafe `as` cast.
 * A model is included iff its `tags` field carries the exact "fast"
 * token. Sorted case-insensitive by `model_name`. No model id is
 * hardcoded, no fixed count is enforced, and no model is substituted
 * when the fast tag is missing.
 */
export function selectFastCodingModelsPricing<
  T extends { model_name: string; tags?: string },
>(models: readonly T[]): T[] {
  return selectFast(models)
}

/** Display-ready USD prices per 1M tokens, resolved via the shared
 * pricing helpers. A null field means "not available" (per-request
 * billing, or no cache ratio in the live data) and renders as a dash;
 * values are never synthesized. */
export interface FastCodingModelsPriceSummary {
  input: string | null
  output: string | null
  cache: string | null
}

export function getFastCodingModelsPriceSummary(
  model: PricingModel
): FastCodingModelsPriceSummary {
  if (model.quota_type !== QUOTA_TYPE_VALUES.TOKEN) {
    return { input: null, output: null, cache: null }
  }
  return {
    input: formatPrice(model, 'input', 'M'),
    output: formatPrice(model, 'output', 'M'),
    cache: model.cache_ratio != null ? formatPrice(model, 'cache', 'M') : null,
  }
}

// ---------------------------------------------------------------------------
// CTA destinations — fixed owned-media UTMs, never inbound passthrough
// ---------------------------------------------------------------------------

/** The fixed owned-media UTM base shared by every CTA on this page. */
export const FAST_CODING_MODELS_UTM = {
  utm_source: 'vancine',
  utm_medium: 'owned',
  utm_campaign: 'fast_coding_models_guide',
} as const

/** CTA placement identifiers; each maps to one utm_content value. */
export type FastCodingModelsCtaContent = 'hero' | 'final' | 'pricing' | 'docs'

/** CTA paths by auth state; the target is never user-controlled. */
export const FAST_CODING_MODELS_CTA_DESTINATION_AUTH = {
  guest: '/sign-up',
  authenticated: '/playground',
} as const

/**
 * Build the CTA search parameters for a placement. The four UTM keys
 * are fixed owned-media values; utm_content is the placement. The
 * inbound query string is accepted only to be scrubbed entirely:
 * email, token, api_key, redirect, inbound UTM overrides, and any
 * unknown parameter are all dropped, so nothing from the landing URL
 * ever rides along into a CTA.
 */
export function buildFastCodingModelsCtaSearch(
  content: FastCodingModelsCtaContent,
  inboundSearch = ''
): Record<string, string> {
  void inboundSearch
  return {
    ...FAST_CODING_MODELS_UTM,
    utm_content: content,
  }
}

export interface FastCodingModelsCtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

/**
 * Resolve the auth-aware "Start with Vancine" CTA target for a
 * placement: guests land on /sign-up, authenticated users on
 * /playground, always with the fixed owned-media UTMs.
 */
export function getFastCodingModelsCtaTarget(
  isAuthenticated: boolean,
  content: FastCodingModelsCtaContent,
  inboundSearch = ''
): FastCodingModelsCtaTarget {
  return {
    to: isAuthenticated
      ? FAST_CODING_MODELS_CTA_DESTINATION_AUTH.authenticated
      : FAST_CODING_MODELS_CTA_DESTINATION_AUTH.guest,
    search: buildFastCodingModelsCtaSearch(content, inboundSearch),
  }
}

// ---------------------------------------------------------------------------
// Anonymous analytics event contract
// ---------------------------------------------------------------------------

export const FAST_CODING_MODELS_CTA_EVENT = 'get_started_clicked'

export const FAST_CODING_MODELS_RESOURCE_EVENT = 'developer_resource_clicked'

export const FAST_CODING_MODELS_RESOURCE = 'fast_coding_models_guide'

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface FastCodingModelsLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const FAST_CODING_MODELS_METADATA: Record<
  InterfaceLanguageCode,
  FastCodingModelsLanguageMetadata
> = {
  // The English block is pinned byte-for-byte against
  // router/web_metadata.go's /guides/fast-coding-models entry.
  en: {
    title:
      'Fast Chinese AI Models for Coding and High-Throughput Workloads | Vancine',
    description:
      'Explore fast-inference Chinese AI models available through Vancine’s OpenAI-compatible API, with live pricing and model capabilities from the current catalog.',
    ogTitle: 'Fast Chinese AI Models for Coding and High-Throughput Workloads',
    ogDescription:
      'Explore fast-inference Chinese AI models available through Vancine’s OpenAI-compatible API, with live pricing and model capabilities from the current catalog.',
    twitterTitle:
      'Fast Chinese AI Models for Coding and High-Throughput Workloads',
    twitterDescription:
      'Explore fast-inference Chinese AI models available through Vancine’s OpenAI-compatible API, with live pricing and model capabilities from the current catalog.',
  },
  zhCN: {
    title: '面向编码与高吞吐负载的快速中国 AI 模型 | Vancine',
    description:
      '通过 Vancine 提供的 OpenAI 兼容 API，探索当前目录中可用的快速推理中国 AI 模型，获取实时价格与能力信息。',
    ogTitle: '面向编码与高吞吐负载的快速中国 AI 模型',
    ogDescription:
      '通过 Vancine 提供的 OpenAI 兼容 API，探索当前目录中可用的快速推理中国 AI 模型，获取实时价格与能力信息。',
    twitterTitle: '面向编码与高吞吐负载的快速中国 AI 模型',
    twitterDescription:
      '通过 Vancine 提供的 OpenAI 兼容 API，探索当前目录中可用的快速推理中国 AI 模型，获取实时价格与能力信息。',
  },
  zhTW: {
    title: '面向編碼與高吞吐負載的快速中國 AI 模型 | Vancine',
    description:
      '透過 Vancine 提供的 OpenAI 相容 API，探索目前目錄中可用的快速推論中國 AI 模型，取得即時價格與能力資訊。',
    ogTitle: '面向編碼與高吞吐負載的快速中國 AI 模型',
    ogDescription:
      '透過 Vancine 提供的 OpenAI 相容 API，探索目前目錄中可用的快速推論中國 AI 模型，取得即時價格與能力資訊。',
    twitterTitle: '面向編碼與高吞吐負載的快速中國 AI 模型',
    twitterDescription:
      '透過 Vancine 提供的 OpenAI 相容 API，探索目前目錄中可用的快速推論中國 AI 模型，取得即時價格與能力資訊。',
  },
  fr: {
    title:
      'Modèles d’IA chinois rapides pour code et workloads à haut débit | Vancine',
    description:
      'Explorez les modèles d’IA chinois à inférence rapide disponibles via l’API compatible OpenAI de Vancine, avec tarifs en direct et capacités issues du catalogue actuel.',
    ogTitle: 'Modèles d’IA chinois rapides pour code et workloads à haut débit',
    ogDescription:
      'Explorez les modèles d’IA chinois à inférence rapide disponibles via l’API compatible OpenAI de Vancine, avec tarifs en direct et capacités issues du catalogue actuel.',
    twitterTitle:
      'Modèles d’IA chinois rapides pour code et workloads à haut débit',
    twitterDescription:
      'Explorez les modèles d’IA chinois à inférence rapide disponibles via l’API compatible OpenAI de Vancine, avec tarifs en direct et capacités issues du catalogue actuel.',
  },
  ru: {
    title:
      'Быстрые китайские ИИ-модели для кода и высоконагруженных задач | Vancine',
    description:
      'Изучите быстрые китайские ИИ-модели, доступные через OpenAI-совместимый API Vancine, с актуальными ценами и возможностями из текущего каталога.',
    ogTitle: 'Быстрые китайские ИИ-модели для кода и высоконагруженных задач',
    ogDescription:
      'Изучите быстрые китайские ИИ-модели, доступные через OpenAI-совместимый API Vancine, с актуальными ценами и возможностями из текущего каталога.',
    twitterTitle:
      'Быстрые китайские ИИ-модели для кода и высоконагруженных задач',
    twitterDescription:
      'Изучите быстрые китайские ИИ-модели, доступные через OpenAI-совместимый API Vancine, с актуальными ценами и возможностями из текущего каталога.',
  },
  ja: {
    title: 'コーディングと高スループット向け中国発高速 AI モデル | Vancine',
    description:
      'Vancine の OpenAI 互換 API で利用できる、中国発の高速推論 AI モデルを現在のカタログから探索。リアルタイム価格と機能を確認できます。',
    ogTitle: 'コーディングと高スループット向け中国発高速 AI モデル',
    ogDescription:
      'Vancine の OpenAI 互換 API で利用できる、中国発の高速推論 AI モデルを現在のカタログから探索。リアルタイム価格と機能を確認できます。',
    twitterTitle: 'コーディングと高スループット向け中国発高速 AI モデル',
    twitterDescription:
      'Vancine の OpenAI 互換 API で利用できる、中国発の高速推論 AI モデルを現在のカタログから探索。リアルタイム価格と機能を確認できます。',
  },
  vi: {
    title:
      'Mô hình AI Trung Quốc tốc độ cao cho code và workloads thông lượng lớn | Vancine',
    description:
      'Khám phá các mô hình AI Trung Quốc suy luận nhanh có sẵn qua API tương thích OpenAI của Vancine, với giá theo thời gian thực và năng lực từ danh mục hiện hành.',
    ogTitle:
      'Mô hình AI Trung Quốc tốc độ cao cho code và workloads thông lượng lớn',
    ogDescription:
      'Khám phá các mô hình AI Trung Quốc suy luận nhanh có sẵn qua API tương thích OpenAI của Vancine, với giá theo thời gian thực và năng lực từ danh mục hiện hành.',
    twitterTitle:
      'Mô hình AI Trung Quốc tốc độ cao cho code và workloads thông lượng lớn',
    twitterDescription:
      'Khám phá các mô hình AI Trung Quốc suy luận nhanh có sẵn qua API tương thích OpenAI của Vancine, với giá theo thời gian thực và năng lực từ danh mục hiện hành.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is
 * normalized (zhCN / zhTW / BCP-47 variants), and any unknown language
 * falls back to English. The canonical URL and og:url are fixed
 * constants — they are never derived from host headers, query
 * parameters, or user input.
 */
export function getFastCodingModelsPageMetadata(
  language: string
): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = FAST_CODING_MODELS_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: FAST_CODING_MODELS_CANONICAL,
    canonical: FAST_CODING_MODELS_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// Catalog display helpers
// ---------------------------------------------------------------------------

/**
 * Capability label keys shared by the model cards and the comparison
 * table. Values are the same English-source i18n keys the pricing page
 * uses, so translations stay in one place (the locale files).
 */
export const FAST_CODING_MODELS_CAPABILITY_LABEL_KEY: Record<
  ModelCapability,
  string
> = {
  function_calling: 'Function calling',
  streaming: 'Streaming',
  vision: 'Vision',
  json_mode: 'JSON mode',
  structured_output: 'Structured output',
  reasoning: 'Reasoning',
  tools: 'Tools',
  system_prompt: 'System prompt',
  web_search: 'Web search',
  code_interpreter: 'Code interpreter',
  caching: 'Prompt caching',
  embeddings: 'Embeddings',
}

/** Modality label keys shared by the model cards and the comparison. */
export const FAST_CODING_MODELS_MODALITY_LABEL_KEY: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
}

/**
 * Format a catalog token count (context window / max output) with the
 * same M/K convention the pricing pages use. Returns null when the
 * backend did not provide a usable value — the UI renders a dash and
 * never synthesizes a number.
 */
export function formatFastCodingModelsTokenCount(
  tokens: number | undefined
): string | null {
  if (tokens === undefined || !Number.isFinite(tokens) || tokens <= 0) {
    return null
  }
  if (tokens >= 1_000_000) {
    return `${trimTrailingZeros((tokens / 1_000_000).toFixed(1))}M`
  }
  if (tokens >= 1_000) {
    return `${trimTrailingZeros((tokens / 1_000).toFixed(1))}K`
  }
  return String(tokens)
}

function trimTrailingZeros(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value
}

// ---------------------------------------------------------------------------
// Quickstart
// ---------------------------------------------------------------------------

/**
 * Build the curl example using the first live fast-tagged model as the
 * default. When the fast list is empty, returns null — the caller must
 * render an empty state and never a curl with a fake model id.
 */
export function getFastCodingModelsCurlExample(
  defaultModelId: string | null
): string | null {
  if (!defaultModelId) return null
  return `curl ${FAST_CODING_MODELS_API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer ${FAST_CODING_MODELS_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${defaultModelId}",
    "messages": [
      { "role": "user", "content": "Fix this function so the tests pass." }
    ]
  }'`
}

/**
 * The fixed evidence-boundary facts. The guide is a selection guide,
 * not a benchmark; the "fast" tag is not equivalent to measured
 * performance, benchmark membership, or official partnership.
 */
export const FAST_CODING_MODELS_EVIDENCE_KEYS = [
  'This page reflects the current fast-tagged catalog and does not claim benchmark membership or measured performance for any model.',
  'See the benchmark page for recorded results, and do not extend those results to fast-tagged models that were not tested.',
] as const

// ---------------------------------------------------------------------------
// FAQ (i18n keys, byte-stable)
// ---------------------------------------------------------------------------

export interface FastCodingModelsFaqEntry {
  questionKey: string
  answerKey: string
}

export const FAST_CODING_MODELS_FAQ: readonly FastCodingModelsFaqEntry[] = [
  {
    questionKey: 'How do I switch models?',
    answerKey:
      'Keep the same Base URL and API key, and change only the model field of your request to another model shown in the live fast-model catalog.',
  },
  {
    questionKey: 'Where does the live price come from?',
    answerKey:
      'Prices and capabilities on this page are read live from the Vancine pricing API, the same source as the model square. Prices can change at any time.',
  },
  {
    questionKey: 'Are these models officially partnered with Vancine?',
    answerKey:
      'No. Vancine is not the official vendor, partner, or built-in provider of these model labs or of coding-agent tools such as OpenCode, Cline, or Roo Code. Vancine provides access through one OpenAI-compatible API.',
  },
  {
    questionKey: 'Where can I configure OpenCode, Cline, or Roo Code?',
    answerKey:
      'Follow the Coding Agent Integration Center for the Base URL, API key, and model setup of each tool.',
  },
]

/**
 * Generic, honest guidance rendered identically on every card and in
 * the comparison table. There is no per-model-id guidance: the
 * decision between fast-tagged models is left to live pricing, context
 * window, and capability facts.
 */
export const FAST_CODING_MODELS_GENERIC_GUIDANCE_KEY =
  'Compare live prices, context limits, and capabilities to choose the model that fits your workload.'

/**
 * Every translation key this page passes to t(). Locale completeness
 * tests iterate this list. Model ids, numbers, URLs, and code are
 * excluded.
 */
export const FAST_CODING_MODELS_I18N_KEYS = [
  // Hero
  'Model selection guide',
  'Fast Chinese AI models for coding and high-throughput workloads',
  'Explore fast-inference Chinese AI models available through Vancine’s OpenAI-compatible API, with live pricing and model capabilities from the current catalog.',
  'Compare the fast models',
  'Start with Vancine',
  // One endpoint, dynamic model list
  'One endpoint, dynamic fast models',
  'Every model tagged "fast" in the public catalog shares one OpenAI-compatible endpoint at https://vancine.com/v1. Switch models by changing only the model field of your request.',
  'Base URL',
  'API Key',
  'Model IDs',
  'Replace the placeholder with your own key. Never paste a real API key into this page.',
  // Model cards
  'Pick the model that fits your agent',
  'Live pricing and capabilities are read from the Vancine pricing API.',
  'Preview',
  'Input',
  'Output',
  'Cache read',
  'Context',
  'Max output',
  'Inputs',
  'Capabilities',
  'Model details',
  'Not listed in live pricing right now.',
  'View live pricing',
  'Live pricing is unavailable right now. The guide and the CTAs still work; check the pricing page for the latest figures.',
  'No fast models are listed in the public catalog right now.',
  FAST_CODING_MODELS_GENERIC_GUIDANCE_KEY,
  // Comparison
  'Comparison',
  'Platform facts below come from live pricing metadata. Catalog description is shown on each card.',
  'Model',
  'Input price',
  'Output price',
  'Cache read price',
  'Input modalities',
  'Context window',
  'per 1M tokens',
  // Capability and modality labels (shared vocabulary with the pricing page)
  'Function calling',
  'Streaming',
  'Vision',
  'JSON mode',
  'Structured output',
  'Reasoning',
  'Tools',
  'System prompt',
  'Web search',
  'Code interpreter',
  'Prompt caching',
  'Embeddings',
  'Text',
  'Image',
  'Audio',
  'Video',
  'File',
  // Quickstart
  'Quickstart',
  'Send your first request with curl, then switch models by changing only the model field.',
  'Switch to any of the other fast models by changing only the model field:',
  'No code sample is available while the fast catalog is empty.',
  'Set up OpenCode, Cline, or Roo Code',
  'Connect Vancine in OpenCode with /connect — no manual provider JSON required.',
  // Evidence boundary
  'Measured results are separate',
  'This page is a selection guide for fast-inference models, not a benchmark.',
  ...FAST_CODING_MODELS_EVIDENCE_KEYS,
  'View the benchmark',
  // Quickstart copy helpers shared with the copyable code block
  'Code copied',
  'Unable to copy code',
  'Copy example code to clipboard',
  // FAQ and disclosure
  'Frequently asked questions',
  ...FAST_CODING_MODELS_FAQ.flatMap((entry) => [
    entry.questionKey,
    entry.answerKey,
  ]),
  'Prices and capabilities can change; the model square and the live pricing API are the source of truth.',
  // Final CTA
  'Start with one endpoint',
  'Create an API key, point your coding agent at https://vancine.com/v1, and switch between fast models by changing only the model field.',
] as const

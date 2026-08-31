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
 * guide. The page compares EXACTLY four model ids — never renamed,
 * expanded, or substituted — through one OpenAI-compatible endpoint.
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
// The four models — a closed, exact set
// ---------------------------------------------------------------------------

/**
 * The exact four model ids this guide compares. The set is closed:
 * selection is strict string equality on `model_name`, so no other
 * model can ever leak into the page, and a missing id degrades to an
 * explicit missing state instead of being substituted.
 */
export const FAST_CODING_MODEL_IDS = [
  'hy4-preview',
  'deepseek-v4-flash-vision-exp',
  'glm-5.3-flash',
  'qwen3.8-flash',
] as const

export type FastCodingModelId = (typeof FAST_CODING_MODEL_IDS)[number]

/**
 * Preview flag per model id, fixed editorial metadata. Only
 * hy4-preview is actually a preview release; the flag is declared
 * explicitly per id instead of being derived from the id string.
 */
export const FAST_CODING_MODEL_PREVIEW: Record<FastCodingModelId, boolean> = {
  'hy4-preview': true,
  'deepseek-v4-flash-vision-exp': false,
  'glm-5.3-flash': false,
  'qwen3.8-flash': false,
}

/**
 * Neutral, editorial "Consider when…" guidance per model id. These are
 * selection suggestions, never measured claims; the page renders them
 * visually separate from platform facts.
 */
export const FAST_CODING_MODEL_GUIDANCE_KEY: Record<FastCodingModelId, string> =
  {
    'hy4-preview':
      'Consider when you want early access to a preview release and can tolerate preview-level changes.',
    'deepseek-v4-flash-vision-exp':
      'Consider when your coding agent reads images or screenshots and you want an experimental flash-class model.',
    'glm-5.3-flash':
      'Consider when you want a flash-class GLM model that also appears in the Vancine Pi coding-agent benchmark.',
    'qwen3.8-flash':
      'Consider when you want a flash-class Qwen model that also appears in the Vancine Pi coding-agent benchmark.',
  }

/** One slot per exact model id, in the fixed guide order. */
export interface FastCodingModelsPricingSlot {
  modelId: FastCodingModelId
  /** The live pricing entry, or null when the model is not listed. */
  model: PricingModel | null
}

/**
 * Select exactly the four guide models from a live /api/pricing model
 * list, preserving the fixed guide order. Matching is strict string
 * equality on model_name — case, prefix, and substring matches are
 * impossible — and every id always yields a slot, so a missing model
 * surfaces as an explicit degradation state and can never be replaced
 * by a different model.
 */
export function selectFastCodingModelsPricing(
  models: readonly PricingModel[]
): FastCodingModelsPricingSlot[] {
  return FAST_CODING_MODEL_IDS.map((modelId) => ({
    modelId,
    model: models.find((model) => model.model_name === modelId) ?? null,
  }))
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
    title: 'Four Fast Chinese AI Models for Coding Agents | Vancine',
    description:
      'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
    ogTitle: 'Four Fast Chinese AI Models for Coding Agents',
    ogDescription:
      'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
    twitterTitle: 'Four Fast Chinese AI Models for Coding Agents',
    twitterDescription:
      'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
  },
  zhCN: {
    title: '面向 Coding Agent 的四个快速中国 AI 模型 | Vancine',
    description:
      '通过一个 OpenAI 兼容 API，比较 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 和 Qwen3.8 Flash。',
    ogTitle: '面向 Coding Agent 的四个快速中国 AI 模型',
    ogDescription:
      '通过一个 OpenAI 兼容 API，比较 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 和 Qwen3.8 Flash。',
    twitterTitle: '面向 Coding Agent 的四个快速中国 AI 模型',
    twitterDescription:
      '通过一个 OpenAI 兼容 API，比较 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 和 Qwen3.8 Flash。',
  },
  zhTW: {
    title: '面向 Coding Agent 的四個快速中國 AI 模型 | Vancine',
    description:
      '透過一個 OpenAI 相容 API，比較 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 與 Qwen3.8 Flash。',
    ogTitle: '面向 Coding Agent 的四個快速中國 AI 模型',
    ogDescription:
      '透過一個 OpenAI 相容 API，比較 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 與 Qwen3.8 Flash。',
    twitterTitle: '面向 Coding Agent 的四個快速中國 AI 模型',
    twitterDescription:
      '透過一個 OpenAI 相容 API，比較 Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash 與 Qwen3.8 Flash。',
  },
  fr: {
    title: 'Quatre modèles d’IA chinois rapides pour agents de code | Vancine',
    description:
      'Comparez Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash et Qwen3.8 Flash via une seule API compatible OpenAI.',
    ogTitle: 'Quatre modèles d’IA chinois rapides pour agents de code',
    ogDescription:
      'Comparez Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash et Qwen3.8 Flash via une seule API compatible OpenAI.',
    twitterTitle: 'Quatre modèles d’IA chinois rapides pour agents de code',
    twitterDescription:
      'Comparez Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash et Qwen3.8 Flash via une seule API compatible OpenAI.',
  },
  ru: {
    title: 'Четыре быстрые китайские ИИ-модели для кодинг-агентов | Vancine',
    description:
      'Сравните Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash и Qwen3.8 Flash через один OpenAI-совместимый API.',
    ogTitle: 'Четыре быстрые китайские ИИ-модели для кодинг-агентов',
    ogDescription:
      'Сравните Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash и Qwen3.8 Flash через один OpenAI-совместимый API.',
    twitterTitle: 'Четыре быстрые китайские ИИ-модели для кодинг-агентов',
    twitterDescription:
      'Сравните Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash и Qwen3.8 Flash через один OpenAI-совместимый API.',
  },
  ja: {
    title: 'コーディングエージェント向け中国発高速 AI モデル 4 選 | Vancine',
    description:
      'Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash、Qwen3.8 Flash を 1 つの OpenAI 互換 API で比較。',
    ogTitle: 'コーディングエージェント向け中国発高速 AI モデル 4 選',
    ogDescription:
      'Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash、Qwen3.8 Flash を 1 つの OpenAI 互換 API で比較。',
    twitterTitle: 'コーディングエージェント向け中国発高速 AI モデル 4 選',
    twitterDescription:
      'Hy4 Preview、DeepSeek V4 Flash Vision Exp、GLM-5.3 Flash、Qwen3.8 Flash を 1 つの OpenAI 互換 API で比較。',
  },
  vi: {
    title: 'Bốn mô hình AI Trung Quốc tốc độ cao cho coding agent | Vancine',
    description:
      'So sánh Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash và Qwen3.8 Flash qua một API tương thích OpenAI.',
    ogTitle: 'Bốn mô hình AI Trung Quốc tốc độ cao cho coding agent',
    ogDescription:
      'So sánh Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash và Qwen3.8 Flash qua một API tương thích OpenAI.',
    twitterTitle: 'Bốn mô hình AI Trung Quốc tốc độ cao cho coding agent',
    twitterDescription:
      'So sánh Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash và Qwen3.8 Flash qua một API tương thích OpenAI.',
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

/** The curl example always defaults to glm-5.3-flash. */
export const FAST_CODING_MODELS_DEFAULT_MODEL: FastCodingModelId =
  'glm-5.3-flash'

/** The three alternatives listed beside the curl example. */
export const FAST_CODING_MODELS_ALTERNATE_MODELS: readonly FastCodingModelId[] =
  FAST_CODING_MODEL_IDS.filter(
    (modelId) => modelId !== FAST_CODING_MODELS_DEFAULT_MODEL
  )

export const FAST_CODING_MODELS_CURL_EXAMPLE = `curl ${FAST_CODING_MODELS_API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer ${FAST_CODING_MODELS_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${FAST_CODING_MODELS_DEFAULT_MODEL}",
    "messages": [
      { "role": "user", "content": "Fix this function so the tests pass." }
    ]
  }'`

/**
 * The exact benchmark membership facts rendered in the evidence
 * boundary section, kept as fixed i18n keys.
 */
export const FAST_CODING_MODELS_EVIDENCE_KEYS = [
  'The benchmark includes glm-5.3-flash and qwen3.8-flash.',
  'The benchmark does not include hy4-preview.',
  'The benchmark does not include deepseek-v4-flash-vision-exp; the deepseek-v4-flash listed there is a different model ID.',
  'Do not extend those results to models that were not tested.',
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
      'Keep the same Base URL and API key, and change only the model field of the request to hy4-preview, deepseek-v4-flash-vision-exp, glm-5.3-flash, or qwen3.8-flash.',
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
 * Every translation key this page passes to t(). Locale completeness
 * tests iterate this list. Model ids, numbers, URLs, and code are
 * excluded.
 */
export const FAST_CODING_MODELS_I18N_KEYS = [
  // Hero
  'Model selection guide',
  'Four fast Chinese AI models for coding agents',
  'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
  'Compare the four models',
  'Start with Vancine',
  // One endpoint, four models
  'One endpoint, four models',
  'All four models share one OpenAI-compatible endpoint at https://vancine.com/v1. Switch models by changing only the model field of your request.',
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
  // Guidance
  ...Object.values(FAST_CODING_MODEL_GUIDANCE_KEY),
  // Comparison
  'Comparison',
  'Platform facts below come from live pricing metadata. Editorial guidance is marked separately.',
  'Editorial guidance',
  'Model',
  'Input price',
  'Output price',
  'Cache read price',
  'Input modalities',
  'Context window',
  'Consider when…',
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
  'Switch to any of the other three models by changing only the model field:',
  'Set up OpenCode, Cline, or Roo Code',
  'Connect Vancine in OpenCode with /connect — no manual provider JSON required.',
  // Evidence boundary
  'Measured results are separate',
  'This page is a selection guide, not a benchmark. The existing Pi benchmark is a separate, single-task, single-run piece of evidence.',
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
  'Create an API key, point your coding agent at https://vancine.com/v1, and switch between the four models by changing only the model field.',
] as const

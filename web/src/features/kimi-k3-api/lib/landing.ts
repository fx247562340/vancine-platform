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
import type { LandingModelPrice } from '@/features/landing-pricing'
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * Pure business logic for the Kimi K3.1 developer landing page. The route
 * and canonical use /kimi-api; the server redirects old campaign links. Live
 * Vancine amounts are not stored here.
 */

export const KIMI_K3_CTA_EVENT = 'get_started_clicked'

export const KIMI_K3_CTA_LOCATIONS = [
  'kimi_k3_hero',
  'kimi_k3_quickstart',
  'kimi_k3_evidence',
  'kimi_k3_final_cta',
] as const

export type KimiK3CtaLocation = (typeof KIMI_K3_CTA_LOCATIONS)[number]

export const KIMI_K3_RESOURCE_EVENT = 'developer_resource_clicked'

export const KIMI_K3_RESOURCE_VALUES = [
  'docs',
  'pricing',
  'starter_repo',
  'kimi_official_pricing',
  'openrouter_pricing',
] as const

export type KimiK3ResourceValue = (typeof KIMI_K3_RESOURCE_VALUES)[number]

export const KIMI_K3_RESOURCE_LOCATIONS = [
  'quickstart',
  'evidence',
  'pricing',
] as const

export type KimiK3ResourceLocation = (typeof KIMI_K3_RESOURCE_LOCATIONS)[number]

export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-api'
export const KIMI_K3_PRICING_SECTION_ID = 'pricing'

const ALLOWED_UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

export function getKimiK3CtaDestination(
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

export interface KimiK3CtaTarget {
  to: '/sign-up' | '/playground'
  search: Record<string, string>
}

export function getKimiK3CtaTarget(
  isAuthenticated: boolean,
  search = ''
): KimiK3CtaTarget {
  const destination = getKimiK3CtaDestination(isAuthenticated, search)
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

export type KimiK3CtaLabelKey = 'Create an API key' | 'Open Playground'

export function getKimiK3CtaLabelKey(
  isAuthenticated: boolean
): KimiK3CtaLabelKey {
  return isAuthenticated ? 'Open Playground' : 'Create an API key'
}

interface KimiK3LanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const KIMI_K3_METADATA: Record<InterfaceLanguageCode, KimiK3LanguageMetadata> =
  {
    // The English block is pinned byte-for-byte against
    // router/web_metadata.go's /kimi-api entry.
    en: {
      title: 'Kimi K3.1 Pro & Highspeed API for Coding Agents | Vancine',
      description:
        'Choose Kimi K3.1 Pro or Highspeed on an OpenAI-compatible API. Compare live Vancine input and output prices with the October 24, 2026 Kimi official reference.',
      ogTitle: 'Kimi K3.1 Pro & Highspeed API for Coding Agents',
      ogDescription:
        'Choose Kimi K3.1 Pro or Highspeed on an OpenAI-compatible API. Compare live Vancine input and output prices with the October 24, 2026 Kimi official reference.',
      twitterTitle: 'Kimi K3.1 Pro & Highspeed API for Coding Agents',
      twitterDescription:
        'Choose Kimi K3.1 Pro or Highspeed on an OpenAI-compatible API. Compare live Vancine input and output prices with the October 24, 2026 Kimi official reference.',
    },
    zhCN: {
      title: 'Kimi K3.1 Pro 与 Highspeed API：面向编程 Agent | Vancine',
      description:
        '在同一个 OpenAI 兼容 API 上选择 Kimi K3.1 Pro 或 Highspeed。将 Vancine 实时输入和输出价格与 2026 年 10 月 24 日的 Kimi 官方参考价对比。',
      ogTitle: 'Kimi K3.1 Pro 与 Highspeed API：面向编程 Agent',
      ogDescription:
        '在同一个 OpenAI 兼容 API 上选择 Kimi K3.1 Pro 或 Highspeed。将 Vancine 实时输入和输出价格与 2026 年 10 月 24 日的 Kimi 官方参考价对比。',
      twitterTitle: 'Kimi K3.1 Pro 与 Highspeed API：面向编程 Agent',
      twitterDescription:
        '在同一个 OpenAI 兼容 API 上选择 Kimi K3.1 Pro 或 Highspeed。将 Vancine 实时输入和输出价格与 2026 年 10 月 24 日的 Kimi 官方参考价对比。',
    },
    zhTW: {
      title: 'Kimi K3.1 Pro 與 Highspeed API：面向程式 Agent | Vancine',
      description:
        '在同一個 OpenAI 相容 API 上選擇 Kimi K3.1 Pro 或 Highspeed。將 Vancine 即時輸入與輸出價格和 2026 年 10 月 24 日的 Kimi 官方參考價對比。',
      ogTitle: 'Kimi K3.1 Pro 與 Highspeed API：面向程式 Agent',
      ogDescription:
        '在同一個 OpenAI 相容 API 上選擇 Kimi K3.1 Pro 或 Highspeed。將 Vancine 即時輸入與輸出價格和 2026 年 10 月 24 日的 Kimi 官方參考價對比。',
      twitterTitle: 'Kimi K3.1 Pro 與 Highspeed API：面向程式 Agent',
      twitterDescription:
        '在同一個 OpenAI 相容 API 上選擇 Kimi K3.1 Pro 或 Highspeed。將 Vancine 即時輸入與輸出價格和 2026 年 10 月 24 日的 Kimi 官方參考價對比。',
    },
    fr: {
      title: 'API Kimi K3.1 Pro et Highspeed pour les agents de code | Vancine',
      description:
        "Choisissez Kimi K3.1 Pro ou Highspeed via une API compatible OpenAI. Comparez les prix d'entrée et de sortie Vancine en direct avec la référence officielle Kimi du 24 octobre 2026.",
      ogTitle: 'API Kimi K3.1 Pro et Highspeed pour les agents de code',
      ogDescription:
        "Choisissez Kimi K3.1 Pro ou Highspeed via une API compatible OpenAI. Comparez les prix d'entrée et de sortie Vancine en direct avec la référence officielle Kimi du 24 octobre 2026.",
      twitterTitle: 'API Kimi K3.1 Pro et Highspeed pour les agents de code',
      twitterDescription:
        "Choisissez Kimi K3.1 Pro ou Highspeed via une API compatible OpenAI. Comparez les prix d'entrée et de sortie Vancine en direct avec la référence officielle Kimi du 24 octobre 2026.",
    },
    ru: {
      title:
        'API Kimi K3.1 Pro и Highspeed для агентов программирования | Vancine',
      description:
        'Выберите Kimi K3.1 Pro или Highspeed через OpenAI-совместимый API. Сравните актуальные цены Vancine на вход и выход с официальной справкой Kimi от 24 октября 2026 г.',
      ogTitle: 'API Kimi K3.1 Pro и Highspeed для агентов программирования',
      ogDescription:
        'Выберите Kimi K3.1 Pro или Highspeed через OpenAI-совместимый API. Сравните актуальные цены Vancine на вход и выход с официальной справкой Kimi от 24 октября 2026 г.',
      twitterTitle:
        'API Kimi K3.1 Pro и Highspeed для агентов программирования',
      twitterDescription:
        'Выберите Kimi K3.1 Pro или Highspeed через OpenAI-совместимый API. Сравните актуальные цены Vancine на вход и выход с официальной справкой Kimi от 24 октября 2026 г.',
    },
    ja: {
      title:
        'コーディングエージェント向け Kimi K3.1 Pro と Highspeed API | Vancine',
      description:
        'OpenAI 互換 API で Kimi K3.1 Pro または Highspeed を選べます。Vancine のリアルタイム入力・出力価格を、2026年10月24日の Kimi 公式参考価格と比較します。',
      ogTitle: 'コーディングエージェント向け Kimi K3.1 Pro と Highspeed API',
      ogDescription:
        'OpenAI 互換 API で Kimi K3.1 Pro または Highspeed を選べます。Vancine のリアルタイム入力・出力価格を、2026年10月24日の Kimi 公式参考価格と比較します。',
      twitterTitle:
        'コーディングエージェント向け Kimi K3.1 Pro と Highspeed API',
      twitterDescription:
        'OpenAI 互換 API で Kimi K3.1 Pro または Highspeed を選べます。Vancine のリアルタイム入力・出力価格を、2026年10月24日の Kimi 公式参考価格と比較します。',
    },
    vi: {
      title: 'API Kimi K3.1 Pro và Highspeed cho tác nhân lập trình | Vancine',
      description:
        'Chọn Kimi K3.1 Pro hoặc Highspeed qua API tương thích OpenAI. So sánh giá đầu vào và đầu ra Vancine trực tiếp với giá tham chiếu chính thức của Kimi ngày 24 tháng 10 năm 2026.',
      ogTitle: 'API Kimi K3.1 Pro và Highspeed cho tác nhân lập trình',
      ogDescription:
        'Chọn Kimi K3.1 Pro hoặc Highspeed qua API tương thích OpenAI. So sánh giá đầu vào và đầu ra Vancine trực tiếp với giá tham chiếu chính thức của Kimi ngày 24 tháng 10 năm 2026.',
      twitterTitle: 'API Kimi K3.1 Pro và Highspeed cho tác nhân lập trình',
      twitterDescription:
        'Chọn Kimi K3.1 Pro hoặc Highspeed qua API tương thích OpenAI. So sánh giá đầu vào và đầu ra Vancine trực tiếp với giá tham chiếu chính thức của Kimi ngày 24 tháng 10 năm 2026.',
    },
  }

export function getKimiK3PageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = KIMI_K3_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: KIMI_K3_CANONICAL,
    canonical: KIMI_K3_CANONICAL,
  }
}

export const KIMI_K31_MODELS = [
  {
    id: 'kimi-k3.1-pro',
    labelKey: 'Kimi K3.1 Pro',
    officialInputUsd: 2,
    officialOutputUsd: 10,
  },
  {
    id: 'kimi-k3.1-pro-highspeed',
    labelKey: 'Kimi K3.1 Pro Highspeed',
    officialInputUsd: 4,
    officialOutputUsd: 20,
  },
] as const

export type KimiK31ModelId = (typeof KIMI_K31_MODELS)[number]['id']
export type KimiK31Model = (typeof KIMI_K31_MODELS)[number]

export const KIMI_K31_DEFAULT_MODEL_ID: KimiK31ModelId = 'kimi-k3.1-pro'

export const KIMI_K31_OFFICIAL_PRICING_URL =
  'https://platform.moonshot.ai/docs/pricing/chat'

export const KIMI_K31_OFFICIAL_GUIDE_URL =
  'https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart'

export const KIMI_K31_PRICE_VERIFIED_ON = '2026-10-24'

/**
 * OpenRouter reference for the SAME model ID (moonshotai/kimi-k3.1-pro).
 * Shown on the page only for Kimi K3.1 Pro; Highspeed has no independent
 * OpenRouter model entry with the same pricing basis, so it renders no row.
 * Amounts are a dated snapshot from OpenRouter's public pricing page, never
 * a Vancine billing rate.
 */
export const KIMI_K31_OPENROUTER_MODEL_URL =
  'https://openrouter.ai/moonshotai/kimi-k3.1-pro'
export const KIMI_K31_OPENROUTER_PRICE_VERIFIED_ON = '2026-10-24'
export const KIMI_K31_OPENROUTER_INPUT_USD = 2
export const KIMI_K31_OPENROUTER_OUTPUT_USD = 10

export interface KimiK31ModelProfile {
  /** i18n key describing which tasks the model fits. */
  positioningKey: string
  /** i18n keys for the concrete K3.1 use cases. */
  useCaseKeys: readonly string[]
  /** Only Highspeed carries Moonshot's official 2–3× speed note. */
  officialSpeedNote: boolean
}

export const KIMI_K31_MODEL_PROFILES: Record<
  KimiK31ModelId,
  KimiK31ModelProfile
> = {
  'kimi-k3.1-pro': {
    positioningKey: 'For cost-sensitive coding tasks',
    useCaseKeys: [
      'Code modification and refactoring',
      'Test tasks',
      'Long-context project analysis',
    ],
    officialSpeedNote: false,
  },
  'kimi-k3.1-pro-highspeed': {
    positioningKey: 'For interactive tasks where response speed matters',
    useCaseKeys: [
      'Code modification and refactoring',
      'Test tasks',
      'Long-context project analysis',
    ],
    officialSpeedNote: true,
  },
}

export const KIMI_K3_PRICE_UNIT_KEY = 'USD per 1M tokens'

export const KIMI_K31_DISCOUNT_KEY =
  'Input and output are {{percent}}% lower than the October 24, 2026 Kimi official reference. This is not a total-bill discount.'

export const KIMI_K31_DISCOUNT_UNCONFIRMED_KEY =
  'Discount not confirmed against the dated official reference'

export function isKimiK31ModelId(value: string): value is KimiK31ModelId {
  return KIMI_K31_MODELS.some((model) => model.id === value)
}

export function getKimiK31Model(modelId: KimiK31ModelId): KimiK31Model {
  const model = KIMI_K31_MODELS.find((entry) => entry.id === modelId)
  if (!model) {
    return KIMI_K31_MODELS[0]
  }
  return model
}

export function getKimiK31PricingPath(modelId: KimiK31ModelId): string {
  return `/pricing/${modelId}`
}

/**
 * Show a discount only when live input and output are the same percentage
 * below the dated official reference for that model. Hide every other case.
 */
export function getKimiK31InputOutputDiscountPercent(
  live: LandingModelPrice,
  modelId: KimiK31ModelId
): number | null {
  if (live.status !== 'ready') return null
  const reference = getKimiK31Model(modelId)
  if (reference.officialInputUsd <= 0 || reference.officialOutputUsd <= 0) {
    return null
  }
  const inputRatio = 1 - live.amounts.inputUsd / reference.officialInputUsd
  const outputRatio = 1 - live.amounts.outputUsd / reference.officialOutputUsd
  if (
    !Number.isFinite(inputRatio) ||
    !Number.isFinite(outputRatio) ||
    inputRatio <= 0 ||
    outputRatio <= 0 ||
    inputRatio >= 1 ||
    outputRatio >= 1 ||
    Math.abs(inputRatio - outputRatio) > 1e-6
  ) {
    return null
  }
  const percent = ((inputRatio + outputRatio) / 2) * 100
  const rounded = Math.round(percent)
  if (Math.abs(percent - rounded) > 0.05 || rounded <= 0 || rounded >= 100) {
    return null
  }
  return rounded
}

export function formatKimiK3Usd(value: number): string {
  return `$${value.toFixed(2)}`
}

export const KIMI_K3_PRICE_DISCLAIMER_KEYS = [
  'All prices are per 1M tokens. Kimi official and third-party references are dated October 24, 2026; current charges are governed by the Vancine Pricing page.',
] as const

export const KIMI_K31_CACHE_DISCLAIMER_KEY =
  'Cache reads are priced separately; cache write prices and TTL tiers are on the Vancine Pricing page.'

export const KIMI_K31_OPENROUTER_DISCLAIMER_KEY =
  'The OpenRouter input and output reference was snapshotted on October 24, 2026 for the same model ID.'

export const KIMI_K3_API_BASE_URL = 'https://vancine.com/v1'
export const KIMI_K3_CHAT_ENDPOINT = 'https://vancine.com/v1/chat/completions'
export const KIMI_K3_API_KEY_ENV_VAR = 'VANCINE_API_KEY'

export interface KimiK3CodeExample {
  id: 'curl' | 'python' | 'node' | 'opencode'
  label: string
  code: string
}

export function getKimiK31CodeExamples(
  modelId: KimiK31ModelId
): readonly KimiK3CodeExample[] {
  const displayName = getKimiK31Model(modelId).labelKey
  return [
    {
      id: 'curl',
      label: 'cURL',
      code: `curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role": "user", "content": "Review this pull request."}]
  }'`,
    },
    {
      id: 'python',
      label: 'Python',
      code: `import os
import requests

# POST https://vancine.com/v1/chat/completions
response = requests.post(
    "https://vancine.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['VANCINE_API_KEY']}"},
    json={"model": "${modelId}", "messages": [{"role": "user", "content": "Review this pull request."}]},
)
print(response.json())`,
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
    model: '${modelId}',
    messages: [{ role: 'user', content: 'Review this pull request.' }],
  }),
})
console.log(await response.json())`,
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      code: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vancine": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vancine",
      "options": {
        "baseURL": "https://vancine.com/v1",
        "apiKey": "{env:VANCINE_API_KEY}"
      },
      "models": {
        "${modelId}": { "name": "${displayName}" }
      }
    }
  }
}`,
    },
  ]
}

export const KIMI_K3_EVIDENCE_STARTER_REPO =
  'https://github.com/VancineAI/kimi-k3-api-starter'

export const KIMI_K3_EVIDENCE_FILE_URL =
  'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json?utm_source=vancine&utm_medium=developer_resource&utm_campaign=kimi_k3_launch&utm_content=opencode_verified_evidence'

export interface KimiK3ApiCompatibilityEvidence {
  readonly status: 'passed'
  readonly visibleContentStatus: 'inconclusive'
  readonly requestTemperature: number
  readonly requestMaxTokens: number
  readonly httpStatus: number
  readonly requestedModel: string
  readonly responseModel: string
  readonly usagePromptTokens: number
  readonly usageCompletionTokens: number
  readonly usageTotalTokens: number
  readonly usageReasoningTokens: number
  readonly finishReason: string
}

export const KIMI_K3_API_COMPATIBILITY_EVIDENCE: KimiK3ApiCompatibilityEvidence =
  {
    status: 'passed',
    visibleContentStatus: 'inconclusive',
    requestTemperature: 0,
    requestMaxTokens: 16,
    httpStatus: 200,
    requestedModel: 'kimi-k3',
    responseModel: 'kimi-k3',
    usagePromptTokens: 92,
    usageCompletionTokens: 16,
    usageTotalTokens: 108,
    usageReasoningTokens: 13,
    finishReason: 'length',
  }

export interface KimiK3AgentToolCallStats {
  readonly completed: number
  readonly failed: number
}

export interface KimiK3AgentTelemetryTokens {
  readonly total: number
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export interface KimiK3OpenCodeAgentEvidence {
  readonly status: 'verified'
  readonly client: string
  readonly clientVersion: string
  readonly model: string
  readonly executor: string
  readonly runStatus: 'completed'
  readonly durationMs: number
  readonly rounds: number
  readonly modelStepsCompleted: number
  readonly toolCalls: {
    readonly read: KimiK3AgentToolCallStats
    readonly edit: KimiK3AgentToolCallStats
    readonly bash: KimiK3AgentToolCallStats
  }
  readonly testsPassed: true
  readonly telemetryTokens: KimiK3AgentTelemetryTokens
  readonly runId: string
}

export const KIMI_K3_OPENCODE_AGENT_EVIDENCE: KimiK3OpenCodeAgentEvidence = {
  status: 'verified',
  client: 'OpenCode',
  clientVersion: 'v1.18.3',
  model: 'kimi-k3',
  executor: 'Docker Linux ARM64',
  runStatus: 'completed',
  durationMs: 84345,
  rounds: 1,
  modelStepsCompleted: 6,
  toolCalls: {
    read: { completed: 5, failed: 0 },
    edit: { completed: 1, failed: 0 },
    bash: { completed: 1, failed: 0 },
  },
  testsPassed: true,
  telemetryTokens: {
    total: 28707,
    input: 3746,
    output: 1019,
    reasoning: 902,
    cacheRead: 23040,
    cacheWrite: 0,
  },
  runId: 'e52f78b7-0bfa-430f-b8b0-1ad813ea0695',
}

export interface KimiK3MeasuredUsageEvidence {
  readonly scope: 'one_controlled_task'
  readonly amount: number
  readonly currency: 'USD'
}

export const KIMI_K3_MEASURED_USAGE_EVIDENCE: KimiK3MeasuredUsageEvidence = {
  scope: 'one_controlled_task',
  amount: 0.19,
  currency: 'USD',
}

export const KIMI_K3_EVIDENCE_LIMITATION_KEYS = [
  'This record is for the retired model kimi-k3. It is not a verification of kimi-k3.1-pro or kimi-k3.1-pro-highspeed.',
  'This is a single historical controlled run. It does not predict the outcome of future requests.',
  'Token usage, latency, and cost vary with every task and model version.',
  'This controlled verification run incurred $0.19 in measured Vancine usage for one controlled task only. Pricing and token usage vary by task, and this historical measurement is not a current price or credit commitment.',
  'No free-tier or credit amount is guaranteed to complete the same task.',
  'Upstream provider costs are not shown or implied.',
  'Only OpenCode v1.18.3 has a live coding-agent verification, and that run used the retired model kimi-k3. Cline and Roo Code configurations in the starter repository have not been independently live-verified.',
] as const

export interface KimiK3FaqEntry {
  questionKey: string
  answerKey: string
}

export const KIMI_K3_FAQ: readonly KimiK3FaqEntry[] = [
  {
    questionKey: 'How do I choose between Kimi K3.1 Pro and Highspeed?',
    answerKey:
      'Pick Kimi K3.1 Pro for cost-sensitive coding tasks. Pick Highspeed for interactive work where response speed matters; Highspeed runs about 2–3× the speed of Kimi K3.1 Pro.',
  },
  {
    questionKey: 'Which prices apply to my requests?',
    answerKey:
      'Vancine charges the live prices on the Vancine Pricing page for the selected model ID. The Kimi official and OpenRouter rows are dated references from their own pricing pages, not Vancine billing rates. Cache reads are priced separately when shown.',
  },
  {
    questionKey: 'How do I send my first request?',
    answerKey:
      'Create a Vancine account, generate an API key, and send a chat completion to https://vancine.com/v1 with the selected model ID. Read the key from VANCINE_API_KEY and omit sampling parameters such as temperature.',
  },
  {
    questionKey: 'How do I configure coding clients like Cline or Roo Code?',
    answerKey:
      'Choose the OpenAI-compatible provider, set the base URL to https://vancine.com/v1, and use your VANCINE_API_KEY. The OpenCode tab in the quickstart shows a copyable provider configuration with the selected model ID.',
  },
  {
    questionKey: 'Which parameters are restricted?',
    answerKey:
      'The examples omit temperature, top_p, n, presence_penalty, and frequency_penalty because official Kimi docs fix them. The parameter notes next to the quickstart examples have the details.',
  },
]

export const KIMI_K3_I18N_KEYS = [
  'Kimi K3.1 Pro & Highspeed API for Coding Agents',
  'Choose Kimi K3.1 Pro or Highspeed, then call it through one OpenAI-compatible API.',
  'Choose a Kimi K3.1 model',
  'Kimi K3.1 Pro',
  'Kimi K3.1 Pro Highspeed',
  'View integration examples',
  'Choose the model that fits your task',
  'Both models run on one OpenAI-compatible API with a 1M-token context window.',
  'For cost-sensitive coding tasks',
  'For interactive tasks where response speed matters',
  'Code modification and refactoring',
  'Test tasks',
  'Long-context project analysis',
  'About 2–3× the speed of Kimi K3.1 Pro.',
  'Model profiles',
  KIMI_K31_DISCOUNT_KEY,
  'Create an API key',
  'Open Playground',
  'Kimi K3.1 live pricing',
  'Vancine',
  'Kimi official',
  'OpenRouter',
  'Standard price reference',
  'OpenAI-compatible API',
  'Pay as you go',
  'Current charges are governed by the Vancine Pricing page.',
  'Loading',
  'View live pricing',
  'Dynamic Pricing',
  'Cache read',
  KIMI_K3_PRICE_UNIT_KEY,
  'Kimi K3.1 price comparison',
  'Provider',
  'Input price',
  'Output price',
  'Input',
  'Output',
  'Unit',
  'Difference',
  'Source',
  'Current Vancine price',
  'Vancine live Pricing',
  'Kimi official pricing',
  'OpenRouter pricing',
  KIMI_K31_CACHE_DISCLAIMER_KEY,
  'View cache pricing',
  ...KIMI_K3_PRICE_DISCLAIMER_KEYS,
  'OpenAI-compatible quickstart',
  'Send a chat completion for the selected model ID. Read the key from VANCINE_API_KEY. Do not send temperature or max_tokens.',
  'Quickstart languages',
  'Read API documentation',
  'Copy',
  'Code copied',
  'Unable to copy code',
  'Copy example code to clipboard',
  'Parameter notes',
  'Official Kimi docs fix temperature, top_p, n, presence_penalty, and frequency_penalty for these model IDs. The examples omit them.',
  'Streaming, reasoning_effort, and tool calling follow the official Kimi parameter guide.',
  'Agent setup',
  'Point your coding clients at the Vancine base URL with an environment-backed key.',
  'Configure a Vancine provider',
  'Use the OpenAI-compatible SDK provider, the Vancine base URL, and an environment-backed key.',
  'Cline and Roo Code',
  'Use the same OpenAI-compatible connection',
  'Choose OpenAI Compatible as the API provider.',
  'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.',
  'Selected model ID',
  'OpenAI-compatible clients',
  'Frequently asked questions',
  ...KIMI_K3_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
  'Get Kimi K3.1 Pro or Highspeed through an OpenAI-compatible API',
  'Choose a model, create a Vancine API key, and send your first request.',
] as const

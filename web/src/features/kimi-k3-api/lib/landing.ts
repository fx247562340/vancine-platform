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

/**
 * Pure business logic for the Kimi K3 developer landing page: CTA target
 * resolution, UTM filtering, dated public price snapshot, page metadata,
 * code examples, and the published historical evidence. Everything here
 * is deterministic and unit-testable — nothing reads request headers,
 * user input, or live configuration.
 */

// ---------------------------------------------------------------------------
// Anonymous analytics event contract
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** The fixed canonical origin for every public link on this page. */
export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-k3-api'

/** In-page anchor for the price comparison section. */
export const KIMI_K3_PRICING_SECTION_ID = 'pricing'

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
 * retaining only allowlisted UTM parameters. Everything else (email, phone,
 * username, user_id, token, api_key, key, password, redirect, return_to,
 * unknown parameters) is dropped, so no sensitive value and no
 * user-controlled target can ride along — there is no open redirect because
 * the path itself is fixed by the auth state.
 */
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

/**
 * Split a resolved CTA destination into a TanStack Link-ready target so
 * internal navigation keeps the allowlisted UTM parameters without building
 * hrefs by string concatenation in components.
 */
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

/**
 * The English-source CTA label for the current auth state. Components
 * pass the result to t() so the rendered string follows the active
 * language; tests use the returned literal directly.
 */
export function getKimiK3CtaLabelKey(
  isAuthenticated: boolean
): KimiK3CtaLabelKey {
  return isAuthenticated ? 'Open Playground' : 'Create an API key'
}

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

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
    // router/web_metadata.go's /kimi-k3-api entry.
    en: {
      title: 'Kimi K3 API Pricing & OpenRouter Comparison | Vancine',
      description:
        'See live Vancine pricing for Kimi K3. Vancine is offered at a fixed 20% discount to the referenced OpenRouter Models API standard price as of September 9, 2026. Compare pricing, code, and test evidence.',
      ogTitle: 'Kimi K3 API Pricing & OpenRouter Comparison',
      ogDescription:
        'See live Vancine pricing for Kimi K3. Vancine is offered at a fixed 20% discount to the referenced OpenRouter Models API standard price as of September 9, 2026. Compare pricing, code, and test evidence.',
      twitterTitle: 'Kimi K3 API Pricing & OpenRouter Comparison',
      twitterDescription:
        'See live Vancine pricing for Kimi K3. Vancine is offered at a fixed 20% discount to the referenced OpenRouter Models API standard price as of September 9, 2026. Compare pricing, code, and test evidence.',
    },
    zhCN: {
      title: 'Kimi K3 API 价格与 OpenRouter 对比 | Vancine',
      description:
        '查看 Vancine 上 Kimi K3 的实时价格。Vancine 相对所引用的 OpenRouter Models API 标准价格固定优惠 20%（参考日期 2026 年 9 月 9 日）。可对比价格、代码与实测证据。',
      ogTitle: 'Kimi K3 API 价格与 OpenRouter 对比',
      ogDescription:
        '查看 Vancine 上 Kimi K3 的实时价格。Vancine 相对所引用的 OpenRouter Models API 标准价格固定优惠 20%（参考日期 2026 年 9 月 9 日）。可对比价格、代码与实测证据。',
      twitterTitle: 'Kimi K3 API 价格与 OpenRouter 对比',
      twitterDescription:
        '查看 Vancine 上 Kimi K3 的实时价格。Vancine 相对所引用的 OpenRouter Models API 标准价格固定优惠 20%（参考日期 2026 年 9 月 9 日）。可对比价格、代码与实测证据。',
    },
    zhTW: {
      title: 'Kimi K3 API 價格與 OpenRouter 對比 | Vancine',
      description:
        '查看 Vancine 上 Kimi K3 的即時價格。Vancine 相對所引用的 OpenRouter Models API 標準價格固定優惠 20%（參考日期 2026 年 9 月 9 日）。可對比價格、程式碼與實測證據。',
      ogTitle: 'Kimi K3 API 價格與 OpenRouter 對比',
      ogDescription:
        '查看 Vancine 上 Kimi K3 的即時價格。Vancine 相對所引用的 OpenRouter Models API 標準價格固定優惠 20%（參考日期 2026 年 9 月 9 日）。可對比價格、程式碼與實測證據。',
      twitterTitle: 'Kimi K3 API 價格與 OpenRouter 對比',
      twitterDescription:
        '查看 Vancine 上 Kimi K3 的即時價格。Vancine 相對所引用的 OpenRouter Models API 標準價格固定優惠 20%（參考日期 2026 年 9 月 9 日）。可對比價格、程式碼與實測證據。',
    },
    fr: {
      title: "Tarifs de l'API Kimi K3 et comparaison OpenRouter | Vancine",
      description:
        'Consultez les tarifs Vancine en direct pour Kimi K3. Vancine est proposé avec une remise fixe de 20 % par rapport au tarif standard OpenRouter Models API au 9 septembre 2026. Comparez les tarifs, le code et les preuves de test.',
      ogTitle: "Tarifs de l'API Kimi K3 et comparaison OpenRouter",
      ogDescription:
        'Consultez les tarifs Vancine en direct pour Kimi K3. Vancine est proposé avec une remise fixe de 20 % par rapport au tarif standard OpenRouter Models API au 9 septembre 2026. Comparez les tarifs, le code et les preuves de test.',
      twitterTitle: "Tarifs de l'API Kimi K3 et comparaison OpenRouter",
      twitterDescription:
        'Consultez les tarifs Vancine en direct pour Kimi K3. Vancine est proposé avec une remise fixe de 20 % par rapport au tarif standard OpenRouter Models API au 9 septembre 2026. Comparez les tarifs, le code et les preuves de test.',
    },
    ru: {
      title: 'Цены API Kimi K3 и сравнение с OpenRouter | Vancine',
      description:
        'Смотрите актуальные цены Vancine на Kimi K3. Vancine предлагается с фиксированной скидкой 20% относительно стандартной цены OpenRouter Models API на 9 сентября 2026 г. Сравните цены, код и результаты тестов.',
      ogTitle: 'Цены API Kimi K3 и сравнение с OpenRouter',
      ogDescription:
        'Смотрите актуальные цены Vancine на Kimi K3. Vancine предлагается с фиксированной скидкой 20% относительно стандартной цены OpenRouter Models API на 9 сентября 2026 г. Сравните цены, код и результаты тестов.',
      twitterTitle: 'Цены API Kimi K3 и сравнение с OpenRouter',
      twitterDescription:
        'Смотрите актуальные цены Vancine на Kimi K3. Vancine предлагается с фиксированной скидкой 20% относительно стандартной цены OpenRouter Models API на 9 сентября 2026 г. Сравните цены, код и результаты тестов.',
    },
    ja: {
      title: 'Kimi K3 API の価格と OpenRouter 比較 | Vancine',
      description:
        'Kimi K3 の Vancine リアルタイム価格をご確認ください。Vancine は、参照した OpenRouter Models API の 2026 年 9 月 9 日標準価格から固定 20% 割引です。価格、コード、テスト証拠を比較できます。',
      ogTitle: 'Kimi K3 API の価格と OpenRouter 比較',
      ogDescription:
        'Kimi K3 の Vancine リアルタイム価格をご確認ください。Vancine は、参照した OpenRouter Models API の 2026 年 9 月 9 日標準価格から固定 20% 割引です。価格、コード、テスト証拠を比較できます。',
      twitterTitle: 'Kimi K3 API の価格と OpenRouter 比較',
      twitterDescription:
        'Kimi K3 の Vancine リアルタイム価格をご確認ください。Vancine は、参照した OpenRouter Models API の 2026 年 9 月 9 日標準価格から固定 20% 割引です。価格、コード、テスト証拠を比較できます。',
    },
    vi: {
      title: 'Giá API Kimi K3 và so sánh OpenRouter | Vancine',
      description:
        'Xem giá Vancine trực tiếp cho Kimi K3. Vancine được cung cấp với mức chiết khấu cố định 20% so với giá chuẩn OpenRouter Models API ngày 9 tháng 9 năm 2026. So sánh giá, mã mẫu và bằng chứng kiểm thử.',
      ogTitle: 'Giá API Kimi K3 và so sánh OpenRouter',
      ogDescription:
        'Xem giá Vancine trực tiếp cho Kimi K3. Vancine được cung cấp với mức chiết khấu cố định 20% so với giá chuẩn OpenRouter Models API ngày 9 tháng 9 năm 2026. So sánh giá, mã mẫu và bằng chứng kiểm thử.',
      twitterTitle: 'Giá API Kimi K3 và so sánh OpenRouter',
      twitterDescription:
        'Xem giá Vancine trực tiếp cho Kimi K3. Vancine được cung cấp với mức chiết khấu cố định 20% so với giá chuẩn OpenRouter Models API ngày 9 tháng 9 năm 2026. So sánh giá, mã mẫu và bằng chứng kiểm thử.',
    },
  }

/**
 * Resolve the complete page metadata for a language. The input is normalized
 * (zhCN / zhTW / BCP-47 variants), and any unknown language falls back to
 * English. The canonical URL and og:url are fixed constants — they are never
 * derived from host headers or user input.
 */
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

// ---------------------------------------------------------------------------
// Dated public price snapshot (USD / 1M tokens)
// ---------------------------------------------------------------------------

/**
 * Dated third-party reference snapshot (2026-09-09). OpenRouter figures
 * are the standard prices that the OpenRouter Models API
 * (https://openrouter.ai/api/v1/models) returns for moonshotai/kimi-k3
 * under default conditions ($3.00 / $15.00). Provider prices shown on the
 * OpenRouter model page follow a different, dynamic basis and are not the
 * comparison basis here. Kimi official figures are from
 * https://platform.kimi.ai/docs/pricing/chat-k3 ($3.00 / $15.00).
 * Vancine current prices are read live from /api/pricing; this snapshot
 * never stores a Vancine amount and is not wired to billing code.
 */
export const KIMI_K3_PRICE_UNIT_KEY = 'USD per 1M tokens'

export const KIMI_K3_VANCINE_PRICING_PATH = '/pricing/kimi-k3'

export const KIMI_K3_VANCINE_PRICING_MODEL_ID = 'kimi-k3'

export const KIMI_K3_OFFICIAL_PRICING_URL =
  'https://platform.kimi.ai/docs/pricing/chat-k3'

/**
 * Evidence link for the OpenRouter comparator: the public Models API whose
 * default-condition standard pricing this page quotes. The model detail page
 * is deliberately not used as price evidence because its headline price
 * follows provider-specific dynamic pricing.
 */
export const KIMI_K3_OPENROUTER_PRICING_URL =
  'https://openrouter.ai/api/v1/models'

interface KimiK3PriceProviderBase {
  nameKey: string
  sourceHref: string
  sourceLabelKey: string
  sourceKind: 'internal' | 'external'
  resource: KimiK3ResourceValue
  differenceKey: string
}

export type KimiK3PriceProvider =
  | (KimiK3PriceProviderBase & { id: 'vancine' })
  | (KimiK3PriceProviderBase & {
      id: 'openrouter' | 'kimi_official'
      inputUsd: number
      outputUsd: number
    })

export const KIMI_K3_PRICE_PROVIDERS = [
  {
    id: 'vancine',
    nameKey: 'Vancine',
    sourceHref: KIMI_K3_VANCINE_PRICING_PATH,
    sourceLabelKey: 'Vancine live Pricing',
    sourceKind: 'internal',
    resource: 'pricing',
    differenceKey: 'Current Vancine price',
  },
  {
    id: 'openrouter',
    nameKey: 'OpenRouter',
    inputUsd: 3.0,
    outputUsd: 15.0,
    sourceHref: KIMI_K3_OPENROUTER_PRICING_URL,
    sourceLabelKey: 'OpenRouter Models API standard pricing',
    sourceKind: 'external',
    resource: 'openrouter_pricing',
    differenceKey: 'Vancine is 20% lower on both input and output',
  },
  {
    id: 'kimi_official',
    nameKey: 'Kimi official',
    inputUsd: 3.0,
    outputUsd: 15.0,
    sourceHref: KIMI_K3_OFFICIAL_PRICING_URL,
    sourceLabelKey: 'Kimi official pricing',
    sourceKind: 'external',
    resource: 'kimi_official_pricing',
    differenceKey: 'Vancine is 20% lower on both input and output',
  },
] as const satisfies readonly KimiK3PriceProvider[]

/** Two-decimal USD formatter for dated third-party snapshot prices. */
export function formatKimiK3Usd(value: number): string {
  return `$${value.toFixed(2)}`
}

export const KIMI_K3_PRICE_DISCLAIMER_KEYS = [
  'All prices are shown per 1M tokens.',
  'OpenRouter and Kimi official prices were snapshotted on September 9, 2026.',
  'OpenRouter figures are the standard prices returned by the OpenRouter Models API under default conditions. Provider prices shown on OpenRouter model pages can differ.',
  'Free variants, promotional prices, cached input prices, and temporary provider discounts are excluded from this comparison.',
  'Third-party prices may change.',
  'Current Vancine settlement prices are on the Vancine Pricing page.',
] as const

// ---------------------------------------------------------------------------
// API example contract
// ---------------------------------------------------------------------------

export const KIMI_K3_API_BASE_URL = 'https://vancine.com/v1'
export const KIMI_K3_CHAT_ENDPOINT = 'https://vancine.com/v1/chat/completions'
export const KIMI_K3_MODEL_ID = 'kimi-k3'
export const KIMI_K3_API_KEY_ENV_VAR = 'VANCINE_API_KEY'

export interface KimiK3CodeExample {
  id: 'curl' | 'python' | 'node' | 'opencode'
  label: string
  code: string
}

/**
 * Quickstart examples. Every example targets the public Vancine endpoint,
 * uses the kimi-k3 model id, and reads the API key exclusively from the
 * VANCINE_API_KEY environment variable — never a hardcoded secret.
 */
export const KIMI_K3_CODE_EXAMPLES: readonly KimiK3CodeExample[] = [
  {
    id: 'curl',
    label: 'cURL',
    code: `curl -X POST https://vancine.com/v1/chat/completions \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k3",
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
    json={"model": "kimi-k3", "messages": [{"role": "user", "content": "Review this pull request."}]},
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
    model: 'kimi-k3',
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
        "kimi-k3": { "name": "Kimi K3" }
      }
    }
  }
}`,
  },
]

// ---------------------------------------------------------------------------
// Historical evidence (single controlled run, published on main)
// ---------------------------------------------------------------------------

/**
 * Public evidence links. The starter repository and the verified evidence
 * JSON inside it are the only approved external artifacts; the internal ops
 * kit is deliberately not linked.
 */
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

/**
 * i18n keys of the mandatory public caveats shown alongside the evidence.
 * They bound what the historical run may be read as: a single controlled
 * run, no future prediction, no price or credit commitment, no upstream
 * cost disclosure, and no official-provider claim.
 */
export const KIMI_K3_EVIDENCE_LIMITATION_KEYS = [
  'This is a single historical controlled run. It does not predict the outcome of future requests.',
  'Token usage, latency, and cost vary with every task and model version.',
  'This controlled verification run incurred $0.19 in measured Vancine usage for one controlled task only. Pricing and token usage vary by task, and this historical measurement is not a current price or credit commitment.',
  'No free-tier or credit amount is guaranteed to complete the same task.',
  'Upstream provider costs are not shown or implied.',
  'Only OpenCode v1.18.3 has a live coding-agent verification so far. Cline and Roo Code configurations are provided in the starter repository but have not been independently live-verified.',
  'Vancine is an independent third-party API aggregation platform, not an official Moonshot AI or Kimi service.',
] as const

// ---------------------------------------------------------------------------
// FAQ contract
// ---------------------------------------------------------------------------

export interface KimiK3FaqEntry {
  /** i18n key of the question. */
  questionKey: string
  /** i18n key of the answer. */
  answerKey: string
}

export const KIMI_K3_FAQ: readonly KimiK3FaqEntry[] = [
  {
    questionKey: 'Where can I confirm current Kimi K3 pricing?',
    answerKey:
      'Check Vancine live Pricing. The comparison on this page is a dated public snapshot; live Pricing is authoritative for current Vancine rates.',
  },
  {
    questionKey:
      'How does Vancine pricing compare with Kimi official and OpenRouter?',
    answerKey:
      'See live Vancine pricing for Kimi K3. Vancine is offered at a fixed 20% discount to the referenced OpenRouter standard API pricing. As of September 9, 2026, OpenRouter Models API standard pricing is $3.00 / $15.00 and Kimi official pricing is $3.00 / $15.00. Third-party prices may change. Live Vancine Pricing is authoritative.',
  },
  {
    questionKey: 'Is this the real kimi-k3 model?',
    answerKey:
      'The published API probe requested kimi-k3 and received kimi-k3 with HTTP 200. That is a single historical check, not a guarantee for every future request.',
  },
  {
    questionKey: 'Is Vancine an official Moonshot AI or Kimi service?',
    answerKey:
      'Vancine is an independent third-party API aggregation platform, not an official Moonshot AI or Kimi service.',
  },
  {
    questionKey: 'What has actually been tested?',
    answerKey:
      'A compatibility probe returned HTTP 200 for kimi-k3, and one controlled OpenCode v1.18.3 run completed tool calls and passed tests. Cline and Roo Code have configuration notes only, not independent live evidence. The run does not predict future requests.',
  },
  {
    questionKey: 'Are rate limits and availability guaranteed?',
    answerKey:
      'No. This page does not promise unlimited rate, permanent pricing, uptime, or a production SLA. Availability, limits, and latency can change.',
  },
  {
    questionKey: 'How do I start with an OpenAI-compatible request?',
    answerKey:
      'Create a Vancine account, generate an API key, and send a chat completion to https://vancine.com/v1 with model kimi-k3, reading the key from VANCINE_API_KEY.',
  },
]

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the Kimi K3 landing page passes to t(). Locale
 * completeness tests iterate this list; product-name literals that are
 * intentionally not localized (e.g. "OpenCode") are excluded.
 */
export const KIMI_K3_I18N_KEYS = [
  'Kimi K3 API pricing and OpenRouter comparison',
  'Vancine is an independent third-party API platform, not an official Moonshot AI or Kimi service. This page compares dated public prices, shows OpenAI-compatible examples, and publishes existing test evidence. Rates, availability, and behavior are not guaranteed to match the official service.',
  'Create an API key',
  'Open Playground',
  'Compare prices',
  'Kimi K3 API pricing',
  'Vancine',
  'OpenRouter',
  'Kimi official',
  'OpenAI-compatible API',
  'Pay as you go',
  '20% lower than OpenRouter on both input and output',
  'Loading',
  'View live pricing',
  'Dynamic Pricing',
  KIMI_K3_PRICE_UNIT_KEY,
  'Kimi K3 API price comparison',
  'Provider',
  'Input price',
  'Output price',
  'Input',
  'Output',
  'Unit',
  'Difference',
  'Source',
  'Current Vancine price',
  'Vancine is 20% lower on both input and output',
  'Vancine live Pricing',
  'Kimi official pricing',
  'OpenRouter Models API standard pricing',
  ...KIMI_K3_PRICE_DISCLAIMER_KEYS,
  'Quickstart',
  'OpenAI-compatible quickstart',
  'Send your first Kimi K3 chat completion with an environment variable, not a pasted secret.',
  'Quickstart languages',
  'Read API documentation',
  'Copy',
  'Code copied',
  'Unable to copy code',
  'Copy example code to clipboard',
  'Agent setup',
  'OpenAI-compatible clients',
  'Configure a Vancine provider',
  'Use the OpenAI-compatible SDK provider, the Vancine base URL, and an environment-backed key.',
  'Cline and Roo Code',
  'Use the same OpenAI-compatible connection',
  'Choose OpenAI Compatible as the API provider.',
  'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.',
  'Select kimi-k3 as the model ID.',
  'Only OpenCode v1.18.3 has a live coding-agent verification so far. Cline and Roo Code configurations are provided in the starter repository but have not been independently live-verified.',
  'Evidence',
  'Real Kimi K3 API test evidence',
  'Headline results from a single historical run: the request succeeded, the returned model matched, tool calls completed, tests passed, and the evidence file is public. Token counts and run IDs are secondary detail.',
  'Request succeeded',
  'Returned model',
  'Tool calls completed',
  'Tests passed',
  'Evidence file is public',
  'Verified',
  'Measured',
  'OpenCode coding agent',
  'API compatibility',
  'Measured usage',
  'View public evidence file',
  'View starter repository',
  'temperature:0 probe accepted',
  'Requested model',
  'Response model',
  'Usage (prompt / completion / total tokens)',
  'Reasoning tokens',
  'Completion stop reason',
  'Agent client',
  'Execution environment',
  'Model steps completed',
  'Tool calls completed (read / edit / bash)',
  'Tool calls failed',
  'Tests',
  'PASS',
  'FAIL',
  'Run duration',
  'Run ID',
  'Agent telemetry tokens (total)',
  'Token breakdown (input / output / reasoning / cache read / cache write)',
  'Measured Vancine usage',
  'The probe used a 16-token completion budget that was mostly consumed by reasoning, so its visible content is inconclusive. This small reasoning-heavy response is not a content-generation failure.',
  ...KIMI_K3_EVIDENCE_LIMITATION_KEYS,
  'Frequently asked questions',
  ...KIMI_K3_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
  'Get Kimi K3 through an OpenAI-compatible API',
  'Review the dated price snapshot and the published test evidence, then send a request with your Vancine API key.',
] as const

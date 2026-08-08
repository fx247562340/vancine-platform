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
 * resolution, UTM filtering, page metadata, code examples, and the published
 * historical evidence. Everything here is deterministic and unit-testable —
 * nothing reads request headers, user input, or live configuration.
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
] as const

export type KimiK3ResourceValue = (typeof KIMI_K3_RESOURCE_VALUES)[number]

export const KIMI_K3_RESOURCE_LOCATIONS = [
  'header',
  'quickstart',
  'faq',
  'evidence',
  'availability',
] as const

export type KimiK3ResourceLocation = (typeof KIMI_K3_RESOURCE_LOCATIONS)[number]

// ---------------------------------------------------------------------------
// CTA destination resolution (UTM-safe, no open redirects)
// ---------------------------------------------------------------------------

/** The fixed canonical origin for every public link on this page. */
export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-k3-api'

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

// ---------------------------------------------------------------------------
// Page metadata (SEO) — fixed canonical, seven supported languages
// ---------------------------------------------------------------------------

interface KimiK3LanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
}

const KIMI_K3_METADATA: Record<InterfaceLanguageCode, KimiK3LanguageMetadata> =
  {
    en: {
      title: 'Kimi K3 API for Coding Agents | Vancine',
      description:
        'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.',
      ogTitle: 'Kimi K3 for Coding Agents',
      ogDescription:
        'Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier models.',
    },
    zhCN: {
      title: 'Kimi K3 编程智能体 API | Vancine',
      description:
        '通过 Vancine 的一个 API 密钥，将 OpenCode、Cline、Roo Code 和兼容 OpenAI 的工具连接至 Kimi K3。',
      ogTitle: '面向编程智能体的 Kimi K3',
      ogDescription:
        '使用一个兼容 OpenAI 的 API 密钥，将编程智能体接入 Kimi K3 和其他前沿模型。',
    },
    zhTW: {
      title: 'Kimi K3 程式設計智能體 API | Vancine',
      description:
        '透過 Vancine 的一個 API 金鑰，將 OpenCode、Cline、Roo Code 和相容 OpenAI 的工具連接至 Kimi K3。',
      ogTitle: '面向程式設計智能體的 Kimi K3',
      ogDescription:
        '使用一個相容 OpenAI 的 API 金鑰，將程式設計智能體接入 Kimi K3 和其他前沿模型。',
    },
    fr: {
      title: 'API Kimi K3 pour agents de code | Vancine',
      description:
        'Connectez OpenCode, Cline, Roo Code et les outils compatibles OpenAI à Kimi K3 avec une seule clé API via Vancine.',
      ogTitle: 'Kimi K3 pour les agents de code',
      ogDescription:
        "Utilisez une seule clé API compatible OpenAI pour connecter vos agents de code à Kimi K3 et à d'autres modèles de pointe.",
    },
    ru: {
      title: 'Kimi K3 API для агентов-программистов | Vancine',
      description:
        'Подключите OpenCode, Cline, Roo Code и инструменты с поддержкой OpenAI к Kimi K3 с одним API-ключом через Vancine.',
      ogTitle: 'Kimi K3 для агентов-программистов',
      ogDescription:
        'Используйте один OpenAI-совместимый API-ключ, чтобы подключить агентов-программистов к Kimi K3 и другим передовым моделям.',
    },
    ja: {
      title: 'コーディングエージェント向け Kimi K3 API | Vancine',
      description:
        'Vancine の単一の API キーで、OpenCode、Cline、Roo Code、OpenAI 互換ツールを Kimi K3 に接続できます。',
      ogTitle: 'コーディングエージェントのための Kimi K3',
      ogDescription:
        'OpenAI 互換の単一 API キーで、コーディングエージェントを Kimi K3 やその他の最先端モデルに接続できます。',
    },
    vi: {
      title: 'API Kimi K3 cho tác tử lập trình | Vancine',
      description:
        'Kết nối OpenCode, Cline, Roo Code và các công cụ tương thích OpenAI với Kimi K3 bằng một khóa API duy nhất qua Vancine.',
      ogTitle: 'Kimi K3 cho tác tử lập trình',
      ogDescription:
        'Dùng một khóa API tương thích OpenAI để kết nối tác tử lập trình với Kimi K3 và các mô hình tiên tiến khác.',
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
    ogUrl: KIMI_K3_CANONICAL,
    canonical: KIMI_K3_CANONICAL,
  }
}

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
    questionKey: 'Where can I confirm Kimi K3 availability and pricing?',
    answerKey:
      'Check live pricing and your authenticated model list. Availability, pricing, and limits can change, and those live sources are authoritative.',
  },
  {
    questionKey: 'Which developer tools work with this API?',
    answerKey:
      'OpenCode, Cline, Roo Code, and tools that support the OpenAI-compatible chat completions API can use the same base URL and API key.',
  },
  {
    questionKey: 'Is Vancine an official Moonshot AI or Kimi service?',
    answerKey:
      'Vancine is an independent third-party API aggregation platform, not an official Moonshot AI or Kimi service.',
  },
  {
    questionKey: 'How do I get an API key and start testing?',
    answerKey:
      'Create a Vancine account, generate an API key in the console, and follow the quickstart above. The same key works with every OpenAI-compatible client.',
  },
]

/**
 * Example model combinations shown in the availability section. These are
 * illustrative only — the live Docs model catalog and live Pricing are the
 * authoritative sources.
 */
export const KIMI_K3_PORTFOLIO_EXAMPLES = [
  'Kimi K3',
  'GLM-5.2',
  'DeepSeek V4',
  'Qwen 3.7',
  'MiniMax',
] as const

// ---------------------------------------------------------------------------
// i18n key registry for this page
// ---------------------------------------------------------------------------

/**
 * Every translation key the Kimi K3 landing page passes to t(). Locale
 * completeness tests iterate this list; product-name literals that are
 * intentionally not localized (e.g. "OpenCode") are excluded.
 */
export const KIMI_K3_I18N_KEYS = [
  'Kimi K3 API for Coding Agents',
  'China frontier AI, one developer path',
  'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.',
  'Start free',
  'Go to Playground',
  'View quickstart',
  'Quickstart',
  'OpenAI-compatible quickstart',
  'Send your first Kimi K3 chat completion with an environment variable, not a pasted secret.',
  'Quickstart languages',
  'Read API documentation',
  'Create an API key',
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
  'Live verification evidence',
  'Three recorded checks against the real kimi-k3 model through the Vancine endpoint: API compatibility, a completed OpenCode coding-agent run, and the measured usage of that run.',
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
  'One key, a focused China AI portfolio',
  'Switch models as your task changes. Features, availability, and pricing are model-specific.',
  'View live pricing and availability',
  'Browse the Docs model catalog',
  'kimi-k3 is listed in the live Docs model catalog, and live Pricing shows current rates. Other model combinations are examples only; the live catalog is authoritative.',
  'Frequently asked questions',
  ...KIMI_K3_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
  'Put Kimi K3 in your coding agent today',
  'Start with a documented OpenAI-compatible request, then choose the model that fits the work.',
  'Get started with Vancine',
  'Run K3 in Playground',
] as const

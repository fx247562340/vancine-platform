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
export const KIMI_K3_CTA_EVENT = 'get_started_clicked'
export const KIMI_K3_CTA_LOCATIONS = Object.freeze([
  'kimi_k3_hero',
  'kimi_k3_quickstart',
  'kimi_k3_evidence',
  'kimi_k3_final_cta',
] as const)

export const KIMI_K3_RESOURCE_EVENT = 'developer_resource_clicked'
export const KIMI_K3_RESOURCE_VALUES = Object.freeze([
  'docs',
  'pricing',
  'starter_repo',
] as const)
export const KIMI_K3_RESOURCE_LOCATIONS = Object.freeze([
  'header',
  'quickstart',
  'faq',
  'evidence',
] as const)

export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-k3-api'
export const KIMI_K3_CREDIT_DISCLAIMER =
  '$1 free credit. No credit card required. Usage varies by model and request.'

export interface ClipboardWriter {
  writeText(text: string): Promise<void>
}

export async function copyTextToClipboard(
  text: string,
  clipboard?: ClipboardWriter
): Promise<'copied' | 'error'> {
  if (!clipboard) return 'error'
  try {
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'error'
  }
}

const UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

/** Builds an internal CTA URL while retaining only attribution parameters. */
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
    if (UTM_KEYS.has(key)) allowed.append(key, value)
  }

  const query = allowed.toString()
  return query ? `${destination}?${query}` : destination
}

interface KimiK3Metadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  canonical: string
}

const KIMI_K3_METADATA: Record<'en' | 'zh', KimiK3Metadata> = {
  en: {
    title: 'Kimi K3 API for Coding Agents | Vancine',
    description:
      'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.',
    ogTitle: 'Kimi K3 for Coding Agents',
    ogDescription:
      'Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier models.',
    canonical: KIMI_K3_CANONICAL,
  },
  zh: {
    title: 'Kimi K3 编程智能体 API | Vancine',
    description:
      '通过 Vancine 的一个 API 密钥，将 OpenCode、Cline、Roo Code 和兼容 OpenAI 的工具连接至 Kimi K3。',
    ogTitle: '面向编程智能体的 Kimi K3',
    ogDescription:
      '使用一个兼容 OpenAI 的 API 密钥，将编程智能体接入 Kimi K3 和其他前沿模型。',
    canonical: KIMI_K3_CANONICAL,
  },
}

export function getKimiK3Metadata(language: string): KimiK3Metadata {
  const normalized = (language ?? '').trim().toLowerCase()
  return normalized === 'zh' || normalized.startsWith('zh-')
    ? KIMI_K3_METADATA.zh
    : KIMI_K3_METADATA.en
}

export interface KimiK3CodeExample {
  id: 'curl' | 'python' | 'node'
  label: string
  code: string
}

export const KIMI_K3_CODE_EXAMPLES: readonly KimiK3CodeExample[] =
  Object.freeze([
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
  ])

export const KIMI_K3_OPENCODE_CONFIG = `{
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
}`

export const KIMI_K3_PORTFOLIO = Object.freeze([
  'Kimi K3',
  'GLM-5.2',
  'DeepSeek V4',
  'Qwen 3.7',
  'MiniMax',
])

/**
 * Evidence section status. Live verification HAS been completed against the
 * real kimi-k3 model through the Vancine endpoint:
 *
 * 1. API compatibility probe (temperature:0) — HTTP 200, requested and
 *    response model kimi-k3. The probe used a 16-token completion budget that
 *    was mostly consumed by reasoning, so visible content is inconclusive;
 *    this is NOT a content-generation failure.
 * 2. OpenCode v1.18.3 coding-agent run — completed with 6 model steps,
 *    read/edit/bash tool calls, passing tests, and no provider errors. This
 *    is the only live coding-agent verification; Cline and Roo Code configs
 *    are provided but have not been independently live verified.
 * 3. Measured usage for that single controlled run — 28707 agent telemetry
 *    tokens and $0.19 USD measured Vancine usage. This figure is
 *    task-specific: pricing and token usage vary, and it does NOT guarantee
 *    that $1 credit completes another run. Upstream provider costs are
 *    deliberately never displayed.
 *
 * KIMI_K3_EVIDENCE_STARTER_REPO is the public starter repository;
 * KIMI_K3_EVIDENCE_FILE_URL is the public agent-verification artifact inside
 * that repository (with attribution parameters). The internal ops kit is
 * deliberately not linked.
 */
export const KIMI_K3_EVIDENCE_STATUS = 'verified' as const

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
  Object.freeze({
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
  } as const)

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
  readonly sourceFileModified: string
  readonly testFileModified: false
  readonly unexpectedFiles: number
  readonly exitStatus: number
  readonly telemetryTokens: KimiK3AgentTelemetryTokens
  readonly runId: string
}

export const KIMI_K3_OPENCODE_AGENT_EVIDENCE: KimiK3OpenCodeAgentEvidence =
  Object.freeze({
    status: 'verified',
    client: 'OpenCode',
    clientVersion: 'v1.18.3',
    model: 'kimi-k3',
    executor: 'Docker Linux ARM64',
    runStatus: 'completed',
    durationMs: 84345,
    rounds: 1,
    modelStepsCompleted: 6,
    toolCalls: Object.freeze({
      read: Object.freeze({ completed: 5, failed: 0 } as const),
      edit: Object.freeze({ completed: 1, failed: 0 } as const),
      bash: Object.freeze({ completed: 1, failed: 0 } as const),
    }),
    testsPassed: true,
    sourceFileModified: 'src/leap-year.js',
    testFileModified: false,
    unexpectedFiles: 0,
    exitStatus: 0,
    telemetryTokens: Object.freeze({
      total: 28707,
      input: 3746,
      output: 1019,
      reasoning: 902,
      cacheRead: 23040,
      cacheWrite: 0,
    } as const),
    runId: 'e52f78b7-0bfa-430f-b8b0-1ad813ea0695',
  } as const)

export interface KimiK3MeasuredUsageEvidence {
  readonly scope: 'one_controlled_task'
  readonly amount: number
  readonly currency: 'USD'
}

export const KIMI_K3_MEASURED_USAGE_EVIDENCE: KimiK3MeasuredUsageEvidence =
  Object.freeze({
    scope: 'one_controlled_task',
    amount: 0.19,
    currency: 'USD',
  } as const)

export const KIMI_K3_FAQ = Object.freeze([
  {
    question: 'Where can I confirm Kimi K3 availability and pricing?',
    answer:
      'Check live pricing and your authenticated model list. Availability, pricing, and limits can change, and those live sources are authoritative.',
  },
  {
    question: 'What does the free credit include?',
    answer: KIMI_K3_CREDIT_DISCLAIMER,
  },
  {
    question: 'Which developer tools work with this API?',
    answer:
      'OpenCode, Cline, Roo Code, and tools that support the OpenAI-compatible chat completions API can use the same base URL and API key.',
  },
])

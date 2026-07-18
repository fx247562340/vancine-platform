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
  'kimi_k3_final_cta',
] as const)

export const KIMI_K3_RESOURCE_EVENT = 'developer_resource_clicked'
export const KIMI_K3_RESOURCE_VALUES = Object.freeze([
  'docs',
  'pricing',
] as const)
export const KIMI_K3_RESOURCE_LOCATIONS = Object.freeze([
  'header',
  'quickstart',
  'faq',
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

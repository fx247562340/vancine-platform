/*
Copyright (C) 2025 QuantumNous

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

export const KIMI_K3_CANONICAL = 'https://vancine.com/kimi-k3-api';
export const KIMI_K3_CREDIT_DISCLAIMER =
  '$1 free credit. No credit card required. Usage varies by model and request.';

const UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);

export function getKimiK3CtaDestination(isAuthenticated, search = '') {
  const destination = isAuthenticated
    ? '/console/playground'
    : '/register?source=kimi-k3-api';
  const source = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const allowed = new URLSearchParams();

  for (const [key, value] of source) {
    if (UTM_KEYS.has(key)) allowed.append(key, value);
  }

  const query = allowed.toString();
  if (!query) return destination;
  return `${destination}${destination.includes('?') ? '&' : '?'}${query}`;
}

const METADATA = {
  en: {
    title: 'Kimi K3 API for Coding Agents | Vancine',
    description:
      'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.',
    ogTitle: 'Kimi K3 for Coding Agents',
    ogDescription:
      'Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier Chinese models.',
    canonical: KIMI_K3_CANONICAL,
  },
  zh: {
    title: 'Kimi K3 编程智能体 API | Vancine',
    description:
      '通过 Vancine 的一个 API 密钥，将 OpenCode、Cline、Roo Code 和兼容 OpenAI 的工具连接至 Kimi K3。',
    ogTitle: '面向编程智能体的 Kimi K3',
    ogDescription:
      '使用一个兼容 OpenAI 的 API 密钥，将编程智能体接入 Kimi K3 和其他中国前沿模型。',
    canonical: KIMI_K3_CANONICAL,
  },
};

export function getKimiK3Metadata(language = '') {
  const normalized = language.trim().toLowerCase();
  return normalized === 'zh' || normalized.startsWith('zh-')
    ? METADATA.zh
    : METADATA.en;
}

export async function copyTextToClipboard(text, clipboard) {
  if (!clipboard || typeof clipboard.writeText !== 'function') return 'error';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch (_error) {
    return 'error';
  }
}

export const KIMI_K3_CODE_EXAMPLES = Object.freeze([
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
    code: `const response = await fetch('https://vancine.com/v1/chat/completions', {
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
]);

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
}`;

export const KIMI_K3_PORTFOLIO = Object.freeze([
  'Kimi K3',
  'GLM-5.2',
  'DeepSeek V4',
  'Qwen 3.7',
  'MiniMax',
]);

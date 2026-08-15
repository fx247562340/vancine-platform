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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems, type CodeTabSample } from '../lib/code-tabs'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

type CodeTab = keyof typeof CODE_LANGUAGES
const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

export default function ChatPage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'chat-title', title: t('chat.title'), level: 2 },
        { id: 'chat-params', title: t('chat.paramsTitle'), level: 3 },
        { id: 'chat-examples', title: t('chat.examplesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const samples = useMemo<Record<CodeTab, CodeTabSample>>(
    () => ({
      curl: {
        label: 'cURL',
        code: `curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "glm-5.1",
    "messages": [
      { "role": "user", "content": "ping" }
    ],
    "max_tokens": 100
  }'`,
      },
      python: {
        label: 'Python',
        code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="glm-5.1",
    messages=[{"role": "user", "content": "ping"}],
    max_tokens=100,
)

print(response.choices[0].message.content)
# Reasoning models may also return response.choices[0].message.reasoning_content`,
      },
      node: {
        label: 'Node.js',
        code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-api-key",
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "glm-5.1",
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
      },
    }),
    [baseUrl]
  )

  const codeTabItems = useMemo(
    () => buildCodeTabItems(samples, CODE_TAB_ORDER, CODE_LANGUAGES),
    [samples]
  )

  const params = useMemo<ParamRow[]>(
    () => [
      {
        name: 'model',
        type: 'string',
        required: true,
        description: t('chat.params.model'),
      },
      {
        name: 'messages',
        type: 'array',
        required: true,
        description: t('chat.params.messages'),
      },
      {
        name: 'max_tokens',
        type: 'integer',
        required: false,
        description: t('chat.params.maxTokens'),
      },
      {
        name: 'stream',
        type: 'boolean',
        required: false,
        description: t('chat.params.stream'),
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: t('chat.params.temperature'),
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='chat-title'>{t('chat.title')}</DocsH2>
      <DocsEndpoint method='POST' path='/v1/chat/completions' />
      <DocsP>{t('chat.desc')}</DocsP>

      <DocsH3 id='chat-params'>{t('chat.paramsTitle')}</DocsH3>
      <DocsParamTable params={params} />

      <DocsH3 id='chat-examples'>{t('chat.examplesTitle')}</DocsH3>
      <DocsCodeTabs items={codeTabItems} />

      <DocsCallout type='info'>{t('chat.reasoningCallout')}</DocsCallout>
    </div>
  )
}

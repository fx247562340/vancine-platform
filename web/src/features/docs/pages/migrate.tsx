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
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DocsCallout } from '../components/callout'
import { DocsCodeBlock } from '../components/code-block'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsH2, DocsP } from '../components/headings'
import { DocsTable, DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems, type CodeTabSample } from '../lib/code-tabs'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

type CodeTab = keyof typeof CODE_LANGUAGES
const CODE_TAB_ORDER: readonly CodeTab[] = ['python', 'node', 'curl']

export default function MigratePage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'migrate-title', title: t('migrate.title'), level: 2 },
        { id: 'two-changes', title: t('migrate.twoChanges.title'), level: 2 },
        {
          id: 'full-examples',
          title: t('migrate.fullExamples.title'),
          level: 2,
        },
        {
          id: 'what-stays-same',
          title: t('migrate.whatStaysSame.title'),
          level: 2,
        },
        {
          id: 'comparison-table',
          title: t('migrate.comparison.title'),
          level: 2,
        },
        { id: 'next-steps', title: t('migrate.nextSteps.title'), level: 2 },
      ],
      [t]
    )
  )

  // Minimal "only 2 changes" Python example
  const minimalExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",       # ← Change to your Vancine API key
    base_url="${baseUrl}"             # ← Change to Vancine base URL
)

resp = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(resp.choices[0].message.content)`

  const samples = useMemo<Record<CodeTab, CodeTabSample>>(
    () => ({
      python: {
        label: 'Python',
        code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=100,
)

print(response.choices[0].message.content)`,
      },
      node: {
        label: 'Node.js',
        code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-api-key",
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
      },
      curl: {
        label: 'cURL',
        code: `curl -X POST ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ],
    "max_tokens": 100
  }'`,
      },
    }),
    [baseUrl]
  )

  const codeTabItems = useMemo(
    () => buildCodeTabItems(samples, CODE_TAB_ORDER, CODE_LANGUAGES),
    [samples]
  )

  const sameItems = useMemo(
    () => [
      t('migrate.sameItems.endpoint'),
      t('migrate.sameItems.sdk'),
      t('migrate.sameItems.response'),
      t('migrate.sameItems.streaming'),
      t('migrate.sameItems.functionCalling'),
    ],
    [t]
  )

  const comparisonRows = useMemo<
    { field: string; openai: string; vancine: string; note: string }[]
  >(
    () => [
      {
        field: 'base_url',
        openai: t('migrate.comparison.baseUrlOpenai'),
        vancine: baseUrl,
        note: t('migrate.comparison.baseUrlNote'),
      },
      {
        field: 'api_key',
        openai: t('migrate.comparison.apiKeyOpenai'),
        vancine: 'sk-your-vancine-key',
        note: t('migrate.comparison.apiKeyNote'),
      },
      {
        field: 'model',
        openai: t('migrate.comparison.modelOpenai'),
        vancine: 'deepseek-v4-flash',
        note: t('migrate.comparison.modelNote'),
      },
    ],
    [t, baseUrl]
  )

  const nextSteps = useMemo<
    { slug: 'models' | 'quickstart'; label: string; icon: string }[]
  >(
    () => [
      {
        slug: 'models',
        label: t('migrate.nextSteps.models'),
        icon: '📋',
      },
      {
        slug: 'quickstart',
        label: t('migrate.nextSteps.quickstart'),
        icon: '🔑',
      },
    ],
    [t]
  )

  return (
    <div>
      {/* Title + hook */}
      <DocsH2 id='migrate-title'>{t('migrate.title')}</DocsH2>
      <DocsP>{t('migrate.hook')}</DocsP>

      {/* "Only 2 changes" core block */}
      <DocsH2 id='two-changes'>{t('migrate.twoChanges.title')}</DocsH2>
      <DocsP>{t('migrate.twoChanges.desc')}</DocsP>
      <DocsCodeBlock code={minimalExample} language='python' title='Python' />

      {/* Full examples */}
      <DocsH2 id='full-examples'>{t('migrate.fullExamples.title')}</DocsH2>
      <DocsP>{t('migrate.fullExamples.desc')}</DocsP>
      <DocsCodeTabs items={codeTabItems} />

      {/* "What stays the same" reassurance block */}
      <DocsH2 id='what-stays-same'>{t('migrate.whatStaysSame.title')}</DocsH2>
      <DocsP>{t('migrate.whatStaysSame.desc')}</DocsP>
      <DocsCallout type='tip'>
        <ul className='m-0 list-disc pl-5 leading-7'>
          {sameItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DocsCallout>

      {/* Migration comparison table */}
      <DocsH2 id='comparison-table'>{t('migrate.comparison.title')}</DocsH2>
      <DocsTable
        headers={[
          t('migrate.comparison.colField'),
          t('migrate.comparison.colOpenai'),
          t('migrate.comparison.colVancine'),
          t('migrate.comparison.colNote'),
        ]}
      >
        {comparisonRows.map((row) => (
          <DocsTr key={row.field} last={row.field === 'model'}>
            <DocsTd className='text-primary font-mono text-[13px]'>
              {row.field}
            </DocsTd>
            <DocsTd className='text-muted-foreground text-[13px]'>
              {row.openai}
            </DocsTd>
            <DocsTd className='text-primary font-mono text-[13px]'>
              {row.vancine}
            </DocsTd>
            <DocsTd className='text-muted-foreground text-[13px]'>
              {row.note}
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>

      {/* Next steps */}
      <DocsH2 id='next-steps'>{t('migrate.nextSteps.title')}</DocsH2>
      <DocsP>{t('migrate.nextSteps.desc')}</DocsP>
      <div className='grid gap-3 sm:grid-cols-2'>
        {nextSteps.map((item) => (
          <Link
            key={item.slug}
            to='/docs/$slug'
            params={{ slug: item.slug }}
            className='border-border text-foreground hover:border-primary/50 group flex items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-md'
          >
            <span className='text-xl' aria-hidden='true'>
              {item.icon}
            </span>
            <span className='flex-1'>{item.label}</span>
            <ArrowRight className='text-muted-foreground group-hover:text-primary size-4 transition-all group-hover:translate-x-0.5' />
          </Link>
        ))}
      </div>
    </div>
  )
}

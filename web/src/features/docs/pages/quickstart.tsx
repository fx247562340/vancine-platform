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
import { Link } from '@tanstack/react-router'
import { ArrowRight, Braces, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { DocsCallout } from '../components/callout'
import { DocsCodeBlock } from '../components/code-block'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems, type CodeTabSample } from '../lib/code-tabs'
import type { DocsSlug, TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

type CodeTab = keyof typeof CODE_LANGUAGES
const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

const RECOMMENDED_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.1',
  'qwen3.7-max',
  'kimi-k2.5',
]

const EXPECTED_RESPONSE = `{
  "id": "chatcmpl-xxxxx",
  "object": "chat.completion",
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  }
}`

export default function QuickStartPage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'quickstart-title', title: t('quickstart.title'), level: 2 },
        { id: 'step1', title: t('quickstart.step1.title'), level: 2 },
        { id: 'step2', title: t('quickstart.step2.title'), level: 2 },
        { id: 'step3', title: t('quickstart.step3.title'), level: 2 },
        { id: 'step4', title: t('quickstart.step4.title'), level: 2 },
        {
          id: 'expected-response',
          title: t('quickstart.step4.expectedResponse'),
          level: 3,
        },
        { id: 'info-table', title: t('quickstart.infoTable.title'), level: 2 },
        {
          id: 'explore-more',
          title: t('quickstart.exploreMore.title'),
          level: 2,
        },
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
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "user", "content": "Hello, Vancine!" }
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
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello, Vancine!"}],
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
  messages: [{ role: "user", content: "Hello, Vancine!" }],
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

  const infoRows = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: t('quickstart.infoTable.baseUrl'), value: baseUrl },
      {
        label: t('quickstart.infoTable.auth'),
        value: 'Authorization: Bearer sk-your-api-key',
      },
      { label: t('quickstart.infoTable.modelList'), value: 'GET /v1/models' },
      { label: t('quickstart.infoTable.pricing'), value: 'GET /api/pricing' },
    ],
    [t, baseUrl]
  )

  const exploreItems = useMemo<
    { slug: DocsSlug; label: string; icon: string }[]
  >(
    () => [
      { slug: 'chat', label: t('quickstart.exploreMore.chat'), icon: '💬' },
      { slug: 'image', label: t('quickstart.exploreMore.image'), icon: '🎨' },
      { slug: 'video', label: t('quickstart.exploreMore.video'), icon: '🎬' },
      {
        slug: 'migrate',
        label: t('quickstart.exploreMore.migrate'),
        icon: '🔄',
      },
    ],
    [t]
  )

  return (
    <div>
      {/* Page title */}
      <DocsH2 id='quickstart-title'>{t('quickstart.title')}</DocsH2>
      <DocsP>{t('quickstart.subtitle')}</DocsP>

      {/* Step 1: Get API key */}
      <DocsH2 id='step1'>{t('quickstart.step1.title')}</DocsH2>
      <DocsP>{t('quickstart.step1.desc')}</DocsP>
      <div className='mb-4 flex gap-2'>
        <Link
          to='/console/token'
          className='bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2'
        >
          {t('quickstart.step1.cta')}
          <ArrowRight className='size-4' />
        </Link>
      </div>
      <DocsCallout type='warning'>{t('quickstart.step1.security')}</DocsCallout>

      {/* Step 2: Choose a model */}
      <DocsH2 id='step2'>{t('quickstart.step2.title')}</DocsH2>
      <DocsP>{t('quickstart.step2.desc')}</DocsP>
      <div className='mb-4 flex flex-wrap gap-2'>
        {RECOMMENDED_MODELS.map((model, i) => (
          <Badge
            key={model}
            variant='secondary'
            className={
              i === 0
                ? 'bg-blue-500/15 font-mono text-blue-700 dark:text-blue-300'
                : 'font-mono'
            }
          >
            {model}
          </Badge>
        ))}
      </div>
      <DocsP>
        <Link
          to='/docs/$slug'
          params={{ slug: 'models' }}
          className='text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors'
        >
          {t('quickstart.step2.viewAll')}
          <ArrowRight className='size-4' />
        </Link>
      </DocsP>

      {/* Step 3: Choose calling method */}
      <DocsH2 id='step3'>{t('quickstart.step3.title')}</DocsH2>
      <DocsP>{t('quickstart.step3.desc')}</DocsP>
      <div className='mb-4 grid gap-3 sm:grid-cols-2'>
        <div className='border-border bg-card hover:border-primary/40 group rounded-xl border p-4 transition-all hover:shadow-sm'>
          <div className='mb-2 flex items-center gap-2'>
            <span className='bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-110'>
              <Globe className='size-4' />
            </span>
            <h4 className='text-foreground font-semibold'>HTTP API</h4>
          </div>
          <p className='text-muted-foreground m-0 text-[13px] leading-6'>
            {t('quickstart.step3.httpDesc')}
          </p>
        </div>
        <div className='border-border bg-card hover:border-primary/40 group rounded-xl border p-4 transition-all hover:shadow-sm'>
          <div className='mb-2 flex items-center gap-2'>
            <span className='bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-110'>
              <Braces className='size-4' />
            </span>
            <h4 className='text-foreground font-semibold'>OpenAI SDK</h4>
          </div>
          <p className='text-muted-foreground m-0 text-[13px] leading-6'>
            {t('quickstart.step3.sdkDesc')}
          </p>
        </div>
      </div>

      {/* Step 4: Make your first call */}
      <DocsH2 id='step4'>{t('quickstart.step4.title')}</DocsH2>
      <DocsP>{t('quickstart.step4.desc')}</DocsP>

      <DocsCodeTabs items={codeTabItems} />

      <DocsH3 id='expected-response'>
        {t('quickstart.step4.expectedResponse')}
      </DocsH3>
      <DocsCodeBlock code={EXPECTED_RESPONSE} language='json' title='JSON' />

      {/* Info table */}
      <DocsH2 id='info-table'>{t('quickstart.infoTable.title')}</DocsH2>
      <div className='border-border mb-4 overflow-hidden rounded-xl border'>
        <table className='w-full text-sm'>
          <tbody>
            {infoRows.map((row, i) => (
              <DocsTr key={row.label} last={i === infoRows.length - 1}>
                <DocsTd className='bg-muted/50 text-foreground w-40 font-semibold'>
                  {row.label}
                </DocsTd>
                <DocsTd className='text-primary font-mono text-[13px]'>
                  {row.value}
                </DocsTd>
              </DocsTr>
            ))}
          </tbody>
        </table>
      </div>

      <DocsCallout type='tip'>{t('quickstart.infoTable.tip')}</DocsCallout>

      {/* Explore more */}
      <DocsH2 id='explore-more'>{t('quickstart.exploreMore.title')}</DocsH2>
      <DocsP>{t('quickstart.exploreMore.desc')}</DocsP>
      <div className='grid gap-3 sm:grid-cols-2'>
        {exploreItems.map((item) => (
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

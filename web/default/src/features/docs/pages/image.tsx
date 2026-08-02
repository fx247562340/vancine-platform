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
import { Badge } from '@/components/ui/badge'
import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
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
const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

// [model, working size, notes]
const IMAGE_MODELS: ReadonlyArray<readonly [string, string, string]> = [
  ['qwen-image-2.0', '1024x1024', ''],
  ['qwen-image-2.0-pro', '1024x1024', '2K'],
  ['Doubao-Seedream-5.0-pro', '1K / 2K / WxH', '921,600 ~ 4,624,220 px'],
  ['Doubao-Seedream-5.0-lite', '2K / 3K / 4K / WxH', '≥ 3,686,400 px'],
  ['wan2.7-image', 'WxH', ''],
  ['wan2.7-image-pro', 'WxH', ''],
]

export default function ImagePage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'image-title', title: t('image.title'), level: 2 },
        { id: 'image-params', title: t('image.paramsTitle'), level: 3 },
        { id: 'image-sizes', title: t('image.sizesTitle'), level: 3 },
        { id: 'image-examples', title: t('image.examplesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const samples = useMemo<Record<CodeTab, CodeTabSample>>(
    () => ({
      curl: {
        label: 'cURL',
        code: `curl -X POST ${baseUrl}/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "qwen-image-2.0",
    "prompt": "a red apple on a wooden table",
    "n": 1,
    "size": "1024x1024"
  }'`,
      },
      python: {
        label: 'Python',
        code: `import requests

response = requests.post(
    "${baseUrl}/images/generations",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json",
    },
    json={
        "model": "qwen-image-2.0",
        "prompt": "a red apple on a wooden table",
        "n": 1,
        "size": "1024x1024",
    },
)

print(response.json()["data"][0]["url"])`,
      },
      node: {
        label: 'Node.js',
        code: `const response = await fetch("${baseUrl}/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen-image-2.0",
    prompt: "a red apple on a wooden table",
    n: 1,
    size: "1024x1024",
  }),
});

const data = await response.json();
console.log(data.data[0].url);`,
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
        description: t('image.params.model'),
      },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: t('image.params.prompt'),
      },
      {
        name: 'n',
        type: 'integer',
        required: false,
        description: t('image.params.n'),
      },
      {
        name: 'size',
        type: 'string',
        required: false,
        description: t('image.params.size'),
      },
      {
        name: 'response_format',
        type: 'string',
        required: false,
        description: t('image.params.response_format'),
      },
      {
        name: 'output_format',
        type: 'string',
        required: false,
        description: t('image.params.output_format'),
      },
      {
        name: 'image',
        type: 'string/array',
        required: false,
        description: t('image.params.image'),
      },
      {
        name: 'watermark',
        type: 'boolean',
        required: false,
        description: t('image.params.watermark'),
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='image-title'>{t('image.title')}</DocsH2>
      <DocsEndpoint method='POST' path='/v1/images/generations' />
      <DocsP>{t('image.desc')}</DocsP>

      <DocsH3 id='image-params'>{t('image.paramsTitle')}</DocsH3>
      <DocsParamTable params={params} />

      <DocsH3 id='image-sizes'>{t('image.sizesTitle')}</DocsH3>
      <DocsTable
        headers={[
          t('common.model'),
          t('image.colWorkingSize'),
          t('common.notes'),
        ]}
      >
        {IMAGE_MODELS.map(([model, size, note], i) => (
          <DocsTr key={model} last={i === IMAGE_MODELS.length - 1}>
            <DocsTd>
              <code className='text-primary font-mono text-[13px]'>
                {model}
              </code>
            </DocsTd>
            <DocsTd>
              <Badge className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'>
                {size}
              </Badge>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>
              {note || t('image.defaultSizeSupported')}
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>

      <DocsCallout type='warning'>{t('image.sizeWarning')}</DocsCallout>

      <DocsCallout type='info'>{t('image.advancedParamsCallout')}</DocsCallout>

      <DocsH3 id='image-examples'>{t('image.examplesTitle')}</DocsH3>
      <DocsCodeTabs items={codeTabItems} />
    </div>
  )
}

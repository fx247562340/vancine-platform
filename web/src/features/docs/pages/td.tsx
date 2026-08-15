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
import { DocsCodeBlock } from '../components/code-block'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { DocsTable, DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

// [model, images parameter, notes]
const THREE_D_MODELS: ReadonlyArray<readonly [string, string, string]> = [
  ['Hyper3D-Gen2', 'images optional', 'text or image reference'],
  ['Hitem3D-2.0', 'images optional', 'image reference recommended'],
  ['Doubao-Seed3D-2.0', 'images required', 'image-to-3D only'],
]

export default function TdPage(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'td-title', title: t('td.title'), level: 2 },
        { id: 'td-models', title: t('td.modelsTitle'), level: 3 },
        { id: 'td-params', title: t('td.paramsTitle'), level: 3 },
        { id: 'td-examples', title: t('td.examplesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const params = useMemo<ParamRow[]>(
    () => [
      {
        name: 'model',
        type: 'string',
        required: true,
        description: t('td.params.model'),
      },
      {
        name: 'prompt',
        type: 'string',
        required: false,
        description: t('td.params.prompt'),
      },
      {
        name: 'images',
        type: 'array',
        required: false,
        description: t('td.params.images'),
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='td-title'>{t('td.title')}</DocsH2>
      <DocsEndpoint
        method='POST'
        path='/v1/video/generations'
        desc={t('td.endpointSubmit')}
      />
      <DocsEndpoint
        method='GET'
        path='/v1/video/generations/{task_id}'
        desc={t('td.endpointPoll')}
      />
      <DocsP>{t('td.desc')}</DocsP>

      <DocsH3 id='td-models'>{t('td.modelsTitle')}</DocsH3>
      <DocsTable
        headers={[t('common.model'), t('td.colImagesParam'), t('common.notes')]}
      >
        {THREE_D_MODELS.map(([model, input, state], i) => (
          <DocsTr key={model} last={i === THREE_D_MODELS.length - 1}>
            <DocsTd>
              <code className='text-primary font-mono text-[13px]'>
                {model}
              </code>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>{input}</DocsTd>
            <DocsTd>
              <Badge className='bg-orange-500/15 text-orange-700 dark:text-orange-400'>
                {state}
              </Badge>
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>

      <DocsH3 id='td-params'>{t('td.paramsTitle')}</DocsH3>
      <DocsParamTable params={params} />

      <DocsH3 id='td-examples'>{t('td.examplesTitle')}</DocsH3>
      <DocsCodeBlock
        language='json'
        title={t('td.withoutImage')}
        code={`{
  "model": "Hyper3D-Gen2",
  "prompt": "a simple cube"
}`}
      />
      <DocsCodeBlock
        language='json'
        title={t('td.withImage')}
        code={`{
  "model": "Doubao-Seed3D-2.0",
  "prompt": "turn this reference into a clean 3D asset",
  "images": ["https://example.com/reference.png"]
}`}
      />

      <DocsCallout type='warning'>{t('td.imagesWarning')}</DocsCallout>
      <DocsCallout type='info'>
        {t('td.asyncCallout')}{' '}
        <code className='rounded bg-black/10 px-1 py-0.5 font-mono text-[12px] dark:bg-white/10'>
          {`GET ${baseUrl}/video/generations/{task_id}`}
        </code>
      </DocsCallout>
    </div>
  )
}

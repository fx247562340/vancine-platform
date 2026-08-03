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
import { DocsCodeBlock } from '../components/code-block'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsTable, DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import { getPricingUrl } from '../lib/base-url'
import type { TocHeading } from '../types'

const TEXT_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'Doubao-Seed-2.0-Code',
  'Doubao-Seed-2.0-pro',
  'Doubao-Seed-2.1-pro',
  'Doubao-Seed-2.1-turbo',
  'glm-5.1',
  'glm-5.2',
  'kimi-k2.5',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k3',
  'LongCat-2.0',
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M3',
  'qwen3.5-omni-flash',
  'qwen3.6-plus',
  'qwen3.7-max',
  'qwen3.7-plus',
]

const IMAGE_MODELS: [model: string, size: string, note: string][] = [
  ['qwen-image-2.0', '1024x1024', ''],
  ['qwen-image-2.0-pro', '1024x1024', '2K'],
  ['Doubao-Seedream-5.0-pro', '1K / 2K / WxH', '921,600 ~ 4,624,220 px'],
  ['Doubao-Seedream-5.0-lite', '2K / 3K / 4K / WxH', '≥ 3,686,400 px'],
  ['wan2.7-image', 'WxH', ''],
  ['wan2.7-image-pro', 'WxH', ''],
]

const VIDEO_MODELS: [model: string, price: string, note: string][] = [
  ['Doubao-Seedance-1.5-pro', '¥0.24 / call', '~37s in verification'],
  ['Doubao-Seedance-2.0-fast', '¥0.55 / call', 'async generation'],
  ['Doubao-Seedance-2.0', '¥0.68 / call', 'async generation'],
]

const THREE_D_MODELS: [model: string, input: string, state: string][] = [
  ['Hyper3D-Gen2', 'images optional', 'text or image reference'],
  ['Hitem3D-2.0', 'images optional', 'image reference recommended'],
  ['Doubao-Seed3D-2.0', 'images required', 'image-to-3D only'],
]

type ModelType = 'image' | 'video' | '3D' | 'audio'

interface MultimodalRow {
  model: string
  type: ModelType
  note: string
}

const TYPE_BADGE_CLASSES: Record<ModelType, string> = {
  image: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  video: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  '3D': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  audio: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
}

export default function ModelsPage(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  // Derive pricingUrl from baseUrl
  const pricingUrl = getPricingUrl(baseUrl)

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'models-title', title: t('models.title'), level: 2 },
        {
          id: 'models-text',
          title: t('models.textModelsTitle', { count: TEXT_MODELS.length }),
          level: 3,
        },
        {
          id: 'models-multimodal',
          title: t('models.multimodalTitle'),
          level: 3,
        },
      ],
      [t]
    )
  )

  const multimodalRows = useMemo<MultimodalRow[]>(
    () => [
      ...IMAGE_MODELS.map(
        ([model, size, note]): MultimodalRow => ({
          model,
          type: 'image',
          note: note !== '' ? note : size,
        })
      ),
      ...VIDEO_MODELS.map(
        ([model, price, note]): MultimodalRow => ({
          model,
          type: 'video',
          note: `${price}; ${note}`,
        })
      ),
      ...THREE_D_MODELS.map(
        ([model, input, state]): MultimodalRow => ({
          model,
          type: '3D',
          note: `${input}; ${state}`,
        })
      ),
      { model: 'Doubao-tts', type: 'audio', note: t('models.returnsValidMp3') },
      {
        model: 'Doubao-tts2.0',
        type: 'audio',
        note: t('models.returnsValidMp3'),
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='models-title'>{t('models.title')}</DocsH2>
      <DocsP>{t('models.desc')}</DocsP>
      <DocsCodeBlock
        code={`curl ${pricingUrl}`}
        title={t('models.fetchPricing')}
        language='bash'
      />

      <DocsH3 id='models-text'>
        {t('models.textModelsTitle', { count: TEXT_MODELS.length })}
      </DocsH3>
      <div className='mb-6 flex flex-wrap gap-2'>
        {TEXT_MODELS.map((model) => (
          <Badge
            key={model}
            variant='secondary'
            className='bg-blue-500/10 font-mono text-blue-700 transition-colors hover:bg-blue-500/20 dark:text-blue-300'
          >
            {model}
          </Badge>
        ))}
      </div>

      <DocsH3 id='models-multimodal'>{t('models.multimodalTitle')}</DocsH3>
      <DocsTable
        headers={[
          t('common.model'),
          t('models.colType'),
          t('models.colUsageNotes'),
        ]}
      >
        {multimodalRows.map((row, i) => (
          <DocsTr key={row.model} last={i === multimodalRows.length - 1}>
            <DocsTd className='text-primary font-mono text-[13px]'>
              {row.model}
            </DocsTd>
            <DocsTd>
              <Badge
                variant='secondary'
                className={TYPE_BADGE_CLASSES[row.type]}
              >
                {row.type}
              </Badge>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>{row.note}</DocsTd>
          </DocsTr>
        ))}
      </DocsTable>
    </div>
  )
}

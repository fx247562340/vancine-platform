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

import { DocsH2, DocsP } from '../components/headings'
import { DocsTable, DocsTr, DocsTd } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

interface CapabilityRow {
  key: 'chat' | 'tts' | 'image' | 'video' | 'td'
  endpoint: string
}

const CAPABILITY_ROWS: CapabilityRow[] = [
  { key: 'chat', endpoint: 'POST /v1/chat/completions' },
  { key: 'tts', endpoint: 'POST /v1/audio/speech' },
  { key: 'image', endpoint: 'POST /v1/images/generations' },
  { key: 'video', endpoint: 'POST /v1/video/generations' },
  { key: 'td', endpoint: 'POST /v1/video/generations' },
]

export default function Capabilities(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        {
          id: 'capabilities-title',
          title: t('capabilities.title'),
          level: 2,
        },
      ],
      [t]
    )
  )

  return (
    <div>
      <DocsH2 id='capabilities-title'>{t('capabilities.title')}</DocsH2>
      <DocsP>{t('capabilities.desc')}</DocsP>

      <div className='border-border bg-muted/40 mb-6 flex items-center gap-3 overflow-x-auto rounded-lg border px-4 py-2.5'>
        <Badge variant='outline'>{t('common.endpoint')}</Badge>
        <code className='text-foreground font-mono text-[13px]'>{baseUrl}</code>
      </div>

      <DocsTable
        headers={[
          t('common.category'),
          t('common.endpoint'),
          t('common.notes'),
        ]}
      >
        {CAPABILITY_ROWS.map((row, i) => (
          <DocsTr key={row.key} last={i === CAPABILITY_ROWS.length - 1}>
            <DocsTd>
              <Badge variant='secondary'>
                {t(`capabilities.rows.${row.key}`)}
              </Badge>
            </DocsTd>
            <DocsTd>
              <code className='bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[13px]'>
                {row.endpoint}
              </code>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>
              {t(`capabilities.rows.${row.key}Note`)}
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>
    </div>
  )
}

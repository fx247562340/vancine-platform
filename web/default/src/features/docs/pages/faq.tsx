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
import { DocsH2 } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

const FAQ_ITEMS = [
  'verifyKey',
  'video3dResults',
  'ttsNotJson',
  'seedreamSize',
] as const

type FaqItemKey = (typeof FAQ_ITEMS)[number]

export default function Faq(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [{ id: 'faq-title', title: t('faq.title'), level: 2 }],
      [t]
    )
  )

  return (
    <div>
      <DocsH2 id='faq-title'>{t('faq.title')}</DocsH2>

      {FAQ_ITEMS.map((itemKey: FaqItemKey) => (
        <div
          key={itemKey}
          className='border-border bg-card hover:border-primary/40 mb-4 rounded-xl border p-5 transition-all hover:shadow-md'
        >
          <div className='mb-2 flex items-start gap-2.5'>
            <Badge
              variant='secondary'
              className='mt-0.5 h-6 w-6 shrink-0 justify-center rounded-full font-bold'
            >
              Q
            </Badge>
            <h4 className='text-foreground font-semibold'>
              {t(`faq.items.${itemKey}.q`)}
            </h4>
          </div>
          <p className='text-muted-foreground pl-[34px] text-sm leading-relaxed'>
            {t(`faq.items.${itemKey}.a`, { baseUrl })}
          </p>
        </div>
      ))}
    </div>
  )
}

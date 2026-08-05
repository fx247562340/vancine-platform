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
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

interface SdkItem {
  name: string
  detail: string
  isCommand: boolean
}

export default function Sdks(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [{ id: 'sdks-title', title: t('sdks.title'), level: 2 }],
      [t]
    )
  )

  const sdks = useMemo<SdkItem[]>(
    () => [
      {
        name: 'OpenAI Python SDK',
        detail: 'pip install openai',
        isCommand: true,
      },
      {
        name: 'OpenAI Node.js SDK',
        detail: 'npm install openai',
        isCommand: true,
      },
      {
        name: 'requests / fetch',
        detail: t('sdks.requestsDesc'),
        isCommand: false,
      },
      {
        name: 'cURL',
        detail: t('sdks.curlDesc'),
        isCommand: false,
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='sdks-title'>{t('sdks.title')}</DocsH2>
      <DocsP>{t('sdks.desc')}</DocsP>

      <div className='border-border bg-muted/40 mb-6 flex items-center gap-3 overflow-x-auto rounded-lg border px-4 py-2.5'>
        <Badge variant='outline'>{t('common.endpoint')}</Badge>
        <code className='text-foreground font-mono text-[13px]'>{baseUrl}</code>
      </div>

      <div className='mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {sdks.map((sdk) => (
          <div
            key={sdk.name}
            className='border-border bg-card hover:border-primary/40 group rounded-xl border p-5 transition-all hover:shadow-md'
          >
            <h4 className='text-foreground mb-2 font-semibold'>{sdk.name}</h4>
            {sdk.isCommand ? (
              <code className='bg-muted text-primary group-hover:bg-primary/10 inline-block rounded-md px-2.5 py-1 font-mono text-xs transition-colors'>
                {sdk.detail}
              </code>
            ) : (
              <span className='text-muted-foreground text-sm leading-relaxed'>
                {sdk.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

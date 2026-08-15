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
import { DocsH2, DocsP } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

export default function Auth(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [{ id: 'auth-title', title: t('auth.title'), level: 2 }],
      [t]
    )
  )

  const curlExample = `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "glm-5.1",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'`

  return (
    <div>
      <DocsH2 id='auth-title'>{t('auth.title')}</DocsH2>
      <DocsP>{t('auth.desc')}</DocsP>

      <div className='mb-2 flex items-center gap-2'>
        <Badge variant='destructive'>{t('common.required')}</Badge>
        <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          HTTP Header
        </span>
      </div>
      <DocsCodeBlock
        code='Authorization: Bearer sk-your-api-key'
        language='bash'
      />

      <div className='mb-2 flex items-center gap-2'>
        <Badge variant='outline'>{t('common.endpoint')}</Badge>
        <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          cURL
        </span>
      </div>
      <DocsCodeBlock code={curlExample} language='bash' />

      <DocsCallout type='warning'>{t('auth.securityWarning')}</DocsCallout>
    </div>
  )
}

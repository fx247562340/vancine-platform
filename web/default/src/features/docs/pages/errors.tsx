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
import { DocsH2, DocsH3 } from '../components/headings'
import { DocsTable, DocsTr, DocsTd } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import type { TocHeading } from '../types'

interface ErrorCodeRow {
  status: string
  meaningKey: string
  causeKey: string
  severe: boolean
}

const ERROR_CODE_ROWS: ErrorCodeRow[] = [
  {
    status: '400',
    meaningKey: 'errors.codes.badRequest',
    causeKey: 'errors.codes.badRequestCause',
    severe: false,
  },
  {
    status: '401',
    meaningKey: 'errors.codes.unauthorized',
    causeKey: 'errors.codes.unauthorizedCause',
    severe: false,
  },
  {
    status: '404',
    meaningKey: 'errors.codes.notFound',
    causeKey: 'errors.codes.notFoundCause',
    severe: false,
  },
  {
    status: '503',
    meaningKey: 'errors.codes.noChannel',
    causeKey: 'errors.codes.noChannelCause',
    severe: true,
  },
]

const ERROR_RESPONSE = `{
  "error": {
    "message": "The parameter size specified in the request is not valid",
    "type": "upstream_error",
    "param": "",
    "code": "InvalidParameter"
  }
}`

export default function Errors(props: { baseUrl: string }) {
  const baseUrl = props.baseUrl
  const { t } = useTranslation('docs', { useSuspense: false })

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'errors-title', title: t('errors.title'), level: 2 },
        { id: 'errors-format', title: t('errors.formatTitle'), level: 3 },
      ],
      [t]
    )
  )

  return (
    <div>
      <DocsH2 id='errors-title'>{t('errors.title')}</DocsH2>

      <DocsTable
        headers={[
          t('errors.colHttpStatus'),
          t('common.meaning'),
          t('errors.colTypicalCause'),
        ]}
      >
        {ERROR_CODE_ROWS.map((row, i) => (
          <DocsTr key={row.status} last={i === ERROR_CODE_ROWS.length - 1}>
            <DocsTd>
              <Badge
                variant={row.severe ? 'destructive' : 'secondary'}
                className={
                  row.severe
                    ? undefined
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                }
              >
                {row.status}
              </Badge>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>
              {t(row.meaningKey)}
            </DocsTd>
            <DocsTd className='text-muted-foreground text-[13px]'>
              {t(row.causeKey)}
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>

      <div className='border-border bg-muted/40 mb-6 flex items-center gap-3 overflow-x-auto rounded-lg border px-4 py-2.5'>
        <Badge variant='outline'>{t('common.endpoint')}</Badge>
        <code className='text-foreground font-mono text-[13px]'>{baseUrl}</code>
      </div>

      <DocsH3 id='errors-format'>{t('errors.formatTitle')}</DocsH3>
      <DocsCodeBlock code={ERROR_RESPONSE} title='JSON' language='json' />
      <DocsCallout type='info'>{t('errors.asyncCallout')}</DocsCallout>
    </div>
  )
}

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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import { DOCS_NS } from '../i18n/loader'

export interface ParamRow {
  name: string
  type: string
  required: boolean
  description: string
}

export function DocsParamTable(props: { params: ParamRow[] }) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const params = props.params

  return (
    <div className='border-border mb-6 overflow-x-auto rounded-xl border'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='bg-muted/50 border-border border-b'>
            <th className='px-4 py-3 text-left font-semibold'>
              {t('common.parameter')}
            </th>
            <th className='px-4 py-3 text-left font-semibold'>
              {t('common.type')}
            </th>
            <th className='px-4 py-3 text-left font-semibold'>
              {t('common.required')}
            </th>
            <th className='px-4 py-3 text-left font-semibold'>
              {t('common.description')}
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr
              key={p.name}
              className={i < params.length - 1 ? 'border-border border-b' : ''}
            >
              <td className='px-4 py-3'>
                <code className='bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[13px]'>
                  {p.name}
                </code>
              </td>
              <td className='px-4 py-3'>
                <Badge variant='secondary'>{p.type}</Badge>
              </td>
              <td className='px-4 py-3'>
                {p.required ? (
                  <Badge variant='destructive'>{t('common.yes')}</Badge>
                ) : (
                  <Badge variant='secondary'>{t('common.no')}</Badge>
                )}
              </td>
              <td className='text-muted-foreground px-4 py-3'>
                {p.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

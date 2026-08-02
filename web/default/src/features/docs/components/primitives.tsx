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
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DocsTable(props: { headers: string[]; children: ReactNode }) {
  return (
    <div className='border-border mb-4 overflow-hidden rounded-xl border'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='bg-muted/50 border-border border-b'>
            {props.headers.map((h) => (
              <th key={h} className='px-4 py-3 text-left font-semibold'>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  )
}

export function DocsTr(props: { last?: boolean; children: ReactNode }) {
  return (
    <tr className={props.last ? '' : 'border-border border-b'}>
      {props.children}
    </tr>
  )
}

export function DocsTd(props: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-3 align-top', props.className)}>
      {props.children}
    </td>
  )
}

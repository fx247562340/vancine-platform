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

type CalloutType = 'info' | 'warning' | 'tip' | 'danger'

const CALLOUT_STYLES: Record<CalloutType, string> = {
  info: 'border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
  warning:
    'border-l-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  tip: 'border-l-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300',
  danger:
    'border-l-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300',
}

const CALLOUT_ICONS: Record<CalloutType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  tip: '💡',
  danger: '🚫',
}

export function DocsCallout(props: {
  type?: CalloutType
  children: ReactNode
}) {
  const type = props.type ?? 'info'
  return (
    <div
      role='note'
      className={cn(
        'mb-4 rounded-r-lg border-l-4 px-4 py-3 text-sm',
        CALLOUT_STYLES[type]
      )}
    >
      <span className='mr-1' aria-hidden='true'>
        {CALLOUT_ICONS[type]}
      </span>{' '}
      {props.children}
    </div>
  )
}

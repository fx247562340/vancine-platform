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
import { cn } from '@/lib/utils'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-600 text-white',
  POST: 'bg-blue-600 text-white',
  PUT: 'bg-amber-600 text-white',
  DELETE: 'bg-red-600 text-white',
}

export function DocsEndpoint(props: {
  method: string
  path: string
  desc?: string
}) {
  return (
    <div className='border-border bg-muted/30 mb-4 flex items-start gap-3 rounded-xl border p-4'>
      <span
        className={cn(
          'inline-block rounded px-2 py-0.5 text-xs font-bold',
          METHOD_COLORS[props.method] ?? 'bg-gray-600 text-white'
        )}
      >
        {props.method}
      </span>
      <div>
        <code className='text-foreground text-sm font-semibold'>
          {props.path}
        </code>
        {props.desc && (
          <p className='text-muted-foreground mt-1 text-sm'>{props.desc}</p>
        )}
      </div>
    </div>
  )
}

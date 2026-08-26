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

For commercial licensing, please contact support@quantumnous.com.
*/
import type { ReactNode } from 'react'

type GenerationGalleryShellProps = {
  /** Section title, e.g. "Task queue" or "Generation history". */
  title: string
  /** Accessible name for the region landmark (falls back to title). */
  ariaLabel?: string
  /** Right-aligned meta slot: counts, filters, or actions. */
  meta?: ReactNode
  children: ReactNode
}

/**
 * Shared results-area frame used by both playgrounds: a titled
 * section header with an optional meta slot, followed by the result
 * cards. Presentation only — result data and actions stay in the
 * owning feature.
 */
export function GenerationGalleryShell(props: GenerationGalleryShellProps) {
  return (
    <section
      className='mt-6 flex flex-col gap-3'
      aria-label={props.ariaLabel ?? props.title}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-base font-semibold'>{props.title}</h2>
        {props.meta}
      </div>
      {props.children}
    </section>
  )
}

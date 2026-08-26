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
import { useTranslation } from 'react-i18next'

type CanvasComposerShellProps = {
  /** Compact top toolbar: model / mode / connection controls. */
  toolbar?: ReactNode
  /** Bottom control bar: quick parameters and submit. */
  footer?: ReactNode
  /** Composer body — the prompt and reference tray. */
  children: ReactNode
}

/**
 * The Canvas Composer card: toolbar on top, prompt-first body, and a
 * control-bar footer. Presentation only — slots receive display data
 * and callbacks from the owning feature; the shell owns no state.
 */
export function CanvasComposerShell(props: CanvasComposerShellProps) {
  const { t } = useTranslation()
  return (
    <section className='bg-card border-border/60 overflow-hidden rounded-2xl border shadow-sm'>
      {props.toolbar ? (
        <div
          role='toolbar'
          aria-label={t('Composer toolbar')}
          className='border-border/60 flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4'
        >
          {props.toolbar}
        </div>
      ) : null}
      <div className='px-3 py-3 md:px-4 md:py-4'>{props.children}</div>
      {props.footer ? (
        <div className='border-border/60 bg-muted/30 flex flex-wrap items-center gap-2 border-t px-3 py-2.5 md:px-4'>
          {props.footer}
        </div>
      ) : null}
    </section>
  )
}

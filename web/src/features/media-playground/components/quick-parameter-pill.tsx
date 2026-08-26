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
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Compact footer pill used by the Canvas Composer quick controls.
 * Thin wrapper over `Button` (variant `outline`) so the trigger can
 * be re-used as a Base UI Popover/Sheet trigger via `render`. It
 * owns no parameter state and forwards all props (including the
 * trigger's `data-slot` / `aria-expanded` / ref) to the underlying
 * `<button>`. The `ariaLabel` shorthand is mapped to `aria-label`
 * for caller ergonomics — passing it raw would surface as a custom
 * DOM attribute.
 */
export type QuickParameterPillProps = Omit<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'aria-label'
> & {
  /** Shortcut for the accessible name of the trigger button. */
  ariaLabel?: string
  /** Forwarded to the inner `Button`'s `size` variant. */
  size?: ComponentProps<typeof Button>['size']
}

export function QuickParameterPill(props: QuickParameterPillProps) {
  const { ariaLabel, size, ...rest } = props
  return (
    <Button
      type='button'
      variant='outline'
      size={size ?? 'default'}
      aria-label={ariaLabel}
      {...rest}
    />
  )
}

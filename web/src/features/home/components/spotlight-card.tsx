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
import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  interactive?: boolean
}

/**
 * Restrained Spotlight Card primitive.
 *
 * Pure-React local primitive; no gsap/framer-motion/motion/React Bits
 * dependency. The pointer-following radial spotlight is implemented by
 * writing two CSS custom properties (--spot-x, --spot-y) on the card DOM
 * node via a ref + a single rAF-throttled pointermove handler. No React
 * state is updated per frame.
 *
 * Hover behavior is gated behind the combined media query
 * `(pointer: fine) and (prefers-reduced-motion: no-preference)`.
 * coarse pointer / touch / reduced-motion users never trigger hover.
 */
export const SpotlightCard = forwardRef<HTMLDivElement, Props>(
  function SpotlightCard(
    { children, className = '', style, interactive = true },
    forwardedRef
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null)

    const setRef = (node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    }

    useEffect(() => {
      const el = innerRef.current
      if (!el || !interactive) return

      let rafId: number | null = null
      let pendingX = 0
      let pendingY = 0

      const allowHover =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia(
          '(pointer: fine) and (prefers-reduced-motion: no-preference)'
        ).matches

      if (!allowHover) return

      const apply = () => {
        rafId = null
        el.style.setProperty('--spot-x', `${pendingX}px`)
        el.style.setProperty('--spot-y', `${pendingY}px`)
      }

      const onMove = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect()
        pendingX = e.clientX - rect.left
        pendingY = e.clientY - rect.top
        if (rafId == null) rafId = window.requestAnimationFrame(apply)
      }

      el.addEventListener('pointermove', onMove, { passive: true })
      return () => {
        el.removeEventListener('pointermove', onMove)
        if (rafId != null) {
          window.cancelAnimationFrame(rafId)
          rafId = null
        }
      }
    }, [interactive])

    const wrapperClass = [
      'group relative h-full overflow-hidden rounded-xl',
      'border border-border/40 bg-muted/10',
      interactive
        ? 'transition-transform duration-200 motion-reduce:transition-none'
        : '',
      '[@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:border-border',
      interactive
        ? '[@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:-translate-y-1 motion-reduce:hover:translate-y-0'
        : '',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    const cssVars: CSSProperties = {
      ...({
        '--spot-x': '50%',
        '--spot-y': '50%',
      } as Record<string, string>),
      ...style,
    }

    return (
      <div ref={setRef} className={wrapperClass} style={cssVars}>
        <span
          aria-hidden
          className='pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 motion-reduce:opacity-0 motion-reduce:transition-none [@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:group-hover:opacity-100'
          style={{
            background:
              'radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(167,139,250,0.18), transparent 60%)',
          }}
        />
        <span className='relative block h-full'>{children}</span>
      </div>
    )
  }
)

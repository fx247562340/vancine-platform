/*
Copyright (C) 2025 QuantumNous

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
import React, { useEffect, useRef } from 'react';

/**
 * Restrained Spotlight Card primitive (Classic theme).
 *
 * Pure-React local primitive; no gsap/framer-motion/motion/React Bits
 * dependency. The pointer-following radial spotlight is implemented by
 * writing two CSS custom properties (--spot-x, --spot-y) on the card DOM
 * node via a ref + a single rAF-throttled pointermove handler. No React
 * state is updated per frame, so the listener never re-renders the tree.
 *
 * Base transitions (transform + opacity, duration-200) live on the wrapper
 * and overlay unconditionally so the fade-in is smooth in normal motion.
 *
 * Hover behavior (translate, border lift, spotlight overlay opacity) is
 * gated behind the COMBINED media query
 * `(pointer: fine) and (prefers-reduced-motion: no-preference)`, expressed
 * via Tailwind's arbitrary media variant
 * `[@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:`.
 * coarse pointer / touch / reduced-motion users never trigger hover and
 * the static card face stays still.
 *
 * The JS pointermove listener is gated on the same combined condition
 * via `matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)')`.
 * coarse pointer OR reduced-motion short-circuits the listener so no
 * pointermove handler, no rAF, no CSS-var writes happen at all.
 *
 * prefers-reduced-motion fully disables transitions and hover via
 * `motion-reduce:transition-none` / `motion-reduce:opacity-0`.
 *
 * The focus ring lives on the consumer's enclosing link (no native
 * focusable role added here). This component is decorative-only.
 */
const SpotlightCard = React.forwardRef(function SpotlightCard(
  { children, className = '', style, interactive = true },
  forwardedRef,
) {
  const innerRef = useRef(null);

  const setRef = (node) => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  useEffect(() => {
    const el = innerRef.current;
    if (!el || !interactive) return undefined;

    let rafId = null;
    let pendingX = 0;
    let pendingY = 0;

    // Combined gate: fine pointer AND no reduced-motion preference.
    // coarse pointer OR reduced-motion: no listener, no rAF, no CSS writes.
    const allowHover =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(
        '(pointer: fine) and (prefers-reduced-motion: no-preference)',
      ).matches;

    if (!allowHover) return undefined;

    const apply = () => {
      rafId = null;
      el.style.setProperty('--spot-x', `${pendingX}px`);
      el.style.setProperty('--spot-y', `${pendingY}px`);
    };

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      pendingX = e.clientX - rect.left;
      pendingY = e.clientY - rect.top;
      if (rafId == null) rafId = window.requestAnimationFrame(apply);
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [interactive]);

  const wrapperClass = [
    'group relative h-full overflow-hidden rounded-2xl border backdrop-blur-[12px]',
    'bg-[color:var(--vc-glass-bg)]',
    'border-[color:var(--vc-glass-border)]',
    // Base transition lives on the wrapper unconditionally so motion is
    // smooth when hover fires on fine pointer + no-preference.
    interactive
      ? 'transition-transform duration-200 motion-reduce:transition-none'
      : '',
    // Hover border lift is gated behind the combined media query —
    // coarse pointer / touch / reduced-motion never enter a hover state.
    '[@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:border-[color:rgba(255,255,255,0.20)]',
    // 4px lift is gated behind the same combined media query.
    interactive
      ? '[@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:-translate-y-1 motion-reduce:hover:translate-y-0'
      : '',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setRef}
      className={wrapperClass}
      style={{
        '--spot-x': '50%',
        '--spot-y': '50%',
        ...style,
      }}
    >
      <span
        aria-hidden
        className='pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 [@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:group-hover:opacity-100 motion-reduce:opacity-0 motion-reduce:transition-none'
        style={{
          background:
            'radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(167,139,250,0.18), transparent 60%)',
        }}
      />
      <span className='relative block h-full'>{children}</span>
    </div>
  );
});

export default SpotlightCard;
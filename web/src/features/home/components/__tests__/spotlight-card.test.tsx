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
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SpotlightCard } from '../spotlight-card'

// ---------------------------------------------------------------------------
// Polyfill PointerEvent for jsdom
// ---------------------------------------------------------------------------

class PointerEventPolyfill extends MouseEvent {
  pointerType: string
  constructor(type: string, init?: MouseEventInit & { pointerType?: string }) {
    super(type, init)
    this.pointerType = init?.pointerType ?? 'mouse'
  }
}

function installPointerEventPolyfill(): void {
  if (typeof globalThis.PointerEvent === 'undefined') {
    ;(globalThis as unknown as Record<string, unknown>).PointerEvent =
      PointerEventPolyfill
  }
  if (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).PointerEvent ===
      'undefined'
  ) {
    ;(window as unknown as Record<string, unknown>).PointerEvent =
      PointerEventPolyfill
  }
}

// ---------------------------------------------------------------------------
// State saved between tests for global stubs
// ---------------------------------------------------------------------------

let savedRaf: typeof globalThis.requestAnimationFrame
let savedCaf: typeof globalThis.cancelAnimationFrame
let savedMatchMedia: typeof window.matchMedia

beforeEach(() => {
  installPointerEventPolyfill()
  savedRaf = globalThis.requestAnimationFrame
  savedCaf = globalThis.cancelAnimationFrame
  savedMatchMedia = window.matchMedia
})

afterEach(() => {
  globalThis.requestAnimationFrame = savedRaf
  globalThis.cancelAnimationFrame = savedCaf
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: savedMatchMedia,
  })
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpotlightCard', () => {
  it('renders children content', () => {
    render(
      <SpotlightCard>
        <span>child content</span>
      </SpotlightCard>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('forwards ref to root div', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(ref.current?.className).toContain('rounded-xl')
  })

  it('applies custom className alongside defaults', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref} className='custom-class'>
        <span>child</span>
      </SpotlightCard>
    )
    expect(ref.current?.className).toContain('custom-class')
    expect(ref.current?.className).toContain('rounded-xl')
    expect(ref.current?.className).toContain('border-border/40')
  })

  it('sets default --spot-x and --spot-y CSS vars', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement
    expect(el.style.getPropertyValue('--spot-x')).toBe('50%')
    expect(el.style.getPropertyValue('--spot-y')).toBe('50%')
  })

  it('on fine pointer + no-preference: pointermove writes CSS coordinates via rAF', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let rafCounter = 0
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return ++rafCounter
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = vi.fn()

    const matchMediaSpy = vi.fn().mockImplementation((query: string) => {
      if (
        query === '(pointer: fine) and (prefers-reduced-motion: no-preference)'
      ) {
        return { matches: true, media: query }
      }
      return { matches: false, media: query }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    })

    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement

    // Override getBoundingClientRect for deterministic coordinates
    el.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        right: 300,
        bottom: 250,
        width: 200,
        height: 200,
        x: 100,
        y: 50,
        toJSON: () => {},
      }) as DOMRect

    // Dispatch pointermove
    const ev = new PointerEventPolyfill('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 180,
      clientY: 120,
      pointerType: 'mouse',
    })
    el.dispatchEvent(ev)

    // rAF callback should have been scheduled
    expect(rafCallbacks.length).toBe(1)

    // Execute the rAF callback
    rafCallbacks[0]?.(performance.now())

    // CSS coordinates should be clientX - rect.left, clientY - rect.top
    expect(el.style.getPropertyValue('--spot-x')).toBe('80px')
    expect(el.style.getPropertyValue('--spot-y')).toBe('70px')
  })

  it('coarse pointer: does not mount pointermove listener', () => {
    const rafSpy = vi.fn()
    globalThis.requestAnimationFrame =
      rafSpy as unknown as typeof requestAnimationFrame

    const matchMediaSpy = vi.fn().mockImplementation((query: string) => {
      if (
        query === '(pointer: fine) and (prefers-reduced-motion: no-preference)'
      ) {
        return { matches: false, media: query } // coarse pointer
      }
      return { matches: false, media: query }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    })

    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect

    const ev = new PointerEventPolyfill('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 100,
      clientY: 100,
      pointerType: 'mouse',
    })
    el.dispatchEvent(ev)

    // No listener attached → rAF should not be called
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('reduced-motion: does not mount pointermove listener', () => {
    const rafSpy = vi.fn()
    globalThis.requestAnimationFrame =
      rafSpy as unknown as typeof requestAnimationFrame

    const matchMediaSpy = vi.fn().mockImplementation((query: string) => {
      if (
        query === '(pointer: fine) and (prefers-reduced-motion: no-preference)'
      ) {
        return { matches: false, media: query } // reduced-motion
      }
      return { matches: false, media: query }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    })

    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect

    const ev = new PointerEventPolyfill('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 100,
      clientY: 100,
      pointerType: 'mouse',
    })
    el.dispatchEvent(ev)

    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('interactive=false: does not mount pointermove listener', () => {
    const rafSpy = vi.fn()
    globalThis.requestAnimationFrame =
      rafSpy as unknown as typeof requestAnimationFrame

    const matchMediaSpy = vi.fn().mockImplementation((query: string) => {
      if (
        query === '(pointer: fine) and (prefers-reduced-motion: no-preference)'
      ) {
        return { matches: true, media: query }
      }
      return { matches: false, media: query }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    })

    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref} interactive={false}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect

    const ev = new PointerEventPolyfill('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 100,
      clientY: 100,
      pointerType: 'mouse',
    })
    el.dispatchEvent(ev)

    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('unmount cancels pending rAF', () => {
    let lastRafId = 0
    const cancelSpy = vi.fn()
    globalThis.requestAnimationFrame = (() => {
      return ++lastRafId
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame =
      cancelSpy as unknown as typeof cancelAnimationFrame

    const matchMediaSpy = vi.fn().mockImplementation((query: string) => {
      if (
        query === '(pointer: fine) and (prefers-reduced-motion: no-preference)'
      ) {
        return { matches: true, media: query }
      }
      return { matches: false, media: query }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    })

    const ref = createRef<HTMLDivElement>()
    const { unmount } = render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const el = ref.current as HTMLDivElement
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect

    // Dispatch a pointermove to schedule a rAF
    const ev = new PointerEventPolyfill('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 100,
      clientY: 100,
      pointerType: 'mouse',
    })
    el.dispatchEvent(ev)

    // rAF was scheduled (id=1)
    expect(lastRafId).toBe(1)

    // Unmount should cancel it
    unmount()
    expect(cancelSpy).toHaveBeenCalledWith(1)
  })

  it('does not set tabIndex on the card itself', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    expect(ref.current?.getAttribute('tabindex')).toBeNull()
  })

  it('renders spotlight gradient span with CSS variable references', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <SpotlightCard ref={ref}>
        <span>child</span>
      </SpotlightCard>
    )
    const spotlight = (ref.current as HTMLDivElement).querySelector(
      '[aria-hidden]'
    )
    expect(spotlight).not.toBeNull()
    const bgStyle = (spotlight as HTMLElement).style.background
    expect(bgStyle).toContain('var(--spot-x)')
    expect(bgStyle).toContain('var(--spot-y)')
  })
})

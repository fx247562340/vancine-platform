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
*/
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// ogl is mocked so the dynamic import inside the component resolves to a
// stub. The stub is wired to track WebGL lifecycle (renderer construction,
// render calls, context loss) so the test can assert that the
// BrandLightTunnel component only ever runs at most one RAF loop, fully
// cancels it on visibility/intersection changes, and releases the WebGL
// context on unmount.
// ---------------------------------------------------------------------------

interface MockOglState {
  renderCalls: number
  contextLossCalls: number
}

const mockOglRefs: MockOglState & {
  lastWebglContext: null | { lost: boolean; loseContext: () => void }
} = {
  renderCalls: 0,
  contextLossCalls: 0,
  lastWebglContext: null,
}

vi.mock('ogl', () => {
  const loseContext = () => {
    mockOglRefs.contextLossCalls += 1
    if (mockOglRefs.lastWebglContext) mockOglRefs.lastWebglContext.lost = true
  }
  return {
    Mesh: class {
      gl: WebGL2RenderingContext
      constructor(gl: WebGL2RenderingContext, _opts?: unknown) {
        this.gl = gl
      }
    },
    Program: class {
      gl: WebGL2RenderingContext
      constructor(gl: WebGL2RenderingContext, _opts?: unknown) {
        this.gl = gl
      }
    },
    Renderer: class {
      gl: WebGL2RenderingContext
      canvas: HTMLCanvasElement
      constructor(_opts?: unknown) {
        const canvas = document.createElement('canvas')
        this.canvas = canvas
        const ctx = {
          canvas,
          clearColor: vi.fn(),
          getExtension: (name: string) =>
            name === 'WEBGL_lose_context' ? { loseContext } : null,
          drawingBufferWidth: 1024,
          drawingBufferHeight: 1024,
        } as unknown as WebGL2RenderingContext
        this.gl = ctx
        mockOglRefs.lastWebglContext = {
          lost: false,
          loseContext,
        }
      }
      setSize() {
        /* no-op */
      }
      render() {
        mockOglRefs.renderCalls += 1
      }
    },
    Triangle: class {
      gl: WebGL2RenderingContext
      constructor(gl: WebGL2RenderingContext, _opts?: unknown) {
        this.gl = gl
      }
    },
  }
})

// Polyfill ResizeObserver (jsdom does not ship one).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  })
}

import { BrandLightTunnel } from '../brand-light-tunnel'

// ---------------------------------------------------------------------------
// Test harness: controllable RAF / IntersectionObserver / document.hidden
// ---------------------------------------------------------------------------

interface Harness {
  rafCallbacks: Map<number, FrameRequestCallback>
  raf: ReturnType<typeof vi.fn>
  caf: ReturnType<typeof vi.fn>
  observedElements: Element[]
  intersectionCallbacks: Array<(entries: IntersectionObserverEntry[]) => void>
  visibilityListeners: Set<() => void>
  documentHidden: { value: boolean }
  fireVisibilityChange: (next: boolean) => void
  fireIntersection: (next: boolean) => void
}

function installHarness(): Harness {
  const rafCallbacks = new Map<number, FrameRequestCallback>()
  const raf = vi.fn((cb: FrameRequestCallback) => {
    const id = rafCallbacks.size + 1
    rafCallbacks.set(id, cb)
    return id
  })
  const caf = vi.fn((id: number) => {
    rafCallbacks.delete(id)
  })

  const intersectionCallbacks: Array<
    (entries: IntersectionObserverEntry[]) => void
  > = []
  const observedElements: Element[] = []

  class IntersectionObserverMock {
    cb: (entries: IntersectionObserverEntry[]) => void
    constructor(
      cb: (entries: IntersectionObserverEntry[]) => void,
      _opts?: IntersectionObserverInit
    ) {
      this.cb = cb
      intersectionCallbacks.push(cb)
    }
    observe(target: Element) {
      observedElements.push(target)
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  const visibilityListeners = new Set<() => void>()
  const documentHidden = { value: false }
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get() {
      return documentHidden.value
    },
  })

  // Intercept document.addEventListener for 'visibilitychange' so the test
  // can fire the callback without an actual tab change.
  const originalAdd = document.addEventListener.bind(document)
  const originalRemove = document.removeEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'visibilitychange') {
        visibilityListeners.add(handler as () => void)
        return
      }
      return originalAdd(event, handler)
    }
  )
  vi.spyOn(document, 'removeEventListener').mockImplementation(
    (event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'visibilitychange') {
        visibilityListeners.delete(handler as () => void)
        return
      }
      return originalRemove(event, handler)
    }
  )

  // RAF / caf / IO installation.
  const rafOriginal = globalThis.requestAnimationFrame
  const cafOriginal = globalThis.cancelAnimationFrame
  void rafOriginal
  void cafOriginal
  const ioOriginal = (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: raf,
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: caf,
  })
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverMock,
  })

  return {
    rafCallbacks,
    raf,
    caf,
    observedElements,
    intersectionCallbacks,
    visibilityListeners,
    documentHidden,
    fireVisibilityChange(next: boolean) {
      documentHidden.value = next
      for (const fn of visibilityListeners) fn()
    },
    fireIntersection(next: boolean) {
      const entries: IntersectionObserverEntry[] = observedElements.map(
        (el) =>
          ({
            isIntersecting: next,
            target: el,
            intersectionRatio: next ? 1 : 0,
            boundingClientRect: el.getBoundingClientRect(),
            intersectionRect: el.getBoundingClientRect(),
            rootBounds: null,
            time: performance.now(),
          }) as unknown as IntersectionObserverEntry
      )
      for (const cb of intersectionCallbacks) {
        cb(entries)
      }
    },
    __rafOriginal: rafOriginal,
    __cafOriginal: cafOriginal,
    __ioOriginal: ioOriginal,
  } as Harness & {
    __rafOriginal: unknown
    __cafOriginal: unknown
    __ioOriginal: unknown
  }
}

function restoreHarness(
  harness: ReturnType<typeof installHarness> & {
    __rafOriginal: unknown
    __cafOriginal: unknown
    __ioOriginal: unknown
  }
) {
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: harness.__rafOriginal,
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: harness.__cafOriginal,
  })
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: harness.__ioOriginal,
  })
}

// Drive the queued RAF callbacks; the callbacks themselves may queue
// another frame, so we keep draining until no new RAF is queued.
function flushRaf(harness: Harness) {
  let safety = 200
  while (harness.rafCallbacks.size > 0 && safety > 0) {
    const cbs = [...harness.rafCallbacks.entries()]
    for (const [id, cb] of cbs) {
      harness.caf(id)
      cb(performance.now())
    }
    safety -= 1
  }
}

let harness: ReturnType<typeof installHarness> & {
  __rafOriginal: unknown
  __cafOriginal: unknown
  __ioOriginal: unknown
}
let originalMatchMedia: typeof window.matchMedia
let originalUserAgent: string

function setMatchMedia(opts: { reducedMotion: boolean; finePointer: boolean }) {
  window.matchMedia = ((query: string) => {
    const matches =
      (query.includes('prefers-reduced-motion') && opts.reducedMotion) ||
      (query.includes('pointer: fine') && opts.finePointer)
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia
  originalUserAgent = navigator.userAgent
  // Pretend we are NOT in jsdom so the component tries the WebGL branch.
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    writable: true,
    value: 'Mozilla/5.0 (BrandLightTunnelTest) VancineLifecycle/1.0',
  })
  setMatchMedia({ reducedMotion: false, finePointer: false })
  harness = installHarness() as ReturnType<typeof installHarness> & {
    __rafOriginal: unknown
    __cafOriginal: unknown
    __ioOriginal: unknown
  }
})

afterEach(() => {
  restoreHarness(harness)
  window.matchMedia = originalMatchMedia
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    writable: true,
    value: originalUserAgent,
  })
})

// Wait for the OGL dynamic import to resolve. The component uses
// `void import('ogl').then(...)`; the test must yield microtasks for
// the import promise to settle and the scheduleRaf call to land.
async function waitForOglReady() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  // The renderer constructor is the first thing the .then() does.
  // Wait until the mock has at least one instance visible.
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      if (mockOglRefs.lastWebglContext) break
      await Promise.resolve()
    }
  })
}

describe('BrandLightTunnel RAF lifecycle', () => {
  it('reduced-motion users never start a continuous RAF', async () => {
    setMatchMedia({ reducedMotion: true, finePointer: false })
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.raf).not.toHaveBeenCalled()
    unmount()
  })

  it('reduced-motion: document.hidden→visible does not start a RAF', async () => {
    setMatchMedia({ reducedMotion: true, finePointer: false })
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBe(0)

    // The visibilitychange listener IS still registered (we
    // intercepted document.addEventListener), so the fire call
    // reaches the component's handler. The reduced-motion gate
    // inside scheduleRaf must keep the loop idle.
    await act(async () => {
      harness.fireVisibilityChange(true)
    })
    expect(harness.rafCallbacks.size).toBe(0)

    await act(async () => {
      harness.fireVisibilityChange(false)
    })
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.raf).not.toHaveBeenCalled()
    unmount()
  })

  it('reduced-motion: IntersectionObserver off-screen→visible does not start a RAF', async () => {
    setMatchMedia({ reducedMotion: true, finePointer: false })
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBe(0)

    await act(async () => {
      harness.fireIntersection(false)
    })
    expect(harness.rafCallbacks.size).toBe(0)

    await act(async () => {
      harness.fireIntersection(true)
    })
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.raf).not.toHaveBeenCalled()
    unmount()
  })

  it('IntersectionObserver off-screen cancels the RAF loop', async () => {
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    // The host is observed and visible by default; the loop is active.
    expect(harness.observedElements.length).toBeGreaterThan(0)
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBeGreaterThanOrEqual(1)

    await act(async () => {
      harness.fireIntersection(false)
    })
    // The loop MUST be cancelled as soon as the host leaves the
    // viewport — no second concurrent loop is allowed.
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.caf).toHaveBeenCalled()
    unmount()
  })

  it('re-entering the viewport restarts the loop with exactly one RAF', async () => {
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBeGreaterThanOrEqual(1)

    await act(async () => {
      harness.fireIntersection(false)
    })
    expect(harness.rafCallbacks.size).toBe(0)

    await act(async () => {
      harness.fireIntersection(true)
    })
    // Exactly one RAF must be scheduled — the loop must not
    // self-multiply when visibility returns.
    expect(harness.rafCallbacks.size).toBe(1)
    // And the next frame must self-sustain without external nudges.
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBe(1)
    unmount()
  })

  it('document.hidden pauses the loop; visible resumes it', async () => {
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.rafCallbacks.size).toBeGreaterThanOrEqual(1)

    await act(async () => {
      harness.fireVisibilityChange(true)
    })
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.caf).toHaveBeenCalled()

    await act(async () => {
      harness.fireVisibilityChange(false)
    })
    expect(harness.rafCallbacks.size).toBe(1)
    unmount()
  })

  it('unmount cancels RAF, disconnects the IO, removes the pointer listener, and loses the WebGL context', async () => {
    setMatchMedia({ reducedMotion: false, finePointer: true })
    const { unmount } = render(<BrandLightTunnel appearance='light' />)
    await waitForOglReady()
    flushRaf(harness)
    expect(harness.observedElements.length).toBeGreaterThan(0)
    expect(harness.rafCallbacks.size).toBeGreaterThanOrEqual(1)

    const ctxLossBefore = mockOglRefs.contextLossCalls
    unmount()
    expect(harness.rafCallbacks.size).toBe(0)
    expect(harness.caf).toHaveBeenCalled()
    // WebGL context must be lost on cleanup so the GPU resources
    // are released the moment the hero leaves the page.
    expect(mockOglRefs.contextLossCalls).toBeGreaterThan(ctxLossBefore)
  })
})

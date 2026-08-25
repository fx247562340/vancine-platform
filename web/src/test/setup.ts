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
import '@testing-library/jest-dom/vitest'

// Enable the React act() environment so explicit act() calls (used to flush
// Base UI's deferred focus updates) work without warnings.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom does not implement scrolling; stub the APIs components touch so
// tests don't throw "Not implemented" (TOC click + router scroll restoration).
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}

// jsdom does not implement ResizeObserver, but cmdk/command menus and popper
// implementations depend on it. Provide a no-op so component tests render
// without throwing.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom does not implement matchMedia; useMediaQuery (useSyncExternalStore)
// needs a stable, EventTarget-backed object per query. Default matches:false;
// tests that need to control a query (e.g. prefers-reduced-motion) override
// window.matchMedia via vi.stubGlobal.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const mediaQueryLists = new Map<string, MediaQueryList>()
  window.matchMedia = ((query: string) => {
    let mql = mediaQueryLists.get(query)
    if (!mql) {
      const target = new EventTarget() as unknown as MediaQueryList & {
        media: string
      }
      target.media = query
      Object.defineProperty(target, 'matches', {
        value: false,
        configurable: true,
      })
      mql = target
      mediaQueryLists.set(query, mql)
    }
    return mql
  }) as typeof window.matchMedia
}

// jsdom does not implement PointerEvent; Base UI's Switch / Select
// open via the pressable trigger which dispatches pointer events.
// Provide a minimal constructor that mirrors MouseEvent so userEvent
// clicks land cleanly without throwing "PointerEvent is not a
// constructor".
if (
  typeof window !== 'undefined' &&
  typeof (window as { PointerEvent?: unknown }).PointerEvent === 'undefined'
) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit & EventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  ;(window as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill
  ;(globalThis as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill
}

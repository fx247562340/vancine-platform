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
// Run with: node --test src/lib/analytics.test.ts
// Uses Node's native test runner (node:test + node:assert/strict) so that no
// new test dependency is introduced. Node 22 strips TypeScript types from .ts
// files natively.
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { trackEvent } from './analytics.ts'

interface TrackCall {
  eventName: string
  eventData: unknown
}

interface TrackSpy {
  calls: TrackCall[]
}

interface WindowLike {
  location: { hostname: string }
  umami?: { track: (eventName: string, eventData?: unknown) => void }
}

function installWindow(hostname: string, spy?: TrackSpy): void {
  const win: WindowLike = { location: { hostname } }
  if (spy) {
    win.umami = {
      track: (eventName: string, eventData?: unknown) => {
        spy.calls.push({ eventName, eventData })
      },
    }
  }
  ;(globalThis as unknown as { window: WindowLike }).window = win
}

function clearWindow(): void {
  delete (globalThis as unknown as { window?: WindowLike }).window
}

describe('analytics.trackEvent', () => {
  afterEach(clearWindow)

  test('reports an event on vancine.com', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('vancine.com', spy)

    trackEvent('get_started_clicked', { location: 'hero' })

    assert.equal(spy.calls.length, 1)
    assert.equal(spy.calls[0].eventName, 'get_started_clicked')
  })

  test('reports an event on www.vancine.com', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('www.vancine.com', spy)

    trackEvent('signup_started')

    assert.equal(spy.calls.length, 1)
    assert.equal(spy.calls[0].eventName, 'signup_started')
  })

  test('does not report on localhost', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('localhost', spy)

    trackEvent('playground_request_started', {
      model: 'doubao-pro',
      endpoint_type: 'openai',
    })

    assert.equal(spy.calls.length, 0)
  })

  test('does not report on 127.0.0.1', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('127.0.0.1', spy)

    trackEvent('checkout_started', { provider: 'stripe', amount: 10 })

    assert.equal(spy.calls.length, 0)
  })

  test('does not report on other hostnames (e.g. staging)', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('staging.vancine.com', spy)

    trackEvent('get_started_clicked', { location: 'cta' })

    assert.equal(spy.calls.length, 0)
  })

  test('does not throw when window.umami is missing', () => {
    installWindow('vancine.com') // no umami tracker present

    assert.doesNotThrow(() => trackEvent('signup_completed'))
  })

  test('does not throw when umami.track throws', () => {
    const win: WindowLike = { location: { hostname: 'vancine.com' } }
    win.umami = {
      track: () => {
        throw new Error('ad-blocker or script error')
      },
    }
    ;(globalThis as unknown as { window: WindowLike }).window = win

    assert.doesNotThrow(() => trackEvent('signup_started'))
  })

  test('does not throw or report when window is absent', () => {
    clearWindow()

    assert.doesNotThrow(() => trackEvent('signup_started'))
  })

  test('forwards eventData unchanged and injects no extra fields', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('vancine.com', spy)
    const payload = { provider: 'epay', amount: 50 }

    trackEvent('checkout_started', payload)

    assert.equal(spy.calls.length, 1)
    assert.deepEqual(spy.calls[0].eventData, payload)
    const data = spy.calls[0].eventData as Record<string, unknown>
    assert.deepEqual(Object.keys(data).sort(), ['amount', 'provider'])
  })

  test('forwards eventData by reference when provided', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('vancine.com', spy)
    const payload = { location: 'hero' }

    trackEvent('get_started_clicked', payload)

    assert.equal(spy.calls[0].eventData, payload)
  })

  test('forwards undefined eventData when omitted', () => {
    const spy: TrackSpy = { calls: [] }
    installWindow('vancine.com', spy)

    trackEvent('signup_started')

    assert.equal(spy.calls.length, 1)
    assert.equal(spy.calls[0].eventData, undefined)
  })
})

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
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { trackEvent } from '@/lib/analytics'

/**
 * window stub harness: every case installs a fresh window/umami mock and the
 * afterEach hook restores the original global, so no case leaks state into
 * the next one.
 */
interface TrackCall {
  eventName: string
  eventData: unknown
}

const originalWindow = (globalThis as Record<string, unknown>).window

function installWindow(
  hostname: string,
  options: { track?: (eventName: string, eventData?: unknown) => void } = {}
): { calls: TrackCall[] } {
  const calls: TrackCall[] = []
  const umami =
    options.track === undefined
      ? {
          track: (eventName: string, eventData?: unknown) => {
            calls.push({ eventName, eventData })
          },
        }
      : { track: options.track }
  ;(globalThis as Record<string, unknown>).window = {
    location: { hostname },
    umami,
  }
  return { calls }
}

function removeWindow(): void {
  delete (globalThis as Record<string, unknown>).window
}

afterEach(() => {
  if (originalWindow === undefined) {
    removeWindow()
  } else {
    ;(globalThis as Record<string, unknown>).window = originalWindow
  }
})

describe('analytics production hostname gate', () => {
  test('sends events on vancine.com', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], {
      eventName: 'get_started_clicked',
      eventData: { location: 'kimi_k3_hero' },
    })
  })

  test('sends events on www.vancine.com', () => {
    const { calls } = installWindow('www.vancine.com')
    trackEvent('developer_resource_clicked', { resource: 'docs' })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], {
      eventName: 'developer_resource_clicked',
      eventData: { resource: 'docs' },
    })
  })

  for (const hostname of [
    'localhost',
    '127.0.0.1',
    'staging.vancine.com',
    'preview.vercel.app',
    'app.vancine.com',
  ]) {
    test(`does not send events on ${hostname}`, () => {
      const { calls } = installWindow(hostname)
      trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
      assert.equal(calls.length, 0)
    })
  }
})

describe('analytics failure safety', () => {
  test('is a strict no-op when window is missing', () => {
    removeWindow()
    assert.doesNotThrow(() =>
      trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
    )
  })

  test('is a strict no-op when umami is not injected', () => {
    ;(globalThis as Record<string, unknown>).window = {
      location: { hostname: 'vancine.com' },
    }
    assert.doesNotThrow(() =>
      trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
    )
  })

  test('never propagates errors thrown by track', () => {
    installWindow('vancine.com', {
      track: () => {
        throw new Error('tracker blocked')
      },
    })
    assert.doesNotThrow(() =>
      trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
    )
  })
})

describe('analytics payload privacy boundary', () => {
  test('passes the fixed enumeration through unchanged', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('developer_resource_clicked', {
      resource: 'starter_repo',
      location: 'evidence',
    })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].eventData, {
      resource: 'starter_repo',
      location: 'evidence',
    })
  })

  test('does not auto-inject any extra fields', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('get_started_clicked', { location: 'kimi_k3_hero' })
    assert.deepEqual(Object.keys(calls[0].eventData ?? {}), ['location'])
  })

  test('drops keys outside the fixed enumeration', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('get_started_clicked', {
      location: 'kimi_k3_hero',
      email: 'user@example.com',
      api_key: 'secret',
    } as unknown as Parameters<typeof trackEvent>[1])
    assert.deepEqual(calls[0].eventData, { location: 'kimi_k3_hero' })
  })

  test('passes model field through to the tracker', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('featured_model_clicked', {
      location: 'available_now',
      model: 'kimi-k3',
    })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].eventData, {
      location: 'available_now',
      model: 'kimi-k3',
    })
  })

  test('drops unauthorized keys even when model is present', () => {
    const { calls } = installWindow('vancine.com')
    trackEvent('featured_model_clicked', {
      location: 'available_now',
      model: 'kimi-k3',
      email: 'user@example.com',
      api_key: 'secret',
    } as unknown as Parameters<typeof trackEvent>[1])
    assert.deepEqual(calls[0].eventData, {
      location: 'available_now',
      model: 'kimi-k3',
    })
  })
})

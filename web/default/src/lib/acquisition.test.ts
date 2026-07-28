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
// Run with: node --test --experimental-strip-types src/lib/acquisition.test.ts
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import {
  __resetAcquisitionLocksForTests,
  captureAndReportFirstTouch,
  extractLandingPath,
  extractUtm,
  reportAcquisitionEvent,
  reportSignupStarted,
} from './acquisition.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  __resetAcquisitionLocksForTests()
  try {
    delete (globalThis as { window?: unknown }).window
  } catch {
    /* empty */
  }
})

describe('extractUtm', () => {
  test('allowlists only utm_* keys', () => {
    const utm = extractUtm(
      '?utm_source=reddit&utm_campaign=kimi_k3_launch&utm_medium=post&utm_content=a&utm_term=b&foo=1&fbclid=x'
    )
    assert.equal(utm.utm_source, 'reddit')
    assert.equal(utm.utm_campaign, 'kimi_k3_launch')
    assert.equal(utm.utm_medium, 'post')
    assert.equal(utm.utm_content, 'a')
    assert.equal(utm.utm_term, 'b')
    assert.equal(
      Object.keys(utm).sort().join(','),
      'utm_campaign,utm_content,utm_medium,utm_source,utm_term'
    )
  })

  test('empty search yields empty object', () => {
    assert.deepEqual(extractUtm(''), {})
    assert.deepEqual(extractUtm('?foo=1'), {})
  })
})

describe('extractLandingPath', () => {
  test('returns pathname only', () => {
    assert.equal(extractLandingPath('/kimi-k3-api'), '/kimi-k3-api')
    assert.equal(extractLandingPath('//evil'), '')
    assert.equal(extractLandingPath('relative'), '')
  })
})

describe('reportAcquisitionEvent', () => {
  test('landing_view payload includes utm and path; never throws', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push({ url: String(url), init: init || {} })
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch
    await reportAcquisitionEvent('landing_view', {
      utm_source: 'reddit',
      landing_path: '/kimi-k3-api',
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/acquisition/touch')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.credentials, 'same-origin')
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.event, 'landing_view')
    assert.equal(body.utm_source, 'reddit')
    assert.equal(body.landing_path, '/kimi-k3-api')
  })

  test('signup_started payload is event-only', async () => {
    const calls: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (
      _url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push(JSON.parse(String(init?.body)))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    await reportAcquisitionEvent('signup_started', {
      utm_source: 'should-not-send',
      landing_path: '/nope',
    })
    assert.deepEqual(calls[0], { event: 'signup_started' })
  })

  test('network errors are swallowed', async () => {
    globalThis.fetch = async () => {
      throw new Error('network down')
    }
    await assert.doesNotReject(() =>
      reportAcquisitionEvent('landing_view', { landing_path: '/' })
    )
  })

  test('passes keepalive option through to fetch', async () => {
    const calls: Array<RequestInit> = []
    globalThis.fetch = (async (
      _url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push(init || {})
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    await reportAcquisitionEvent('signup_started', undefined, {
      keepalive: true,
    })
    assert.equal(calls[0].keepalive, true)
  })
})

describe('captureAndReportFirstTouch', () => {
  test('reads window location and posts landing_view once under dedupe', async () => {
    const calls: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (
      _u: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push(JSON.parse(String(init?.body)))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    ;(
      globalThis as unknown as {
        window: { location: { search: string; pathname: string } }
      }
    ).window = {
      location: {
        search: '?utm_source=x&utm_campaign=y',
        pathname: '/sign-up',
      },
    }
    await Promise.all([
      captureAndReportFirstTouch(),
      captureAndReportFirstTouch(),
    ])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].event, 'landing_view')
    assert.equal(calls[0].utm_source, 'x')
    assert.equal(calls[0].landing_path, '/sign-up')
  })
})

describe('reportSignupStarted', () => {
  test('posts signup_started after ensuring landing_view', async () => {
    const calls: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (
      _u: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push(JSON.parse(String(init?.body)))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    ;(
      globalThis as unknown as {
        window: { location: { search: string; pathname: string } }
      }
    ).window = {
      location: { search: '', pathname: '/sign-up' },
    }
    await reportSignupStarted()
    assert.equal(calls.length, 2)
    assert.equal(calls[0].event, 'landing_view')
    assert.equal(calls[1].event, 'signup_started')
  })

  test('waits for in-flight landing_view before signup_started', async () => {
    const order: string[] = []
    let resolveLanding!: () => void
    const landingGate = new Promise<void>((r) => {
      resolveLanding = r
    })
    let landingStarted = false

    globalThis.fetch = (async (
      _u: string | URL | Request,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body)) as { event: string }
      if (body.event === 'landing_view') {
        landingStarted = true
        order.push('landing_fetch_start')
        await landingGate
        order.push('landing_fetch_end')
      } else {
        order.push('signup_fetch')
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    ;(
      globalThis as unknown as {
        window: { location: { search: string; pathname: string } }
      }
    ).window = {
      location: { search: '?utm_source=race', pathname: '/' },
    }

    // Start global landing capture without awaiting.
    const landingP = captureAndReportFirstTouch()
    // Give fetch a tick to start.
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(landingStarted, true)

    const signupP = reportSignupStarted()
    // signup must still be waiting on landing
    await new Promise((r) => setTimeout(r, 10))
    assert.ok(!order.includes('signup_fetch'))

    resolveLanding()
    await Promise.all([landingP, signupP])

    assert.deepEqual(order, [
      'landing_fetch_start',
      'landing_fetch_end',
      'signup_fetch',
    ])
  })

  test('OAuth-style await with keepalive settles before caller continues', async () => {
    const order: string[] = []
    let resolveLanding!: () => void
    const landingGate = new Promise<void>((r) => {
      resolveLanding = r
    })

    globalThis.fetch = (async (
      _u: string | URL | Request,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body)) as { event: string }
      if (body.event === 'landing_view') {
        await landingGate
      } else {
        order.push(`signup keepalive=${Boolean(init?.keepalive)}`)
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    ;(
      globalThis as unknown as {
        window: { location: { search: string; pathname: string } }
      }
    ).window = {
      location: { search: '', pathname: '/sign-up' },
    }

    void captureAndReportFirstTouch()
    let redirected = false
    const oauthClick = (async () => {
      await reportSignupStarted({ keepalive: true })
      redirected = true
      order.push('redirect')
    })()

    await new Promise((r) => setTimeout(r, 10))
    assert.equal(redirected, false)
    resolveLanding()
    await oauthClick
    assert.equal(redirected, true)
    assert.deepEqual(order, ['signup keepalive=true', 'redirect'])
  })
})

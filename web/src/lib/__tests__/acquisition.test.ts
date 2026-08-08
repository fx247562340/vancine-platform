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
// @ts-expect-error - bun:test ships no types in this project; only its fake
// timer controls are used here.
import { jest } from 'bun:test'
/**
 * Behavior tests for the first-party acquisition capture module.
 *
 * Every test loads a fresh module instance through a cache-busting dynamic
 * import, so the per-page-load dedupe state is isolated without any
 * production test-only reset export. Timing-dependent cases drive the real
 * budget/timeout timers through fake timers or controlled promises — never
 * real waiting.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

type AcquisitionModule = typeof import('../acquisition')

type RecordedCall = {
  url: string
  init: RequestInit | undefined
  body: Record<string, unknown> | null
  settle?: (response: Response) => void
}

type FetchBehavior = (call: RecordedCall) => Promise<Response>

type Deferred = { promise: Promise<void>; resolve: () => void }

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let instanceCounter = 0
let calls: RecordedCall[] = []
let callStartSignals: Deferred[] = []
let fetchBehavior: FetchBehavior = async () =>
  new Response(null, { status: 200 })

const originalFetch = globalThis.fetch

function installFetchStub(): void {
  calls = []
  callStartSignals = []
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    const rawBody = init?.body
    const call: RecordedCall = {
      url: String(url),
      init,
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : null,
    }
    calls.push(call)
    while (callStartSignals.length < calls.length) {
      callStartSignals.push(createDeferred())
    }
    // Explicit "request started" signal, resolved synchronously when the
    // Nth fetch begins — tests await this instead of flushing microtasks.
    callStartSignals[calls.length - 1].resolve()
    return fetchBehavior(call)
  }) as typeof fetch
}

/** Resolves when the Nth network request has started. */
function callStarted(index: number): Promise<void> {
  while (callStartSignals.length <= index) {
    callStartSignals.push(createDeferred())
  }
  return callStartSignals[index].promise
}

/** No request ever settles on its own; only abort ends it. */
function fullyHangingBehavior(): FetchBehavior {
  return (call) =>
    new Promise<Response>((_resolve, reject) => {
      call.init?.signal?.addEventListener('abort', () =>
        reject(new Error('AbortError'))
      )
    })
}

/** Every request hangs until the test settles it explicitly. */
function scriptedBehavior(): FetchBehavior {
  return (call) =>
    new Promise<Response>((resolve, reject) => {
      call.settle = resolve
      call.init?.signal?.addEventListener('abort', () =>
        reject(new Error('AbortError'))
      )
    })
}

async function loadAcquisition(location?: {
  pathname?: string
  search?: string
}): Promise<AcquisitionModule> {
  instanceCounter += 1
  ;(globalThis as Record<string, unknown>).window = {
    location: {
      pathname: location?.pathname ?? '/pricing',
      search: location?.search ?? '',
    },
  }
  const specifier = `../acquisition.ts?instance=${instanceCounter}`
  return (await import(specifier)) as AcquisitionModule
}

function trackResolution(promise: Promise<void>): () => boolean {
  let resolved = false
  void promise.then(() => {
    resolved = true
  })
  return () => resolved
}

function landingCalls(): RecordedCall[] {
  return calls.filter((call) => call.body?.event === 'landing_view')
}

function signupCalls(): RecordedCall[] {
  return calls.filter((call) => call.body?.event === 'signup_started')
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchBehavior = async () => new Response(null, { status: 200 })
  delete (globalThis as Record<string, unknown>).window
  jest.useRealTimers()
})

describe('extractUtm', () => {
  test('extracts exactly the five allowlisted UTM fields', async () => {
    const acquisition = await loadAcquisition()

    const utm = acquisition.extractUtm(
      '?utm_source=hn&utm_medium=cpc&utm_campaign=launch&utm_content=banner&utm_term=gateway' +
        '&aff=42&fbclid=fb-1&gclid=g-1&referrer=r&ref=x&url=https%3A%2F%2Fvancine.com'
    )

    assert.deepEqual(utm, {
      utm_source: 'hn',
      utm_medium: 'cpc',
      utm_campaign: 'launch',
      utm_content: 'banner',
      utm_term: 'gateway',
    })
  })

  test('skips empty UTM values and accepts a bare query string', async () => {
    const acquisition = await loadAcquisition()

    assert.deepEqual(acquisition.extractUtm('?utm_source=&utm_medium=social'), {
      utm_medium: 'social',
    })
    assert.deepEqual(acquisition.extractUtm('utm_term=kw'), { utm_term: 'kw' })
    assert.deepEqual(acquisition.extractUtm(''), {})
  })
})

describe('extractLandingPath', () => {
  test('keeps absolute pathnames and drops query or fragment pollution', async () => {
    const acquisition = await loadAcquisition()

    assert.equal(acquisition.extractLandingPath('/pricing'), '/pricing')
    assert.equal(acquisition.extractLandingPath('/sign-up'), '/sign-up')
    assert.equal(
      acquisition.extractLandingPath('/pricing?utm_source=x#top'),
      '/pricing'
    )
    assert.equal(acquisition.extractLandingPath('/a/b#frag'), '/a/b')
  })

  test('rejects relative, protocol-relative and empty paths', async () => {
    const acquisition = await loadAcquisition()

    assert.equal(acquisition.extractLandingPath('pricing/plans'), '')
    assert.equal(acquisition.extractLandingPath('//evil.example/steal'), '')
    assert.equal(acquisition.extractLandingPath(''), '')
  })
})

describe('captureLandingView', () => {
  test('posts one landing_view with allowlisted UTM and the landing path', async () => {
    installFetchStub()
    const acquisition = await loadAcquisition({
      pathname: '/pricing',
      search: '?utm_source=newsletter&utm_campaign=launch&fbclid=leak&aff=7',
    })

    await acquisition.captureLandingView()

    assert.equal(calls.length, 1)
    const call = calls[0]
    assert.equal(call.url, '/api/acquisition/touch')
    assert.equal(call.init?.method, 'POST')
    assert.equal(call.init?.credentials, 'same-origin')
    assert.deepEqual(call.init?.headers, {
      'Content-Type': 'application/json',
    })
    assert.equal(call.init?.keepalive, false)
    assert.deepEqual(call.body, {
      event: 'landing_view',
      utm_source: 'newsletter',
      utm_campaign: 'launch',
      landing_path: '/pricing',
    })
  })

  test('omits empty UTM values and invalid landing paths from the body', async () => {
    installFetchStub()
    const acquisition = await loadAcquisition({ pathname: '', search: '' })

    await acquisition.captureLandingView()

    assert.deepEqual(calls[0].body, { event: 'landing_view' })
  })

  test('dedupes concurrent and repeated calls into one request', async () => {
    installFetchStub()
    const acquisition = await loadAcquisition()

    const first = acquisition.captureLandingView()
    const second = acquisition.captureLandingView()
    await Promise.all([first, second])
    await acquisition.captureLandingView()

    assert.equal(calls.length, 1)
  })

  test('resolves when the network request fails', async () => {
    fetchBehavior = async () => {
      throw new TypeError('network down')
    }
    installFetchStub()
    const acquisition = await loadAcquisition()

    await acquisition.captureLandingView()

    assert.equal(calls.length, 1)
  })

  test('resolves on non-2xx responses without throwing', async () => {
    fetchBehavior = async () => new Response(null, { status: 500 })
    installFetchStub()
    const acquisition = await loadAcquisition()

    await acquisition.captureLandingView()

    assert.equal(calls.length, 1)
  })

  test('aborts itself after the short landing timeout', async () => {
    jest.useFakeTimers()
    fetchBehavior = fullyHangingBehavior()
    installFetchStub()
    const acquisition = await loadAcquisition()

    const done = acquisition.captureLandingView()
    const isResolved = trackResolution(done)
    await callStarted(0)
    assert.equal(isResolved(), false)

    jest.advanceTimersByTime(1499)
    assert.equal(isResolved(), false)

    jest.advanceTimersByTime(1)
    await done

    assert.equal(calls[0].init?.signal?.aborted, true)
  })
})

describe('reportSignupStarted', () => {
  test('waits for the in-flight landing_view before posting signup_started', async () => {
    fetchBehavior = scriptedBehavior()
    installFetchStub()
    const acquisition = await loadAcquisition()

    void acquisition.captureLandingView()
    await callStarted(0)
    const done = acquisition.reportSignupStarted()

    // signup_started must not be sent while landing_view is unresolved
    assert.equal(calls.length, 1)
    assert.equal(signupCalls().length, 0)

    calls[0].settle?.(new Response(null, { status: 200 }))
    await callStarted(1)
    calls[1].settle?.(new Response(null, { status: 200 }))
    await done

    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1].body, { event: 'signup_started' })
  })

  test('starts landing_view first when capture never ran, then sends signup_started', async () => {
    installFetchStub()
    const acquisition = await loadAcquisition()

    await acquisition.reportSignupStarted({ keepalive: true })

    assert.equal(calls.length, 2)
    assert.equal(calls[0].body?.event, 'landing_view')
    assert.equal(calls[0].init?.keepalive, false)
    assert.deepEqual(calls[1].body, { event: 'signup_started' })
    assert.equal(calls[1].init?.keepalive, true)
    assert.equal(calls[1].url, '/api/acquisition/touch')
    assert.equal(calls[1].init?.credentials, 'same-origin')
  })

  test('dedupes repeated signup intents into one signup_started', async () => {
    installFetchStub()
    const acquisition = await loadAcquisition()

    await acquisition.reportSignupStarted()
    await acquisition.reportSignupStarted()
    const concurrent = [
      acquisition.reportSignupStarted(),
      acquisition.reportSignupStarted(),
    ]
    await Promise.all(concurrent)

    assert.equal(landingCalls().length, 1)
    assert.equal(signupCalls().length, 1)
  })

  test('releases without signup_started when landing stays unresolved at the budget end', async () => {
    jest.useFakeTimers()
    fetchBehavior = fullyHangingBehavior()
    installFetchStub()
    const acquisition = await loadAcquisition()

    const done = acquisition.reportSignupStarted({ keepalive: true })
    const isResolved = trackResolution(done)
    await callStarted(0)

    jest.advanceTimersByTime(1499)
    assert.equal(isResolved(), false)
    assert.equal(signupCalls().length, 0)

    jest.advanceTimersByTime(1)
    await done

    // Released inside the budget, never out-of-order:
    assert.equal(calls.length, 1)
    assert.equal(signupCalls().length, 0)
    assert.equal(calls[0].init?.signal?.aborted, true)
  })

  test('gives signup_started only the remaining budget after a slow landing', async () => {
    jest.useFakeTimers()
    fetchBehavior = scriptedBehavior()
    installFetchStub()
    const acquisition = await loadAcquisition()

    const done = acquisition.reportSignupStarted({ keepalive: true })
    const isResolved = trackResolution(done)
    // landing_view request starts and is held in its controlled deferred.
    await callStarted(0)

    // t=400ms: landing is still unresolved, so no signup request exists.
    jest.advanceTimersByTime(400)
    assert.equal(calls.length, 1)
    assert.equal(signupCalls().length, 0)

    // Landing completes at t=400ms; signup_started starts only now.
    calls[0].settle?.(new Response(null, { status: 200 }))
    await callStarted(1)

    // t=1499ms total: signup consumed 1099ms of the remaining 1100ms.
    jest.advanceTimersByTime(1099)
    assert.equal(isResolved(), false)
    assert.equal(calls[1].init?.signal?.aborted, false)

    // t=1500ms total: the shared budget ends — not a second 1500ms window.
    jest.advanceTimersByTime(1)
    await done

    assert.equal(isResolved(), true)
    assert.equal(calls[1].init?.signal?.aborted, true)
    assert.equal(signupCalls().length, 1)
  })

  test('resolves when the signup_started request fails', async () => {
    fetchBehavior = async (call) => {
      if (call.body?.event === 'signup_started') {
        throw new TypeError('network down')
      }
      return new Response(null, { status: 200 })
    }
    installFetchStub()
    const acquisition = await loadAcquisition()

    await acquisition.reportSignupStarted()

    assert.equal(landingCalls().length, 1)
    assert.equal(signupCalls().length, 1)
  })
})

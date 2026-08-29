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
/**
 * Behavior tests for the Google Ads signup-conversion module: hostname gate,
 * configuration gate, per-signup dedup, safe page_location, soft failure,
 * and the server-confirmed new-user predicate. A query-string dynamic
 * import gives every case a fresh module instance (same pattern as the
 * acquisition tests).
 */
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

type GoogleAdsModule = typeof import('../google-ads')
type GtagCall = unknown[]

let gtagCalls: GtagCall[] = []
let instanceCounter = 0

const originalWindow = (globalThis as Record<string, unknown>).window

interface WindowOptions {
  signupSendTo?: string
  gtag?: (...args: unknown[]) => void
  pathname?: string
  search?: string
  hash?: string
}

function installWindow(hostname: string, options: WindowOptions = {}): void {
  const gtag =
    options.gtag ??
    ((...args: unknown[]) => {
      gtagCalls.push(args)
    })
  ;(globalThis as Record<string, unknown>).window = {
    location: {
      hostname,
      origin: `https://${hostname}`,
      pathname: options.pathname ?? '/',
      search: options.search ?? '',
      hash: options.hash ?? '',
    },
    gtag,
    __VANCINE_GOOGLE_ADS__:
      options.signupSendTo === undefined
        ? undefined
        : { signupSendTo: options.signupSendTo },
  }
}

function removeWindow(): void {
  delete (globalThis as Record<string, unknown>).window
}

/** Fresh module instance so the per-signup dedup state starts clear. */
async function loadGoogleAds(): Promise<GoogleAdsModule> {
  instanceCounter += 1
  gtagCalls = []
  return await import(`../google-ads.ts?instance=${instanceCounter}`)
}

afterEach(() => {
  if (originalWindow === undefined) {
    removeWindow()
  } else {
    ;(globalThis as Record<string, unknown>).window = originalWindow
  }
})

const SEND_TO = 'AW-18416812623/LQ_rCMbphuocEM-E6c1E'

describe('google ads conversion environment gates', () => {
  test('sends exactly one conversion event on vancine.com with config', async () => {
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(1)
    assert.equal(gtagCalls.length, 1)
    assert.deepEqual(gtagCalls[0], [
      'event',
      'conversion',
      { send_to: SEND_TO, page_location: 'https://vancine.com/' },
    ])
  })

  test('sends exactly one conversion event on www.vancine.com', async () => {
    installWindow('www.vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(1)
    assert.equal(gtagCalls.length, 1)
  })

  for (const hostname of [
    'localhost',
    '127.0.0.1',
    'staging.vancine.com',
    'preview.vercel.app',
    'vancine.com.evil.example',
  ]) {
    test(`does not send on ${hostname} even when production env vars leaked`, async () => {
      installWindow(hostname, { signupSendTo: SEND_TO })
      const googleAds = await loadGoogleAds()
      googleAds.reportGoogleAdsSignupConversion(1)
      assert.equal(gtagCalls.length, 0)
    })
  }

  test('does not send when the runtime Ads config is absent (unconfigured deployment)', async () => {
    installWindow('vancine.com', {})
    const googleAds = await loadGoogleAds()
    assert.doesNotThrow(() => googleAds.reportGoogleAdsSignupConversion(1))
    assert.equal(gtagCalls.length, 0)
  })

  test('does not send when the send_to value is empty', async () => {
    installWindow('vancine.com', { signupSendTo: '' })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(1)
    assert.equal(gtagCalls.length, 0)
  })
})

describe('google ads conversion page_location privacy', () => {
  test('sends a page_location without query or hash on an OAuth callback URL', async () => {
    installWindow('vancine.com', {
      signupSendTo: SEND_TO,
      pathname: '/oauth/github',
      search: '?code=SECRET_CODE&state=SECRET_STATE&error=x',
      hash: '#frag',
    })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(1)
    assert.equal(gtagCalls.length, 1)
    const payload = gtagCalls[0][2] as Record<string, unknown>
    assert.equal(payload.page_location, 'https://vancine.com/oauth/github')
    assert.equal(String(payload.page_location).includes('code'), false)
    assert.equal(String(payload.page_location).includes('SECRET'), false)
  })

  test('never includes the signup dedup key or any user identifier in the payload', async () => {
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(4242)
    assert.equal(gtagCalls.length, 1)
    const payload = gtagCalls[0][2] as Record<string, unknown>
    assert.deepEqual(Object.keys(payload).sort(), ['page_location', 'send_to'])
  })
})

describe('google ads conversion per-signup dedup', () => {
  test('repeated calls for the same signup send at most one event', async () => {
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    // StrictMode double effects, callback retries, duplicate renders: all
    // repeat the same server-confirmed signup key.
    googleAds.reportGoogleAdsSignupConversion(7)
    googleAds.reportGoogleAdsSignupConversion(7)
    googleAds.reportGoogleAdsSignupConversion(7)
    assert.equal(gtagCalls.length, 1)
  })

  test('a second, different real signup in the same SPA session still sends', async () => {
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(7)
    googleAds.reportGoogleAdsSignupConversion(8)
    assert.equal(gtagCalls.length, 2)
    assert.deepEqual(gtagCalls[1][2], {
      send_to: SEND_TO,
      page_location: 'https://vancine.com/',
    })
  })

  test('two different password registrations each send exactly once', async () => {
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(101)
    googleAds.reportGoogleAdsSignupConversion(101)
    googleAds.reportGoogleAdsSignupConversion(102)
    googleAds.reportGoogleAdsSignupConversion(102)
    assert.equal(gtagCalls.length, 2)
  })

  test('does not mark the signup key when gtag is missing, so a retry can still send', async () => {
    const installNoGtag = () => {
      ;(globalThis as Record<string, unknown>).window = {
        location: {
          hostname: 'vancine.com',
          origin: 'https://vancine.com',
          pathname: '/',
          search: '',
          hash: '',
        },
        __VANCINE_GOOGLE_ADS__: { signupSendTo: SEND_TO },
      }
    }
    installNoGtag()
    const googleAds = await loadGoogleAds()
    googleAds.reportGoogleAdsSignupConversion(9)
    assert.equal(gtagCalls.length, 0)

    // Script recovered: the same signup key can still send exactly once.
    installWindow('vancine.com', { signupSendTo: SEND_TO })
    googleAds.reportGoogleAdsSignupConversion(9)
    googleAds.reportGoogleAdsSignupConversion(9)
    assert.equal(gtagCalls.length, 1)
  })
})

describe('google ads conversion failure safety', () => {
  test('is a strict no-op when window is missing', async () => {
    removeWindow()
    const googleAds = await loadGoogleAds()
    assert.doesNotThrow(() => googleAds.reportGoogleAdsSignupConversion(1))
  })

  test('never propagates errors thrown by gtag', async () => {
    installWindow('vancine.com', {
      signupSendTo: SEND_TO,
      gtag: () => {
        throw new Error('blocked')
      },
    })
    const googleAds = await loadGoogleAds()
    assert.doesNotThrow(() => googleAds.reportGoogleAdsSignupConversion(1))
  })
})

describe('google ads server-confirmed new user predicate', () => {
  test('accepts an auth bundle whose server set signup_completed=true', async () => {
    const googleAds = await loadGoogleAds()
    assert.equal(
      googleAds.isServerConfirmedNewUser({ signup_completed: true }),
      true
    )
  })

  test('rejects an ordinary login bundle without the flag', async () => {
    const googleAds = await loadGoogleAds()
    assert.equal(
      googleAds.isServerConfirmedNewUser({ access_token: 'x' }),
      false
    )
  })

  test('rejects forged or mistyped values', async () => {
    const googleAds = await loadGoogleAds()
    assert.equal(
      googleAds.isServerConfirmedNewUser({ signup_completed: 'true' }),
      false
    )
    assert.equal(
      googleAds.isServerConfirmedNewUser({ signup_completed: 1 }),
      false
    )
    assert.equal(
      googleAds.isServerConfirmedNewUser({ signup_completed: false }),
      false
    )
    assert.equal(googleAds.isServerConfirmedNewUser(null), false)
    assert.equal(googleAds.isServerConfirmedNewUser(undefined), false)
    assert.equal(googleAds.isServerConfirmedNewUser('signup_completed'), false)
  })
})

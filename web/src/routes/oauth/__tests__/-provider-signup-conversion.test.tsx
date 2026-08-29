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
 * OAuthCallback Google Ads signup-conversion wiring tests. The route runs
 * with mocked TanStack Router hooks (navigate/params/search) and a mocked
 * API client; the server-confirmed-new-user predicate stays real. In jsdom
 * window.opener is null, so the callback always resolves to login mode -
 * exactly the branch that carries signup conversions.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type OAuthCallbackComponent = () => React.ReactElement

let capturedComponent: OAuthCallbackComponent | null = null

// A plain anchor replaces the router-aware Link so the callback screen can
// render without a router instance (the Link contract is not under test).
const StubLink = (props: {
  to?: string
  className?: string
  children?: React.ReactNode
}) => (
  <a
    href={typeof props.to === 'string' ? props.to : '#'}
    className={props.className}
  >
    {props.children}
  </a>
)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: StubLink,
    createFileRoute: () => (options: { component: OAuthCallbackComponent }) => {
      capturedComponent = options.component
      return { options }
    },
    useNavigate: () => mockNavigate,
    useParams: () => ({ provider: paramsProviderHolder.current }),
    useSearch: () => searchHolder.current,
  }
})

const mockNavigate = vi.fn()
const paramsProviderHolder = { current: 'github' }
const searchHolder: {
  current: { code?: string; state?: string; error?: string }
} = { current: {} }

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  applyAuthBundle: vi.fn(),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: apiMocks.get },
    applyAuthBundle: apiMocks.applyAuthBundle,
  }
})

const googleAdsMocks = vi.hoisted(() => ({
  reportGoogleAdsSignupConversion: vi.fn(),
}))

vi.mock('@/lib/google-ads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-ads')>()
  return {
    ...actual,
    reportGoogleAdsSignupConversion:
      googleAdsMocks.reportGoogleAdsSignupConversion,
  }
})

const toastSpy = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { ...toastSpy } }))

await i18next.use(initReactI18next).init({ lng: 'en', resources: {} })

function validAuthBundle(extra: Record<string, unknown> = {}, userId = 1) {
  return {
    access_token: 'access-token',
    token_type: 'Bearer',
    access_expires_at: 1893456000000,
    user: { id: userId, username: 'oauth-user', role: 1 },
    session: {
      sid: 'sid-1',
      current: true,
      login_method: 'oauth:github',
      ip: '127.0.0.1',
      user_agent: 'ua',
      created_at: 1,
      last_active_at: 1,
      expires_at: 1893456000000,
    },
    ...extra,
  }
}

beforeEach(() => {
  capturedComponent = null
  paramsProviderHolder.current = 'github'
  searchHolder.current = { code: 'oauth-code', state: 'state-token' }
  apiMocks.get.mockReset()
  apiMocks.applyAuthBundle.mockClear()
  googleAdsMocks.reportGoogleAdsSignupConversion.mockReset()
  mockNavigate.mockClear()
  toastSpy.error.mockClear()
  toastSpy.success.mockClear()
  window.opener = null
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

async function renderOAuthCallback(): Promise<void> {
  await import('../$provider')
  if (!capturedComponent) throw new Error('route component was not captured')
  const Callback = capturedComponent
  render(<Callback />)
}

describe('OAuthCallback Google Ads conversion wiring', () => {
  it('fires the conversion once, keyed by the new user id, for a server-confirmed new OAuth user', async () => {
    apiMocks.get.mockImplementation(async () => ({
      data: {
        success: true,
        data: validAuthBundle({ signup_completed: true }, 11),
      },
    }))

    await renderOAuthCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(googleAdsMocks.reportGoogleAdsSignupConversion).toHaveBeenCalledWith(
      11
    )
  })

  it('fires no conversion when an existing OAuth user signs in', async () => {
    apiMocks.get.mockImplementation(async () => ({
      data: { success: true, data: validAuthBundle() },
    }))

    await renderOAuthCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(apiMocks.applyAuthBundle).toHaveBeenCalledTimes(1)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
  })

  it('fires no conversion when the OAuth callback fails', async () => {
    apiMocks.get.mockImplementation(async () => ({
      data: { success: false, message: 'oauth rejected' },
    }))

    await renderOAuthCallback()

    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith('oauth rejected')
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(apiMocks.applyAuthBundle).not.toHaveBeenCalled()
  })
})

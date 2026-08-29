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
 * (auth)/oauth WeChat callback Google Ads signup-conversion wiring tests.
 * The route runs with mocked TanStack Router hooks and a mocked auth API;
 * the server-confirmed-new-user predicate stays real. The WeChat provider
 * here can still durably create a brand-new account, so only the
 * server-confirmed flag may trigger the conversion.
 */
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type OAuthRouteComponent = () => React.ReactElement

let capturedComponent: OAuthRouteComponent | null = null

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: () => (options: { component: OAuthRouteComponent }) => {
      capturedComponent = options.component
      return { options }
    },
    useNavigate: () => mockNavigate,
    useSearch: () => searchHolder.current,
  }
})

const mockNavigate = vi.fn()
const searchHolder: {
  current: {
    provider?: string
    code?: string
    state?: string
    redirect?: string
  }
} = { current: {} }

const authApiMocks = vi.hoisted(() => ({
  wechatLoginByCode: vi.fn(),
}))

vi.mock('@/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/api')>()
  return { ...actual, wechatLoginByCode: authApiMocks.wechatLoginByCode }
})

const sessionMocks = vi.hoisted(() => ({
  applyAuthBundle: vi.fn(),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, applyAuthBundle: sessionMocks.applyAuthBundle }
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

function validAuthBundle(extra: Record<string, unknown> = {}, userId = 1) {
  return {
    access_token: 'access-token',
    token_type: 'Bearer',
    access_expires_at: 1893456000000,
    user: { id: userId, username: 'wechat-user', role: 1 },
    session: {
      sid: 'sid-1',
      current: true,
      login_method: 'wechat',
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
  searchHolder.current = {
    provider: 'wechat',
    code: 'wechat-callback-code',
    state: 'state-token',
  }
  authApiMocks.wechatLoginByCode.mockReset()
  sessionMocks.applyAuthBundle.mockClear()
  googleAdsMocks.reportGoogleAdsSignupConversion.mockReset()
  mockNavigate.mockClear()
  toastSpy.error.mockClear()
})

afterEach(() => {
  vi.resetModules()
})

async function renderOAuthRoute(): Promise<void> {
  await import('../oauth')
  if (!capturedComponent) throw new Error('route component was not captured')
  const RouteComponent = capturedComponent
  render(<RouteComponent />)
}

describe('(auth)/oauth WeChat callback Google Ads conversion wiring', () => {
  it('fires the conversion once, keyed by the new user id, for a server-confirmed new WeChat user', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: true,
      data: validAuthBundle({ signup_completed: true }, 55),
    }))

    await renderOAuthRoute()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(googleAdsMocks.reportGoogleAdsSignupConversion).toHaveBeenCalledWith(
      55
    )
    expect(sessionMocks.applyAuthBundle).toHaveBeenCalledTimes(1)
  })

  it('fires no conversion when an existing WeChat user signs in through the callback', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: true,
      data: validAuthBundle(),
    }))

    await renderOAuthRoute()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(sessionMocks.applyAuthBundle).toHaveBeenCalledTimes(1)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
  })

  it('fires no conversion and redirects to sign-in when the callback fails', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: false,
      message: 'oauth failed',
    }))

    await renderOAuthRoute()

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/sign-in',
        replace: true,
      })
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(sessionMocks.applyAuthBundle).not.toHaveBeenCalled()
  })
})

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
 * UserAuthForm Google Ads signup-conversion wiring tests. The WeChat path on
 * the sign-in page can still durably create a brand-new account; only the
 * server-confirmed signup_completed flag (never an existing-user login or a
 * failure) may trigger the conversion. The server-confirmed-new-user
 * predicate stays real; only the outbound conversion call is spied.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SystemStatus } from '@/features/auth/types'

const authApiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  wechatLoginByCode: vi.fn(),
  logout: vi.fn(async () => ({ success: true, message: '' })),
  createOAuthFlow: vi.fn(async () => 'oauth-state-token'),
  telegramLogin: vi.fn(async () => ({ success: false, message: '' })),
}))

vi.mock('@/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/api')>()
  return { ...actual, ...authApiMocks }
})

const statusHolder = vi.hoisted(() => ({
  current: null as SystemStatus | null,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: statusHolder.current,
    isLoading: false,
    error: null,
  }),
}))

const authRedirectMocks = vi.hoisted(() => ({
  handleLoginSuccess: vi.fn(async () => {}),
  redirectTo2FA: vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => authRedirectMocks,
}))

// A plain anchor replaces the router-aware Link so the auth layout can
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
  return { ...actual, Link: StubLink }
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
  info: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { ...toastSpy } }))

await i18next.use(initReactI18next).init({ lng: 'en', resources: {} })

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
  statusHolder.current = null
  authApiMocks.login.mockReset()
  authApiMocks.wechatLoginByCode.mockReset()
  authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
    success: false,
    message: 'wechat rejected',
  }))
  authRedirectMocks.handleLoginSuccess.mockClear()
  googleAdsMocks.reportGoogleAdsSignupConversion.mockReset()
  toastSpy.error.mockClear()
  toastSpy.success.mockClear()

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 }))
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

async function renderUserAuthForm(): Promise<void> {
  const { UserAuthForm } = await import('../user-auth-form')
  // Mount, then wait for the observable settled state (the WeChat button is
  // rendered by the same pass that async mount detection re-renders). RTL
  // wraps fireEvent and waitFor's polling in act(), so post-mount state
  // updates land inside act without any fixed-duration sleep.
  render(<UserAuthForm />)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    ).toBeInTheDocument()
  )
}

async function submitWeChatCode(): Promise<void> {
  statusHolder.current = { wechat_login: true }
  await renderUserAuthForm()

  fireEvent.click(screen.getByRole('button', { name: /Continue with WeChat/ }))
  await waitFor(() =>
    expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
  )

  fireEvent.change(screen.getByLabelText('Verification code'), {
    target: { value: '654321' },
  })
  // The Confirm click starts handleWeChatLogin's async chain (submitting
  // state, login request, dialog close, submitting reset). waitFor polls
  // inside RTL's act-wrapped asyncWrapper, so the chain settles inside act
  // and the observable end state - not a fixed sleep - defines the wait.
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(authRedirectMocks.handleLoginSuccess).toHaveBeenCalledTimes(1)
  )
}

describe('UserAuthForm Google Ads conversion on WeChat signup', () => {
  it('fires the conversion once, keyed by the new user id, for a server-confirmed new WeChat user', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: true,
      data: validAuthBundle({ signup_completed: true }, 33),
    }))

    await submitWeChatCode()

    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(googleAdsMocks.reportGoogleAdsSignupConversion).toHaveBeenCalledWith(
      33
    )
  })

  it('fires no conversion when an existing WeChat user signs in', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: true,
      data: validAuthBundle(),
    }))

    await submitWeChatCode()

    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(authRedirectMocks.handleLoginSuccess).toHaveBeenCalledTimes(1)
  })

  it('fires no conversion when the WeChat login fails', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: false,
      message: 'wechat rejected',
    }))

    statusHolder.current = { wechat_login: true }
    await renderUserAuthForm()

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )
    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '654321' },
    })
    // Failure path: the observable toast and the re-enabled Confirm button
    // are explicit states; waitFor settles the chain inside act().
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith('wechat rejected')
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(authRedirectMocks.handleLoginSuccess).not.toHaveBeenCalled()
  })
})

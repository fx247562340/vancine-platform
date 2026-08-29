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
 * SignUpForm Google Ads signup-conversion wiring tests. The form runs the
 * real server-confirmed-new-user predicate from the google-ads module; only
 * the outbound conversion call (network boundary to Google) is spied. Auth
 * APIs, status and navigation are mocked like the acquisition suite.
 */
import {
  act,
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
  register: vi.fn(),
  wechatLoginByCode: vi.fn(),
  logout: vi.fn(async () => ({ success: true, message: '' })),
  createOAuthFlow: vi.fn(async () => 'oauth-state-token'),
  telegramLogin: vi.fn(async () => ({ success: false, message: '' })),
  sendEmailVerification: vi.fn(async () => ({ success: true, message: '' })),
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
  redirectToLogin: vi.fn(),
  redirectToRegister: vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => authRedirectMocks,
}))

// Only the outbound conversion call is spied; the server-confirmed
// new-user predicate stays real so the gating contract is under test.
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

  authApiMocks.register.mockReset()
  authApiMocks.register.mockImplementation(async () => ({
    success: true,
    data: { user_id: 1 },
  }))
  authApiMocks.wechatLoginByCode.mockReset()
  authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
    success: false,
    message: 'wechat rejected',
  }))
  authRedirectMocks.handleLoginSuccess.mockClear()
  authRedirectMocks.redirectToLogin.mockClear()
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

async function renderSignUpForm(): Promise<void> {
  const { SignUpForm } = await import('../sign-up-form')
  render(<SignUpForm />)
}

function fillPasswordForm(): void {
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'newuser' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'password123' },
  })
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'password123' },
  })
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Create account' })
}

describe('SignUpForm Google Ads conversion on password registration', () => {
  it('fires the conversion once with the server-confirmed user_id after a successful registration', async () => {
    authApiMocks.register.mockImplementation(async () => ({
      success: true,
      data: { user_id: 21 },
    }))
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    await act(async () => {
      fireEvent.click(submitButton())
    })

    await waitFor(() =>
      expect(authRedirectMocks.redirectToLogin).toHaveBeenCalledTimes(1)
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(googleAdsMocks.reportGoogleAdsSignupConversion).toHaveBeenCalledWith(
      21
    )
  })

  it('reports a second, different password registration once each in the same form session', async () => {
    const responses = [
      { success: true, data: { user_id: 31 } },
      { success: true, data: { user_id: 32 } },
    ]
    authApiMocks.register.mockImplementation(async () => responses.shift())
    statusHolder.current = {}
    await renderSignUpForm()

    // First real registration.
    fillPasswordForm()
    await act(async () => {
      fireEvent.click(submitButton())
    })
    await waitFor(() =>
      expect(authRedirectMocks.redirectToLogin).toHaveBeenCalledTimes(1)
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenLastCalledWith(31)

    // Second, genuinely different new account: must not be suppressed by
    // the first conversion. The redirect mock swallowed the navigation, so
    // the form is still mounted and can submit again.
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'anotheruser' },
    })
    await act(async () => {
      fireEvent.click(submitButton())
    })
    await waitFor(() => expect(authApiMocks.register).toHaveBeenCalledTimes(2))
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(2)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenLastCalledWith(32)
  })

  it('fires no conversion when registration fails', async () => {
    authApiMocks.register.mockImplementation(async () => ({
      success: false,
      message: 'username already taken',
    }))
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    await act(async () => {
      fireEvent.click(submitButton())
    })

    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith('username already taken')
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(authRedirectMocks.redirectToLogin).not.toHaveBeenCalled()
  })

  it('fires no conversion when the register response lacks a strictly valid user_id', async () => {
    authApiMocks.register.mockImplementation(async () => ({
      success: true,
      data: { user_id: 'not-a-number' },
    }))
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    await act(async () => {
      fireEvent.click(submitButton())
    })

    await waitFor(() =>
      expect(authRedirectMocks.redirectToLogin).toHaveBeenCalledTimes(1)
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
  })
})

describe('SignUpForm Google Ads conversion on WeChat registration', () => {
  async function submitWeChatCode(): Promise<void> {
    statusHolder.current = { wechat_login: true }
    await renderSignUpForm()

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )
    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '654321' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })
    await waitFor(() =>
      expect(authRedirectMocks.handleLoginSuccess).toHaveBeenCalledTimes(1)
    )
  }

  it('fires the conversion once, keyed by the new user id, for a server-confirmed new WeChat user', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: true,
      data: validAuthBundle({ signup_completed: true }),
    }))

    await submitWeChatCode()

    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(googleAdsMocks.reportGoogleAdsSignupConversion).toHaveBeenCalledWith(
      1
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

  it('reports a second, different real WeChat registration in the same form session', async () => {
    const responses = [
      { success: true, data: validAuthBundle({ signup_completed: true }, 1) },
      { success: true, data: validAuthBundle({ signup_completed: true }, 2) },
    ]
    authApiMocks.wechatLoginByCode.mockImplementation(async () =>
      responses.shift()
    )

    statusHolder.current = { wechat_login: true }
    await renderSignUpForm()

    // First real registration.
    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )
    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '654321' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })
    await waitFor(() =>
      expect(authRedirectMocks.handleLoginSuccess).toHaveBeenCalledTimes(1)
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(1)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenLastCalledWith(1)

    // Second, genuinely different new account: must not be suppressed by
    // the first conversion.
    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )
    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '987654' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })
    await waitFor(() =>
      expect(authRedirectMocks.handleLoginSuccess).toHaveBeenCalledTimes(2)
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenCalledTimes(2)
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).toHaveBeenLastCalledWith(2)
  })

  it('fires no conversion when the WeChat login fails', async () => {
    authApiMocks.wechatLoginByCode.mockImplementation(async () => ({
      success: false,
      message: 'wechat rejected',
    }))

    statusHolder.current = { wechat_login: true }
    await renderSignUpForm()

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )
    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '654321' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith('wechat rejected')
    )
    expect(
      googleAdsMocks.reportGoogleAdsSignupConversion
    ).not.toHaveBeenCalled()
    expect(authRedirectMocks.handleLoginSuccess).not.toHaveBeenCalled()
  })
})

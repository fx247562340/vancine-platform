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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Behavior test for Telegram sign-up on the Default theme. Telegram reuses the
// login endpoint (matching Classic), must respect the legal-consent gate, and
// must NOT fire signup_started (no first-party redirect to await) — mirroring
// the Classic theme and the OAuth acquisition contract.
import type { ReactNode } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelegramAuthPayload } from '@/features/auth/lib/telegram'
import { SignUpForm } from './sign-up-form'

type WindowWithCallback = Window & Record<string, unknown>

const {
  telegramLoginMock,
  handleLoginSuccessMock,
  toastSuccessMock,
  toastErrorMock,
  reportSignupStartedMock,
  statusRef,
} = vi.hoisted(() => ({
  telegramLoginMock: vi.fn(),
  handleLoginSuccessMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  reportSignupStartedMock: vi.fn(),
  statusRef: { current: {} as Record<string, unknown> },
}))

vi.mock('@/features/auth/lib/telegram', () => ({
  telegramLogin: (...args: unknown[]) => telegramLoginMock(...args),
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    handleLoginSuccess: (...args: unknown[]) => handleLoginSuccessMock(...args),
    redirectTo2FA: vi.fn(),
    redirectToLogin: vi.fn(),
    redirectToRegister: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: statusRef.current, loading: false }),
}))

vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: false,
    turnstileSiteKey: '',
    turnstileToken: '',
    setTurnstileToken: vi.fn(),
    validateTurnstile: () => true,
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/acquisition', () => ({
  reportSignupStarted: (...args: unknown[]) => reportSignupStartedMock(...args),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-email-verification', () => ({
  useEmailVerification: () => ({
    isSending: false,
    secondsLeft: 0,
    isActive: false,
    sendCode: vi.fn(),
  }),
}))

vi.mock('@/features/auth/lib/storage', () => ({
  getAffiliateCode: () => '',
  saveAffiliateCode: vi.fn(),
}))

vi.mock('@/features/auth/api', () => ({
  register: vi.fn(),
  wechatLoginByCode: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

afterEach(() => cleanup())

beforeEach(() => {
  vi.clearAllMocks()
  statusRef.current = {}
})

async function triggerTelegramAuth(
  container: HTMLElement,
  payload: TelegramAuthPayload
) {
  const script = container.querySelector('script[data-telegram-login]')
  expect(script).not.toBeNull()
  const callbackName = script!
    .getAttribute('data-onauth')!
    .replace('(user)', '')
  const handler = (window as unknown as WindowWithCallback)[callbackName] as (
    u: TelegramAuthPayload
  ) => void
  expect(typeof handler).toBe('function')
  handler(payload)
}

const PAYLOAD: TelegramAuthPayload = {
  id: 111222333,
  first_name: 'Grace',
  username: 'grace',
  auth_date: 1700000001,
  hash: 'feedface',
}

describe('SignUpForm — Telegram sign-up', () => {
  it('renders the Telegram widget when enabled with a bot name', () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    const { container } = render(<SignUpForm />)
    const script = container.querySelector('script[data-telegram-login]')
    expect(script).not.toBeNull()
    expect(script!.getAttribute('data-telegram-login')).toBe('vancine_bot')
  })

  it('reuses the login endpoint via telegramLogin and logs the user in', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({ success: true, data: { id: 3 } })

    const { container } = render(<SignUpForm />)
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() => expect(telegramLoginMock).toHaveBeenCalledWith(PAYLOAD))
    await waitFor(() => expect(handleLoginSuccessMock).toHaveBeenCalledTimes(1))
    expect(handleLoginSuccessMock).toHaveBeenCalledWith({ id: 3 })
    expect(toastSuccessMock).toHaveBeenCalledWith('Signed in via Telegram')
  })

  it('blocks Telegram auth until legal terms are agreed', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
      user_agreement_enabled: true,
    }

    const { container } = render(<SignUpForm />)
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Please agree to the legal terms first'
      )
    )
    expect(telegramLoginMock).not.toHaveBeenCalled()
    expect(handleLoginSuccessMock).not.toHaveBeenCalled()
  })

  it('does not fire signup_started on the Telegram path', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({ success: true, data: { id: 9 } })

    const { container } = render(<SignUpForm />)
    await triggerTelegramAuth(container, PAYLOAD)
    await waitFor(() => expect(handleLoginSuccessMock).toHaveBeenCalled())

    expect(reportSignupStartedMock).not.toHaveBeenCalled()
  })

  it('surfaces the backend error message on failure', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({
      success: false,
      message: '无效的请求',
    })

    const { container } = render(<SignUpForm />)
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('无效的请求')
    )
    expect(handleLoginSuccessMock).not.toHaveBeenCalled()
  })
})

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
// End-to-end (jsdom) behavior test for Telegram sign-in on the Default theme.
// Renders the real UserAuthForm, drives the Telegram widget callback, and
// asserts the login request, the login-success side effects, the backend error
// surfacing, and the legal-consent gate. The "coming soon" stub must be gone.
import type { ReactNode } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelegramAuthPayload } from '@/features/auth/lib/telegram'
import { UserAuthForm } from './user-auth-form'

type WindowWithCallback = Window & Record<string, unknown>

const {
  telegramLoginMock,
  handleLoginSuccessMock,
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
  statusRef,
} = vi.hoisted(() => ({
  telegramLoginMock: vi.fn(),
  handleLoginSuccessMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
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
    info: (...args: unknown[]) => toastInfoMock(...args),
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

vi.mock('@/lib/passkey', () => ({
  buildAssertionResult: vi.fn(),
  prepareCredentialRequestOptions: vi.fn(),
  isPasskeySupported: () => Promise.resolve(false),
}))

vi.mock('@/features/auth/passkey', () => ({
  beginPasskeyLogin: vi.fn(),
  finishPasskeyLogin: vi.fn(),
}))

vi.mock('@/features/auth/api', () => ({
  login: vi.fn(),
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

function renderForm() {
  return render(<UserAuthForm />)
}

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
  id: 987654321,
  first_name: 'Ada',
  username: 'ada',
  auth_date: 1700000000,
  hash: 'deadbeef',
}

describe('UserAuthForm — Telegram sign-in', () => {
  it('renders the Telegram widget when enabled with a bot name', () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    const { container } = renderForm()
    const script = container.querySelector('script[data-telegram-login]')
    expect(script).not.toBeNull()
    expect(script!.getAttribute('data-telegram-login')).toBe('vancine_bot')
  })

  it('does not render Telegram when telegram_oauth is off', () => {
    statusRef.current = { telegram_oauth: false, telegram_bot_name: 'bot' }
    const { container } = renderForm()
    expect(container.querySelector('script[data-telegram-login]')).toBeNull()
  })

  it('requests /api/oauth/telegram/login via telegramLogin with the payload', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({ success: true, data: { id: 1 } })

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() => expect(telegramLoginMock).toHaveBeenCalledTimes(1))
    expect(telegramLoginMock).toHaveBeenCalledWith(PAYLOAD)
  })

  it('runs the login-success side effects on success', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({ success: true, data: { id: 7 } })

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() => expect(handleLoginSuccessMock).toHaveBeenCalledTimes(1))
    expect(handleLoginSuccessMock).toHaveBeenCalledWith({ id: 7 }, undefined)
    expect(toastSuccessMock).toHaveBeenCalledWith('Signed in via Telegram')
  })

  it('surfaces the backend error message on failure', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({
      success: false,
      message: '该 Telegram 账户未绑定',
    })

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('该 Telegram 账户未绑定')
    )
    expect(handleLoginSuccessMock).not.toHaveBeenCalled()
  })

  it('shows a generic error when the request throws', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockRejectedValue(new Error('network down'))

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Login failed')
    )
    expect(handleLoginSuccessMock).not.toHaveBeenCalled()
  })

  it('blocks Telegram auth until legal terms are agreed', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
      user_agreement_enabled: true,
    }

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Please agree to the legal terms first'
      )
    )
    expect(telegramLoginMock).not.toHaveBeenCalled()
    expect(handleLoginSuccessMock).not.toHaveBeenCalled()
  })

  it('no longer emits the "coming soon" toast', async () => {
    statusRef.current = {
      telegram_oauth: true,
      telegram_bot_name: 'vancine_bot',
    }
    telegramLoginMock.mockResolvedValue({ success: true, data: { id: 1 } })

    const { container } = renderForm()
    await triggerTelegramAuth(container, PAYLOAD)
    await waitFor(() => expect(telegramLoginMock).toHaveBeenCalled())

    for (const call of toastInfoMock.mock.calls) {
      expect(String(call[0])).not.toContain('coming soon')
    }
  })
})

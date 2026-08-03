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
// Behavior test for the email bind dialog's Turnstile integration.
// `/api/verification` is protected by middleware.TurnstileCheck(), so the
// dialog must validate the human check and pass the token along, exactly like
// the sign-in / sign-up forms do. Cases covered:
//   1. Turnstile enabled + no token  -> blocked with a prompt, no API call
//   2. Turnstile enabled + token     -> sendEmailVerification(email, token)
//   3. Turnstile disabled            -> original path, no token passed
//   4. Successful send               -> token is reset (single-use)
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailBindDialog } from './email-bind-dialog'

const { sendEmailVerificationMock, toastMock, turnstileState } = vi.hoisted(
  () => ({
    sendEmailVerificationMock: vi.fn(),
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
    // Mutable Turnstile state so each test can drive the hook's shape.
    turnstileState: {
      isTurnstileEnabled: false,
      turnstileToken: '',
      setTurnstileToken: vi.fn(),
    },
  })
)

vi.mock('@/features/profile/api', () => ({
  sendEmailVerification: (...args: unknown[]) =>
    sendEmailVerificationMock(...args),
  bindEmail: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastMock.success(...args),
    error: (...args: unknown[]) => toastMock.error(...args),
    info: (...args: unknown[]) => toastMock.info(...args),
    warning: (...args: unknown[]) => toastMock.warning(...args),
  },
}))

vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: turnstileState.isTurnstileEnabled,
    turnstileSiteKey: 'test-site-key',
    turnstileToken: turnstileState.turnstileToken,
    setTurnstileToken: (...args: unknown[]) =>
      turnstileState.setTurnstileToken(...args),
    // Mirrors the real hook: when enabled but no token yet, prompt and block.
    validateTurnstile: () => {
      if (turnstileState.isTurnstileEnabled && !turnstileState.turnstileToken) {
        toastMock.info('Please wait a moment, human check is initializing...')
        return false
      }
      return true
    },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function renderDialog() {
  return render(
    <EmailBindDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />
  )
}

function typeEmailAndClickSend(email = 'test@example.com') {
  renderDialog()
  fireEvent.change(screen.getByLabelText('Email Address'), {
    target: { value: email },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('EmailBindDialog Turnstile integration', () => {
  beforeEach(() => {
    turnstileState.isTurnstileEnabled = false
    turnstileState.turnstileToken = ''
    turnstileState.setTurnstileToken.mockReset()
    sendEmailVerificationMock.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.info.mockReset()
  })

  afterEach(() => cleanup())

  it('blocks sending without a Turnstile token when Turnstile is enabled', () => {
    turnstileState.isTurnstileEnabled = true
    turnstileState.turnstileToken = ''

    typeEmailAndClickSend()

    expect(sendEmailVerificationMock).not.toHaveBeenCalled()
    expect(toastMock.info).toHaveBeenCalledWith(
      'Please wait a moment, human check is initializing...'
    )
  })

  it('passes the Turnstile token to sendEmailVerification when verified', async () => {
    turnstileState.isTurnstileEnabled = true
    turnstileState.turnstileToken = 'cf-test-token-123'
    sendEmailVerificationMock.mockResolvedValue({ success: true })

    typeEmailAndClickSend()

    await waitFor(() => {
      expect(sendEmailVerificationMock).toHaveBeenCalledWith(
        'test@example.com',
        'cf-test-token-123'
      )
    })
  })

  it('sends without a token when Turnstile is disabled (original path)', async () => {
    turnstileState.isTurnstileEnabled = false
    sendEmailVerificationMock.mockResolvedValue({ success: true })

    typeEmailAndClickSend()

    await waitFor(() => {
      expect(sendEmailVerificationMock).toHaveBeenCalledWith('test@example.com')
    })
  })

  it('resets the Turnstile token after a successful send', async () => {
    turnstileState.isTurnstileEnabled = true
    turnstileState.turnstileToken = 'cf-test-token-123'
    sendEmailVerificationMock.mockResolvedValue({ success: true })

    typeEmailAndClickSend()

    await waitFor(() => {
      expect(turnstileState.setTurnstileToken).toHaveBeenCalledWith('')
    })
  })
})

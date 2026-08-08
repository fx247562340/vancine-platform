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
 * SignUpForm acquisition behavior tests. The form runs the real acquisition
 * module against a mocked fetch boundary; auth APIs, status and navigation
 * are mocked so every test asserts user actions and observable outcomes.
 * vi.resetModules + dynamic import gives every test a fresh per-page-load
 * acquisition state.
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

// Boundary spy on sonner so validation-gate tests can wait for the exact
// user-visible error toast instead of flushing microtasks.
const toastSpy = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { ...toastSpy } }))

await i18next.use(initReactI18next).init({ lng: 'en', resources: {} })

type FetchBehavior = (
  body: Record<string, unknown> | null,
  init?: RequestInit
) => Promise<Response>

let timeline: string[] = []
let fetchBehavior: FetchBehavior = async () =>
  new Response(null, { status: 200 })
let fetchStub: ReturnType<typeof vi.fn>
let fetchStartSignals: Deferred[] = []
const openSpy = vi.fn()

type Deferred = { promise: Promise<void>; resolve: () => void }

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Resolves when the Nth acquisition fetch has started. */
function fetchStarted(index: number): Promise<void> {
  while (fetchStartSignals.length <= index) {
    fetchStartSignals.push(createDeferred())
  }
  return fetchStartSignals[index].promise
}

// jsdom has no PointerEvent; Base UI's checkbox constructs one on click.
class PointerEventPolyfill extends MouseEvent {}

function touchCalls(): Array<{
  body: Record<string, unknown> | null
  init?: RequestInit
}> {
  return fetchStub.mock.calls.map((call) => {
    const rawBody = call[1]?.body
    return {
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : null,
      init: call[1],
    }
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('PointerEvent', PointerEventPolyfill)
  timeline = []
  fetchBehavior = async () => new Response(null, { status: 200 })
  statusHolder.current = null

  authApiMocks.register.mockReset()
  authApiMocks.register.mockImplementation(async () => {
    timeline.push('register')
    return { success: true }
  })
  authApiMocks.wechatLoginByCode.mockReset()
  authApiMocks.wechatLoginByCode.mockImplementation(async () => {
    timeline.push('wechat')
    return { success: false, message: 'wechat rejected' }
  })
  authApiMocks.logout.mockClear()
  authApiMocks.createOAuthFlow.mockClear()
  authRedirectMocks.redirectToLogin.mockClear()
  toastSpy.error.mockClear()
  toastSpy.success.mockClear()
  toastSpy.info.mockClear()
  openSpy.mockReset()
  openSpy.mockImplementation(() => {
    timeline.push('open')
  })

  fetchStartSignals = []
  fetchStub = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const rawBody = init?.body
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : null
    timeline.push(`touch:${String(body?.event ?? 'unknown')}`)
    const callIndex = fetchStub.mock.calls.length - 1
    while (fetchStartSignals.length <= callIndex) {
      fetchStartSignals.push(createDeferred())
    }
    // Explicit "request started" checkpoint: tests await this signal
    // instead of flushing microtasks.
    fetchStartSignals[callIndex].resolve()
    return fetchBehavior(body, init)
  })
  vi.stubGlobal('fetch', fetchStub)
  vi.stubGlobal('open', openSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
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

describe('SignUpForm password registration', () => {
  it('awaits the bounded signup_started capture before calling register', async () => {
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    fireEvent.click(submitButton())

    await waitFor(() => expect(authApiMocks.register).toHaveBeenCalledTimes(1))

    expect(timeline).toEqual([
      'touch:landing_view',
      'touch:signup_started',
      'register',
    ])
    const touches = touchCalls()
    expect(touches[0].body).toMatchObject({ event: 'landing_view' })
    expect(touches[1].body).toEqual({ event: 'signup_started' })
    expect(touches[1].init?.keepalive).toBe(true)

    const payload = authApiMocks.register.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload).toMatchObject({
      username: 'newuser',
      password: 'password123',
    })
    expect(Object.keys(payload).some((key) => key.startsWith('utm_'))).toBe(
      false
    )

    await waitFor(() =>
      expect(authRedirectMocks.redirectToLogin).toHaveBeenCalledTimes(1)
    )
  })

  it('still registers when the acquisition capture fails', async () => {
    fetchBehavior = async () => {
      throw new TypeError('network down')
    }
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    fireEvent.click(submitButton())

    await waitFor(() => expect(authApiMocks.register).toHaveBeenCalledTimes(1))
    expect(timeline).toContain('register')
  })

  it('still registers when the acquisition capture hangs until the budget expires', async () => {
    vi.useFakeTimers()
    fetchBehavior = () => new Promise<Response>(() => {})
    statusHolder.current = {}
    await renderSignUpForm()
    fillPasswordForm()

    // One explicit act boundary: the click runs onSubmit up to the
    // landing_view request starting, and React flushes the loading state.
    await act(async () => {
      fireEvent.click(submitButton())
      await fetchStarted(0)
    })

    expect(submitButton()).toBeDisabled()
    expect(authApiMocks.register).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499)
    })
    expect(authApiMocks.register).not.toHaveBeenCalled()

    // The shared budget ends at t=1500ms; act settles the whole register
    // success path (toast, redirect and the finally loading reset).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(authApiMocks.register).toHaveBeenCalledTimes(1)
  })

  it('blocks submit without legal consent and reports nothing', async () => {
    statusHolder.current = { user_agreement_enabled: true }
    await renderSignUpForm()
    fillPasswordForm()

    expect(submitButton()).toBeDisabled()
    fireEvent.click(submitButton())

    expect(fetchStub).not.toHaveBeenCalled()
    expect(authApiMocks.register).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(submitButton()).toBeEnabled()

    fireEvent.click(submitButton())
    await waitFor(() => expect(authApiMocks.register).toHaveBeenCalledTimes(1))
    expect(timeline).toContain('touch:signup_started')
  })

  it('blocks submit without email or verification code and reports nothing', async () => {
    statusHolder.current = { email_verification: true }
    await renderSignUpForm()
    fillPasswordForm()

    fireEvent.click(submitButton())
    // Wait for the user-visible error state: the missing-email toast.
    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith('Please enter your email')
    )
    expect(fetchStub).not.toHaveBeenCalled()
    expect(authApiMocks.register).not.toHaveBeenCalled()

    fireEvent.change(
      screen.getByLabelText('Email (required for verification)'),
      { target: { value: 'newuser@example.com' } }
    )
    fireEvent.click(submitButton())
    // Wait for the next user-visible error state: the missing code toast.
    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith(
        'Please enter the verification code'
      )
    )
    expect(fetchStub).not.toHaveBeenCalled()
    expect(authApiMocks.register).not.toHaveBeenCalled()
  })

  it('blocks submit without a turnstile token and reports nothing', async () => {
    statusHolder.current = {
      turnstile_check: true,
      turnstile_site_key: 'site-key',
    }
    await renderSignUpForm()
    fillPasswordForm()

    expect(submitButton()).toBeDisabled()
    expect(fetchStub).not.toHaveBeenCalled()
    expect(authApiMocks.register).not.toHaveBeenCalled()
  })
})

describe('SignUpForm OAuth wiring', () => {
  it('fires signup_started before the GitHub OAuth redirect', async () => {
    statusHolder.current = {
      github_oauth: true,
      github_client_id: 'gh-client',
    }
    await renderSignUpForm()

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with GitHub/ })
    )

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))

    expect(timeline).toEqual([
      'touch:landing_view',
      'touch:signup_started',
      'open',
    ])
    expect(touchCalls()[1].init?.keepalive).toBe(true)
    expect(String(openSpy.mock.calls[0][0])).toContain(
      'github.com/login/oauth/authorize'
    )
  })
})

describe('SignUpForm WeChat registration', () => {
  it('reports nothing when legal consent is missing', async () => {
    statusHolder.current = {
      wechat_login: true,
      user_agreement_enabled: true,
    }
    await renderSignUpForm()

    const wechatButton = screen.getByRole('button', {
      name: /Continue with WeChat/,
    })
    // The consent gate disables the button, so a click cannot start any
    // async flow; everything below is asserted synchronously.
    expect(wechatButton).toBeDisabled()

    fireEvent.click(wechatButton)

    expect(fetchStub).not.toHaveBeenCalled()
    expect(screen.queryByText('WeChat sign in')).not.toBeInTheDocument()
  })

  it('starts the signup_started capture when the WeChat dialog opens', async () => {
    statusHolder.current = { wechat_login: true }
    await renderSignUpForm()

    fireEvent.click(
      screen.getByRole('button', { name: /Continue with WeChat/ })
    )

    await waitFor(() =>
      expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    )
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))

    const touches = touchCalls()
    expect(touches[0].body).toMatchObject({ event: 'landing_view' })
    expect(touches[1].body).toEqual({ event: 'signup_started' })
  })

  it('waits on the same bounded capture before the WeChat request and proceeds after the budget', async () => {
    vi.useFakeTimers()
    fetchBehavior = () => new Promise<Response>(() => {})
    statusHolder.current = { wechat_login: true }
    await renderSignUpForm()

    // One explicit act boundary: opening the dialog starts the deduped
    // landing_view capture, and React flushes the dialog into the DOM.
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Continue with WeChat/ })
      )
      await fetchStarted(0)
    })

    expect(screen.getByText('WeChat sign in')).toBeInTheDocument()
    // One deduped capture attempt (landing_view); it never settles.
    expect(fetchStub).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '654321' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    // The Confirm button entering its submitting state is explicit evidence
    // that handleWeChatLogin started and is awaiting the bounded capture.
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(authApiMocks.wechatLoginByCode).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499)
    })
    expect(authApiMocks.wechatLoginByCode).not.toHaveBeenCalled()

    // The shared budget ends at t=1500ms; act settles the WeChat response
    // handling and the finally submitting reset.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(authApiMocks.wechatLoginByCode).toHaveBeenCalledTimes(1)
    expect(authApiMocks.wechatLoginByCode).toHaveBeenCalledWith('654321')
    // Still only the single deduped capture attempt — no second landing_view
    // or signup_started request was issued.
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(timeline).toContain('wechat')
  })
})

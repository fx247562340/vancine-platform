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
// Admin Google binding clear: the dialog reads the google_sub model field ONLY
// to decide whether Google is bound — the sensitive subject must never reach
// the DOM (text, aria-label, title, confirm copy or toast). The clear request
// sends backend binding_type "google" (never "google_sub"), works even when
// Google OAuth is disabled, surfaces each failure as exactly one toast owned
// by the component, and re-renders the cleared state after a successful clear.
//
// Deterministic by construction: every request is answered by a recording
// adapter (no real network, no timers); the in-flight clear is observed via an
// arrival promise, never through sleeps or polling.

/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import i18next from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { UserBindingDialog } from '../user-binding-dialog'

// jsdom lacks the Web Animations API; Base UI's ScrollArea viewport calls
// getAnimations during scroll checks. Stub it locally so the dialog renders
// without touching the shared test setup.
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}

// ============================================================================
// Test i18n instance
// ============================================================================

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Account Binding Management': 'Account Binding Management',
        'Manage account bindings for this user':
          'Manage account bindings for this user',
        Bound: 'Bound',
        'Bound Only': 'Bound Only',
        Cancel: 'Cancel',
        'Confirm Unbind': 'Confirm Unbind',
        Disabled: 'Disabled',
        'Failed to load': 'Failed to load',
        Google: 'Google',
        'No providers available': 'No providers available',
        'Not bound': 'Not bound',
        'Show All': 'Show All',
        'Show all providers including unbound':
          'Show all providers including unbound',
        'Show only bound providers': 'Show only bound providers',
        'This user has no bindings': 'This user has no bindings',
        Unbind: 'Unbind',
        'Unbind failed': 'Unbind failed',
        'Unbound {{provider}}': 'Unbound {{provider}}',
        'Are you sure you want to unbind {{provider}} for this user? The user will no longer be able to log in via this method.':
          'Are you sure you want to unbind {{provider}} for this user? The user will no longer be able to log in via this method.',
      },
    },
  },
})

// ============================================================================
// Request recording adapter (no real network, no timing)
// ============================================================================

// A distinctive sensitive subject: it must never appear anywhere in the DOM.
const SENSITIVE_GOOGLE_SUB = 'sensitive-google-sub-DO-NOT-LEAK-9f3a'

type ClearMode =
  | 'success'
  | 'business-failure'
  | 'http-failure'
  | 'http-failure-no-message'

interface RecordedRequest {
  method: string
  url: string
  body?: unknown
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const recordedRequests: RecordedRequest[] = []
let clearRequestArrived: Deferred<RecordedRequest> = createDeferred()

// Per-test controllable behavior.
let googleOauthEnabled = true
let clearMode: ClearMode = 'success'
let businessFailureMessage = 'clear refused by backend'
// Once the clear succeeds, the persisted state is gone: subsequent getUser
// calls return no google_sub so the dialog re-renders the cleared state.
let googleCleared = false

function jsonResponse(
  config: InternalAxiosRequestConfig,
  data: unknown
): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  message?: string
) {
  const err = new Error(
    `Request failed with status code ${status}`
  ) as Error & {
    config: InternalAxiosRequestConfig
    response: { status: number; data: Record<string, unknown> }
    isAxiosError: boolean
  }
  err.config = config
  err.response = { status, data: message === undefined ? {} : { message } }
  err.isAxiosError = true
  return err
}

function targetUser(): Record<string, unknown> {
  return {
    id: 1,
    username: 'target-user',
    display_name: 'Target User',
    role: 1,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
    google_sub: googleCleared ? undefined : SENSITIVE_GOOGLE_SUB,
  }
}

const recordingAdapter = async (
  config: InternalAxiosRequestConfig
): Promise<AxiosResponse> => {
  const method = (config.method ?? 'get').toLowerCase()
  const url = config.url ?? ''
  let body: unknown
  if (typeof config.data === 'string' && config.data.length > 0) {
    try {
      body = JSON.parse(config.data)
    } catch {
      body = config.data
    }
  }
  const request: RecordedRequest = { method, url, body }
  recordedRequests.push(request)

  if (method === 'delete' && url.includes('/bindings/')) {
    clearRequestArrived.resolve(request)
    if (clearMode === 'http-failure') {
      throw httpError(config, 500, 'http failure backend message')
    }
    if (clearMode === 'http-failure-no-message') {
      throw httpError(config, 500)
    }
    if (clearMode === 'business-failure') {
      return jsonResponse(config, {
        success: false,
        message: businessFailureMessage,
        data: null,
      })
    }
    googleCleared = true
    return jsonResponse(config, { success: true, message: '', data: null })
  }
  if (url.includes('/oauth/bindings')) {
    return jsonResponse(config, { success: true, message: '', data: [] })
  }
  if (url.includes('/api/status')) {
    return jsonResponse(config, {
      success: true,
      message: '',
      data: { google_oauth: googleOauthEnabled },
    })
  }
  if (/\/api\/user\/\d+$/.test(url)) {
    return jsonResponse(config, {
      success: true,
      message: '',
      data: targetUser(),
    })
  }
  return jsonResponse(config, { success: true, message: '', data: null })
}

// ============================================================================
// Rendering harness
// ============================================================================

function renderDialog(onUnbindSuccess?: () => void) {
  return render(
    <I18nextProvider i18n={i18n}>
      <UserBindingDialog
        open
        onOpenChange={() => undefined}
        userId={1}
        onUnbindSuccess={onUnbindSuccess ?? (() => undefined)}
      />
    </I18nextProvider>
  )
}

function countUserFetches(): number {
  return recordedRequests.filter(
    (request) => request.method === 'get' && request.url.endsWith('/api/user/1')
  ).length
}

function clearRequests(): RecordedRequest[] {
  return recordedRequests.filter(
    (request) =>
      request.method === 'delete' && request.url.includes('/bindings/')
  )
}

function expectNoSensitiveSubjectLeak(): void {
  // Covers rendered text, aria-label and title attributes (all live in the
  // serialized markup). Toasts are asserted separately via the toast spy.
  expect(document.body.innerHTML).not.toContain(SENSITIVE_GOOGLE_SUB)
}

// ============================================================================
// Tests
// ============================================================================

const originalAdapter = api.defaults.adapter

beforeEach(() => {
  recordedRequests.length = 0
  clearRequestArrived = createDeferred()
  googleOauthEnabled = true
  clearMode = 'success'
  businessFailureMessage = 'clear refused by backend'
  googleCleared = false
  api.defaults.adapter = recordingAdapter
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  api.defaults.adapter = originalAdapter
})

describe('UserBindingDialog Google admin clear', () => {
  it('shows a bound Google row with an unbind action when google_sub is set', async () => {
    renderDialog()

    // Bound state + action exist; the sensitive subject itself is never a
    // visible value.
    const unbind = await screen.findByRole('button', { name: 'Unbind Google' })
    expect(unbind).toBeEnabled()
    expectNoSensitiveSubjectLeak()
  })

  it('still allows clearing a bound Google account when Google OAuth is disabled', async () => {
    googleOauthEnabled = false
    renderDialog()

    const unbind = await screen.findByRole('button', { name: 'Unbind Google' })
    expect(unbind).toBeEnabled()
    expectNoSensitiveSubjectLeak()
  })

  it('never renders the sensitive google_sub in text, aria-label, title or confirm copy', async () => {
    renderDialog()

    await screen.findByRole('button', { name: 'Unbind Google' })
    expectNoSensitiveSubjectLeak()

    // Open the confirm dialog: its description is built from the provider
    // label, never from the subject.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    expect(
      screen.getByRole('button', { name: 'Confirm Unbind' })
    ).toBeInTheDocument()
    expectNoSensitiveSubjectLeak()
  })

  it('sends binding_type=google (never google_sub) on confirm', async () => {
    renderDialog()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    const request = await clearRequestArrived.promise
    expect(request.method).toBe('delete')
    expect(request.url).toContain('/api/user/1/bindings/google')
    expect(request.url).not.toContain('google_sub')
    expect(clearRequests()).toHaveLength(1)
  })

  it('sends no request when the clear confirmation is cancelled', async () => {
    renderDialog()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(clearRequests()).toHaveLength(0)
  })

  it('shows exactly one toast with the backend message on a business failure', async () => {
    clearMode = 'business-failure'
    businessFailureMessage = 'clear refused by backend'
    const errorSpy = vi.spyOn(toast, 'error')
    renderDialog()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await clearRequestArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('clear refused by backend')
    // A failed clear must not trigger a success refetch beyond the initial load.
    expect(countUserFetches()).toBe(1)
    expect(clearRequests()).toHaveLength(1)
  })

  it('shows exactly one toast with the backend message on an HTTP failure', async () => {
    clearMode = 'http-failure'
    const errorSpy = vi.spyOn(toast, 'error')
    renderDialog()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await clearRequestArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('http failure backend message')
    expect(clearRequests()).toHaveLength(1)
  })

  it('shows exactly one localized toast when an HTTP failure has no backend message', async () => {
    clearMode = 'http-failure-no-message'
    const errorSpy = vi.spyOn(toast, 'error')
    renderDialog()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await clearRequestArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('Unbind failed')
    expect(clearRequests()).toHaveLength(1)
  })

  it('re-renders the cleared state after a successful clear', async () => {
    const onUnbindSuccess = vi.fn()
    renderDialog(onUnbindSuccess)

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Unbind Google' })
    )
    // While bound, the sensitive subject is still not shown.
    expectNoSensitiveSubjectLeak()
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await clearRequestArrived.promise
    // The refetch returns an empty google_sub, so the bound Google row
    // disappears from the bound-only view.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Unbind Google' })
      ).not.toBeInTheDocument()
    )
    expectNoSensitiveSubjectLeak()
    expect(clearRequests()).toHaveLength(1)
    expect(onUnbindSuccess).toHaveBeenCalledTimes(1)
  })
})

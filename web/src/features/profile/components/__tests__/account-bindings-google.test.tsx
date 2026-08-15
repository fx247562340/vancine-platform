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
// Google account binding entry on the profile page: same-origin callback
// contract, bound/unbound states, and the bind click driving the shared popup
// flow with provider=google + intent=bind — without ever logging out.
//
// Deterministic by construction: the status query is pre-seeded into the
// QueryClient cache (no fetch, no timing), and the OAuth state request is
// awaited through an arrival promise, never through sleeps or polling.

/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://app.example.com/profile"}
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import i18next from 'i18next'
import { useState } from 'react'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'

import { AccountBindingsTab } from '../tabs/account-bindings-tab'

// ============================================================================
// Test i18n instance
// ============================================================================

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Bind: 'Bind',
        Bound: 'Bound',
        Cancel: 'Cancel',
        Change: 'Change',
        'Confirm Unbind': 'Confirm Unbind',
        Continue: 'Continue',
        Discord: 'Discord',
        Email: 'Email',
        GitHub: 'GitHub',
        Google: 'Google',
        LinuxDO: 'LinuxDO',
        'Not bound': 'Not bound',
        OIDC: 'OIDC',
        Telegram: 'Telegram',
        Unbind: 'Unbind',
        'Unbind failed': 'Unbind failed',
        'Unbound {{provider}}': 'Unbound {{provider}}',
        WeChat: 'WeChat',
        'OAuth pop-up was blocked': 'OAuth pop-up was blocked',
        'Failed to initialize OAuth': 'Failed to initialize OAuth',
        'Are you sure you want to unbind Google? After unbinding, you will no longer be able to sign in with Google. The system only allows unbinding when you still have another usable sign-in method.':
          'Are you sure you want to unbind Google? After unbinding, you will no longer be able to sign in with Google. The system only allows unbinding when you still have another usable sign-in method.',
      },
    },
  },
})

// ============================================================================
// Request recording adapter (no real network, no timing)
// ============================================================================

const flowToken = 'google-bind-flow-token'

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
let stateRequestArrived: Deferred<RecordedRequest> = createDeferred()

// Controllable Google self-unbind endpoint behavior (per-test).
let googleUnbindResponse: { success: boolean; message: string } = {
  success: true,
  message: '',
}
let googleUnbindArrived: Deferred<RecordedRequest> = createDeferred()
// When non-null the unbind request rejects with an HTTP error carrying this
// backend message (or an empty body when the message is ''), letting tests
// exercise the HTTP-failure path.
let googleUnbindHttpErrorMessage: string | null = null
// When true, the unbind request is recorded but its response is held until
// releaseGoogleUnbind resolves, letting tests observe the in-flight state.
let holdGoogleUnbind = false
let releaseGoogleUnbind: Deferred<void> = createDeferred()

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

function jsonResponse(
  config: InternalAxiosRequestConfig,
  data: unknown
): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
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

  if (url.includes('/api/oauth/state')) {
    stateRequestArrived.resolve(request)
    return jsonResponse(config, {
      success: true,
      message: '',
      data: { flow_token: flowToken, expires_at: 2_000_000_000 },
    })
  }
  if (url.includes('/api/user/self/bindings/google')) {
    googleUnbindArrived.resolve(request)
    if (holdGoogleUnbind) {
      await releaseGoogleUnbind.promise
    }
    if (googleUnbindHttpErrorMessage !== null) {
      throw httpError(
        config,
        500,
        googleUnbindHttpErrorMessage === ''
          ? undefined
          : googleUnbindHttpErrorMessage
      )
    }
    return jsonResponse(config, {
      success: googleUnbindResponse.success,
      message: googleUnbindResponse.message,
      data: null,
    })
  }
  if (url.includes('/api/user/oauth/bindings')) {
    return jsonResponse(config, { success: true, message: '', data: [] })
  }
  return jsonResponse(config, { success: true, message: '', data: null })
}

// ============================================================================
// Rendering harness
// ============================================================================

const googleClientId = 'google-client-id'
const sameOriginRedirect = 'https://app.example.com/oauth/google'

function fullGoogleStatus(): Record<string, unknown> {
  return {
    google_oauth: true,
    google_client_id: googleClientId,
    google_redirect_uri: sameOriginRedirect,
  }
}

function testProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 1,
    username: 'binding-tester',
    display_name: 'Binding Tester',
    role: 1,
    group: 'default',
    quota: 0,
    used_quota: 0,
    request_count: 0,
    status: 1,
    created_time: 0,
    aff_count: 0,
    aff_quota: 0,
    aff_history_quota: 0,
    ...overrides,
  }
}

// Track the QueryClient created per render so afterEach can clear its cache.
let activeQueryClient: QueryClient | null = null

function renderTab(
  profile: UserProfile,
  status: Record<string, unknown>,
  onUpdate: () => void | Promise<void> = () => undefined
) {
  // Pre-seed the status query so the bindings render synchronously from the
  // cache; no fetch, no loading state, no timers.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  activeQueryClient = queryClient
  queryClient.setQueryData(['status'], status)

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AccountBindingsTab profile={profile} onUpdate={onUpdate} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

// A wrapper that owns the profile state so a successful unbind can
// re-render the tab with the cleared google_sub, exactly like the real page
// refreshing the profile after onUpdate resolves.
function ControlledBindingsTab(props: {
  initialProfile: UserProfile
  onRefresh?: () => void
}) {
  const [profile, setProfile] = useState(props.initialProfile)
  return (
    <AccountBindingsTab
      profile={profile}
      onUpdate={async () => {
        setProfile((prev) => ({ ...prev, google_sub: undefined }))
        props.onRefresh?.()
      }}
    />
  )
}

function renderControlledTab(
  initialProfile: UserProfile,
  status: Record<string, unknown>,
  onRefresh?: () => void
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  activeQueryClient = queryClient
  queryClient.setQueryData(['status'], status)

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ControlledBindingsTab
          initialProfile={initialProfile}
          onRefresh={onRefresh}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

// Bind actions carry an explicit accessible name ("Bind Google",
// "Bound Google", ...); tests locate controls by role + name only.
function assertNoGoogleEntry(): void {
  expect(
    screen.queryByRole('button', { name: 'Bind Google' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Bound Google' })
  ).not.toBeInTheDocument()
  // Control: the list itself rendered.
  expect(screen.getByRole('button', { name: 'Bind Email' })).toBeInTheDocument()
}

function assertNoLogoutOrCallback(): void {
  expect(
    recordedRequests.some((request) =>
      request.url.includes('/api/user/auth/logout')
    )
  ).toBe(false)
  expect(
    recordedRequests.some((request) =>
      request.url.includes('/api/oauth/google')
    )
  ).toBe(false)
}

// ============================================================================
// Popup fake
// ============================================================================

interface PopupFake {
  closed: boolean
  sessionStorage?: unknown
  location: { replace: (url: string) => void }
  close: () => void
  postMessage: () => void
  navigatedUrls: string[]
  storage: Map<string, string>
}

function installPopupFake(options?: { throwingStorage?: boolean }): PopupFake {
  const storage = new Map<string, string>()
  const popup: PopupFake = {
    closed: false,
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    location: {
      replace: (url: string) => {
        popup.navigatedUrls.push(url)
      },
    },
    close: () => {
      popup.closed = true
    },
    postMessage: () => undefined,
    navigatedUrls: [],
    storage,
  }
  if (options?.throwingStorage) {
    Object.defineProperty(popup, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('sessionStorage is disabled')
      },
    })
  }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  return popup
}

function blockPopups(): void {
  vi.spyOn(window, 'open').mockReturnValue(null)
}

// ============================================================================
// Tests
// ============================================================================

const originalAdapter = api.defaults.adapter

beforeEach(() => {
  recordedRequests.length = 0
  stateRequestArrived = createDeferred()
  googleUnbindArrived = createDeferred()
  googleUnbindResponse = { success: true, message: '' }
  googleUnbindHttpErrorMessage = null
  holdGoogleUnbind = false
  releaseGoogleUnbind = createDeferred()
  window.localStorage.clear()
  api.defaults.adapter = recordingAdapter
})

afterEach(() => {
  // Restore mocks (window.open spy), RTL DOM, axios adapter, browser storage,
  // and the per-test QueryClient cache so every test starts from a clean
  // page-load state.
  cleanup()
  vi.restoreAllMocks()
  api.defaults.adapter = originalAdapter
  window.localStorage.clear()
  activeQueryClient?.clear()
  activeQueryClient = null
})

describe('AccountBindingsTab Google binding entry', () => {
  it('shows an enabled, unbound Google entry when the callback origin matches', () => {
    renderTab(testProfile(), fullGoogleStatus())

    // Unbound-and-available is proven by the accessible action itself: a
    // 'Bind Google' button exists and is enabled, and there is no 'Bound
    // Google' action. No semantically-meaningless row div is used to pair
    // the button with the repeated 'Not bound' copy.
    const button = screen.getByRole('button', { name: 'Bind Google' })
    expect(button).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Bound Google' })
    ).not.toBeInTheDocument()
  })

  it('shows the bound Google account with an unbind action instead of re-binding', () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const button = screen.getByRole('button', { name: 'Unbind Google' })
    expect(button).toBeEnabled()
    // The bound state is still visible as localized 'Bound' copy; the raw
    // google_sub never enters textContent / innerHTML / aria-label / title.
    expect(screen.getAllByText('Bound').length).toBeGreaterThanOrEqual(1)
    expect(document.body.textContent).not.toContain('google-sub-1')
    expect(document.body.innerHTML).not.toContain('google-sub-1')
    for (const el of document.body.querySelectorAll('*')) {
      expect(el.getAttribute('aria-label') ?? '').not.toContain('google-sub-1')
      expect(el.getAttribute('title') ?? '').not.toContain('google-sub-1')
    }
    expect(
      screen.queryByRole('button', { name: 'Bind Google' })
    ).not.toBeInTheDocument()
  })

  it('never leaks the raw google_sub into the unbind confirmation copy or the DOM', async () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))

    // Confirmation dialog is open; its copy and every attribute stay clean.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirm Unbind' })
      ).toBeInTheDocument()
    )
    expect(document.body.textContent).not.toContain('google-sub-1')
    expect(document.body.innerHTML).not.toContain('google-sub-1')
    for (const el of document.body.querySelectorAll('*')) {
      expect(el.getAttribute('aria-label') ?? '').not.toContain('google-sub-1')
      expect(el.getAttribute('title') ?? '').not.toContain('google-sub-1')
    }
    // Dismiss without a request.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(countUnbindRequests()).toBe(0)
  })

  it('hides the Google entry when Google OAuth configuration is missing', () => {
    renderTab(testProfile(), { google_oauth: false })

    assertNoGoogleEntry()
  })

  it('hides the Google entry when the redirect URI is on a different origin', () => {
    renderTab(testProfile(), {
      google_oauth: true,
      google_client_id: googleClientId,
      google_redirect_uri: 'https://api.example.com/oauth/google',
    })

    assertNoGoogleEntry()
  })

  it.each(['/oauth/google', 'javascript:alert(1)', 'data:text/html,x'])(
    'hides the Google entry for the non-http(s) redirect URI %s',
    (uri) => {
      renderTab(testProfile(), {
        google_oauth: true,
        google_client_id: googleClientId,
        google_redirect_uri: uri,
      })

      assertNoGoogleEntry()
    }
  )

  it('keeps the Google entry hidden when google_oauth is off even with complete configuration', async () => {
    const popup = installPopupFake()
    renderTab(testProfile(), {
      google_oauth: false,
      google_client_id: googleClientId,
      google_redirect_uri: sameOriginRedirect,
      github_oauth: true,
      github_client_id: 'github-client-id',
      discord_oauth: true,
      discord_client_id: 'discord-client-id',
    })

    // Complete public configuration, but the switch is off: no Google
    // entry, and nothing may reach /api/oauth/state for it.
    assertNoGoogleEntry()
    expect(recordedRequests).toHaveLength(0)

    // The other built-in providers are unaffected: Discord can still start
    // a bind through the same shared popup flow.
    expect(
      screen.getByRole('button', { name: 'Bind GitHub' })
    ).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bind Discord' }))
    const request = await stateRequestArrived.promise
    expect(request.body).toEqual({ provider: 'discord', intent: 'bind' })
    await waitFor(() => expect(popup.navigatedUrls).toHaveLength(1))
    expect(popup.navigatedUrls[0]).toMatch(
      /^https:\/\/discord\.com\/oauth2\/authorize/
    )
    assertNoLogoutOrCallback()
  })

  it('keeps GitHub and Discord entries independent and intact', () => {
    renderTab(testProfile({ github_id: 'github-1' }), {
      github_oauth: true,
      github_client_id: 'github-client-id',
      discord_oauth: true,
      discord_client_id: 'discord-client-id',
    })

    const githubButton = screen.getByRole('button', { name: 'Bound GitHub' })
    const discordButton = screen.getByRole('button', { name: 'Bind Discord' })
    expect(githubButton).toBeDisabled()
    expect(discordButton).toBeEnabled()
    // The bound GitHub id is unique to the GitHub entry.
    expect(screen.getByText('github-1')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Bind Google' })
    ).not.toBeInTheDocument()
  })

  it('click starts provider=google intent=bind flow and never logs out', async () => {
    const popup = installPopupFake()
    renderTab(testProfile(), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bind Google' }))
    // Wait for "POST /api/oauth/state happened" — a promise, not a timer.
    const request = await stateRequestArrived.promise
    expect(request.method).toBe('post')
    expect(request.url).toContain('/api/oauth/state')
    expect(request.body).toEqual({ provider: 'google', intent: 'bind' })

    // Wait for the bind chain to stamp the popup and navigate it.
    await waitFor(() => expect(popup.navigatedUrls).toHaveLength(1))

    // The popup is stamped with provider+state before it navigates.
    expect(popup.storage.get('oauth_bind_flow:google')).toBe(flowToken)

    // The popup navigates to the exact Google authorize URL built from the
    // status-served same-origin configuration.
    expect(popup.navigatedUrls).toHaveLength(1)
    const url = new URL(popup.navigatedUrls[0])
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    )
    expect(url.searchParams.get('client_id')).toBe(googleClientId)
    expect(url.searchParams.get('redirect_uri')).toBe(sameOriginRedirect)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe(flowToken)
    expect(url.searchParams.get('prompt')).toBe('select_account')

    assertNoLogoutOrCallback()
  })

  it('fails safely when the popup is blocked', async () => {
    blockPopups()
    renderTab(testProfile(), fullGoogleStatus())

    // A blocked popup fails synchronously before any network call.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bind Google' }))

    expect(recordedRequests).toHaveLength(0)
    assertNoLogoutOrCallback()
  })

  it('unavailable popup storage creates the flow but never navigates or logs out', async () => {
    const popup = installPopupFake({ throwingStorage: true })
    renderTab(testProfile(), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bind Google' }))
    // The bind flow is still created first: provider=google, intent=bind.
    const request = await stateRequestArrived.promise
    expect(request.body).toEqual({ provider: 'google', intent: 'bind' })

    // Wait for the failure path (storage mark fails -> popup closed).
    await waitFor(() => expect(popup.closed).toBe(true))
    expect(popup.navigatedUrls).toHaveLength(0)
    // Exactly the state request happened: no logout, no callback, nothing
    // else — the current login state is untouched.
    expect(recordedRequests).toHaveLength(1)
    assertNoLogoutOrCallback()
  })
})

// ============================================================================
// Google self-unbind (Phase B2)
// ============================================================================

function countUnbindRequests(): number {
  return recordedRequests.filter(
    (request) =>
      request.method === 'delete' &&
      request.url.includes('/api/user/self/bindings/google')
  ).length
}

describe('AccountBindingsTab Google self-unbind', () => {
  it('shows an enabled "Unbind Google" action when bound and Google OAuth is available', () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const button = screen.getByRole('button', { name: 'Unbind Google' })
    expect(button).toBeEnabled()
    // The bound row no longer renders a dead "Bound Google" control.
    expect(
      screen.queryByRole('button', { name: 'Bound Google' })
    ).not.toBeInTheDocument()
  })

  it('still shows the unbind entry when bound but Google OAuth is disabled', () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), {
      google_oauth: false,
    })

    expect(screen.getByRole('button', { name: 'Unbind Google' })).toBeEnabled()
  })

  it('still shows the unbind entry when bound but the redirect URI is invalid', () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), {
      google_oauth: true,
      google_client_id: googleClientId,
      google_redirect_uri: 'javascript:alert(1)',
    })

    expect(screen.getByRole('button', { name: 'Unbind Google' })).toBeEnabled()
  })

  it('shows no Google entry at all when unbound and Google OAuth is unavailable', () => {
    renderTab(testProfile(), { google_oauth: false })

    expect(
      screen.queryByRole('button', { name: 'Unbind Google' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Bind Google' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Bound Google' })
    ).not.toBeInTheDocument()
  })

  it('sends no request when the unbind confirmation is cancelled', async () => {
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(countUnbindRequests()).toBe(0)
    assertNoLogoutOrCallback()
  })

  it('sends exactly one request when confirm is clicked repeatedly while pending', async () => {
    holdGoogleUnbind = true
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    const confirm = screen.getByRole('button', { name: 'Confirm Unbind' })
    await user.click(confirm)
    // The request is now in flight; the confirm control is disabled, so a
    // second click must not produce a second request.
    await googleUnbindArrived.promise
    expect(confirm).toBeDisabled()
    await user.click(confirm).catch(() => undefined)

    expect(countUnbindRequests()).toBe(1)

    releaseGoogleUnbind.resolve()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirm Unbind' })
      ).not.toBeInTheDocument()
    )
  })

  it('keeps the binding and shows the backend message when no alternative login remains', async () => {
    const backendMessage =
      'Please set up another sign-in method before unbinding Google'
    googleUnbindResponse = { success: false, message: backendMessage }
    const errorSpy = vi.spyOn(toast, 'error')
    const onUpdate = vi.fn(() => Promise.resolve())
    renderTab(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onUpdate
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(backendMessage))
    // No success refresh on a refused unbind.
    expect(onUpdate).not.toHaveBeenCalled()
    expect(countUnbindRequests()).toBe(1)
    assertNoLogoutOrCallback()
  })

  it('shows the backend message as-is for a not-bound business failure without duplicate toast', async () => {
    const backendMessage = 'Google account is not bound'
    googleUnbindResponse = { success: false, message: backendMessage }
    const errorSpy = vi.spyOn(toast, 'error')
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(backendMessage)
    assertNoLogoutOrCallback()
  })

  it('unbinds through the real endpoint, refreshes the profile, and keeps the session', async () => {
    const successSpy = vi.spyOn(toast, 'success')
    const onRefresh = vi.fn()
    renderControlledTab(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onRefresh
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    const request = await googleUnbindArrived.promise
    expect(request.method).toBe('delete')
    expect(request.url).toContain('/api/user/self/bindings/google')

    // After onUpdate resolves the refreshed profile has no google_sub, so the
    // bound entry (and its Unbind action) disappears from the UI.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Unbind Google' })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(successSpy).toHaveBeenCalled())
    expect(countUnbindRequests()).toBe(1)
    // Confirm dialog closed after the refresh completed.
    expect(
      screen.queryByRole('button', { name: 'Confirm Unbind' })
    ).not.toBeInTheDocument()
    assertNoLogoutOrCallback()
  })

  it('shows exactly one toast on an HTTP failure (no duplicate with the interceptor)', async () => {
    googleUnbindHttpErrorMessage = 'http failure backend message'
    const errorSpy = vi.spyOn(toast, 'error')
    const onUpdate = vi.fn(() => Promise.resolve())
    renderTab(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onUpdate
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('http failure backend message')
    // A failed unbind must not refresh the profile.
    expect(onUpdate).not.toHaveBeenCalled()
    expect(countUnbindRequests()).toBe(1)
    assertNoLogoutOrCallback()
  })

  it('shows exactly one localized toast on an HTTP failure without a backend message', async () => {
    googleUnbindHttpErrorMessage = ''
    const errorSpy = vi.spyOn(toast, 'error')
    renderTab(testProfile({ google_sub: 'google-sub-1' }), fullGoogleStatus())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Unbind Google' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('Unbind failed')
    assertNoLogoutOrCallback()
  })
})

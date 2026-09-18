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
// Google account binding entry on the security page: same-origin callback
// contract, bound/unbound states, self-unbind, and the bind click driving the
// shared popup flow with provider=google + intent=bind — without ever logging
// out.
//
// The account-security UI now lives in features/security, and binding is a
// sensitive action: one click runs the shared verification ceremony
// (GET /api/verify/methods -> POST /api/verify -> proof token) and creates the
// flow (POST /api/oauth/state); a SECOND explicit user gesture ("Continue
// account binding") is what opens the provider popup, so the popup is never
// opened from an async callback where Safari would block it.
//
// The popup stamp is the contract from features/auth/lib/oauth-callback-mode.ts
// (markOAuthPopup), which the /oauth/google callback page reads to tell one of
// our own bind popups from a plain login redirect:
//   sessionStorage['oauth_popup_flow:google'] = JSON.stringify({
//     state: <flow token>,
//     intent: 'bind',
//   })
// The legacy Vancine stamp ('oauth_bind_flow:google' = raw token) is gone and
// must not be written.
//
// Deterministic by construction: the status query is pre-seeded into the
// QueryClient cache (no fetch, no timing), and every request is awaited
// through an arrival promise, never through sleeps or polling.

/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://app.example.com/security"}
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { AccountBindings } from '../account-bindings'

// Translations come from the global test i18next instance (src/test-setup.ts),
// whose empty resource map makes every t('English source') call render its own
// key — the same convention the sibling security tests use.

// ============================================================================
// Request recording adapter (no real network, no timing)
// ============================================================================

const flowToken = 'google-bind-flow-token'
const proofToken = 'google-bind-proof'

interface RecordedRequest {
  method: string
  url: string
  body?: unknown
  headers?: Record<string, unknown>
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
  const headers = (
    typeof config.headers?.toJSON === 'function'
      ? config.headers.toJSON()
      : (config.headers ?? {})
  ) as Record<string, unknown>
  const request: RecordedRequest = { method, url, body, headers }
  recordedRequests.push(request)

  if (url.includes('/api/verify/methods')) {
    // Binding is proof-gated: one available factor keeps the ceremony to a
    // single password prompt.
    return jsonResponse(config, {
      success: true,
      message: '',
      data: {
        scope: 'account.binding.bind',
        methods: [{ method: 'password', available: true }],
        oauth_providers: [],
        password_encryption_enabled: false,
      },
    })
  }
  if (url.includes('/api/verify')) {
    return jsonResponse(config, {
      success: true,
      message: '',
      data: {
        proof_token: proofToken,
        scope: 'account.binding.bind',
        method: 'password',
        expires_at: 2_000_000_000,
      },
    })
  }
  if (url.includes('/api/oauth/state')) {
    stateRequestArrived.resolve(request)
    // No authorization_url: the authorize URL must be built on the client from
    // the status-served Google configuration.
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

function recordedUrls(): string[] {
  return recordedRequests.map((request) => request.url)
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

function createSeededQueryClient(status: Record<string, unknown>): QueryClient {
  // Pre-seed the status query so the bindings render synchronously from the
  // cache; no fetch, no loading state, no timers.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  activeQueryClient = queryClient
  queryClient.setQueryData(STATUS_QUERY_KEY, status)
  return queryClient
}

function renderBindings(
  profile: UserProfile,
  status: Record<string, unknown>,
  onUpdate: () => void = () => undefined
) {
  const queryClient = createSeededQueryClient(status)
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountBindings profile={profile} onUpdate={onUpdate} />
    </QueryClientProvider>
  )
}

// A wrapper that owns the profile state so a successful unbind can re-render
// the bindings with the cleared google_sub, exactly like the real page
// refreshing the profile after onUpdate returns.
function ControlledBindings(props: {
  initialProfile: UserProfile
  onRefresh?: () => void
}) {
  const [profile, setProfile] = useState(props.initialProfile)
  return (
    <AccountBindings
      profile={profile}
      onUpdate={() => {
        setProfile((prev) => ({ ...prev, google_sub: undefined }))
        props.onRefresh?.()
      }}
    />
  )
}

function renderControlledBindings(
  initialProfile: UserProfile,
  status: Record<string, unknown>,
  onRefresh?: () => void
) {
  const queryClient = createSeededQueryClient(status)
  return render(
    <QueryClientProvider client={queryClient}>
      <ControlledBindings
        initialProfile={initialProfile}
        onRefresh={onRefresh}
      />
    </QueryClientProvider>
  )
}

// ============================================================================
// Entry locators
// ============================================================================

// The refactored list renders one <li> per provider whose label is plain text
// and whose single action button is labelled 'Bind' / 'Bound' / 'Change' /
// 'Unbind' (the old per-provider aria-label such as "Bind Google" is gone), so
// entries are located by label and scoped with within(). The name patterns
// still accept a "<Action> <Provider>" accessible name in case the label is
// restored.
function queryBindingEntry(label: string): HTMLElement | null {
  const node = screen.queryAllByText(label)[0]
  return node?.closest('li') ?? null
}

function bindingEntry(label: string): HTMLElement {
  const entry = queryBindingEntry(label)
  if (!entry) {
    throw new Error(`No account binding entry rendered for "${label}"`)
  }
  return entry
}

function entryAction(entry: HTMLElement): HTMLElement {
  return within(entry).getByRole('button')
}

function assertNoGoogleEntry(): void {
  // No Google row at all: neither a bind nor an unbind action, because the
  // provider label only renders inside its own entry.
  expect(queryBindingEntry('Google')).toBeNull()
  // Control: the list itself rendered.
  expect(entryAction(bindingEntry('Email'))).toBeInTheDocument()
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
// Bind ceremony driver
// ============================================================================

async function verifyIdentity(user: UserEvent): Promise<void> {
  const verification = await screen.findByRole('dialog', {
    name: 'Security verification',
  })
  await user.type(
    within(verification).getByLabelText('Password', { selector: 'input' }),
    'current-password'
  )
  await user.click(within(verification).getByRole('button', { name: 'Verify' }))
}

async function continueToProvider(user: UserEvent): Promise<void> {
  const continuation = await screen.findByRole('alertdialog', {
    name: 'Continue account binding',
  })
  await user.click(
    within(continuation).getByRole('button', { name: 'Continue' })
  )
}

/** Click a provider's bind action and clear the verification ceremony. */
async function startVerifiedBind(
  user: UserEvent,
  provider: string
): Promise<void> {
  await user.click(entryAction(bindingEntry(provider)))
  await verifyIdentity(user)
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

/** The current popup stamp written by markOAuthPopup (oauth-callback-mode.ts). */
function readPopupFlowMarker(popup: PopupFake, provider: string): unknown {
  const raw = popup.storage.get(`oauth_popup_flow:${provider}`)
  expect(raw).toBeDefined()
  return JSON.parse(raw as string)
}

// ============================================================================
// Tests
// ============================================================================

const originalAdapter = api.defaults.adapter

// The security page is only reachable authenticated, and a proof-gated request
// (singleUseAuthorization / X-Security-Proof) refreshes the session before it
// spends the proof. Seed a live, non-expiring session so that refresh takes the
// in-memory fast path instead of hitting /api/user/auth/refresh.
function signInForTest(): void {
  const now = Math.floor(Date.now() / 1000)
  useAuthStore.getState().auth.setBundle({
    access_token: 'binding-test-access-token',
    token_type: 'Bearer',
    access_expires_at: now + 600,
    user: { id: 1, username: 'binding-tester', role: 1 },
    session: {
      sid: 'binding-test-session',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: 'vitest',
      created_at: now,
      last_active_at: now,
      expires_at: now + 3600,
    },
  })
}

beforeEach(() => {
  signInForTest()
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
  useAuthStore.getState().auth.reset('idle')
  window.localStorage.clear()
  activeQueryClient?.clear()
  activeQueryClient = null
})

describe('AccountBindings Google binding entry', () => {
  it('shows an enabled, unbound Google entry when the callback origin matches', () => {
    renderBindings(testProfile(), fullGoogleStatus())

    // Unbound-and-available is proven by the entry's own action: it offers
    // 'Bind', is enabled, and shows the 'Not bound' placeholder.
    const entry = bindingEntry('Google')
    const action = entryAction(entry)
    expect(action).toHaveAccessibleName(/^Bind( Google)?$/)
    expect(action).toBeEnabled()
    expect(within(entry).getByText('Not bound')).toBeInTheDocument()
  })

  it('shows the bound Google account with an unbind action instead of re-binding', () => {
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const entry = bindingEntry('Google')
    const action = entryAction(entry)
    expect(action).toHaveAccessibleName(/^Unbind( Google)?$/)
    expect(action).toBeEnabled()
    // The bound state is still visible as localized 'Bound' copy; the raw
    // google_sub never enters textContent / innerHTML / aria-label / title.
    expect(screen.getAllByText('Bound').length).toBeGreaterThanOrEqual(1)
    expect(document.body.textContent).not.toContain('google-sub-1')
    expect(document.body.innerHTML).not.toContain('google-sub-1')
    for (const el of document.body.querySelectorAll('*')) {
      expect(el.getAttribute('aria-label') ?? '').not.toContain('google-sub-1')
      expect(el.getAttribute('title') ?? '').not.toContain('google-sub-1')
    }
    // A bound Google account never offers a re-bind action.
    expect(action).not.toHaveAccessibleName(/^Bind( Google)?$/)
    expect(within(entry).queryByText('google-sub-1')).not.toBeInTheDocument()
  })

  it('never leaks the raw google_sub into the unbind confirmation copy or the DOM', async () => {
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))

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
    renderBindings(testProfile(), { google_oauth: false })

    assertNoGoogleEntry()
  })

  it('hides the Google entry when the redirect URI is on a different origin', () => {
    renderBindings(testProfile(), {
      google_oauth: true,
      google_client_id: googleClientId,
      google_redirect_uri: 'https://api.example.com/oauth/google',
    })

    assertNoGoogleEntry()
  })

  it.each(['/oauth/google', 'javascript:alert(1)', 'data:text/html,x'])(
    'hides the Google entry for the non-http(s) redirect URI %s',
    (uri) => {
      renderBindings(testProfile(), {
        google_oauth: true,
        google_client_id: googleClientId,
        google_redirect_uri: uri,
      })

      assertNoGoogleEntry()
    }
  )

  it('keeps the Google entry hidden when google_oauth is off even with complete configuration', async () => {
    const popup = installPopupFake()
    renderBindings(testProfile(), {
      google_oauth: false,
      google_client_id: googleClientId,
      google_redirect_uri: sameOriginRedirect,
      github_oauth: true,
      github_client_id: 'github-client-id',
      discord_oauth: true,
      discord_client_id: 'discord-client-id',
    })

    // Complete public configuration, but the switch is off: no Google entry,
    // and nothing may reach /api/oauth/state for it.
    assertNoGoogleEntry()
    expect(recordedRequests).toHaveLength(0)

    // The other built-in providers are unaffected: Discord can still start a
    // bind through the same shared popup flow.
    expect(entryAction(bindingEntry('GitHub'))).toBeInTheDocument()
    const user = userEvent.setup()
    await startVerifiedBind(user, 'Discord')
    const request = await stateRequestArrived.promise
    expect(request.body).toEqual({ provider: 'discord', intent: 'bind' })
    await continueToProvider(user)
    await waitFor(() => expect(popup.navigatedUrls).toHaveLength(1))
    expect(popup.navigatedUrls[0]).toMatch(
      /^https:\/\/discord\.com\/oauth2\/authorize/
    )
    // Control for the Google stamp assertion below: the same shared popup flow
    // writes the current marker (state + intent), never the legacy raw token.
    expect(readPopupFlowMarker(popup, 'discord')).toEqual({
      state: flowToken,
      intent: 'bind',
    })
    assertNoLogoutOrCallback()
  })

  it('keeps GitHub and Discord entries independent and intact', () => {
    renderBindings(testProfile({ github_id: 'github-1' }), {
      github_oauth: true,
      github_client_id: 'github-client-id',
      discord_oauth: true,
      discord_client_id: 'discord-client-id',
    })

    const githubAction = entryAction(bindingEntry('GitHub'))
    const discordAction = entryAction(bindingEntry('Discord'))
    expect(githubAction).toHaveAccessibleName(/^Bound( GitHub)?$/)
    expect(githubAction).toBeDisabled()
    expect(discordAction).toHaveAccessibleName(/^Bind( Discord)?$/)
    expect(discordAction).toBeEnabled()
    // The bound GitHub id is unique to the GitHub entry.
    expect(screen.getByText('github-1')).toBeInTheDocument()
    expect(queryBindingEntry('Google')).toBeNull()
  })

  it('click starts provider=google intent=bind flow and never logs out', async () => {
    const popup = installPopupFake()
    renderBindings(testProfile(), fullGoogleStatus())

    const user = userEvent.setup()
    await startVerifiedBind(user, 'Google')
    // Wait for "POST /api/oauth/state happened" — a promise, not a timer.
    const request = await stateRequestArrived.promise
    expect(request.method).toBe('post')
    expect(request.url).toContain('/api/oauth/state')
    expect(request.body).toEqual({ provider: 'google', intent: 'bind' })
    // Binding is identity-gated: the flow is created with the verification
    // proof, never anonymously.
    expect(request.headers?.['X-Security-Proof']).toBe(proofToken)

    // A separate user gesture opens the popup and navigates it.
    await continueToProvider(user)
    await waitFor(() => expect(popup.navigatedUrls).toHaveLength(1))

    // The popup is stamped with the flow marker (provider + state + intent)
    // before it navigates, so the callback page can prove this popup is ours.
    expect(readPopupFlowMarker(popup, 'google')).toEqual({
      state: flowToken,
      intent: 'bind',
    })
    // The legacy raw-token stamp must not come back.
    expect(popup.storage.has('oauth_bind_flow:google')).toBe(false)

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
    const errorSpy = vi.spyOn(toast, 'error')
    renderBindings(testProfile(), fullGoogleStatus())

    const user = userEvent.setup()
    await startVerifiedBind(user, 'Google')
    // The flow is created before the popup opens, so a blocked popup surfaces
    // as an error on the second gesture instead of silently doing nothing.
    await stateRequestArrived.promise
    await continueToProvider(user)

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('OAuth pop-up was blocked')
    )
    // Nothing but the verification ceremony and the flow creation happened:
    // no provider callback, no logout, no navigation.
    expect(recordedUrls()).toEqual([
      '/api/verify/methods',
      '/api/verify',
      '/api/oauth/state',
    ])
    assertNoLogoutOrCallback()
  })

  it('unavailable popup storage creates the flow but never navigates or logs out', async () => {
    const popup = installPopupFake({ throwingStorage: true })
    const errorSpy = vi.spyOn(toast, 'error')
    renderBindings(testProfile(), fullGoogleStatus())

    const user = userEvent.setup()
    await startVerifiedBind(user, 'Google')
    // The bind flow is still created first: provider=google, intent=bind.
    const request = await stateRequestArrived.promise
    expect(request.body).toEqual({ provider: 'google', intent: 'bind' })
    await continueToProvider(user)

    // Wait for the failure path (storage mark fails -> popup closed).
    await waitFor(() => expect(popup.closed).toBe(true))
    expect(popup.navigatedUrls).toHaveLength(0)
    expect(popup.storage.size).toBe(0)
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'OAuth popup storage is unavailable.'
      )
    )
    // Only the ceremony and the flow creation happened: no logout, no
    // callback, nothing else — the current login state is untouched.
    expect(recordedUrls()).toEqual([
      '/api/verify/methods',
      '/api/verify',
      '/api/oauth/state',
    ])
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

describe('AccountBindings Google self-unbind', () => {
  it('shows an enabled "Unbind" action when bound and Google OAuth is available', () => {
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const action = entryAction(bindingEntry('Google'))
    expect(action).toHaveAccessibleName(/^Unbind( Google)?$/)
    expect(action).toBeEnabled()
    // The bound row no longer renders a dead 'Bound' control.
    expect(action).not.toHaveAccessibleName(/^Bound( Google)?$/)
  })

  it('still shows the unbind entry when bound but Google OAuth is disabled', () => {
    renderBindings(testProfile({ google_sub: 'google-sub-1' }), {
      google_oauth: false,
    })

    const action = entryAction(bindingEntry('Google'))
    expect(action).toHaveAccessibleName(/^Unbind( Google)?$/)
    expect(action).toBeEnabled()
  })

  it('still shows the unbind entry when bound but the redirect URI is invalid', () => {
    renderBindings(testProfile({ google_sub: 'google-sub-1' }), {
      google_oauth: true,
      google_client_id: googleClientId,
      google_redirect_uri: 'javascript:alert(1)',
    })

    const action = entryAction(bindingEntry('Google'))
    expect(action).toHaveAccessibleName(/^Unbind( Google)?$/)
    expect(action).toBeEnabled()
  })

  it('shows no Google entry at all when unbound and Google OAuth is unavailable', () => {
    renderBindings(testProfile(), { google_oauth: false })

    expect(queryBindingEntry('Google')).toBeNull()
  })

  it('sends no request when the unbind confirmation is cancelled', async () => {
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(countUnbindRequests()).toBe(0)
    assertNoLogoutOrCallback()
  })

  it('sends exactly one request when confirm is clicked repeatedly while pending', async () => {
    holdGoogleUnbind = true
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
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
    const onUpdate = vi.fn()
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onUpdate
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
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
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(backendMessage)
    assertNoLogoutOrCallback()
  })

  it('unbinds through the real endpoint, refreshes the profile, and keeps the session', async () => {
    const successSpy = vi.spyOn(toast, 'success')
    const onRefresh = vi.fn()
    renderControlledBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onRefresh
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    const request = await googleUnbindArrived.promise
    expect(request.method).toBe('delete')
    expect(request.url).toContain('/api/user/self/bindings/google')

    // After onUpdate returns the refreshed profile has no google_sub, so the
    // Unbind action is replaced by Bind. The entry itself stays listed while
    // Google OAuth remains enabled and configured - that is the contract this
    // test was originally written against (it asserted the "Unbind Google"
    // action was gone, not that the whole row disappeared).
    await waitFor(() =>
      expect(
        within(bindingEntry('Google')).queryByRole('button', {
          name: 'Unbind Google',
        })
      ).toBeNull()
    )
    expect(
      within(bindingEntry('Google')).getByRole('button', {
        name: 'Bind Google',
      })
    ).toBeInTheDocument()
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
    const onUpdate = vi.fn()
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus(),
      onUpdate
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
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
    renderBindings(
      testProfile({ google_sub: 'google-sub-1' }),
      fullGoogleStatus()
    )

    const user = userEvent.setup()
    await user.click(entryAction(bindingEntry('Google')))
    await user.click(screen.getByRole('button', { name: 'Confirm Unbind' }))

    await googleUnbindArrived.promise
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith('Unbind failed')
    assertNoLogoutOrCallback()
  })
})

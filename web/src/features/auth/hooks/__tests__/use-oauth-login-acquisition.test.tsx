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
 * useOAuthLogin register-callback behavior tests. The hook must stay
 * acquisition-agnostic: only an injected register-page callback can produce
 * signup_started, it is awaited before the browser leaves the page, and its
 * failure never blocks the redirect. Network and navigation boundaries are
 * mocked; everything else is the real hook.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomOAuthProviderInfo, SystemStatus } from '../../types'
import { useOAuthLogin } from '../use-oauth-login'

vi.mock('@/features/auth/api', () => ({
  createOAuthFlow: vi.fn(async () => 'oauth-state-token'),
  logout: vi.fn(async () => ({ success: true, message: '' })),
  telegramLogin: vi.fn(async () => ({ success: false, message: '' })),
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    handleLoginSuccess: vi.fn(async () => {}),
    redirectTo2FA: vi.fn(),
    redirectToLogin: vi.fn(),
    redirectToRegister: vi.fn(),
  }),
}))

await i18next.use(initReactI18next).init({ lng: 'en', resources: {} })

const customProvider: CustomOAuthProviderInfo = {
  id: 1,
  name: 'Acme SSO',
  slug: 'acme',
  icon: '',
  client_id: 'acme-client',
  authorization_endpoint: 'https://sso.acme.example/authorize',
  scopes: 'openid profile',
}

const fullStatus: SystemStatus = {
  github_oauth: true,
  github_client_id: 'gh-client',
  google_oauth: true,
  discord_oauth: true,
  discord_client_id: 'dc-client',
  oidc_enabled: true,
  oidc_authorization_endpoint: 'https://oidc.example/authorize',
  oidc_client_id: 'oidc-client',
  oidc_display_name: 'Corp SSO',
  linuxdo_oauth: true,
  linuxdo_client_id: 'ld-client',
  telegram_oauth: true,
  telegram_bot_name: 'vancine_bot',
  custom_oauth_providers: [customProvider],
}

type HookApi = ReturnType<typeof useOAuthLogin>

type ProviderCase = {
  name: string
  invoke: (hooks: HookApi) => Promise<void>
  expectedUrlPart: string
}

const redirectProviders: ProviderCase[] = [
  {
    name: 'GitHub',
    invoke: (hooks) => hooks.handleGitHubLogin(),
    expectedUrlPart: 'github.com/login/oauth/authorize',
  },
  {
    name: 'Google',
    invoke: (hooks) => hooks.handleGoogleLogin(),
    expectedUrlPart: '/api/oauth/google/login',
  },
  {
    name: 'Discord',
    invoke: (hooks) => hooks.handleDiscordLogin(),
    expectedUrlPart: 'discord.com/oauth2/authorize',
  },
  {
    name: 'OIDC',
    invoke: (hooks) => hooks.handleOIDCLogin(),
    expectedUrlPart: 'oidc.example/authorize',
  },
  {
    name: 'LinuxDO',
    invoke: (hooks) => hooks.handleLinuxDOLogin(),
    expectedUrlPart: 'connect.linux.do/oauth2/authorize',
  },
  {
    name: 'Custom OAuth',
    invoke: (hooks) => hooks.handleCustomOAuthLogin(customProvider),
    expectedUrlPart: 'sso.acme.example/authorize',
  },
]

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const openSpy = vi.fn()
const hrefSetter = vi.fn()
const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }))

function lastRedirectUrl(): string | undefined {
  const lastOpen = openSpy.mock.calls.at(-1)
  if (lastOpen) return String(lastOpen[0])
  const lastHref = hrefSetter.mock.calls.at(-1)
  if (lastHref) return String(lastHref[0])
  return undefined
}

beforeEach(() => {
  openSpy.mockReset()
  hrefSetter.mockReset()
  fetchSpy.mockClear()
  vi.stubGlobal('open', openSpy)
  vi.stubGlobal('fetch', fetchSpy)
  // jsdom's location.href is non-configurable, so replace the whole location
  // object to observe the Google server-driven redirect without navigating.
  vi.stubGlobal('location', {
    origin: 'http://localhost:3000',
    pathname: '/sign-up',
    search: '',
    get href() {
      return 'http://localhost:3000/sign-up'
    },
    set href(value: string) {
      hrefSetter(value)
    },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useOAuthLogin register callback', () => {
  it.each(redirectProviders)(
    'awaits the register callback before the $name redirect',
    async ({ invoke, expectedUrlPart }) => {
      const deferred = createDeferred()
      const callback = vi.fn(() => deferred.promise)
      const { result } = renderHook(() =>
        useOAuthLogin(fullStatus, undefined, {
          onBeforeOAuthRedirect: callback,
        })
      )

      act(() => {
        void invoke(result.current)
      })
      await waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

      // The redirect must not happen while the callback is pending.
      expect(lastRedirectUrl()).toBeUndefined()

      await act(async () => {
        deferred.resolve()
      })

      await waitFor(() => expect(lastRedirectUrl()).toContain(expectedUrlPart))
      expect(callback).toHaveBeenCalledTimes(1)
    }
  )

  it.each(redirectProviders)(
    'still redirects via $name when the register callback rejects',
    async ({ invoke, expectedUrlPart }) => {
      const callback = vi.fn(async () => {
        throw new Error('attribution unavailable')
      })
      const { result } = renderHook(() =>
        useOAuthLogin(fullStatus, undefined, {
          onBeforeOAuthRedirect: callback,
        })
      )

      await act(async () => {
        await invoke(result.current)
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(lastRedirectUrl()).toContain(expectedUrlPart)
    }
  )

  it.each(redirectProviders)(
    'never reports acquisition for $name without a register callback',
    async ({ invoke, expectedUrlPart }) => {
      const { result } = renderHook(() => useOAuthLogin(fullStatus))

      await act(async () => {
        await invoke(result.current)
      })

      expect(lastRedirectUrl()).toContain(expectedUrlPart)
      expect(fetchSpy).not.toHaveBeenCalled()
    }
  )

  it('never invokes the register callback for Telegram', async () => {
    const callback = vi.fn()
    const { result } = renderHook(() =>
      useOAuthLogin(fullStatus, undefined, {
        onBeforeOAuthRedirect: callback,
      })
    )

    await act(async () => {
      await result.current.handleTelegramLogin()
    })

    expect(callback).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(result.current.isTelegramDialogOpen).toBe(true)
  })
})

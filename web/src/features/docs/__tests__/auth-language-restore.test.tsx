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
// Global auth saved-language restore behavior test. Not a Docs feature test;
// it lives under docs/__tests__ only as legacy directory placement (relocating
// it is tracked as non-blocking cleanup debt). It verifies that after login the
// authenticated user's saved language preference (from `user.language` or
// `user.setting`, object or JSON string) is normalized to a supported rc23
// interface code before being applied to i18next: Traditional variants
// (zh-TW, zh-HK, zh-Hant) restore as zhTW and Simplified variants (zh-Hans)
// as zhCN, never falling back to English. The redirect target is navigated
// with replace.
import { act, renderHook, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import type { AuthBundle, AuthUser } from '@/stores/auth-store'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const applyAuthBundleMock = vi.fn()
vi.mock('@/lib/api', () => ({
  applyAuthBundle: (...args: unknown[]) => applyAuthBundleMock(...args),
}))

const resources = {
  en: { translation: {} },
  zhCN: { translation: {} },
  zhTW: { translation: {} },
  fr: { translation: {} },
}

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: ['en', 'zhCN', 'zhTW', 'fr'],
      load: 'currentOnly',
      interpolation: { escapeValue: false },
    })
  }
})

beforeEach(async () => {
  navigateMock.mockReset()
  applyAuthBundleMock.mockReset()
  await i18n.changeLanguage('en')
})

function bundleWithUser(user: Partial<AuthUser>): AuthBundle {
  return {
    access_token: 'access-token',
    token_type: 'Bearer',
    access_expires_at: 2_000_000_000,
    user: {
      id: 1,
      username: 'tester',
      role: 1,
      ...user,
    },
    session: {
      sid: 'session-1',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: 'test-agent',
      created_at: 0,
      last_active_at: 0,
      expires_at: 2_000_000_000,
    },
  }
}

describe('useAuthRedirect — saved language restore', () => {
  it('restores a saved zh-TW preference and applies the auth bundle', async () => {
    const bundle = bundleWithUser({
      setting: JSON.stringify({ language: 'zh-TW' }),
    })
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess(bundle, '/dashboard')
    })

    expect(applyAuthBundleMock).toHaveBeenCalledWith(bundle)
    await waitFor(() => expect(i18n.language).toBe('zhTW'))
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/dashboard',
      replace: true,
    })
  })

  it('normalizes a saved zh-HK variant to zhTW on restore', async () => {
    const bundle = bundleWithUser({
      setting: JSON.stringify({ language: 'zh-HK' }),
    })
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess(bundle)
    })

    await waitFor(() => expect(i18n.language).toBe('zhTW'))
  })

  it('normalizes a saved zh-Hans variant to zhCN on restore', async () => {
    const bundle = bundleWithUser({
      setting: JSON.stringify({ language: 'zh-Hans' }),
    })
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess(bundle)
    })

    await waitFor(() => expect(i18n.language).toBe('zhCN'))
  })

  it('reads a top-level user.language variant and normalizes it too', async () => {
    const bundle = bundleWithUser({ language: 'zh-Hant' })
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess(bundle)
    })

    await waitFor(() => expect(i18n.language).toBe('zhTW'))
  })
})

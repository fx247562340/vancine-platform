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
// Global auth saved-language restore behavior test. Housed under docs/__tests__
// only because that is the fixed vitest scope (jsdom + `@` alias); it is not a
// Docs feature test. It verifies that after login, a saved user language that
// is a Traditional-Chinese VARIANT (e.g. zh-HK) is normalized to zh-TW (not
// passed through verbatim or collapsed to zh) when restored.
import { act, renderHook, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const getSelfMock = vi.fn()
vi.mock('@/lib/api', () => ({
  getSelf: (...args: unknown[]) => getSelfMock(...args),
}))

const resources = {
  en: { translation: {} },
  zh: { translation: {} },
  'zh-TW': { translation: {} },
}

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: ['en', 'zh', 'zh-TW'],
      load: 'currentOnly',
      interpolation: { escapeValue: false },
    })
  }
})

beforeEach(async () => {
  navigateMock.mockReset()
  getSelfMock.mockReset()
  await i18n.changeLanguage('en')
})

function userWithLanguage(language: string) {
  return {
    success: true,
    data: { id: 1, setting: JSON.stringify({ language }) },
  }
}

describe('useAuthRedirect — saved language restore', () => {
  it('restores a saved zh-TW preference', async () => {
    getSelfMock.mockResolvedValue(userWithLanguage('zh-TW'))
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess({ id: 1 }, '/dashboard')
    })

    await waitFor(() => expect(i18n.language).toBe('zh-TW'))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/dashboard',
      replace: true,
    })
  })

  it('normalizes a saved zh-HK variant to zh-TW on restore', async () => {
    getSelfMock.mockResolvedValue(userWithLanguage('zh-HK'))
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess({ id: 1 })
    })

    await waitFor(() => expect(i18n.language).toBe('zh-TW'))
  })

  it('normalizes a saved zh-Hans variant to zh on restore', async () => {
    getSelfMock.mockResolvedValue(userWithLanguage('zh-Hans'))
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess({ id: 1 })
    })

    await waitFor(() => expect(i18n.language).toBe('zh'))
  })

  it('reads language from a top-level user.language field too', async () => {
    getSelfMock.mockResolvedValue({
      success: true,
      data: { id: 1, language: 'zh-Hant' },
    })
    const { result } = renderHook(() => useAuthRedirect())

    await act(async () => {
      await result.current.handleLoginSuccess({ id: 1 })
    })

    await waitFor(() => expect(i18n.language).toBe('zh-TW'))
  })
})

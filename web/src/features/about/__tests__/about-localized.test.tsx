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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { About } from '@/features/about'
import { getAboutContent } from '@/features/about/api'
import enLocale from '@/i18n/locales/en.json'

// v1.2.0 About local-content contract: the renderer reads /api/about
// (which already supports localized JSON, legacy Markdown, HTML and URL
// shapes) and isolates cached data by language. The four rendering
// branches and the exact statutory attribution are already covered by
// `about-attribution.test.tsx`, so this file only pins the two contracts
// that are new in v1.2.0: the language-isolated query key and the ability
// for the same body to switch between localized content without a stale
// cache hit.

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

vi.mock('@/components/rich-content', () => ({
  RichContent: (props: { mode?: string; content: string }) => (
    <div data-testid='rich-content' data-mode={props.mode ?? 'markdown'}>
      {props.content}
    </div>
  ),
}))

vi.mock('@/features/about/api', () => ({
  getAboutContent: vi.fn(),
}))

const getAboutContentMock = getAboutContent as ReturnType<typeof vi.fn>

let zhBundle: Record<string, unknown> | null
let enBundle: Record<string, unknown> | null

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
  const zhMod = await import('@/i18n/locales/zh.json')
  zhBundle =
    ((zhMod.default ?? zhMod) as { translation?: Record<string, unknown> })
      .translation ?? {}
  enBundle = (enLocale as { translation?: Record<string, unknown> })
    .translation as Record<string, unknown>
})

afterAll(async () => {
  await i18n.changeLanguage('en')
})

function renderAbout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <About />
    </QueryClientProvider>
  )
}

beforeEach(async () => {
  getAboutContentMock.mockReset()
  await act(async () => {
    await i18n.changeLanguage('en')
  })
  i18n.removeResourceBundle('zhCN', 'translation')
  i18n.removeResourceBundle('en', 'translation')
  if (zhBundle) {
    i18n.addResourceBundle('zhCN', 'translation', zhBundle, true, true)
  }
  if (enBundle) {
    i18n.addResourceBundle('en', 'translation', enBundle, true, true)
  }
})

describe('About v1.2.0 — query key isolation by language', () => {
  it('refetches the about content when the active language changes', async () => {
    getAboutContentMock.mockResolvedValue({
      success: true,
      message: '',
      data: '# About Vancine',
    })
    renderAbout()
    await screen.findByTestId('rich-content')
    const initialCalls = getAboutContentMock.mock.calls.length

    // Switching language forces a new fetch because the query key includes
    // the BCP-47 language tag (zh-CN vs. en).
    getAboutContentMock.mockResolvedValueOnce({
      success: true,
      message: '',
      data: '# 关于 Vancine',
    })
    await act(async () => {
      await i18n.changeLanguage('zhCN')
    })
    await waitFor(() => {
      expect(getAboutContentMock.mock.calls.length).toBeGreaterThan(
        initialCalls
      )
    })
    const content = await screen.findByTestId('rich-content')
    await waitFor(() => {
      expect(content.textContent).toContain('# 关于 Vancine')
    })
  })

  it('serves both zh-CN and en localized content through the same About body', async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    getAboutContentMock.mockResolvedValueOnce({
      success: true,
      message: '',
      data: '# About Vancine\n\nEnglish body.',
    })
    renderAbout()
    let content = await screen.findByTestId('rich-content')
    expect(content.textContent).toContain('English body.')

    // Re-render with the next language; the same body must surface the
    // newly-resolved content without changing which component is mounted.
    getAboutContentMock.mockResolvedValueOnce({
      success: true,
      message: '',
      data: '# 关于 Vancine\n\n中文正文。',
    })
    await act(async () => {
      await i18n.changeLanguage('zhCN')
    })
    content = await screen.findByTestId('rich-content')
    await waitFor(() => {
      expect(content.textContent).toContain('中文正文')
    })
    // The English source content must no longer be present in the live
    // DOM — the language switch must have replaced it.
    expect(content.textContent).not.toContain('English body.')
  })
})

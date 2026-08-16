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
import { act, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { LegalDocument } from '@/features/legal/legal-document'
import enLocale from '@/i18n/locales/en.json'
import frLocale from '@/i18n/locales/fr.json'
import zhLocale from '@/i18n/locales/zh.json'

// PublicLayout would mount the full site chrome (router, status polling);
// degrade it to a plain wrapper so only the document body is under test.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// The module under test decides the rendering MODE; RichContent internals
// (markdown engine / sanitized iframe) are collaborators with their own
// coverage. Expose the mode so tests can assert the routing decision.
vi.mock('@/components/rich-content', () => ({
  RichContent: (props: { mode?: string; content: string }) => (
    <div data-testid='rich-content' data-mode={props.mode ?? 'markdown'}>
      {props.content}
    </div>
  ),
}))

const i18nInstance = i18n

beforeAll(async () => {
  if (!i18nInstance.isInitialized) {
    await i18nInstance.use(initReactI18next).init({
      resources: {
        en: { translation: enLocale.translation },
        zhCN: { translation: zhLocale.translation },
        fr: { translation: frLocale.translation },
      },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
})

// The real API layer sends Accept-Language from the active interface
// language (http-client interceptor); the backend then selects the locale.
// Simulate that contract by keying the canned response off the language
// active at call time.
const bodiesByLang: Record<string, string> = {
  en: 'English body',
  zhCN: '中文正文',
  fr: 'Corps français',
}

let queryClient: QueryClient

function renderDocument(
  fetchDocument: () => Promise<{ success: boolean; data?: string }>
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LegalDocument
        title='User Agreement'
        queryKey='user-agreement'
        fetchDocument={fetchDocument}
        emptyMessage='not configured'
      />
    </QueryClientProvider>
  )
}

describe('LegalDocument language binding', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18nInstance.changeLanguage('en')
    })
  })

  it('binds the React Query cache key to the normalized language tag', async () => {
    const fetchDocument = vi.fn(async () => ({
      success: true,
      data: bodiesByLang[i18nInstance.language ?? 'en'],
    }))
    renderDocument(fetchDocument)
    await screen.findByText('English body')

    await act(async () => {
      await i18nInstance.changeLanguage('zhCN')
    })
    await screen.findByText('中文正文')

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(keys).toContainEqual(['user-agreement', 'en'])
    expect(keys).toContainEqual(['user-agreement', 'zh-CN'])
  })

  it('refetches and re-renders on en -> zhCN -> fr switches without reload', async () => {
    const fetchDocument = vi.fn(async () => ({
      success: true,
      data: bodiesByLang[i18nInstance.language ?? 'en'],
    }))
    renderDocument(fetchDocument)

    await screen.findByText('English body')

    await act(async () => {
      await i18nInstance.changeLanguage('zhCN')
    })
    await screen.findByText('中文正文')
    expect(screen.queryByText('English body')).toBeNull()

    await act(async () => {
      await i18nInstance.changeLanguage('fr')
    })
    await screen.findByText('Corps français')
    expect(screen.queryByText('中文正文')).toBeNull()

    expect(fetchDocument).toHaveBeenCalledTimes(3)
  })

  it('never renders a localized JSON map as document body', async () => {
    const rawMap = JSON.stringify({
      en: 'English body',
      'zh-CN': '中文正文',
    })
    const fetchDocument = vi.fn(async () => ({ success: true, data: rawMap }))
    renderDocument(fetchDocument)

    await screen.findByText('English body')
    expect(screen.queryByText(rawMap)).toBeNull()
    expect(document.body.textContent).not.toContain('{"en"')

    await act(async () => {
      await i18nInstance.changeLanguage('zhCN')
    })
    // Same cached map payload, but the zh-CN entry is selected client-side.
    await screen.findByText('中文正文')
  })

  it('shows the empty state when a localized map has no usable locale', async () => {
    const fetchDocument = vi.fn(async () => ({
      success: true,
      data: JSON.stringify({ vi: 'chỉ tiếng Việt' }),
    }))
    renderDocument(fetchDocument)
    await screen.findByText('not configured')
    expect(document.body.textContent).not.toContain('{"vi"')
  })
})

describe('LegalDocument content modes', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18nInstance.changeLanguage('en')
    })
  })

  it('renders markdown content through the markdown mode', async () => {
    renderDocument(async () => ({ success: true, data: '# Terms\n\nBody' }))
    const content = await screen.findByTestId('rich-content')
    expect(content).toHaveAttribute('data-mode', 'markdown')
    expect(content.textContent).toContain('# Terms')
  })

  it('renders HTML content through the html mode', async () => {
    renderDocument(async () => ({
      success: true,
      data: '<h2>Policy</h2><p>Body</p>',
    }))
    const content = await screen.findByTestId('rich-content')
    expect(content).toHaveAttribute('data-mode', 'html')
  })

  it('renders an external URL as a redirect card, not embedded text', async () => {
    renderDocument(async () => ({
      success: true,
      data: 'https://example.com/terms',
    }))
    // Base UI renders the anchor with role="button"; the href still makes
    // it an external navigation.
    const link = await screen.findByRole('button', { name: 'View document' })
    expect(link).toHaveAttribute('href', 'https://example.com/terms')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByTestId('rich-content')).toBeNull()
  })

  it('shows the empty message when nothing is configured', async () => {
    renderDocument(async () => ({ success: true, data: '' }))
    await screen.findByText('not configured')
  })
})

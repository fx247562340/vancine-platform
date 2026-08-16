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
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { About } from '@/features/about'
import { getAboutContent } from '@/features/about/api'
import enLocale from '@/i18n/locales/en.json'

// The NOTICE-mandated attribution must appear verbatim and unsplit.
const ATTRIBUTION_TEXT =
  'Frontend design and development by New API contributors.'
const ATTRIBUTION_HREF = 'https://github.com/QuantumNous/new-api'

// Degrade PublicLayout to a plain wrapper: the module under test is the
// About body, not the site chrome.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Expose the rendering mode selected by About; markdown/HTML engines are
// collaborators with their own coverage.
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

function expectAttributionVisible() {
  // The exact sentence is visible and is the accessible name of the link to
  // the upstream repository.
  const link = screen.getByRole('link', { name: ATTRIBUTION_TEXT })
  expect(link).toHaveAttribute('href', ATTRIBUTION_HREF)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link.textContent).toBe(ATTRIBUTION_TEXT)
}

describe('About upstream attribution', () => {
  beforeEach(() => {
    getAboutContentMock.mockReset()
  })

  it('shows the attribution when no about content is configured', async () => {
    getAboutContentMock.mockResolvedValue({
      success: true,
      message: '',
      data: '',
    })
    renderAbout()
    await screen.findByText('No About Content Set')
    expectAttributionVisible()
  })

  it('shows the attribution alongside Markdown about content', async () => {
    getAboutContentMock.mockResolvedValue({
      success: true,
      message: '',
      data: '# About Vancine\n\nProduct description.',
    })
    renderAbout()
    const content = await screen.findByTestId('rich-content')
    expect(content).toHaveAttribute('data-mode', 'markdown')
    expect(content.textContent).toContain('# About Vancine')
    expectAttributionVisible()
  })

  it('shows the attribution alongside HTML about content', async () => {
    getAboutContentMock.mockResolvedValue({
      success: true,
      message: '',
      data: '<h2>About</h2><p>HTML body</p>',
    })
    renderAbout()
    const content = await screen.findByTestId('rich-content')
    expect(content).toHaveAttribute('data-mode', 'html')
    expectAttributionVisible()
  })

  it('shows the attribution in the external-URL iframe branch', async () => {
    getAboutContentMock.mockResolvedValue({
      success: true,
      message: '',
      data: 'https://example.com/about',
    })
    renderAbout()
    const iframe = await screen.findByTitle('About')
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe).toHaveAttribute('src', 'https://example.com/about')
    expectAttributionVisible()
  })
})

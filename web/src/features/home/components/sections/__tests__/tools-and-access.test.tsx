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
import { render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

// ToolsAndAccess no longer takes a pricing prop; the renderSection
// helper no longer needs the LOADING_STATE / ERROR_STATE constants.
import type { HomepageStatsState } from '../../../hooks/use-homepage-stats'
import { ToolsAndAccess } from '../tools-and-access'

// Stub the React Router Link so the assertions can rely on the
// chip's href without bringing the entire router stack into the
// unit test. The ToolsAndAccess section never depends on router
// state for behavior.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string
    children: ReactNode
    [key: string]: unknown
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

// AnimateInView in jsdom: the intersection observer is unavailable in
// the test environment, so it must be polyfilled before the section
// is mounted. Without the polyfill, the AnimateInView effect throws
// and the section is unmounted.
class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  })
}

let i18nReady = false

async function initTestI18n() {
  if (!i18nReady) {
    await i18n.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18n.changeLanguage('en')
}

function renderSection(props: { stats?: HomepageStatsState }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToolsAndAccess
        stats={
          props.stats ?? {
            status: 'loading',
            stats: null,
          }
        }
      />
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  await initTestI18n()
})

afterEach(() => {
  // No-op: react-testing-library's render result is auto-cleaned by
  // the global afterEach in vitest's test environment.
})

describe('ToolsAndAccess', () => {
  it('renders the five universal-access chips, the OpenCode/Pi guide rows, and the disclosure line', () => {
    renderSection({})

    const section = screen.getByTestId('homepage-tools-access-section')
    expect(section).toBeInTheDocument()

    // Universal-access chips. The "More" entry is gone — replaced by
    // the "More tools" link inside the setup-guides column.
    const universal = within(section).getByTestId('tools-universal-access')
    expect(within(universal).getByText('OpenAI SDK')).toBeInTheDocument()
    expect(within(universal).getByText('Python')).toBeInTheDocument()
    expect(within(universal).getByText('JavaScript')).toBeInTheDocument()
    expect(within(universal).getByText('cURL')).toBeInTheDocument()
    expect(
      within(universal).getByText('OpenAI-compatible clients and agents')
    ).toBeInTheDocument()
    expect(
      within(universal).queryByText('Cherry Studio')
    ).not.toBeInTheDocument()
    expect(within(universal).queryByText('CC Switch')).not.toBeInTheDocument()

    // Setup guides column.
    const guides = within(section).getByTestId('tools-setup-guides')
    expect(within(guides).getByText('OpenCode')).toBeInTheDocument()
    expect(within(guides).getByText('Pi Agent')).toBeInTheDocument()
    expect(within(guides).getByText('More tools')).toBeInTheDocument()

    // Disclosure line: OpenCode is in the provider catalog, Pi is a
    // community extension, no partnership is implied.
    const disclosure = within(section).getByTestId('tools-disclosure')
    expect(disclosure.textContent).toContain('OpenCode')
    expect(disclosure.textContent).toContain('Pi')
    expect(disclosure.textContent).toContain('No official partnership')
  })

  it('renders the active-vendor count from the stats endpoint when it is ready', () => {
    const stats: HomepageStatsState = {
      status: 'ready',
      stats: {
        window_days: 30,
        successful_requests: { value: 0, availability: 'unavailable' },
        processed_tokens: { value: 0, availability: 'unavailable' },
        active_vendor_count: { value: 6, availability: 'ok' },
        available_model_count: { value: 0, availability: 'unavailable' },
        as_of: 1_700_000_000,
      },
    }
    renderSection({ stats })

    const block = screen.getByTestId('tools-vendor-block')
    const stat = within(block).getByTestId('tools-vendor-stat')
    expect(stat.textContent).toContain('6')
    expect(stat.textContent).toContain('Integrated model vendors')
    expect(stat.textContent).toContain('Counted in real time')
  })

  it('shows the em-dash placeholder when the stats endpoint has not returned', () => {
    renderSection({ stats: { status: 'loading', stats: null } })
    const stat = screen.getByTestId('tools-vendor-stat')
    expect(stat.textContent).toContain('—')
  })

  it('shows the em-dash placeholder when the active_vendor_count triple is "unavailable"', () => {
    const stats: HomepageStatsState = {
      status: 'ready',
      stats: {
        window_days: 30,
        successful_requests: { value: 0, availability: 'unavailable' },
        processed_tokens: { value: 0, availability: 'unavailable' },
        active_vendor_count: { value: 0, availability: 'unavailable' },
        available_model_count: { value: 0, availability: 'unavailable' },
        as_of: 0,
      },
    }
    renderSection({ stats })
    const stat = screen.getByTestId('tools-vendor-stat')
    expect(stat.textContent).toContain('—')
  })

  it('hides the section only on a pricing error (not on loading or empty)', () => {
    // ToolsAndAccess no longer takes a pricing prop; the section
    // is always rendered, independent of the pricing state.
    const { container } = renderSection({})
    expect(
      container.querySelector('[data-testid="homepage-tools-access-section"]')
    ).not.toBeNull()
  })

  it('renders the new OpenCode/Pi Agent intro copy and never the old one', () => {
    renderSection({})
    const section = screen.getByTestId('homepage-tools-access-section')
    const guides = within(section).getByTestId('tools-setup-guides')
    const pageText = document.body.textContent ?? ''

    // New copy: tools link to Vancine setup guidance, SDK links to
    // their official references.
    expect(pageText).toContain(
      'OpenCode and Pi Agent link to Vancine setup guidance'
    )
    expect(guides.textContent).toContain(
      'Coding agents and CLI tools with Vancine setup guidance'
    )

    // Old copy is gone.
    expect(pageText).not.toContain(
      'Each tool links to a Vancine setup guide that records what is live-verified versus configuration-ready'
    )
    expect(guides.textContent).not.toContain('dedicated Vancine setup guide')
  })

  it('keeps the OpenCode and Pi Agent chips pointing to the documented guides', () => {
    renderSection({})
    const section = screen.getByTestId('homepage-tools-access-section')
    const guides = within(section).getByTestId('tools-setup-guides')
    const opencodeLink = within(guides).getByText('OpenCode').closest('a')
    const piLink = within(guides).getByText('Pi Agent').closest('a')
    expect(opencodeLink).toHaveAttribute('href', '/docs/agents/opencode')
    expect(piLink).toHaveAttribute('href', '/docs/agents')
  })
})

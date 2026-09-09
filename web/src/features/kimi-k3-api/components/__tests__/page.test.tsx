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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import {
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import zhLocale from '@/i18n/locales/zh.json'
import { trackEvent } from '@/lib/analytics'
import { Route as KimiK3ApiRouteImport } from '@/routes/kimi-k3-api/index'
import { useAuthStore } from '@/stores/auth-store'

// Isolate the page from the full site header (its dynamic nav would need
// backend config); PublicLayout degrades to a plain wrapper.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Avoid the real /api/status network request in jsdom (used by the Footer).
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Vancine',
    logo: '',
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))

// Capture analytics emissions. The page is the module under test; analytics
// is a collaborator whose contract is covered by its own suite.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// Remember how jsdom originally exposed navigator.clipboard (typically: no own
// property at all) so every case restores the exact descriptor — even when
// an assertion throws mid-test.
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)

let i18nReady = false

async function initTestI18n(): Promise<void> {
  if (!i18nReady) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: enLocale.translation },
        zhCN: { translation: zhLocale.translation },
      },
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

// Build a real router around the ACTUAL kimi-k3-api route module so the page
// renders exactly as wired in routeTree.gen.ts, with stub destinations for
// every internal link target.
const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestKimiRoute = KimiK3ApiRouteImport.update({
  id: '/kimi-k3-api/',
  path: '/kimi-k3-api/',
  getParentRoute: () => testRootRoute,
} as never)

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

const testRouteTree = testRootRoute.addChildren([
  TestKimiRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/pricing/$modelId', 'pricing-model-page'),
  stubRoute('/docs/$slug', 'docs-page'),
])

function renderPage(initialPath = '/kimi-k3-api/'): RenderResult {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function setAuthenticated(isAuthenticated: boolean): void {
  const current = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...current,
      user: isAuthenticated ? { id: 1, username: 'dev', role: 1 } : null,
    },
  })
}

beforeEach(async () => {
  await initTestI18n()
  setAuthenticated(false)
  trackEventMock.mockClear()
})

afterEach(() => {
  // Unconditional clipboard restoration: success, failure, and thrown
  // assertions all land here.
  if (originalClipboardDescriptor === undefined) {
    delete (navigator as { clipboard?: unknown }).clipboard
  } else {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
  }
  // Restore every spy installed by a case (console.warn/error suppression,
  // clipboard mocks, ...).
  vi.restoreAllMocks()
})

describe('kimi-k3-api page structure', () => {
  it('renders exactly one h1 and all required sections in decision order', async () => {
    renderPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Kimi K3 API pricing and OpenRouter comparison'
    )

    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(sections).toEqual([
      'Kimi K3 API price comparison',
      'Real Kimi K3 API test evidence',
      'OpenAI-compatible quickstart',
      'Agent setup',
      'Frequently asked questions',
      'Get Kimi K3 through an OpenAI-compatible API',
    ])
  })

  it('does not present a generalized China-model portfolio', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const pageText = document.body.textContent ?? ''
    for (const needle of ['GLM-5.2', 'DeepSeek V4', 'Qwen 3.7', 'MiniMax']) {
      expect(pageText).not.toContain(needle)
    }
  })
})

describe('CTA destinations and UTM safety', () => {
  it('points every guest destination CTA at /sign-up and keeps only allowlisted UTM parameters', async () => {
    renderPage(
      '/kimi-k3-api/?utm_source=launch&utm_campaign=kimi&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroPrimary = await screen.findByTestId('kimi-k3-hero-primary-cta')
    const heroSecondary = screen.getByTestId('kimi-k3-hero-secondary-cta')
    const quickstartCta = screen.getByTestId('kimi-k3-quickstart-cta')
    const finalCta = screen.getByTestId('kimi-k3-final-cta')
    const expectedSignUp = '/sign-up?utm_source=launch&utm_campaign=kimi'

    expect(screen.getAllByTestId('kimi-k3-hero-primary-cta')).toHaveLength(1)
    expect(screen.getAllByTestId('kimi-k3-hero-secondary-cta')).toHaveLength(1)
    expect(screen.getAllByTestId('kimi-k3-quickstart-cta')).toHaveLength(1)
    expect(screen.getAllByTestId('kimi-k3-final-cta')).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: /Create an API key/ })
    ).toHaveLength(3)

    expect(heroPrimary).toHaveAttribute('href', expectedSignUp)
    expect(quickstartCta).toHaveAttribute('href', expectedSignUp)
    expect(finalCta).toHaveAttribute('href', expectedSignUp)
    expect(heroSecondary).toHaveAttribute('href', '#pricing')

    for (const cta of [heroPrimary, quickstartCta, finalCta]) {
      const href = String(cta.getAttribute('href'))
      expect(href.startsWith('/sign-up')).toBe(true)
      expect(href).not.toContain('email')
      expect(href).not.toContain('api_key')
      expect(href).not.toContain('redirect')
    }
  })

  it('points every authenticated destination CTA at /playground', async () => {
    setAuthenticated(true)
    renderPage('/kimi-k3-api/?utm_source=launch&token=abc')

    const heroPrimary = await screen.findByTestId('kimi-k3-hero-primary-cta')
    const heroSecondary = screen.getByTestId('kimi-k3-hero-secondary-cta')
    const quickstartCta = screen.getByTestId('kimi-k3-quickstart-cta')
    const finalCta = screen.getByTestId('kimi-k3-final-cta')

    expect(
      screen.getAllByRole('button', { name: /Open Playground/ })
    ).toHaveLength(2)
    expect(heroPrimary).toHaveAttribute('href', '/playground?utm_source=launch')
    expect(finalCta).toHaveAttribute('href', '/playground?utm_source=launch')
    expect(quickstartCta).toHaveAttribute(
      'href',
      '/playground?utm_source=launch'
    )
    expect(heroSecondary).toHaveAttribute('href', '#pricing')

    for (const cta of [heroPrimary, quickstartCta, finalCta]) {
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })
})

describe('quickstart examples', () => {
  it('switches between cURL, Python, Node.js, and OpenCode examples', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', {
      level: 2,
      name: 'OpenAI-compatible quickstart',
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'cURL',
      'Python',
      'Node.js',
      'OpenCode',
    ])

    expect(
      await screen.findByText(/curl -X POST https:\/\/vancine\.com\/v1/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Python' }))
    expect(
      await screen.findByText(/os\.environ\['VANCINE_API_KEY'\]/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Node.js' }))
    expect(
      await screen.findByText(/process\.env\.VANCINE_API_KEY/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'OpenCode' }))
    expect(
      await screen.findByText(/\{env:VANCINE_API_KEY\}/)
    ).toBeInTheDocument()
  })

  it('announces copy success and failure accessibly', async () => {
    const user = userEvent.setup()

    const clipboardSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardSpy },
    })

    renderPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: 'Copy example code to clipboard',
    })
    await user.click(copyButtons[0])
    expect(clipboardSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText('Code copied')).toBeInTheDocument()
    })
  })

  it('announces copy failure when every clipboard path fails', async () => {
    const user = userEvent.setup()

    // The production copy path logs the expected failure diagnostics; silence
    // them through controlled spies (restored unconditionally in afterEach)
    // so the suite keeps a clean stderr.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Rejected clipboard API plus jsdom's missing document.execCommand means
    // every copy path fails — the hook must still announce the error.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    renderPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: 'Copy example code to clipboard',
    })
    await user.click(copyButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Unable to copy code')).toBeInTheDocument()
    })
  })
})

describe('link safety', () => {
  it('uses same-origin routes for Docs and Vancine Pricing without target=_blank', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const docsLink = screen.getByRole('button', {
      name: /Read API documentation/,
    })
    expect(docsLink).toHaveAttribute('href', '/docs/chat')
    expect(docsLink).not.toHaveAttribute('target')

    const pricingLinks = screen.getAllByRole('link', {
      name: /Vancine live Pricing/,
    })
    expect(pricingLinks.length).toBeGreaterThanOrEqual(1)
    for (const pricingLink of pricingLinks) {
      expect(pricingLink).toHaveAttribute('href', '/pricing/kimi-k3')
      expect(pricingLink).not.toHaveAttribute('target')
    }
  })

  it('opens GitHub evidence links in a new tab with noopener noreferrer', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const evidenceLink = screen.getAllByRole('button', {
      name: /View public evidence file/,
    })[0]
    const starterLink = screen.getAllByRole('button', {
      name: /View starter repository/,
    })[0]
    for (const link of [evidenceLink, starterLink]) {
      expect(
        String(link.getAttribute('href')).startsWith(
          'https://github.com/VancineAI/kimi-k3-api-starter'
        )
      ).toBe(true)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
  })
})

describe('anonymous analytics emissions', () => {
  it('emits only approved events with fixed payload keys on CTA and resource clicks', async () => {
    const user = userEvent.setup()
    // Each click navigates the memory router away from the landing page, so
    // exercise the resource link and the CTA on separate renders.
    const first = renderPage('/kimi-k3-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getAllByRole('link', { name: /Vancine live Pricing/ })[0]
    )
    first.unmount()

    const second = renderPage('/kimi-k3-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getAllByRole('button', { name: /Create an API key/ })[0]
    )
    second.unmount()

    expect(trackEventMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    const allowedEvents = new Set([
      'get_started_clicked',
      'developer_resource_clicked',
    ])
    const allowedPayloadKeys = new Set(['location', 'resource'])
    for (const [eventName, payload] of trackEventMock.mock.calls) {
      expect(allowedEvents.has(eventName)).toBe(true)
      for (const key of Object.keys(payload ?? {})) {
        expect(allowedPayloadKeys.has(key)).toBe(true)
      }
      expect(JSON.stringify(payload)).not.toContain('launch')
      expect(JSON.stringify(payload)).not.toContain('a@b.com')
    }
  })
})

describe('FAQ keyboard accessibility', () => {
  it('expands an answer through keyboard interaction', async () => {
    const user = userEvent.setup()
    renderPage()

    const question = 'Where can I confirm current Kimi K3 pricing?'
    const trigger = await screen.findByRole('button', { name: question })
    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/Check Vancine live Pricing/)).toBeVisible()
    })
  })
})

describe('VANCINE-FINAL-GATE-REMEDIATION: no inactive-promo copy on the Kimi K3 page', () => {
  const FORBIDDEN_SUBSTRINGS = [
    'Start free',
    '$1 free',
    'promotional API credit',
    'signup bonus',
  ] as const

  it('guest page does not contain any inactive-promo copy', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const pageText = document.body.textContent ?? ''
    for (const needle of FORBIDDEN_SUBSTRINGS) {
      expect(pageText).not.toContain(needle)
    }
  })

  it('authenticated page does not contain any inactive-promo copy', async () => {
    setAuthenticated(true)
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const pageText = document.body.textContent ?? ''
    for (const needle of FORBIDDEN_SUBSTRINGS) {
      expect(pageText).not.toContain(needle)
    }
  })

  it('guest primary CTA is Create an API key and points to /sign-up', async () => {
    renderPage()
    const heroCta = await screen.findAllByRole('button', {
      name: /Create an API key/,
    })
    expect(heroCta[0]).toHaveAttribute('href', '/sign-up')
  })

  it('authenticated primary CTA is Open Playground and points to /playground', async () => {
    setAuthenticated(true)
    renderPage()
    const heroCta = await screen.findAllByRole('button', {
      name: /Open Playground/,
    })
    expect(heroCta[0]).toHaveAttribute('href', '/playground')
  })

  it('guest UTM allowlist still strips sensitive parameters', async () => {
    renderPage(
      '/kimi-k3-api/?utm_source=launch&utm_campaign=kimi&email=a@b.com&api_key=sk-secret&redirect=%2Fevil&token=t-1'
    )
    const heroCta = await screen.findAllByRole('button', {
      name: /Create an API key/,
    })
    const href = String(heroCta[0].getAttribute('href'))
    expect(href).toContain('utm_source=launch')
    expect(href).toContain('utm_campaign=kimi')
    expect(href).not.toContain('email')
    expect(href).not.toContain('api_key')
    expect(href).not.toContain('redirect')
    expect(href).not.toContain('token')
  })
})

describe('price comparison', () => {
  it('labels every hero price as input or output for readers and screen readers', async () => {
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')

    const labeledAmounts = [
      { provider: 'Vancine', input: 'Input $2.40', output: 'Output $12.00' },
      {
        provider: 'OpenRouter',
        input: 'Input $3.00',
        output: 'Output $15.00',
      },
    ] as const

    for (const row of labeledAmounts) {
      const inputAmount = within(card).getByText(row.input)
      const outputAmount = within(card).getByText(row.output)
      const priceLine = inputAmount.closest('div') as HTMLElement

      expect(priceLine).not.toBeNull()
      expect(within(priceLine).getByRole('term')).toHaveTextContent(
        row.provider
      )
      expect(within(priceLine).getByRole('definition')).toContainElement(
        inputAmount
      )
      expect(within(priceLine).getByRole('definition')).toContainElement(
        outputAmount
      )
    }

    // The hero never shows a bare "$2.40 / $12.00" pair without labels.
    expect(card.textContent).not.toContain('$2.40 / $12.00')
    expect(card.textContent).not.toContain('$3.00 / $15.00')
    expect(within(card).getByText('USD per 1M tokens')).toBeInTheDocument()
  })

  it('shows the dated snapshot with Vancine cheaper than OpenRouter and Kimi official', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3 API price comparison',
    })

    const pageText = document.body.textContent ?? ''
    expect(pageText).toContain('$2.40')
    expect(pageText).toContain('$12.00')
    expect(pageText).toContain('$3.00')
    expect(pageText).toContain('$15.00')
    // Retired draft prices and the former 33% / 25% split must not return.
    for (const retired of [
      '$2.00',
      '$11.20',
      '$2.50',
      '$14.00',
      '33%',
      '25%',
      'up to 33%',
      'at least 20%',
    ]) {
      expect(pageText).not.toContain(retired)
    }
    expect(pageText).toContain('USD per 1M tokens')
    expect(pageText).toContain('Vancine is 20% lower on both input and output')
    expect(pageText).toContain('Current Vancine price')
    expect(pageText).toContain(
      'OpenRouter and Kimi official prices were snapshotted on September 9, 2026.'
    )
    expect(pageText).toContain(
      'OpenRouter figures are the standard prices returned by the OpenRouter Models API under default conditions.'
    )
    expect(pageText).toContain(
      'Free variants, promotional prices, cached input prices, and temporary provider discounts are excluded from this comparison.'
    )
    expect(pageText).not.toMatch(
      /Vancine is 20% lower on input · 20% lower on output/
    )
  })

  it('uses accessible names on the three pricing source links', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3 API price comparison',
    })

    const vancine = screen.getAllByRole('link', {
      name: /Vancine live Pricing/,
    })[0]
    expect(vancine).toHaveAttribute('href', '/pricing/kimi-k3')
    expect(vancine).not.toHaveAttribute('target')

    const official = screen.getAllByRole('link', {
      name: /Kimi official pricing/,
    })[0]
    expect(official).toHaveAttribute(
      'href',
      'https://platform.kimi.ai/docs/pricing/chat-k3'
    )
    expect(official).toHaveAttribute('target', '_blank')
    expect(official.getAttribute('rel')).toContain('noopener')
    expect(official.getAttribute('rel')).toContain('noreferrer')

    const openrouter = screen.getAllByRole('link', {
      name: /OpenRouter Models API/,
    })[0]
    expect(openrouter).toHaveAttribute(
      'href',
      'https://openrouter.ai/api/v1/models'
    )
    expect(openrouter).toHaveAttribute('target', '_blank')
    expect(openrouter.getAttribute('rel')).toContain('noopener')
    expect(openrouter.getAttribute('rel')).toContain('noreferrer')
  })

  it('renders the same providers, prices, and conclusions in the table and mobile cards', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3 API price comparison',
    })

    const cards = screen.getAllByTestId('kimi-k3-price-card')
    const table = screen.getByTestId('kimi-k3-price-table')
    expect(cards).toHaveLength(3)
    expect(table.tagName).toBe('TABLE')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)

    const expected = [
      {
        name: 'Vancine',
        input: '$2.40',
        output: '$12.00',
        difference: 'Current Vancine price',
      },
      {
        name: 'OpenRouter',
        input: '$3.00',
        output: '$15.00',
        difference: 'Vancine is 20% lower on both input and output',
      },
      {
        name: 'Kimi official',
        input: '$3.00',
        output: '$15.00',
        difference: 'Vancine is 20% lower on both input and output',
      },
    ] as const

    for (const [index, row] of expected.entries()) {
      expect(cards[index]).toHaveTextContent(row.name)
      expect(cards[index]).toHaveTextContent(row.input)
      expect(cards[index]).toHaveTextContent(row.output)
      expect(cards[index]).toHaveTextContent(row.difference)
      expect(table).toHaveTextContent(row.name)
      expect(table).toHaveTextContent(row.input)
      expect(table).toHaveTextContent(row.output)
      expect(table).toHaveTextContent(row.difference)
    }
  })
})

describe('evidence hierarchy', () => {
  it('leads with request success, returned model, tool calls, tests, and the public file', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Real Kimi K3 API test evidence',
    })
    const headline = screen.getByTestId('kimi-k3-evidence-headline')
    expect(headline).toHaveTextContent('HTTP 200')
    expect(headline).toHaveTextContent('kimi-k3')
    expect(headline).toHaveTextContent('PASS')
    expect(
      screen.getAllByRole('button', { name: /View public evidence file/ })
        .length
    ).toBeGreaterThanOrEqual(1)
  })

  it('keeps the single-run limitations next to the evidence', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Real Kimi K3 API test evidence',
    })
    const pageText = document.body.textContent ?? ''
    expect(pageText).toContain('single historical controlled run')
    expect(pageText).toContain('not a current price or credit commitment')
    expect(pageText).toContain('not an official Moonshot AI or Kimi service')
    expect(pageText).toContain(
      'Cline and Roo Code configurations are provided in the starter repository but have not been independently live-verified'
    )
    expect(pageText.toLowerCase()).not.toContain('99.9%')
    expect(pageText.toLowerCase()).not.toContain('production sla')
    expect(pageText.toLowerCase()).not.toContain('unlimited rate')
  })
})

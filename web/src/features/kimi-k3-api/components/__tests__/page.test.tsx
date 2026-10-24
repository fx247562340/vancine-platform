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

import type { PricingData, PricingModel } from '@/features/pricing/types'
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

const getPricingMock = vi.fn()
vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) => getPricingMock(...args),
}))

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

function tokenModel(
  overrides: Partial<PricingModel> & Pick<PricingModel, 'model_name'>
): PricingModel {
  return {
    id: 1,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

function fixturePricing(models: PricingModel[]): PricingData {
  return {
    success: true,
    data: models,
    vendors: [],
    group_ratio: { default: 1 },
    usable_group: { default: { desc: 'default', ratio: 1 } },
    supported_endpoint: {},
    auto_groups: [],
  }
}

function exprModel(name: string, expr: string, id: number): PricingModel {
  return tokenModel({
    id,
    model_name: name,
    billing_mode: 'tiered_expr',
    billing_expr: expr,
    model_ratio: 99,
    completion_ratio: 9,
    quota_type: 1,
  })
}

const LIVE_MODELS = [
  exprModel('kimi-k3.1-pro', 'tier("base", p * 1.6 + c * 8 + cr * 0.16)', 1),
  exprModel(
    'kimi-k3.1-pro-highspeed',
    'tier("base", p * 3.2 + c * 16 + cr * 0.16)',
    2
  ),
]

function renderPage(initialPath = '/kimi-k3-api/'): RenderResult & {
  queryClient: QueryClient
} {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return Object.assign(result, { queryClient })
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
  getPricingMock.mockReset()
  getPricingMock.mockResolvedValue(fixturePricing(LIVE_MODELS))
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
      'Kimi K3.1 Pro & Highspeed API for Coding Agents'
    )

    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(sections).toEqual([
      'Kimi K3.1 price comparison',
      'Historical Kimi K3 test record',
      'OpenAI-compatible quickstart',
      'Agent setup',
      'Frequently asked questions',
      'Get Kimi K3.1 Pro or Highspeed through an OpenAI-compatible API',
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

  it('keeps the hero price fact and CTA without any relationship disclaimer paragraph', async () => {
    renderPage()
    const [heading] = await screen.findAllByRole('heading', { level: 1 })
    const hero = heading.closest('section') as HTMLElement
    expect(hero).not.toBeNull()
    expect(hero).toHaveTextContent('kimi-k3.1-pro')
    expect(hero.textContent).not.toContain('OpenRouter')
    expect(
      within(hero).getByTestId('kimi-k3-hero-primary-cta')
    ).toBeInTheDocument()
    expect(hero.textContent).not.toMatch(
      /independent third-party|not an official|not guaranteed to match the official/
    )
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
      expect(pricingLink).toHaveAttribute('href', '/pricing/kimi-k3.1-pro')
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

    const question = 'Where can I confirm current Kimi K3.1 pricing?'
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
    await waitFor(() => {
      expect(card.textContent).toContain('Input $1.60')
    })

    expect(card.textContent).toContain('Output $8.00')
    expect(card.textContent).toContain('Input $2.00')
    expect(card.textContent).toContain('Output $10.00')
    expect(card.textContent).toContain('Vancine')
    expect(card.textContent).toContain('Kimi official')
    expect(card.textContent).not.toContain('OpenRouter')
    expect(card.textContent).not.toContain('$2.40')
    expect(card.textContent).not.toContain('$12.00')
    expect(within(card).getByText('USD per 1M tokens')).toBeInTheDocument()
    expect(card.textContent).toContain(
      'Input and output are 20% lower than the October 24, 2026 Kimi official reference. This is not a total-bill discount.'
    )
  })

  it('shows live Vancine prices with the dated Kimi official reference', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3.1 price comparison',
    })
    await waitFor(() => {
      expect(document.body.textContent ?? '').toContain('$1.60')
    })

    const pageText = document.body.textContent ?? ''
    expect(pageText).toContain('$8.00')
    expect(pageText).toContain('$2.00')
    expect(pageText).toContain('$10.00')
    expect(pageText).not.toContain('$2.40')
    expect(pageText).not.toContain('$12.00')
    expect(pageText).not.toContain('$3.00')
    expect(pageText).not.toContain('$15.00')
    expect(pageText).toContain('October 24, 2026')
    expect(pageText).toContain('Current Vancine price')
    expect(pageText).toContain(
      'Input and output are 20% lower than the October 24, 2026 Kimi official reference. This is not a total-bill discount.'
    )
    expect(pageText).toContain('$0.19')
    expect(pageText).toContain('kimi-k3')
    expect(pageText).not.toContain('Verified')
  })

  it('uses accessible names on the pricing source links for the selected model', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3.1 price comparison',
    })

    const vancine = screen.getAllByRole('link', {
      name: /Vancine live Pricing/,
    })[0]
    expect(vancine).toHaveAttribute('href', '/pricing/kimi-k3.1-pro')
    expect(vancine).not.toHaveAttribute('target')

    const official = screen.getAllByRole('link', {
      name: /Kimi official pricing/,
    })[0]
    expect(official).toHaveAttribute(
      'href',
      'https://platform.moonshot.ai/docs/pricing/chat'
    )
    expect(official).toHaveAttribute('target', '_blank')
    expect(official.getAttribute('rel')).toContain('noopener')
    expect(official.getAttribute('rel')).toContain('noreferrer')
    expect(
      screen.queryByRole('link', { name: /OpenRouter Models API/ })
    ).toBeNull()
  })

  it('renders the same providers, prices, and conclusions in the table and mobile cards', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Kimi K3.1 price comparison',
    })

    const cards = screen.getAllByTestId('kimi-k3-price-card')
    const table = screen.getByTestId('kimi-k3-price-table')
    expect(cards).toHaveLength(2)
    expect(table.tagName).toBe('TABLE')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)

    await waitFor(() => {
      expect(cards[0]).toHaveTextContent('$1.60')
    })

    const expected = [
      {
        name: 'Vancine',
        input: '$1.60',
        output: '$8.00',
        difference: 'Current Vancine price',
      },
      {
        name: 'Kimi official',
        input: '$2.00',
        output: '$10.00',
        difference:
          'Input and output are 20% lower than the October 24, 2026 Kimi official reference. This is not a total-bill discount.',
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

  it('syncs the pricing link, code example, and prices when the model changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('$1.60')
    expect(
      screen.getByText(
        (content) =>
          content.includes('"model": "kimi-k3.1-pro"') &&
          !content.includes('highspeed')
      )
    ).toBeInTheDocument()

    const highspeed = screen.getAllByTestId(
      'kimi-k31-hero-kimi-k3.1-pro-highspeed'
    )[0]
    await user.click(highspeed)

    await waitFor(() => {
      expect(document.body.textContent ?? '').toContain('$3.20')
    })
    expect(document.body.textContent ?? '').toContain('$16.00')
    expect(document.body.textContent ?? '').toContain('$4.00')
    expect(document.body.textContent ?? '').toContain('$20.00')
    expect(
      screen.getAllByRole('link', { name: /Vancine live Pricing/ })[0]
    ).toHaveAttribute('href', '/pricing/kimi-k3.1-pro-highspeed')
    expect(
      screen.getByText((content) =>
        content.includes('"model": "kimi-k3.1-pro-highspeed"')
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        (content) =>
          content.includes('"model": "kimi-k3.1-pro"') &&
          !content.includes('highspeed')
      )
    ).toBeNull()
    expect(
      screen.getAllByText('kimi-k3.1-pro-highspeed').length
    ).toBeGreaterThan(0)
  })

  it('hides the discount when the live expression does not match the reference', async () => {
    getPricingMock.mockResolvedValue(
      fixturePricing([
        exprModel(
          'kimi-k3.1-pro',
          'tier("base", p * 1.5 + c * 8 + cr * 0.16)',
          1
        ),
      ])
    )
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')
    await waitFor(() => {
      expect(card.textContent).toContain('$1.50')
    })
    expect(card.textContent).not.toContain('20% lower')
    expect(document.body.textContent ?? '').toContain(
      'Discount not confirmed against the dated official reference'
    )
  })

  it('does not invent a price for an unsupported expression', async () => {
    getPricingMock.mockResolvedValue(
      fixturePricing([
        exprModel('kimi-k3.1-pro', 'tier("base", p * 1.6 + c * 8) * 2', 1),
      ])
    )
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')
    await waitFor(() => {
      expect(card.textContent).toContain('Dynamic Pricing')
    })
    expect(card.textContent).not.toContain('$1.60')
    expect(card.textContent).not.toContain('$198.00')
    expect(card.textContent).not.toContain('20% lower')
  })

  it('does not fall back to the retired static Vancine price while loading', async () => {
    getPricingMock.mockReturnValue(new Promise(() => {}))
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')
    expect(card.textContent).toContain('Loading')
    expect(card.textContent).not.toContain('$2.40')
    expect(card.textContent).not.toContain('$12.00')
    expect(card.textContent).toContain('Input $2.00')
    expect(card.textContent).not.toContain('20% lower')
  })

  it('does not fall back to the retired static Vancine price on pricing error', async () => {
    getPricingMock.mockRejectedValue(new Error('pricing down'))
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')
    await waitFor(() => {
      expect(card.textContent).toContain('View live pricing')
    })
    expect(card.textContent).not.toContain('$2.40')
    expect(card.textContent).not.toContain('$12.00')
    expect(card.textContent).not.toContain('$1.60')
    expect(card.textContent).not.toContain('20% lower')
  })

  it('does not fall back to a static Vancine price when the selected model is missing', async () => {
    getPricingMock.mockResolvedValue(fixturePricing([]))
    renderPage()
    const card = await screen.findByTestId('kimi-k3-hero-price-card')
    await waitFor(() => {
      expect(card.textContent).toContain('View live pricing')
    })
    expect(card.textContent).not.toContain('$1.60')
    expect(card.textContent).not.toContain('$2.40')
    expect(card.textContent).not.toContain('20% lower')
  })

  it('uses a single pricing query when the model changes', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderPage()
    await waitFor(() => {
      expect(document.body.textContent ?? '').toContain('$1.60')
    })
    await user.click(
      screen.getAllByTestId('kimi-k31-hero-kimi-k3.1-pro-highspeed')[0]
    )
    await waitFor(() => {
      expect(document.body.textContent ?? '').toContain('$3.20')
    })
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ['pricing'] })
    ).toHaveLength(1)
    expect(getPricingMock).toHaveBeenCalledTimes(1)
  })
})

describe('evidence hierarchy', () => {
  it('leads with request success, returned model, tool calls, tests, and the public file', async () => {
    renderPage()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Historical Kimi K3 test record',
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
      name: 'Historical Kimi K3 test record',
    })
    const pageText = document.body.textContent ?? ''
    expect(pageText).toContain('single historical controlled run')
    expect(pageText).toContain('not a current price or credit commitment')
    expect(pageText).toContain(
      'Cline and Roo Code configurations in the starter repository have not been independently live-verified'
    )
    expect(pageText).toContain('retired model kimi-k3')
    expect(pageText).toContain(
      'not a verification of kimi-k3.1-pro or kimi-k3.1-pro-highspeed'
    )
    // The relationship caveat is no longer published, and the page never
    // claims an official relationship either.
    expect(pageText).not.toMatch(
      /not an official Moonshot|independent third-party API/i
    )
    expect(pageText).not.toMatch(/is an official (?:Moonshot|Kimi)/i)
    expect(pageText.toLowerCase()).not.toContain('99.9%')
    expect(pageText.toLowerCase()).not.toContain('production sla')
    expect(pageText.toLowerCase()).not.toContain('unlimited rate')
  })
})

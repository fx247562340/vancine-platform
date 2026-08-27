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

For commercial licensing, please contact support@quantumnous.com.
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
  cleanup,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { Route as OpenRouterAlternativeRouteImport } from '@/routes/openrouter-alternative/index'
import { useAuthStore } from '@/stores/auth-store'

type AuthStoreAuth = ReturnType<typeof useAuthStore.getState>['auth']

// ---------------------------------------------------------------------------
// Independent i18n instance — never touches the shared global singleton, so
// language/resource changes here can never leak into another test file.
// ---------------------------------------------------------------------------
const testI18n = i18n.createInstance()

let i18nReady: Promise<unknown> | null = null

async function ensureI18n(): Promise<unknown> {
  if (!i18nReady) {
    i18nReady = testI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: enLocale.translation },
      },
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
  return i18nReady
}

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

// Capture analytics emissions.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// Build a real router around the ACTUAL openrouter-alternative route
// module so the page renders exactly as wired in routeTree.gen.ts, with
// stub destinations for every internal link target.
const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestOpenRouterAlternativeRoute = OpenRouterAlternativeRouteImport.update({
  id: '/openrouter-alternative/',
  path: '/openrouter-alternative/',
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
  TestOpenRouterAlternativeRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/docs/$slug', 'docs-page'),
])

function renderPage(initialPath = '/openrouter-alternative/'): RenderResult {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
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

let authBeforeTest: AuthStoreAuth

beforeEach(async () => {
  authBeforeTest = useAuthStore.getState().auth
  await ensureI18n()
  setAuthenticated(false)
  trackEventMock.mockClear()
})

afterEach(() => {
  cleanup()
  useAuthStore.setState({ auth: authBeforeTest })
  vi.restoreAllMocks()
})

describe('openrouter-alternative page structure', () => {
  it('renders exactly one h1 and all required sections', async () => {
    await renderPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'OpenRouter Alternative for Chinese AI Models'
    )

    for (const section of [
      'What you get',
      'Price comparison: Vancine vs. OpenRouter',
      'Why a smaller catalog',
      'Current flagship coverage',
      'Migrate from OpenRouter today',
      'Frequently asked questions',
      'Try the Vancine catalog today',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })

  it('renders the four flagship evidence cards', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    for (const cardTitle of [
      '20% lower on four flagship paid listings',
      'No top-up platform fee',
      'OpenAI-compatible',
      'Curated and continuously refreshed catalog',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: cardTitle })
      ).toBeInTheDocument()
    }
  })
})

describe('price comparison table', () => {
  it('renders exactly four comparison rows with the published prices', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const table = await screen.findByRole('table')
    const cells = [...table.querySelectorAll('tbody tr')]

    expect(cells).toHaveLength(4)

    // Each row is asserted by its full row text so the test does not lock
    // the cell ordering or the saving-percentage presentation.
    const expected: ReadonlyArray<{
      model: string
      vancine: string
      openrouter: string
    }> = [
      {
        model: 'qwen3.8-max',
        vancine: '$1.60 / $4.80',
        openrouter: '$2.00 / $6.00',
      },
      {
        model: 'kimi-k3',
        vancine: '$2.40 / $12.00',
        openrouter: '$3.00 / $15.00',
      },
      {
        model: 'glm-5.3',
        vancine: '$1.12 / $3.52',
        openrouter: '$1.40 / $4.4',
      },
      {
        model: 'MiniMax-M3',
        vancine: '$0.24 / $0.96',
        openrouter: '$0.30 / $1.20',
      },
    ]
    for (const row of expected) {
      const rowText = cells.find((tr) =>
        tr.textContent?.includes(row.model)
      )?.textContent
      expect(rowText).toContain(row.model)
      expect(rowText).toContain(row.vancine)
      expect(rowText).toContain(row.openrouter)
      // Every row shows a saving of 20%.
      expect(rowText).toMatch(/20\s*%/)
    }
  })

  it('renders the verification date and pricing disclaimers', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Last verified: August 27, 2026.')
    expect(text).toContain('/api/pricing')
    expect(text).toMatch(/free variants|promotional routes|provider discounts/i)
  })

  it('never advertises deepseek-v4-flash in the comparison table', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const table = screen.getByRole('table')
    expect(table.textContent ?? '').not.toContain('deepseek-v4-flash')
  })

  it('never makes an "all models are cheaper" absolute claim', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const forbidden of [
      'all models are cheaper',
      'cheaper for every model',
      'cheaper than every model',
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('renders comparison branches in the DOM', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    // Desktop <table> is rendered (always present in the DOM; visibility is
    // controlled by Tailwind at runtime). Mobile card list is also rendered.
    expect(screen.getByRole('table')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(4)
  })
})

describe('CTA destinations and UTM safety', () => {
  it('points guest CTAs at /sign-up and keeps only allowlisted UTM parameters', async () => {
    await renderPage(
      '/openrouter-alternative/?utm_source=launch&utm_campaign=openrouter_alt&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroCta = (
      await screen.findAllByRole('button', {
        name: /Create an API key/,
      })
    )[0]
    expect(heroCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=openrouter_alt'
    )
    expect(String(heroCta.getAttribute('href'))).not.toContain('email')
    expect(String(heroCta.getAttribute('href'))).not.toContain('api_key')
    expect(String(heroCta.getAttribute('href'))).not.toContain('redirect')

    // Every guest CTA on the page (hero, quickstart, final) renders
    // the same "Create an API key" label and points at /sign-up. The
    // destination and label share a single source of truth in
    // getOpenRouterAlternativeCtaTarget / getOpenRouterAlternativeCtaLabelKey.
    const guestCtas = await screen.findAllByRole('button', {
      name: /Create an API key/,
    })
    expect(guestCtas.length).toBeGreaterThanOrEqual(2)
    for (const cta of guestCtas) {
      expect(cta).toHaveAttribute(
        'href',
        '/sign-up?utm_source=launch&utm_campaign=openrouter_alt'
      )
    }
  })

  it('points authenticated CTAs at /playground with the matching label', async () => {
    setAuthenticated(true)
    await renderPage('/openrouter-alternative/?utm_source=launch&token=abc')

    // The hero and the quickstart primary CTAs must both be the
    // "Open Playground" button and must both point at /playground
    // (the label and the destination share a single source of truth).
    const openPlaygroundButtons = await screen.findAllByRole('button', {
      name: /Open Playground/,
    })
    expect(openPlaygroundButtons.length).toBeGreaterThanOrEqual(2)
    for (const cta of openPlaygroundButtons) {
      expect(cta).toHaveAttribute('href', '/playground?utm_source=launch')
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })
})

describe('quickstart examples', () => {
  it('switches between cURL, Python, and Node.js examples', async () => {
    const user = userEvent.setup()
    await renderPage()

    await screen.findByRole('heading', {
      level: 2,
      name: 'Migrate from OpenRouter today',
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'cURL',
      'Python',
      'Node.js',
    ])

    expect(
      (await screen.findAllByText(/qwen3.8-max/)).length
    ).toBeGreaterThanOrEqual(1)
    expect(await screen.findByText(/v1\/chat\/completions/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Python' }))
    expect(
      await screen.findByText(/os\.environ\[?"VANCINE_API_KEY"?\]/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Node.js' }))
    expect(
      await screen.findByText(/process\.env\.VANCINE_API_KEY/)
    ).toBeInTheDocument()
  })

  it('uses https://vancine.com/v1 as the base URL and never embeds a real API key', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = document.body.textContent ?? ''
    expect(text).toContain('https://vancine.com/v1')
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{16,}/)
  })

  it('exposes a copy button whose aria-label includes the example label after switching tabs', async () => {
    const user = userEvent.setup()
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    // The Tabs widget only mounts the active tab's content, so we
    // walk the three tabs and assert the aria-label of the copy
    // button inside each one names the active example.
    for (const lang of ['cURL', 'Python', 'Node.js']) {
      await user.click(screen.getByRole('tab', { name: lang }))
      const copyButton = await screen.findByRole('button', {
        name: new RegExp(`Copy example code to clipboard \\(${lang}\\)`),
      })
      expect(copyButton).toBeInTheDocument()
    }
  })
})

describe('FAQ keyboard accessibility', () => {
  it('expands an answer through keyboard interaction', async () => {
    const user = userEvent.setup()
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    await screen.findByRole('heading', {
      level: 2,
      name: 'Frequently asked questions',
    })
    const trigger = screen.getByRole('button', {
      name: /Is the Vancine API OpenAI-compatible\?/,
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      await screen.findByText(
        /Yes\. The Vancine API follows the OpenAI chat completions contract/
      )
    ).toBeInTheDocument()
  })
})

describe('internal links', () => {
  it('exposes internal links to /sign-up, /pricing, and /docs without UTM', async () => {
    await renderPage(
      '/openrouter-alternative/?utm_source=launch&utm_medium=cpc'
    )
    await screen.findByRole('heading', { level: 1 })

    const pricingLinks = screen.getAllByRole('button', {
      name: /View pricing|View live pricing/,
    })
    for (const link of pricingLinks) {
      const href = String(link.getAttribute('href'))
      expect(href).toMatch(/^\/pricing/)
      expect(href).not.toContain('utm_source')
      expect(href).not.toContain('utm_medium')
    }

    const docsLinks = await screen.findAllByRole('button', {
      name: /Read API documentation/,
    })
    for (const link of docsLinks) {
      const href = String(link.getAttribute('href'))
      expect(href).toMatch(/^\/docs\//)
      expect(href).not.toContain('utm_source')
    }
  })

  it('links the glm-5.3 model name to the /glm-5-3-api page', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const glmLink = screen.getByRole('link', {
      name: 'GLM-5.3 and GLM-5.3 Flash pricing',
    })
    expect(glmLink.getAttribute('href')).toBe('/glm-5-3-api')
  })
})

describe('metadata owner', () => {
  it('writes the canonical, og:url, and title to the document head', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    // The page is mounted with publicMarketingPage: true, so its
    // metadata is the active owner. Each value must be the literal
    // English string from getOpenRouterAlternativePageMetadata('en').
    expect(document.title).toBe(
      'OpenRouter Alternative for Chinese AI Models | Vancine'
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/openrouter-alternative')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/openrouter-alternative')
  })

  it('leaves no publicMarketingPage metadata on the head after unmount', async () => {
    const { unmount } = await renderPage()
    await screen.findByRole('heading', { level: 1 })

    // The page is mounted with publicMarketingPage: true, so the
    // active owner is the page's metadata.
    expect(document.title).toBe(
      'OpenRouter Alternative for Chinese AI Models | Vancine'
    )

    unmount()

    // After the page unmounts the owner registry is empty, the head
    // returns to the captured baseline, and the public-marketing
    // lock is released so safeApplySystemName can write the system
    // branding again. The title in particular must no longer carry
    // the marketing title.
    expect(document.title).not.toBe(
      'OpenRouter Alternative for Chinese AI Models | Vancine'
    )
  })
})

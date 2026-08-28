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
  act,
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

import {
  GLM53_API_COMPARISON_ROWS,
  GLM53_API_EVIDENCE_KEYS,
  getGlm53ApiPageMetadata,
} from '@/features/glm-5-3-api/lib/glm-5-3-api'
import {
  isPublicMarketingMetadataActive,
  resetMetadataRegistry,
  safeApplySystemName,
} from '@/hooks/use-page-metadata'
import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { Route as Glm53ApiRouteImport } from '@/routes/glm-api/index'
import { useAuthStore } from '@/stores/auth-store'

type AuthStoreAuth = ReturnType<typeof useAuthStore.getState>['auth']

// ---------------------------------------------------------------------------
// Independent i18n instance — never touches the shared global singleton.
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

// Isolate the page from the full site header; PublicLayout degrades to a
// plain wrapper.
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

// Build a real router around the ACTUAL glm-api route module so the
// page renders exactly as wired in routeTree.gen.ts, plus the real
// /openrouter-alternative page for the internal-link contract.
const testRootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <div data-testid='root-route-fallback' />,
})
const TestGlm53ApiRoute = Glm53ApiRouteImport.update({
  id: '/glm-api/',
  path: '/glm-api/',
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
  TestGlm53ApiRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/docs/$slug', 'docs-page'),
  stubRoute('/openrouter-alternative', 'openrouter-alternative-page'),
])

function renderPage(initialPath = '/glm-api/'): RenderResult {
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
  actResetMetadata()
})

function actResetMetadata(): void {
  // The metadata registry is module-global; reset between tests so the
  // lock state of one page never leaks into the next.
  resetMetadataRegistry()
}

afterEach(() => {
  cleanup()
  useAuthStore.setState({ auth: authBeforeTest })
  vi.restoreAllMocks()
  actResetMetadata()
})

describe('glm-api page structure', () => {
  it('renders the route with exactly one h1 naming both models', async () => {
    renderPage('/glm-api/')

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('GLM-5.3 and GLM-5.3 Flash API')

    // Both model ids must be visible somewhere on the page.
    const body = document.body.textContent ?? ''
    expect(body).toContain('glm-5.3')
    expect(body).toContain('glm-5.3-flash')
  })

  it('renders all required sections', async () => {
    renderPage()

    for (const section of [
      'Choose your model',
      'Exact pricing: Vancine vs. OpenRouter',
      'Quickstart',
      'Frequently asked questions',
    ]) {
      expect(
        await screen.findByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })

  it('renders the two model guidance cards', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'glm-5.3 for flagship capability',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'glm-5.3-flash for lower token cost',
      })
    ).toBeInTheDocument()
    // No untested speed claims for flash.
    expect(document.body.textContent ?? '').not.toMatch(/flash is faster/i)
  })
})

describe('price comparison table and mobile cards', () => {
  // rev1 semantics: every amount must be attributable to Vancine or
  // OpenRouter from the table's own structure — no unlabeled "$x / $y"
  // cells and no reliance on a legend outside the table.
  const EXPECTED_ROWS = [
    ['glm-5.3', 'Input', '$1.12', '$1.40'],
    ['glm-5.3', 'Output', '$3.52', '$4.40'],
    ['glm-5.3', 'Cache read', '$0.208', '$0.26'],
    ['glm-5.3-flash', 'Input', '$0.06', '$0.075'],
    ['glm-5.3-flash', 'Output', '$0.20', '$0.25'],
    ['glm-5.3-flash', 'Cache read', '$0.012', '$0.015'],
  ] as const

  it('names attribution columns so no amount depends on an external legend', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const table = (await screen.findByRole('table')) as HTMLTableElement
    const headers = [...table.querySelectorAll('thead th')].map((th) =>
      th.textContent?.trim()
    )
    expect(headers).toEqual([
      'Model',
      'Dimension',
      'Vancine',
      'OpenRouter',
      'Saving',
      'Source',
    ])

    // No merged, unlabeled amount pair anywhere in the table.
    expect(table.textContent).not.toMatch(/\$\d+(\.\d+)?\s*\/\s*\$\d+/)
    expect(table.textContent).not.toContain('deepseek-v4-flash')
  })

  it('renders one self-contained row per model × dimension with attributed amounts', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const table = (await screen.findByRole('table')) as HTMLTableElement
    const rows = [...table.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(EXPECTED_ROWS.length)

    for (const [model, dimension, vancine, openrouter] of EXPECTED_ROWS) {
      const row = rows.find((tr) => {
        const cells = tr.querySelectorAll('th, td')
        return (
          cells[0]?.textContent?.trim() === model &&
          cells[1]?.textContent?.trim() === dimension
        )
      })
      expect(row, `row for ${model} / ${dimension} must exist`).toBeDefined()
      if (row === undefined) {
        throw new Error(`row for ${model} / ${dimension} must exist`)
      }
      const cells = [...row.querySelectorAll('th, td')]
      // Vancine amount sits under the Vancine column, OpenRouter under
      // the OpenRouter column — a screen reader announces each with its
      // column header.
      expect(cells[2].textContent).toContain(vancine)
      expect(cells[3].textContent).toContain(openrouter)
      expect(cells[4].textContent).toMatch(/20\s*%/)
      // The source column carries the model's OpenRouter listing link.
      const sourceLink = cells[5].querySelector('a')
      expect(sourceLink).not.toBeNull()
      expect(sourceLink?.getAttribute('href')).toMatch(
        /^https:\/\/openrouter\.ai\//
      )
    }
  })

  it('mobile cards attribute every dimension amount to Vancine, OpenRouter and Saving separately', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const cards = screen.getAllByTestId('glm53-comparison-card')
    expect(cards).toHaveLength(GLM53_API_COMPARISON_ROWS.length)

    for (const card of cards) {
      const text = card.textContent ?? ''
      for (const dimension of ['Input', 'Output', 'Cache read']) {
        expect(text).toContain(dimension)
      }
      // Three dimensions, each with its own labeled Vancine / OpenRouter /
      // Saving values — never a merged "$x / $y" pair.
      expect((text.match(/Vancine/g) ?? []).length).toBeGreaterThanOrEqual(3)
      expect((text.match(/OpenRouter/g) ?? []).length).toBeGreaterThanOrEqual(3)
      expect((text.match(/Saving/g) ?? []).length).toBeGreaterThanOrEqual(3)
      expect(text).not.toMatch(/\$\d+(\.\d+)?\s*\/\s*\$\d+/)
      expect(text).toMatch(/20\s*%/)
    }
  })

  it('renders the verified date, comparison scope, and live-pricing links', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Last verified: August 27, 2026.')
    expect(text).toContain(
      'The OpenRouter comparison uses the linked standard paid listings; free variants, promotions, and temporary provider discounts are excluded.'
    )
    expect(text).toContain(
      'Vancine is 20% lower than OpenRouter on these two standard paid model listings.'
    )

    // Live pricing link points at the internal /pricing route.
    const pricingLinks = screen.getAllByRole('link', { name: /View pricing/ })
    expect(pricingLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of pricingLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/pricing/)
    }

    // Every OpenRouter source link is present with safe external attrs.
    // Visibility is CSS-only, so the DOM carries the desktop table's
    // link in each of the 3 dimension rows per model plus the mobile
    // card's link per model: 2 models x (3 + 1) = 8.
    const sourceLinks = screen.getAllByTestId('glm53-source-link')
    expect(sourceLinks).toHaveLength(GLM53_API_COMPARISON_ROWS.length * 4)
    for (const link of sourceLinks) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/openrouter\.ai\//)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
  })

  it('renders mobile comparison cards alongside the desktop table', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByRole('table')).toBeInTheDocument()
    const cards = screen.getAllByTestId('glm53-comparison-card')
    expect(cards).toHaveLength(GLM53_API_COMPARISON_ROWS.length)
    for (const card of cards) {
      expect(card.textContent).toMatch(/20\s*%/)
    }
  })
})

describe('quickstart', () => {
  it('switches between Python and cURL examples and shows both model ids', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Quickstart' })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Python', 'cURL'])

    // The default example must show glm-5.3 and the one-line switch hint.
    const switchHint = await screen.findByText(
      /Default model glm-5\.3 — switch to glm-5\.3-flash by changing only the model id\./
    )
    expect(switchHint).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'cURL' }))
    expect(
      await screen.findByText(
        /curl -X POST https:\/\/vancine\.com\/v1\/chat\/completions/
      )
    ).toBeInTheDocument()
  })

  it('never embeds a real API key and reads only VANCINE_API_KEY', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = document.body.textContent ?? ''
    expect(text).toContain('VANCINE_API_KEY')
    expect(text).toContain('https://vancine.com/v1')
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{16,}/)
  })

  it('renders the translated quickstart intro body, never the raw i18n key', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Quickstart' })

    // The full intro body is registered in GLM53_API_EVIDENCE_KEYS and
    // translated in all seven locales; the page must render that
    // translated value, not a missing-key fallback.
    const quickstartBodyKey = GLM53_API_EVIDENCE_KEYS.find((key) =>
      key.startsWith('Point your OpenAI SDK or curl at https://vancine.com/v1')
    )
    expect(quickstartBodyKey).toBeDefined()
    if (quickstartBodyKey === undefined) {
      throw new Error('the quickstart body key must be registered')
    }

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Quickstart body')
    expect(text).toContain(quickstartBodyKey)
  })
})

describe('CTA destinations and UTM safety', () => {
  it('points guest CTAs at /sign-up keeping only allowlisted UTM parameters', async () => {
    renderPage(
      '/glm-api/?utm_source=launch&utm_campaign=glm&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const guestCtas = await screen.findAllByRole('button', {
      name: /Create an API key/,
    })
    expect(guestCtas.length).toBeGreaterThanOrEqual(2)
    for (const cta of guestCtas) {
      expect(cta).toHaveAttribute(
        'href',
        '/sign-up?utm_source=launch&utm_campaign=glm'
      )
      const href = String(cta.getAttribute('href'))
      expect(href).not.toContain('email')
      expect(href).not.toContain('api_key')
      expect(href).not.toContain('redirect')
    }
  })

  it('points authenticated CTAs at /playground with the matching label', async () => {
    setAuthenticated(true)
    renderPage('/glm-api/?utm_source=launch&token=abc')

    const openPlaygroundButtons = await screen.findAllByRole('button', {
      name: /Open Playground/,
    })
    expect(openPlaygroundButtons.length).toBeGreaterThanOrEqual(2)
    for (const cta of openPlaygroundButtons) {
      expect(cta).toHaveAttribute('href', '/playground?utm_source=launch')
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })

  it('re-renders the CTA when the auth store user changes after mount', async () => {
    // Regression guard for the field-level auth selector: the page
    // subscribes to state.auth.user only, so flipping the user while
    // mounted must still switch the CTA label and destination.
    renderPage('/glm-api/')

    const guestCta = (
      await screen.findAllByRole('button', { name: /Create an API key/ })
    )[0] as HTMLElement
    expect(guestCta.getAttribute('href')).toBe('/sign-up')

    act(() => {
      setAuthenticated(true)
    })

    const authCtas = await screen.findAllByRole('button', {
      name: /Open Playground/,
    })
    expect(authCtas.length).toBeGreaterThanOrEqual(2)
    for (const cta of authCtas) {
      expect(cta).toHaveAttribute('href', '/playground')
    }
    expect(
      screen.queryAllByRole('button', { name: /Create an API key/ })
    ).toHaveLength(0)

    act(() => {
      setAuthenticated(false)
    })
    const backToGuest = await screen.findAllByRole('button', {
      name: /Create an API key/,
    })
    expect(backToGuest.length).toBeGreaterThanOrEqual(2)
    for (const cta of backToGuest) {
      expect(cta).toHaveAttribute('href', '/sign-up')
    }
  })
})

describe('internal links', () => {
  it('links to /pricing, /docs/chat, and /openrouter-alternative', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const hrefs = [...document.querySelectorAll('a[href]')].map((a) =>
      a.getAttribute('href')
    )
    expect(hrefs.some((h) => h?.startsWith('/pricing'))).toBe(true)
    expect(hrefs.some((h) => h === '/docs/chat')).toBe(true)
    expect(hrefs.some((h) => h === '/openrouter-alternative')).toBe(true)
  })
})

describe('restrained claims on the rendered page', () => {
  it('never renders absolute pricing or superiority claims', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const forbidden of [
      'all models are cheaper',
      'always 20%',
      'always cheaper',
      'cheapest',
      'fastest',
      'deepseek-v4-flash',
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('discloses provider-specific error differences', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(document.body.textContent).toContain(
      'Provider-specific errors may differ'
    )
  })
})

describe('metadata owner', () => {
  it('writes the approved metadata into the document head', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const expected = getGlm53ApiPageMetadata('en')
    expect(document.title).toBe(expected.title)
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/glm-api')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/glm-api')
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
    ).toBe(expected.description)
  })

  it('holds the public marketing lock while mounted and releases it on unmount', async () => {
    const { unmount } = renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(isPublicMarketingMetadataActive()).toBe(true)
    // The branding bootstrap must be refused while the page is mounted.
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(getGlm53ApiPageMetadata('en').title)

    unmount()
    // After unmount the lock releases and branding is allowed again.
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe('Acme Cloud')
  })
})

describe('retired GLM public paths', () => {
  it.each([['/glm-5-3-api'], ['/glm-5.3-api']])(
    'renders no GLM page for %s (retired from the route tree)',
    async (retiredPath) => {
      // Each case gets a fresh router that boots directly on the retired
      // URL — the user-observable seam of typing an old version-specific
      // address. With both retired route files deleted, the router must
      // land on its not-found fallback and never mount the GLM page.
      const router = createRouter({
        routeTree: testRouteTree,
        history: createMemoryHistory({ initialEntries: [retiredPath] }),
      })
      render(
        <I18nextProvider i18n={testI18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      )

      await screen.findByTestId('root-route-fallback')

      expect(router.state.location.pathname).toBe(retiredPath)
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
      expect(screen.queryByTestId('glm53-comparison-table')).toBeNull()
      expect(screen.queryByTestId('glm53-comparison-card')).toBeNull()
    }
  )
})

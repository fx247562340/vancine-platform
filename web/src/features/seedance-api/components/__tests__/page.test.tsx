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
  cleanup,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { Route as SeedanceApiRouteImport } from '@/routes/seedance-api/index'
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

// Build a real router around the ACTUAL seedance-api route module so the page
// renders exactly as wired in routeTree.gen.ts, with stub destinations for
// every internal link target.
const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestSeedanceRoute = SeedanceApiRouteImport.update({
  id: '/seedance-api/',
  path: '/seedance-api/',
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
  TestSeedanceRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/docs/$slug', 'docs-page'),
])

function renderPage(initialPath = '/seedance-api/'): RenderResult {
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

// Capture the auth state before each test so afterEach can restore it exactly.
let authBeforeTest: AuthStoreAuth

beforeEach(async () => {
  authBeforeTest = useAuthStore.getState().auth
  await ensureI18n()
  setAuthenticated(false)
  trackEventMock.mockClear()
})

afterEach(() => {
  // 1. Unmount React tree FIRST. Restoring the auth store while components
  //    are still mounted would trigger state updates on unmounted trees and
  //    produce act() warnings.
  cleanup()
  // 2. Restore the auth store to its pre-test state.
  useAuthStore.setState({ auth: authBeforeTest })
  // 3. Unconditional clipboard restoration: success, failure, and thrown
  //    assertions all land here.
  if (originalClipboardDescriptor === undefined) {
    delete (navigator as { clipboard?: unknown }).clipboard
  } else {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
  }
  // 4. Restore every spy installed by a case (console.warn/error suppression,
  //    clipboard mocks, ...).
  vi.restoreAllMocks()
})

describe('seedance-api page structure', () => {
  it('renders exactly one h1 and all required sections', async () => {
    await renderPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Seedance 2.5 API for Async Video Generation'
    )

    for (const section of [
      'How async video generation works',
      'Quickstart',
      'Frequently asked questions',
      'Build your first Seedance 2.5 video today',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })

  it('renders the three async-workflow steps', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    for (const step of ['Submit', 'Poll', 'Result']) {
      expect(
        screen.getByRole('heading', { level: 3, name: step })
      ).toBeInTheDocument()
    }
  })
})

describe('CTA destinations and UTM safety', () => {
  it('points guest CTAs at /sign-up and keeps only allowlisted UTM parameters', async () => {
    await renderPage(
      '/seedance-api/?utm_source=launch&utm_campaign=seedance&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroCta = await screen.findByRole('button', {
      name: /Create account/,
    })
    expect(heroCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=seedance'
    )
    expect(String(heroCta.getAttribute('href'))).not.toContain('email')
    expect(String(heroCta.getAttribute('href'))).not.toContain('api_key')
    expect(String(heroCta.getAttribute('href'))).not.toContain('redirect')

    const finalCta = await screen.findByRole('button', {
      name: /Get started with Vancine/,
    })
    expect(finalCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=seedance'
    )
  })

  it('points authenticated CTAs at /playground', async () => {
    setAuthenticated(true)
    await renderPage('/seedance-api/?utm_source=launch&token=abc')

    // Both the hero and the final CTA show the authenticated label.
    const ctas = await screen.findAllByRole('button', {
      name: /Go to Playground/,
    })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/playground?utm_source=launch')
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })
})

describe('real navigation after click', () => {
  it('guest clicking Hero CTA navigates to /sign-up', async () => {
    const user = userEvent.setup()
    await renderPage('/seedance-api/?utm_source=launch')
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: /Create account/ }))
    expect(await screen.findByTestId('sign-up-page')).toBeInTheDocument()
  })

  it('authenticated clicking CTA navigates to /playground', async () => {
    const user = userEvent.setup()
    setAuthenticated(true)
    await renderPage('/seedance-api/?utm_source=launch')
    await screen.findByRole('heading', { level: 1 })

    const ctas = await screen.findAllByRole('button', {
      name: /Go to Playground/,
    })
    await user.click(ctas[0])
    expect(await screen.findByTestId('playground-page')).toBeInTheDocument()
  })

  it('clicking Docs navigates to the docs page', async () => {
    const user = userEvent.setup()
    await renderPage('/seedance-api/')
    await screen.findByRole('heading', { level: 1 })

    await user.click(
      screen.getAllByRole('button', { name: /Read API documentation/ })[0]
    )
    expect(await screen.findByTestId('docs-page')).toBeInTheDocument()
  })

  it('clicking Pricing navigates to the pricing page', async () => {
    const user = userEvent.setup()
    await renderPage('/seedance-api/')
    await screen.findByRole('heading', { level: 1 })

    await user.click(
      screen.getAllByRole('button', {
        name: /View pricing|View live pricing/,
      })[0]
    )
    expect(await screen.findByTestId('pricing-page')).toBeInTheDocument()
  })
})

describe('quickstart examples', () => {
  it('switches between cURL, Python, and Node.js examples', async () => {
    const user = userEvent.setup()
    await renderPage()

    await screen.findByRole('heading', {
      level: 2,
      name: 'Quickstart',
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'cURL',
      'Python',
      'Node.js',
    ])

    const matches = await screen.findAllByText(/Doubao-Seedance-2.5/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(
      await screen.findByText(/v1\/video\/generations/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Python' }))
    expect(
      await screen.findByText(/os\.environ\['VANCINE_API_KEY'\]/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Node.js' }))
    expect(
      await screen.findByText(/process\.env\.VANCINE_API_KEY/)
    ).toBeInTheDocument()
  })

  it('contains no Seedance 1.5 / 2.0 ids, no fixed prices, no hardcoded keys', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('Seedance-1.5')
    expect(pageText).not.toContain('Seedance-2.0')
    expect(pageText).not.toContain('Seedance-1.5-pro')
    expect(pageText).not.toContain('sk-')
    expect(pageText).not.toContain('$0.')
    expect(pageText).not.toContain('1280x720')
  })

  it('announces copy success accessibly', async () => {
    const user = userEvent.setup()

    const clipboardSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardSpy },
    })

    await renderPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: /Copy example code to clipboard/,
    })
    await user.click(copyButtons[0])
    expect(clipboardSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText('Code copied')).toBeInTheDocument()
    })
  })

  it('announces copy failure accessibly when every clipboard path fails', async () => {
    const user = userEvent.setup()

    // The production copy path logs diagnostics on failure; silence them with
    // case-local spies (restored before the case ends) so stderr stays clean.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Rejected clipboard API plus jsdom's missing document.execCommand means
    // every copy path fails — the hook must still announce the error.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    await renderPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: /Copy example code to clipboard/,
    })
    await user.click(copyButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Unable to copy code')).toBeInTheDocument()
    })

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

describe('link safety', () => {
  it('uses same-origin routes for Docs and Pricing without target=_blank', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })

    const docsLinks = await screen.findAllByRole('button', {
      name: /Read API documentation|View quickstart/,
    })
    for (const link of docsLinks) {
      expect(String(link.getAttribute('href'))).toMatch(/^\/docs\//)
      expect(link).not.toHaveAttribute('target')
    }

    const pricingLinks = await screen.findAllByRole('button', {
      name: /View pricing|View live pricing/,
    })
    for (const link of pricingLinks) {
      expect(String(link.getAttribute('href'))).toMatch(/^\/pricing/)
      expect(link).not.toHaveAttribute('target')
    }
  })
})

describe('anonymous analytics emissions', () => {
  it('emits only approved events with fixed payload keys on CTA and resource clicks', async () => {
    const user = userEvent.setup()
    // Each click navigates the memory router away from the landing page, so
    // exercise the resource link and the CTA on separate renders.
    await renderPage('/seedance-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getAllByRole('button', { name: /Read API documentation/ })[0]
    )

    await renderPage('/seedance-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /Create account/ }))

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
    await renderPage()

    const question = 'How does async video generation work?'
    const trigger = await screen.findByRole('button', { name: question })
    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/submit a generation request/i)).toBeVisible()
    })
  })
})

describe('VANCINE-PREPAID-COPY: prepaid CTA labels and inactive-promo prohibition', () => {
  it('guest CTAs use Create account and never Start free', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('Start free')
    const guestCtas = await screen.findAllByRole('button', {
      name: /^Create account$/,
    })
    expect(guestCtas.length).toBeGreaterThanOrEqual(1)
    for (const cta of guestCtas) {
      expect(cta).toHaveAttribute('href', '/sign-up')
    }
  })

  it('authenticated CTAs use Go to Playground', async () => {
    setAuthenticated(true)
    await renderPage()
    await screen.findByRole('heading', { level: 1 })
    const ctas = await screen.findAllByRole('button', {
      name: /^Go to Playground$/,
    })
    expect(ctas.length).toBeGreaterThanOrEqual(1)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/playground')
    }
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('Start free')
  })

  it('does not mention $1, promotional API credit, or signup bonus', async () => {
    await renderPage()
    await screen.findByRole('heading', { level: 1 })
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('$1')
    expect(pageText).not.toContain('signup bonus')
    expect(pageText).not.toContain('promotional API credit')
  })
})

describe('metadata lifecycle', () => {
  it('applies SEO metadata on mount and restores the head on unmount', async () => {
    document.title = 'Baseline Title'

    const result = await renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(document.title).toBe(
      'Seedance 2.5 API for Async Video Generation | Vancine'
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/seedance-api')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/seedance-api')

    result.unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

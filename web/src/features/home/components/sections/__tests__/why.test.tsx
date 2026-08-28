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
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { useAuthStore } from '@/stores/auth-store'

import { Home } from '../../../index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      server_address: 'https://vancine.com',
      docs_link: '',
      user_agreement_enabled: false,
      privacy_policy_enabled: false,
    },
    loading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Vancine',
    logo: '/logo.png',
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))

const getHomePageContentMock = vi.fn()
vi.mock('@/features/home/api', () => ({
  getHomePageContent: (...args: unknown[]) => getHomePageContentMock(...args),
}))

const getPricingMock = vi.fn()
vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) => getPricingMock(...args),
}))

vi.mock('@lobehub/icons', () => ({
  CherryStudio: Object.assign(() => null, { Color: () => null }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const realInitialAuthData = {
  user: useAuthStore.getState().auth.user,
  accessToken: useAuthStore.getState().auth.accessToken,
  accessExpiresAt: useAuthStore.getState().auth.accessExpiresAt,
  session: useAuthStore.getState().auth.session,
  pending2FAFlowToken: useAuthStore.getState().auth.pending2FAFlowToken,
  bootstrapState: useAuthStore.getState().auth.bootstrapState,
}

function restoreAuthStore(): void {
  useAuthStore.setState({
    auth: { ...useAuthStore.getState().auth, ...realInitialAuthData },
  })
}

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

let originalIO: PropertyDescriptor | undefined

beforeEach(async () => {
  originalIO = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver'
  )
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  })
  await initTestI18n()
  localStorage.clear()
  getHomePageContentMock.mockReset()
  getPricingMock.mockReset()
  getPricingMock.mockResolvedValue({
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  })
  restoreAuthStore()
})

afterEach(() => {
  cleanup()
  if (originalIO === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(globalThis, 'IntersectionObserver', originalIO)
  }
  localStorage.clear()
  restoreAuthStore()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

let i18nReady = false

async function initTestI18n(): Promise<void> {
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

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const testRootRoute = createRootRoute()

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

function makeRouteTree() {
  return testRootRoute.addChildren([
    createRoute({
      getParentRoute: () => testRootRoute,
      path: '/',
      component: () => <Home />,
    }),
    stubRoute('/sign-up', 'sign-up-page'),
    stubRoute('/dashboard', 'dashboard-page'),
    stubRoute('/pricing', 'pricing-page'),
    stubRoute('/kimi-k3-api', 'kimi-page'),
    stubRoute('/coding-agent-benchmark', 'benchmark-page'),
    stubRoute('/ai-media-api', 'ai-media-page'),
  ])
}

function renderHome() {
  const router = createRouter({
    routeTree: makeRouteTree(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Why section', () => {
  it('renders section heading', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })
  })

  it('renders exactly three article cards in fixed order', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Why developers use Vancine',
    })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const sectionEl = section as HTMLElement

    const articles = sectionEl.querySelectorAll('article')
    expect(articles.length).toBe(3)

    const expectedTitles = [
      'Faster access to new Chinese models',
      'One API, one bill',
      'Evidence-backed developer experience',
    ]

    for (let i = 0; i < expectedTitles.length; i++) {
      const h3 = articles[i].querySelector('h3')
      expect(h3?.textContent).toBe(expectedTitles[i])
    }
  })

  it('renders all three card bodies', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(
        'New model releases can reach the unified endpoint without a fresh vendor integration each time.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Compatible with the calling conventions you already use, with one balance, billing, and usage log.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Real call examples, inspectable agent run evidence, and developer documentation.'
      )
    ).toBeInTheDocument()
  })

  it('cards have no links', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Why developers use Vancine',
    })
    const section = heading.closest('section') as HTMLElement
    const links = section.querySelectorAll('a')
    expect(links.length).toBe(0)
  })

  it('does not contain model name laundry list', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Why developers use Vancine',
    })
    const section = heading.closest('section') as HTMLElement
    const text = section.textContent ?? ''

    // No specific model names
    for (const name of [
      'Kimi',
      'GLM',
      'Qwen',
      'DeepSeek',
      'Seedance',
      'MiniMax',
    ]) {
      expect(text).not.toContain(name)
    }
  })

  it('cards grid uses mobile 1-col, sm 2-col, lg 3-col responsive classes', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Why developers use Vancine',
    })
    const section = heading.closest('section') as HTMLElement
    // The grid container is the parent of the AnimateInView wrappers, not
    // the direct parent of the <article>s (each article is wrapped in
    // AnimateInView). Find the grid by looking for an element that has
    // the grid-cols-1 token.
    const articles = section.querySelectorAll('article')
    expect(articles.length).toBe(3)
    const grid = section.querySelector(
      '.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3'
    ) as HTMLElement
    expect(grid).not.toBeNull()
    const gridClass = grid.className
    expect(gridClass).toContain('grid')
    expect(gridClass).toContain('grid-cols-1')
    expect(gridClass).toContain('sm:grid-cols-2')
    expect(gridClass).toContain('lg:grid-cols-3')
  })

  // Override-branch coverage for Why lives in
  // homepage-acquisition.test.tsx (URL / HTML / Markdown).
})

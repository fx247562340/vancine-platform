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
import {
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import { Home } from '../../index'

// The section under test is the built-in homepage only; isolate the shared
// header so no backend-driven nav config is needed.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Footer dependencies: avoid the real /api/status network request.
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

// Controlled home page content source (the module under test stays the Home
// component; only the network boundary is mocked).
const getHomePageContentMock = vi.fn()
vi.mock('@/features/home/api', () => ({
  getHomePageContent: (...args: unknown[]) => getHomePageContentMock(...args),
}))

// The real @lobehub/icons entry pulls @lobehub/ui -> @emoji-mart JSON, which
// vitest cannot load; the icon itself is irrelevant to this suite.
vi.mock('@lobehub/icons', () => ({
  CherryStudio: Object.assign(() => null, { Color: () => null }),
}))

// Capture analytics emissions (collaborator, covered by its own suite).
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// Isolate the built-in homepage from the real pricing API network boundary.
// The Home component calls getPricing() on mount; in jsdom the request fails and
// emits an AggregateError on stderr. A minimal fixture keeps the network
// boundary explicit and the test focused on the Developer solutions section.
const getPricingMock = vi.fn()
vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) => getPricingMock(...args),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// jsdom lacks IntersectionObserver; the built-in home sections (Stats,
// AnimateInView) need it. Every case installs a fresh stub and the
// afterEach hook restores the original global — even when an assertion throws.
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

let originalIntersectionObserverDescriptor: PropertyDescriptor | undefined

beforeEach(async () => {
  originalIntersectionObserverDescriptor = Object.getOwnPropertyDescriptor(
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
  trackEventMock.mockClear()
  getHomePageContentMock.mockReset()
  getPricingMock.mockReset()
  // Default: pricing API returns empty success so tests don't hang.
  getPricingMock.mockResolvedValue({
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  })
})

afterEach(() => {
  // Unconditional cleanup: the global stub, storage, and mocks never leak
  // into the next case, regardless of pass or fail.
  if (originalIntersectionObserverDescriptor === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(
      globalThis,
      'IntersectionObserver',
      originalIntersectionObserverDescriptor
    )
  }
  localStorage.clear()
  vi.restoreAllMocks()
})

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

const testRootRoute = createRootRoute()

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

const testRouteTree = testRootRoute.addChildren([
  createRoute({
    getParentRoute: () => testRootRoute,
    path: '/',
    component: () => <Home />,
  }),
  stubRoute('/kimi-k3-api', 'kimi-page'),
  stubRoute('/seedance-api', 'seedance-page'),
  stubRoute('/ai-media-api', 'ai-media-page'),
])

function renderHome(): RenderResult {
  const router = createRouter({
    routeTree: testRouteTree,
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

describe('built-in homepage Developer solutions section', () => {
  it('shows all three registry entries between Stack and Evidence', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()

    const devSolutionsHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'Landing pages for coding agents and AI media workflows.',
    })

    expect(screen.getByText('Kimi K3 API')).toBeInTheDocument()
    expect(screen.getByText('Seedance 2.5 API')).toBeInTheDocument()
    expect(screen.getByText('AI Media API')).toBeInTheDocument()

    const learnMoreLinks = screen.getAllByRole('link', { name: /Learn more/ })
    const hrefs = learnMoreLinks.map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('/kimi-k3-api')
    expect(hrefs).toContain('/seedance-api')
    expect(hrefs).toContain('/ai-media-api')
    for (const link of learnMoreLinks) {
      expect(link).not.toHaveAttribute('target')
    }

    // Real DOM order contract: Stack -> Developer solutions -> Evidence
    // -> Why -> CTA, asserted through the semantic section headings.
    const stackHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Works with your stack',
    })
    const evidenceHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    expect(
      stackHeading.compareDocumentPosition(devSolutionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(
      devSolutionsHeading.compareDocumentPosition(evidenceHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  it('records developer_resource_clicked with location homepage and fixed resources', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()

    await screen.findByRole('heading', {
      level: 2,
      name: 'Landing pages for coding agents and AI media workflows.',
    })

    const learnMoreLinks = screen.getAllByRole('link', { name: /Learn more/ })
    await user.click(learnMoreLinks[0])

    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'kimi_k3_api',
      location: 'homepage',
    })
  })
})

describe('custom homepage branches stay untouched', () => {
  it('does not inject the section into the admin-configured URL iframe home', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: 'https://custom.example.com/home',
    })
    renderHome()

    await screen.findByTitle('Custom Home Page')
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Landing pages for coding agents and AI media workflows.',
      })
    ).not.toBeInTheDocument()
  })

  it('does not inject the section into the admin-configured HTML home', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '<h2>Custom HTML home</h2>',
    })
    renderHome()

    // Isolated HTML renders inside a sanitized sandbox; wait for its
    // container instead of querying sandboxed content.
    await waitFor(() => {
      expect(document.querySelector('.custom-home-content')).not.toBeNull()
    })
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Landing pages for coding agents and AI media workflows.',
      })
    ).not.toBeInTheDocument()
  })

  it('does not inject the section into the admin-configured Markdown home', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '## Custom Markdown home',
    })
    renderHome()

    await screen.findByText('Custom Markdown home')
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Landing pages for coding agents and AI media workflows.',
      })
    ).not.toBeInTheDocument()
  })
})

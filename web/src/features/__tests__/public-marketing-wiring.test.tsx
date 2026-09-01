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
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import React, { type ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AiMediaApiPage } from '@/features/ai-media-api'
import { Home } from '@/features/home'
import { KimiK3ApiPage } from '@/features/kimi-k3-api'
import { Pricing } from '@/features/pricing'
import { SeedanceApiPage } from '@/features/seedance-api'
import {
  isPublicMarketingMetadataActive,
  resetMetadataRegistry,
  safeApplySystemName,
} from '@/hooks/use-page-metadata'
import enLocale from '@/i18n/locales/en.json'
import { useAuthStore } from '@/stores/auth-store'

// PublicLayout is the only layout wrapper every public marketing page
// uses. The full layout tree would pull in the site header / footer /
// nav, which themselves read the auth store, the i18n status, and
// react-query. Mocking the wrapper as a plain <div> isolates the
// metadata wiring under test from the chrome.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// use-status would otherwise hit /api/status from the footer.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      user_agreement_enabled: false,
      privacy_policy_enabled: false,
      server_address: 'https://vancine.com',
    },
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

vi.mock('@/features/home/api', () => ({
  getHomePageContent: vi.fn().mockResolvedValue({ success: false, data: '' }),
}))

vi.mock('@/features/home/hooks/use-homepage-pricing', () => ({
  useHomepagePricing: () => ({
    models: [],
    featured: [],
    fast: [],
    vendors: [],
    rawVendors: [],
    groupRatio: {},
    usableGroup: {},
    endpointMap: {},
    autoGroups: [],
    isLoading: false,
    priceRate: 1,
    usdExchangeRate: 1,
    count: 0,
    ok: true,
    status: 'empty',
    refetch: () => undefined,
  }),
}))

vi.mock('@/features/pricing/api', () => ({
  getPricing: vi.fn().mockResolvedValue({
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }),
}))

vi.mock('@lobehub/icons', () => ({
  CherryStudio: Object.assign(() => null, { Color: () => null }),
}))

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => null,
  default: () => null,
}))
vi.mock('@visactor/vchart', () => ({}))

// The Home page renders Hero / AvailableNow / Why / Evidence / CTA /
// Footer as children. The wiring test only cares about the metadata
// effect at the top of the page component, so the children are stubbed
// to render nothing — the page is mounted, its useEffect runs, and
// the test does not need to satisfy every child component's data
// requirements.
vi.mock('@/features/home/components', async (importActual) => {
  const actual =
    await importActual<typeof import('@/features/home/components')>()
  return {
    ...actual,
    Hero: () => null,
    AvailableNow: () => null,
    Why: () => null,
    Evidence: () => null,
    CTA: () => null,
  }
})

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

let i18nReady = false

async function initTestI18n(): Promise<void> {
  if (!i18nReady) {
    await i18next.use(initReactI18next).init({
      resources: {
        en: { translation: enLocale.translation },
      },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18next.changeLanguage('en')
}

const testRootRoute = createRootRoute({ component: () => <Outlet /> })

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

function renderPage(component: () => ReactNode, initialPath: string) {
  // The wiring test mounts ONE public marketing page at a time. The
  // tree therefore only needs the page's own route plus the links
  // that the page may navigate to. Adding duplicate routes for the
  // same path (e.g. a /pricing stub alongside the real Pricing page
  // component) trips TanStack Router's invariant.
  const tree = testRootRoute.addChildren([
    createRoute({
      getParentRoute: () => testRootRoute,
      path: initialPath,
      component,
    }),
    stubRoute('/sign-up', 'sign-up-page'),
    stubRoute('/playground', 'playground-page'),
    stubRoute('/dashboard', 'dashboard-page'),
    stubRoute('/docs/$slug', 'docs-page'),
  ])
  const router = createRouter({
    routeTree: tree,
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

/**
 * Render a page inside a silent error boundary so a child render error
 * (e.g. AvailableNow hitting an empty pricing state) does not crash
 * the wiring test. The metadata effect is registered at the page
 * component's top level, so it runs before any child render throws.
 */
function renderPageSilently(
  component: () => ReactNode,
  initialPath: string
): RenderResult {
  class SilentBoundary extends React.Component<
    { children: ReactNode },
    { hasError: boolean }
  > {
    state = { hasError: false }
    static getDerivedStateFromError(): { hasError: boolean } {
      return { hasError: true }
    }
    render() {
      if (this.state.hasError) return null
      return this.props.children
    }
  }
  // The path on createRoute must match the initial path exactly,
  // including any trailing slash. Pricing's useSearch hook needs
  // an active match on its exact route id, so a path mismatch
  // throws "Could not find an active match from /pricing/".
  const tree = testRootRoute.addChildren([
    createRoute({
      getParentRoute: () => testRootRoute,
      path: initialPath,
      component: () => <SilentBoundary>{component()}</SilentBoundary>,
    }),
    stubRoute('/sign-up', 'sign-up-page'),
    stubRoute('/playground', 'playground-page'),
    stubRoute('/dashboard', 'dashboard-page'),
    stubRoute('/docs/$slug', 'docs-page'),
  ])
  const router = createRouter({
    routeTree: tree,
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

function clearHead(): void {
  while (document.head.firstElementChild) {
    document.head.firstElementChild.remove()
  }
  document.title = ''
}

beforeEach(async () => {
  await initTestI18n()
  clearHead()
  act(() => {
    resetMetadataRegistry()
  })
  useAuthStore.setState({
    auth: { ...useAuthStore.getState().auth, user: null },
  })
})

afterEach(() => {
  clearHead()
  act(() => {
    resetMetadataRegistry()
  })
})

describe('public marketing route wiring', () => {
  // The SEO-2 contract: every public marketing page must call
  // `usePageMetadata(metadata, { publicMarketingPage: true })`. These
  // tests mount the ACTUAL page component, not a re-implementation,
  // and assert that the lock is held while the page is mounted. A
  // regression in any of the page files (removing the flag, swapping
  // the metadata constant) is caught here.
  //
  // The Home / Pricing pages mount child components that read live
  // pricing data; in jsdom those children throw on an empty fixture.
  // The wiring test wraps the page in a silent error boundary so the
  // metadata effect at the top of the page component is still
  // registered before any child render throws.
  it('Home page acquires the public marketing lock', async () => {
    expect(isPublicMarketingMetadataActive()).toBe(false)
    renderPageSilently(() => <Home />, '/')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
  })

  it('Pricing page acquires the public marketing lock', async () => {
    expect(isPublicMarketingMetadataActive()).toBe(false)
    renderPageSilently(() => <Pricing />, '/pricing/')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
  })
  it('Seedance page acquires the public marketing lock', async () => {
    expect(isPublicMarketingMetadataActive()).toBe(false)
    renderPage(() => <SeedanceApiPage />, '/seedance-api')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
  })

  it('Kimi K3 page acquires the public marketing lock', async () => {
    expect(isPublicMarketingMetadataActive()).toBe(false)
    renderPage(() => <KimiK3ApiPage />, '/kimi-k3-api')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
  })

  it('AI Media page acquires the public marketing lock', async () => {
    expect(isPublicMarketingMetadataActive()).toBe(false)
    renderPage(() => <AiMediaApiPage />, '/ai-media-api')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
  })

  it('safeApplySystemName is refused while the Home page is mounted', async () => {
    const { unmount } = renderPageSilently(() => <Home />, '/')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe(
      'Chinese Frontier & Fast AI Models API | Vancine'
    )
    unmount()
    // After the page unmounts, the next branding write is allowed.
    safeApplySystemName('Acme Cloud')
    expect(document.title).toBe('Acme Cloud')
  })
})

describe('metadata elements survive unrelated re-renders', () => {
  // The metadata effect must not be unmounted / reinstalled on
  // re-renders that do not change i18n.language. A reinstall would
  // remove the registry-created head nodes and recreate them, so node
  // IDENTITY is the observable proof that the effect stayed installed.
  it('Home: auth-state re-render keeps the same metadata DOM nodes', async () => {
    renderPageSilently(() => <Home />, '/')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
    expect(document.title).toBe(
      'Chinese Frontier & Fast AI Models API | Vancine'
    )

    const titleEl = document.head.querySelector('meta[name="title"]')
    const descriptionEl = document.head.querySelector(
      'meta[name="description"]'
    )
    const ogUrlEl = document.head.querySelector('meta[property="og:url"]')
    const canonicalEl = document.head.querySelector('link[rel="canonical"]')
    expect(titleEl).not.toBeNull()
    expect(descriptionEl).not.toBeNull()
    expect(ogUrlEl).not.toBeNull()
    expect(canonicalEl).not.toBeNull()
    const headBefore = document.head.innerHTML

    // Unrelated re-render: Home subscribes to the auth store, so an
    // auth-state change re-renders the page without touching
    // i18n.language.
    act(() => {
      useAuthStore.setState({
        auth: {
          ...useAuthStore.getState().auth,
          user: { id: 1, username: 'dev', role: 1 },
        },
      })
    })

    // Same node identities: the metadata effect was not unmounted and
    // reinstalled.
    expect(document.head.querySelector('meta[name="title"]')).toBe(titleEl)
    expect(document.head.querySelector('meta[name="description"]')).toBe(
      descriptionEl
    )
    expect(document.head.querySelector('meta[property="og:url"]')).toBe(ogUrlEl)
    expect(document.head.querySelector('link[rel="canonical"]')).toBe(
      canonicalEl
    )
    expect(document.title).toBe(
      'Chinese Frontier & Fast AI Models API | Vancine'
    )
    expect(document.head.innerHTML).toBe(headBefore)
  })

  it('Pricing: search-input re-render keeps the same metadata DOM nodes', async () => {
    const user = userEvent.setup()
    renderPageSilently(() => <Pricing />, '/pricing/')
    await waitFor(() => {
      expect(isPublicMarketingMetadataActive()).toBe(true)
    })
    expect(document.title).toBe('Chinese AI Model API Pricing | Vancine')

    const titleEl = document.head.querySelector('meta[name="title"]')
    const descriptionEl = document.head.querySelector(
      'meta[name="description"]'
    )
    const canonicalEl = document.head.querySelector('link[rel="canonical"]')
    expect(titleEl).not.toBeNull()
    expect(descriptionEl).not.toBeNull()
    expect(canonicalEl).not.toBeNull()

    // Unrelated re-render: typing into the model search box updates
    // Pricing's filter state without touching i18n.language.
    const searchInput = await screen.findByPlaceholderText(
      'Search model name, provider, endpoint, or tag...'
    )
    await user.type(searchInput, 'seedance')

    expect(document.head.querySelector('meta[name="title"]')).toBe(titleEl)
    expect(document.head.querySelector('meta[name="description"]')).toBe(
      descriptionEl
    )
    expect(document.head.querySelector('link[rel="canonical"]')).toBe(
      canonicalEl
    )
    expect(document.title).toBe('Chinese AI Model API Pricing | Vancine')
  })
})

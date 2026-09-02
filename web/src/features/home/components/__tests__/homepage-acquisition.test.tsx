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
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import React, { type ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { useAuthStore } from '@/stores/auth-store'

import { useHomePageContent } from '../../hooks/use-home-page-content'
import { Home } from '../../index'

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

const mockStatusDefaults: Record<string, unknown> = {
  server_address: 'https://vancine.com',
  docs_link: 'https://docs.example.com',
  user_agreement_enabled: false,
  privacy_policy_enabled: false,
}
const mockStatusValue: Record<string, unknown> = { ...mockStatusDefaults }

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: mockStatusValue,
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

// Mock the shared `api` HTTP client. The homepage stats hook reads
// /api/homepage/stats through it; the mock is a thin wrapper that
// returns either a stubbed bare payload or a rejection based on the
// URL. Default behaviour (no override) is "no stats yet" so the
// pre-existing tests do not need to know about the stats endpoint
// unless they explicitly opt in via apiGetMock.mockImplementation.
//
// The handler serves the BARE payload — no success/data envelope:
//   { window_days, successful_requests, processed_tokens,
//     active_vendor_count, available_model_count, as_of }
// where each aggregate is a { value, availability } triple. The
// default mock returns all-unavailable so the hero renders
// em-dashes unless a test explicitly opts in.
//
// vi.mock is hoisted to the top of the file by Vitest, so the
// captured `apiGetMock` reference must also be hoisted via
// `vi.hoisted` to exist by the time the mock factory runs.
const { apiGetMock } = vi.hoisted(() => {
  const unavailableTriple = { value: 0, availability: 'unavailable' }
  const defaultStats = {
    window_days: 30,
    successful_requests: unavailableTriple,
    processed_tokens: unavailableTriple,
    active_vendor_count: unavailableTriple,
    available_model_count: unavailableTriple,
    as_of: 0,
  }
  const mock = (url: string) => {
    if (url === '/api/homepage/stats') {
      return Promise.resolve({ data: defaultStats })
    }
    return Promise.resolve({ data: null })
  }
  return { apiGetMock: vi.fn().mockImplementation(mock) }
})
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

vi.mock('@lobehub/icons', () => ({
  CherryStudio: Object.assign(() => null, { Color: () => null }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

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

/** Restore auth store to real initial data while preserving real action fns. */
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
  trackEventMock.mockClear()
  getHomePageContentMock.mockReset()
  getPricingMock.mockReset()
  apiGetMock.mockReset()
  // Default: stats API returns the bare all-unavailable payload so
  // the hero tiles render em-dashes unless a test explicitly opts
  // in.
  apiGetMock.mockImplementation((url: string) => {
    if (url === '/api/homepage/stats') {
      const unavailableTriple = { value: 0, availability: 'unavailable' }
      return Promise.resolve({
        data: {
          window_days: 30,
          successful_requests: unavailableTriple,
          processed_tokens: unavailableTriple,
          active_vendor_count: unavailableTriple,
          available_model_count: unavailableTriple,
          as_of: 0,
        },
      })
    }
    return Promise.resolve({ data: null })
  })
  // Default: pricing API returns empty success so tests don't hang
  getPricingMock.mockResolvedValue({
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  })
  Object.assign(mockStatusValue, mockStatusDefaults)
  restoreAuthStore()
})

afterEach(() => {
  // 1. Unmount all rendered components FIRST so that subsequent store updates
  //    do not trigger re-renders on mounted component trees.
  cleanup()
  // 2. Restore IO.
  if (originalIO === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(globalThis, 'IntersectionObserver', originalIO)
  }
  // 3. Reset storage and store — safe now that nothing is mounted.
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
// Real-locale (RTL) i18n assertions — load each locale's resource bundle,
// switch the active language, and assert that the homepage Hero, Live model
// marketplace, and Final CTA headings plus the credit disclaimer render// translated copy rather than falling back to the English source string.
// ---------------------------------------------------------------------------

describe('Homepage i18n renders translated copy (not English fallback)', () => {
  // English source strings that must NOT appear once a non-English locale is
  // active — if any of these match, the UI fell back to English.
  const HERO_EN = 'One API for Chinese frontier and high-performance AI models'
  const MARKETPLACE_EN = 'Live model marketplace'
  const CTA_EN = "Start building with China's frontier models"
  const DISCLAIMER_EN =
    'Create an account, add credit, and start using the API with transparent usage-based pricing.'

  let zhBundle: Record<string, unknown> | null
  let frBundle: Record<string, unknown> | null

  beforeAll(async () => {
    const zhMod = await import('@/i18n/locales/zh.json')
    zhBundle =
      ((zhMod.default ?? zhMod) as { translation?: Record<string, unknown> })
        .translation ?? {}
    const frMod = await import('@/i18n/locales/fr.json')
    frBundle =
      ((frMod.default ?? frMod) as { translation?: Record<string, unknown> })
        .translation ?? {}
  })

  const renderLocalizedHome = async (
    locale: string,
    bundle: Record<string, unknown> | null
  ) => {
    if (bundle) {
      i18n.addResourceBundle(locale, 'translation', bundle, true, true)
    }
    await i18n.changeLanguage(locale)

    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockResolvedValue({
      success: true,
      data: [
        { model_name: 'Demo', tags: '', supported_endpoint_types: ['chat'] },
      ],
      vendors: [{ id: 1, name: 'DemoVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()
    // Wait for the Hero H1 to appear.
    await screen.findByRole('heading', { level: 1 })
  }

  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('zh-CN homepage is localized (not English fallback)', async () => {
    await renderLocalizedHome('zhCN', zhBundle)

    const h1 = screen.getByRole('heading', { level: 1 })
    const h2s = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    const pageText = document.body.textContent ?? ''

    // Hero, Marketplace and CTA headings are present and translated.
    expect(h1.textContent).not.toBe(HERO_EN)
    expect(h1.textContent).toContain('中国')
    expect(h2s.some((t) => t === MARKETPLACE_EN)).toBe(false)
    expect(h2s.some((t) => t === CTA_EN)).toBe(false)
    expect(h2s.length).toBeGreaterThanOrEqual(2)
    // The Final CTA disclaimer must not be the English source; Chinese copy is present.
    expect(pageText.includes(DISCLAIMER_EN)).toBe(false)
    expect(pageText).toContain('按量计费')
  })

  it('fr homepage is localized (not English fallback)', async () => {
    await renderLocalizedHome('fr', frBundle)

    const h1 = screen.getByRole('heading', { level: 1 })
    const h2s = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    const pageText = document.body.textContent ?? ''

    expect(h1.textContent).not.toBe(HERO_EN)
    expect(h1.textContent).toContain('modèles')
    expect(h2s.some((t) => t === MARKETPLACE_EN)).toBe(false)
    expect(h2s.some((t) => t === CTA_EN)).toBe(false)
    expect(pageText.includes(DISCLAIMER_EN)).toBe(false)
    // French disclaimer copy is present (prepaid usage-based pricing).
    expect(pageText.toLowerCase()).toContain('tarification transparente')
  })
})

// ---------------------------------------------------------------------------
// Routing — every CTA target has a real route (no notFound warning).
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
    stubRoute('/seedance-api', 'seedance-page'),
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

function getHeroSection(): HTMLElement {
  const heading = screen.getByRole('heading', {
    level: 1,
    name: 'One API for Chinese frontier and high-performance AI models',
  })
  const section = heading.closest('section')
  if (!section) throw new Error('Hero heading is not inside a <section>')
  return section
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('R6: cached content lazy initializer', () => {
  it('hook reads localStorage synchronously via lazy initializer', () => {
    localStorage.setItem('home_page_content', 'https://cached.example.com/home')
    getHomePageContentMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHomePageContent())
    expect(result.current.content).toBe('https://cached.example.com/home')
    expect(result.current.isUrl).toBe(true)
  })

  it('cached URL renders without waiting for the network', async () => {
    localStorage.setItem('home_page_content', 'https://cached.example.com/home')
    getHomePageContentMock.mockReturnValue(new Promise(() => {}))
    renderHome()
    await waitFor(() => {
      expect(screen.getByTitle('Custom Home Page')).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'One API for Chinese frontier and high-performance AI models',
      })
    ).not.toBeInTheDocument()
  })

  it('no cache + pending network shows built-in homepage immediately', async () => {
    getHomePageContentMock.mockReturnValue(new Promise(() => {}))
    renderHome()
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(heading).toBeInTheDocument()
  })

  it('clears cache when API returns empty', async () => {
    localStorage.setItem('home_page_content', 'https://cached.example.com/home')
    getHomePageContentMock.mockResolvedValue({ success: true, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(screen.queryByTitle('Custom Home Page')).not.toBeInTheDocument()
    expect(localStorage.getItem('home_page_content')).toBeNull()
  })

  it('switches to new override when API returns different content', async () => {
    localStorage.setItem('home_page_content', 'https://old.example.com/home')
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '<h2>New override</h2>',
    })
    renderHome()
    await waitFor(() => {
      expect(document.querySelector('.custom-home-content')).not.toBeNull()
    })
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'One API for Chinese frontier and high-performance AI models',
      })
    ).not.toBeInTheDocument()
  })

  it('keeps cache when network fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('home_page_content', 'https://cached.example.com/home')
    getHomePageContentMock.mockRejectedValue(new Error('Network error'))
    renderHome()
    await waitFor(() => {
      expect(screen.getByTitle('Custom Home Page')).toBeInTheDocument()
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load home page content:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('shows built-in homepage when network fails and no cache', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getHomePageContentMock.mockRejectedValue(new Error('Network error'))
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load home page content:',
      expect.any(Error)
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One API for Chinese frontier and high-performance AI models',
      })
    ).toBeInTheDocument()
    consoleSpy.mockRestore()
  })
})

describe('R7+R8: Hero CTA destinations and analytics', () => {
  it('guest primary CTA: Create account → /sign-up', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const btn = within(hero).getByRole('button', {
      name: /^Create account$/i,
    })
    expect(btn).toHaveAttribute('href', '/sign-up')
  })

  it('authenticated primary CTA: Go to Dashboard → /dashboard', async () => {
    const prev = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: {
        ...prev,
        user: { id: 1, username: 'u', role: 100 },
        accessToken: 'tok',
      },
    })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const btn = within(hero).getByRole('button', {
      name: /^Go to Dashboard$/i,
    })
    expect(btn).toHaveAttribute('href', '/dashboard')
  })

  it('guest Explore live models → /pricing + explore_models_clicked { hero }', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const btn = within(hero).getByRole('button', {
      name: /View available models/i,
    })
    expect(btn).toHaveAttribute('href', '/pricing')
    await user.click(btn)
    expect(trackEventMock).toHaveBeenCalledWith('explore_models_clicked', {
      location: 'hero',
    })
  })

  it('authenticated Explore live models → /pricing + explore_models_clicked { hero }', async () => {
    const user = userEvent.setup()
    const prev = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: {
        ...prev,
        user: { id: 1, username: 'u', role: 100 },
        accessToken: 'tok',
      },
    })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const btn = within(hero).getByRole('button', {
      name: /View available models/i,
    })
    expect(btn).toHaveAttribute('href', '/pricing')
    await user.click(btn)
    expect(trackEventMock).toHaveBeenCalledWith('explore_models_clicked', {
      location: 'hero',
    })
  })

  it('guest primary CTA fires get_started_clicked { hero }', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const btn = within(hero).getByRole('button', {
      name: /^Create account$/i,
    })
    await user.click(btn)
    expect(trackEventMock).toHaveBeenCalledWith('get_started_clicked', {
      location: 'hero',
    })
  })
})

describe('R8: Documentation control', () => {
  it('shows Documentation link when docs_link is configured', async () => {
    Object.assign(mockStatusValue, { docs_link: 'https://docs.example.com' })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const link = within(hero).getByRole('button', { name: /Documentation/i })
    expect(link).toHaveAttribute('href', 'https://docs.example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('omits Documentation when docs_link is empty', async () => {
    Object.assign(mockStatusValue, { docs_link: '' })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    expect(
      within(hero).queryByRole('button', { name: /Documentation/i })
    ).not.toBeInTheDocument()
  })

  it('omits Documentation when docs_link is undefined', async () => {
    Object.assign(mockStatusValue, { docs_link: undefined })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    expect(
      within(hero).queryByRole('button', { name: /Documentation/i })
    ).not.toBeInTheDocument()
  })

  it('omits Documentation when docs_link is whitespace-only', async () => {
    Object.assign(mockStatusValue, { docs_link: '   ' })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    expect(
      within(hero).queryByRole('button', { name: /Documentation/i })
    ).not.toBeInTheDocument()
  })
})

describe('Final CTA', () => {
  it('primary button says Create account (guest) → /sign-up', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const h2 = screen.getByRole('heading', {
      level: 2,
      name: "Start building with China's frontier models",
    })
    const section = h2.closest('section')
    if (!section) throw new Error('CTA heading not in section')
    expect(
      within(section).getByRole('button', { name: /^Create account$/i })
    ).toBeInTheDocument()
    expect(
      within(section).queryByRole('button', { name: /Get.*free API credit/i })
    ).not.toBeInTheDocument()
  })

  it('primary button says Go to Dashboard (authenticated) → /dashboard', async () => {
    const prev = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: {
        ...prev,
        user: { id: 1, username: 'u', role: 100 },
        accessToken: 'tok',
      },
    })
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const h2 = screen.getByRole('heading', {
      level: 2,
      name: "Start building with China's frontier models",
    })
    const section = h2.closest('section')
    if (!section) throw new Error('CTA heading not in section')
    const btn = within(section).getByRole('button', {
      name: /^Go to Dashboard$/i,
    })
    expect(btn).toHaveAttribute('href', '/dashboard')
  })

  it('fires get_started_clicked { final_cta }', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const h2 = screen.getByRole('heading', {
      level: 2,
      name: "Start building with China's frontier models",
    })
    const section = h2.closest('section')
    if (!section) throw new Error('CTA heading not in section')
    const btn = within(section).getByRole('button', {
      name: /^Create account$/i,
    })
    await user.click(btn)
    expect(trackEventMock).toHaveBeenCalledWith('get_started_clicked', {
      location: 'final_cta',
    })
  })
})

describe('VANCINE-PREPAID-COPY: prepaid copy and inactive-promo prohibition', () => {
  it('renders the new prepaid CTA disclaimer in the Final CTA section', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const h2 = screen.getByRole('heading', {
      level: 2,
      name: "Start building with China's frontier models",
    })
    const section = h2.closest('section')
    if (!section) throw new Error('CTA heading not in section')
    expect(section).toHaveTextContent(
      /Create an account, add credit, and start using the API with transparent usage-based pricing\./
    )
  })

  it('homepage does not mention the inactive $1 promo or signup bonus', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('Start building free')
    expect(pageText).not.toContain('signup bonus')
    expect(pageText).not.toContain('promotional API credit')
    expect(pageText).not.toContain('$1')
  })
})

describe('VANCINE-BRAND-REDESIGN-FINAL-REMEDIATION: stats disclaimer and dt/dd order', () => {
  it('renders the new Aggregated operation metrics disclaimer in the hero', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const disclaimer = await screen.findByTestId('hero-stats-disclaimer')
    expect(disclaimer.textContent ?? '').toContain('Aggregated operation metrics may be delayed')
    // The former "Live operation metrics" copy is gone.
    expect(disclaimer.textContent ?? '').not.toContain('Live operation metrics')
  })

  it('does not render the old Live operation metrics copy anywhere on the page', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('Live operation metrics')
  })

  it('emits stat tiles in dt-then-dd DOM order, value visually first', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const statsRow = screen.getByTestId('hero-stats-row')
    const tile = within(statsRow).getByTestId('hero-stat-successful-requests')
    // The <dt> describing the tile MUST come before the <dd> holding
    // the value in DOM order — the spec requires the term before
    // the description it terms. Visual order is controlled by
    // flex order, not DOM order.
    const dt = tile.querySelector('dt')
    const dd = tile.querySelector('dd')
    expect(dt).not.toBeNull()
    expect(dd).not.toBeNull()
    const dtEl = dt as Element
    const ddEl = dd as Element
    const dtPos = [...tile.children].indexOf(dtEl)
    const ddPos = [...tile.children].indexOf(ddEl)
    expect(dtPos).toBeLessThan(ddPos)
    expect(dtEl.textContent).toContain('Successful requests')
    expect(ddEl.textContent).toMatch(/[\d—]/)
  })
})

describe('Hero copy', () => {
  it('renders the brand light field, three live stats, and the CTAs', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })

    const hero = getHeroSection()
    // v1.12.0: the hero is a single column, no terminal panel and
    // no three-zone rail. One decorative light field spans the hero.
    expect(
      within(hero).queryByTestId('hero-primary-grid')
    ).not.toBeInTheDocument()
    expect(
      within(hero).queryByTestId('hero-copy-panel')
    ).not.toBeInTheDocument()
    expect(
      within(hero).queryByTestId('hero-terminal-panel')
    ).not.toBeInTheDocument()
    expect(
      within(hero).queryByTestId('hero-proof-rail')
    ).not.toBeInTheDocument()

    const lightField = within(hero).getByTestId('brand-light-tunnel')
    expect(lightField).toHaveClass('pointer-events-none')
    expect(lightField.getAttribute('aria-hidden')).toBe('true')
    expect(lightField.querySelector('img')).not.toBeInTheDocument()
    // The light field layer is clipped inside the hero, so the canvas can
    // never create horizontal scroll or escape onto the navigation.
    const lightFieldLayer = lightField.parentElement
    expect(lightFieldLayer).toHaveClass('overflow-hidden')
    expect(lightFieldLayer).toHaveClass('pointer-events-none')

    // Three live stats render as peer <div>s inside a <dl>.
    const statsRow = within(hero).getByTestId('hero-stats-row')
    expect(statsRow.tagName).toBe('DL')
    expect(
      within(statsRow).getByTestId('hero-stat-successful-requests')
    ).toBeInTheDocument()
    expect(
      within(statsRow).getByTestId('hero-stat-processed-tokens')
    ).toBeInTheDocument()
    expect(
      within(statsRow).getByTestId('hero-stat-available-models')
    ).toBeInTheDocument()

    // Old v1.2.0 peer facts are gone.
    expect(
      within(hero).queryByTestId('hero-stat-openai-compatible')
    ).not.toBeInTheDocument()
    expect(
      within(hero).queryByTestId('hero-stat-unified-api-and-billing')
    ).not.toBeInTheDocument()

    // The Cherry Studio / CC Switch chip pair lives in the
    // ToolsAndAccess section now, not the hero.
    expect(within(hero).queryByText('Cherry Studio')).not.toBeInTheDocument()
    expect(within(hero).queryByText('CC Switch')).not.toBeInTheDocument()

    // The "Read the docs" link replaced the old "Documentation" button
    // when no docs_link is configured. We assert the link target so
    // the contract is explicit.
    expect(
      within(hero).getByRole('link', { name: /Read the docs/i })
    ).toHaveAttribute('href', '/docs')
  })

  it('no banned model names', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const text = hero.textContent ?? ''
    for (const name of [
      'Kimi',
      'GLM',
      'Qwen',
      'DeepSeek',
      'Seedance',
      'Seedream',
      'Doubao',
      'MiniMax',
      'K2.6',
      'K3',
      'kimi-k3',
    ]) {
      expect(text).not.toContain(name)
    }
  })

  it('uses Vancine, not NewAPI', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    // The hero text must not leak the upstream product name.
    const hero = getHeroSection()
    const heroText = hero.textContent ?? ''
    expect(heroText).not.toContain('NewAPI')
    expect(heroText).not.toMatch(/\bNew\s*API\b/)
    // Vancine identity is still carried by the page chrome (header + footer)
    // and by the body content (section headings, CTAs).
    const page = document.body.textContent ?? ''
    expect(page).toContain('Vancine')
  })
})

describe('Custom homepage branches', () => {
  it('URL override', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: 'https://custom.example.com/home',
    })
    renderHome()
    await screen.findByTitle('Custom Home Page')
    expect(screen.queryByText('Kimi K3 API')).not.toBeInTheDocument()
    expect(screen.queryByText('Seedance 2.5 API')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Media API')).not.toBeInTheDocument()
    expect(screen.queryByText('Works with your stack')).not.toBeInTheDocument()
    // Evidence + Why are P11-D additions: confirm they don't render under URL override
    expect(
      screen.queryByText('Verified in real agent workflows')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Why developers use Vancine')
    ).not.toBeInTheDocument()
  })

  it('HTML override', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '<h2>Custom</h2>',
    })
    renderHome()
    await waitFor(() => {
      expect(document.querySelector('.custom-home-content')).not.toBeNull()
    })
    expect(screen.queryByText('Kimi K3 API')).not.toBeInTheDocument()
    expect(screen.queryByText('Seedance 2.5 API')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Media API')).not.toBeInTheDocument()
    expect(screen.queryByText('Works with your stack')).not.toBeInTheDocument()
    // Evidence + Why: not rendered under HTML override
    expect(
      screen.queryByText('Verified in real agent workflows')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Why developers use Vancine')
    ).not.toBeInTheDocument()
  })

  it('Markdown override', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '## Custom',
    })
    renderHome()
    await screen.findByText('Custom')
    expect(screen.queryByText('Kimi K3 API')).not.toBeInTheDocument()
    expect(screen.queryByText('Seedance 2.5 API')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Media API')).not.toBeInTheDocument()
    expect(screen.queryByText('Works with your stack')).not.toBeInTheDocument()
    // Evidence + Why: not rendered under Markdown override
    expect(
      screen.queryByText('Verified in real agent workflows')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Why developers use Vancine')
    ).not.toBeInTheDocument()
  })
})

describe('P6-C discovery routes', () => {
  it('no longer renders /kimi-k3-api, /seedance-api, /ai-media-api links on the default home', async () => {
    // v1.2.0 collapses the DeveloperSolutions section out of the default
    // built-in homepage. The pages themselves remain routable (covered by
    // the standalone /kimi-k3-api, /seedance-api, /ai-media-api route
    // tests); the public header's API Solutions menu still lists them
    // (covered by developer-solutions-nav.test.tsx). The test here is the
    // negative contract: the default home body must not surface those
    // links anymore, so the homepage is no longer a discovery surface for
    // every section page.
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const body = document.body.textContent ?? ''
    expect(body).not.toContain('Kimi K3 API')
    expect(body).not.toContain('Seedance 2.5 API')
    expect(body).not.toContain('AI Media API')
  })
})

describe('Footer attribution', () => {
  it('does not render the upstream New API attribution in the footer', async () => {
    // The statutory attribution moved to the /about page; the homepage
    // footer must no longer display it.
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(
      screen.queryByRole('link', {
        name: 'Frontend design and development by New API contributors.',
      })
    ).not.toBeInTheDocument()
  })
})

describe('P11-B: homepage pricing wiring', () => {
  it('calls getPricing exactly once per homepage mount', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockResolvedValue({
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(getPricingMock).toHaveBeenCalledTimes(1)
  })

  it('Hero and AvailableNow consume the same pricing state (ready with count)', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 1,
          model_name: 'TestModel',
          description: 'A test model',
          tags: 'featured',
          vendor_id: 1,
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['default'],
          supported_endpoint_types: ['chat'],
        },
      ],
      vendors: [{ id: 1, name: 'TestVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()

    // Hero should show the live model count and the new "Available models"
    // label. The label is rendered inline with the count inside the same
    // <dt>, so a single text match is the right granularity.
    await screen.findByText('TestModel')
    expect(screen.getByText('Available models')).toBeInTheDocument()
    // After the v1.2.0 collapse the marketplace is gone, so the featured
    // model renders only in AvailableNow — assert a single occurrence.
    expect(screen.getByText('TestModel')).toBeInTheDocument()
    expect(screen.getByText('TestVendor')).toBeInTheDocument()
    expect(
      screen.getByText('Flagship models — available now')
    ).toBeInTheDocument()
  })

  it('shows the em-dash placeholder when pricing is loading', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    // Never resolve pricing → loading state persists
    getPricingMock.mockReturnValue(new Promise(() => {}))
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    // The label is always present, but the value is the em-dash
    // placeholder while pricing is loading — never a fallback to
    // the vendor count.
    const available = within(hero).getByTestId('hero-stat-available-models')
    expect(within(available).getByText('Available models')).toBeInTheDocument()
    expect(within(available).getByText('—')).toBeInTheDocument()
  })

  it('shows the em-dash placeholder when pricing errors', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockRejectedValue(new Error('pricing error'))
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const available = within(hero).getByTestId('hero-stat-available-models')
    expect(within(available).getByText('Available models')).toBeInTheDocument()
    expect(within(available).getByText('—')).toBeInTheDocument()
  })

  it('shows a real 0 when pricing returns an empty catalog', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockResolvedValue({
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const hero = getHeroSection()
    const available = within(hero).getByTestId('hero-stat-available-models')
    expect(within(available).getByText('Available models')).toBeInTheDocument()
    await waitFor(() => {
      expect(within(available).getByText('0')).toBeInTheDocument()
    })
    expect(within(available).queryByText('—')).not.toBeInTheDocument()
  })

  it('custom URL override skips built-in homepage', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: 'https://custom.example.com/home',
    })
    renderHome()
    await screen.findByTitle('Custom Home Page')
    // Hero and AvailableNow should not render
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'One API for Chinese frontier and high-performance AI models',
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Flagship models — available now')
    ).not.toBeInTheDocument()
  })

  it('custom HTML override skips built-in homepage', async () => {
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '<h2>Custom</h2>',
    })
    renderHome()
    await waitFor(() => {
      expect(document.querySelector('.custom-home-content')).not.toBeNull()
    })
    expect(
      screen.queryByText('Flagship models — available now')
    ).not.toBeInTheDocument()
  })

  it('cached URL override does not fire pricing request', async () => {
    localStorage.setItem('home_page_content', 'https://cached.example.com/home')
    getHomePageContentMock.mockReturnValue(new Promise(() => {}))
    getPricingMock.mockResolvedValue({
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()
    await waitFor(() => {
      expect(screen.getByTitle('Custom Home Page')).toBeInTheDocument()
    })
    // Pricing query should be disabled when custom content is present
    expect(getPricingMock).toHaveBeenCalledTimes(0)
  })

  it('async network override shows built-in shell first (pricing may fire)', async () => {
    // When no cache exists and the network override arrives later, the built-in
    // shell renders first and pricing may legitimately fire during that window.
    getHomePageContentMock.mockResolvedValue({
      success: true,
      data: '<h2>Custom</h2>',
    })
    renderHome()
    await waitFor(() => {
      expect(document.querySelector('.custom-home-content')).not.toBeNull()
    })
    expect(
      screen.queryByText('Flagship models — available now')
    ).not.toBeInTheDocument()
  })

  it('instance isolation: pending in-flight — signal aborted on unmount, new signal on remount', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })

    const sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Capture signals passed to getPricing
    const capturedSignals: (AbortSignal | undefined)[] = []
    getPricingMock.mockImplementation((_signal?: AbortSignal) => {
      capturedSignals.push(_signal)
      return new Promise(() => {}) // never resolves
    })

    function renderWithSharedClient() {
      const router = createRouter({
        routeTree: makeRouteTree(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      return render(
        <QueryClientProvider client={sharedQueryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
    }

    const { unmount: unmount1 } = renderWithSharedClient()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(getPricingMock).toHaveBeenCalledTimes(1)

    // First signal should not be aborted yet
    expect(capturedSignals[0]?.aborted).toBe(false)

    unmount1()

    // After unmount the observer unsubscribes and a delayed cancel is
    // scheduled for the controller's signal. The cancel fires on the next
    // macrotask (setTimeout(0)), so poll until the controller signal is
    // aborted rather than asserting synchronously.
    await waitFor(() => {
      expect(capturedSignals[0]?.aborted).toBe(true)
    })

    // Second mount: resolve with data
    getPricingMock.mockImplementation((_signal?: AbortSignal) => {
      capturedSignals.push(_signal)
      return Promise.resolve({
        success: true,
        data: [],
        vendors: [],
        group_ratio: {},
        usable_group: {},
        supported_endpoint: {},
        auto_groups: [],
      })
    })

    renderWithSharedClient()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    expect(getPricingMock).toHaveBeenCalledTimes(2)

    // Second signal must be different from the first
    expect(capturedSignals[1]).not.toBe(capturedSignals[0])
    expect(capturedSignals[1]?.aborted).toBe(false)
  })

  it('instance isolation: resolved cache — second mount has no stale data before resolve', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })

    const sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // First mount returns OLD model
    getPricingMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 1,
          model_name: 'OLD_MODEL',
          description: 'old',
          tags: 'featured',
          vendor_id: 1,
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['default'],
          supported_endpoint_types: ['chat'],
        },
      ],
      vendors: [{ id: 1, name: 'OldVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })

    function renderWithSharedClient() {
      const router = createRouter({
        routeTree: makeRouteTree(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      return render(
        <QueryClientProvider client={sharedQueryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
    }

    const { unmount: unmount1 } = renderWithSharedClient()
    await screen.findAllByText('OLD_MODEL')
    expect(getPricingMock).toHaveBeenCalledTimes(1)

    unmount1()

    // Second mount: use deferred promise
    let resolveSecond: (value: unknown) => void = () => {}
    const secondPromise = new Promise<unknown>((resolve) => {
      resolveSecond = resolve
    })
    getPricingMock.mockReturnValueOnce(secondPromise)

    renderWithSharedClient()

    // Synchronous check: before the second fetch resolves, OLD_MODEL must
    // not appear because the second instance has a different query key.
    expect(screen.queryByText('OLD_MODEL')).not.toBeInTheDocument()
    expect(screen.queryByText('OldVendor')).not.toBeInTheDocument()

    // Resolve with NEW model
    resolveSecond({
      success: true,
      data: [
        {
          id: 2,
          model_name: 'NEW_MODEL',
          description: 'new',
          tags: 'featured',
          vendor_id: 2,
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['default'],
          supported_endpoint_types: ['chat'],
        },
      ],
      vendors: [{ id: 2, name: 'NewVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })

    // After second fetch resolves, only NEW_MODEL should be shown.
    // NEW_MODEL is featured, so it renders in both the Flagship module and the
    // Live model marketplace — assert presence, not uniqueness.
    await screen.findAllByText('NEW_MODEL')
    expect(screen.getAllByText('NewVendor').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('OLD_MODEL')).not.toBeInTheDocument()
    expect(screen.queryByText('OldVendor')).not.toBeInTheDocument()
    expect(getPricingMock).toHaveBeenCalledTimes(2)
  })

  it('P11-C: built-in homepage does not render Stack, DeveloperSolutions, or Marketplace as standalone blocks', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'One API for Chinese frontier and high-performance AI models',
        })
      ).toBeInTheDocument()
    })
    // v1.2.0 collapses these three sections out of the default homepage —
    // AvailableNow absorbs the marketplace surface; the registry and docs
    // sidebar still consume the removed components, but they no longer mount
    // here.
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Works with your stack',
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Landing pages for coding agents and AI media workflows.'
      )
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Live model marketplace',
      })
    ).not.toBeInTheDocument()
    // Old retired sections also stay absent.
    expect(screen.queryByText('Core Features')).not.toBeInTheDocument()
  })

  it('P11-D: Evidence and Why are visible; DeveloperSolutions and HowItWorks are not', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    // Evidence heading must appear (AnimateInView defers first paint
    // until intersection observer fires, so use findBy to wait).
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Verified in real agent workflows',
      })
    ).toBeInTheDocument()
    // Why heading must appear
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Why developers use Vancine',
      })
    ).toBeInTheDocument()
    // DeveloperSolutions section label must NOT appear on the default home
    expect(screen.queryByText('Developer solutions')).not.toBeInTheDocument()
    // HowItWorks heading must NOT appear
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Three steps to get started',
      })
    ).not.toBeInTheDocument()
  })

  it('v1.12.0: built-in homepage section order is Hero → AvailableNow → FastModels → ToolsAndAccess → ApiCodeSection → Why → Evidence → CTA → Footer', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'One API for Chinese frontier and high-performance AI models',
        })
      ).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Why developers use Vancine',
        })
      ).toBeInTheDocument()
    })

    const hero = screen.getByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    const availableNow = screen.getByRole('heading', {
      level: 2,
      name: 'Flagship models — available now',
    })
    const why = screen.getByRole('heading', {
      level: 2,
      name: 'Why developers use Vancine',
    })
    const evidence = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    const cta = screen.getByRole('heading', {
      level: 2,
      name: "Start building with China's frontier models",
    })
    const toolsAndAccess = screen.getByTestId('homepage-tools-access-section')
    const apiCode = screen.getByTestId('homepage-api-code-section')
    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()

    const following = (a: HTMLElement, b: HTMLElement) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

    expect(following(hero, availableNow)).toBe(true)
    expect(following(availableNow, toolsAndAccess)).toBe(true)
    expect(following(toolsAndAccess, apiCode)).toBe(true)
    expect(following(apiCode, why)).toBe(true)
    expect(following(why, evidence)).toBe(true)
    expect(following(evidence, cta)).toBe(true)
    expect(following(cta, footer)).toBe(true)
    expect(following(footer, cta)).toBe(false)
  })

  it('P11-D: HowItWorks, Features, and Stats headings are absent from built-in homepage', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'One API for Chinese frontier and high-performance AI models',
        })
      ).toBeInTheDocument()
    })
    // HowItWorks (retired): "Three steps to get started" must not render
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Three steps to get started',
      })
    ).not.toBeInTheDocument()
    // Features section had a "Core Features" h2 historically
    expect(screen.queryByText('Core Features')).not.toBeInTheDocument()
    // Stats current copy from stats.tsx must not render on the homepage
    expect(
      screen.queryByText('upstream services integrated')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('model billing support')).not.toBeInTheDocument()
    expect(screen.queryByText('compatible API routes')).not.toBeInTheDocument()
    expect(screen.queryByText('scheduling controls')).not.toBeInTheDocument()
  })

  it('v1.12.0 hero stats: the three live stats render with values from the homepage-stats endpoint', async () => {
    // The v2 wire shape: every aggregate is a { value, availability }
    // triple. The hero reads the value verbatim when availability is
    // "ok" and falls back to the em-dash placeholder otherwise.
    const statsPayload = {
      window_days: 30,
      successful_requests: {
        value: 12345,
        availability: 'ok' as const,
      },
      processed_tokens: {
        value: 67890000,
        availability: 'ok' as const,
      },
      active_vendor_count: {
        value: 6,
        availability: 'ok' as const,
      },
      available_model_count: {
        value: 9,
        availability: 'ok' as const,
      },
      as_of: 1_700_000_000,
    }
    apiGetMock.mockImplementation((url: string) => {
      if (url === '/api/homepage/stats') {
        return Promise.resolve({ data: statsPayload })
      }
      return Promise.resolve({ data: null })
    })

    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    getPricingMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 1,
          model_name: 'TestModel',
          description: 'A test model',
          tags: 'featured',
          vendor_id: 1,
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['default'],
          supported_endpoint_types: ['chat'],
        },
      ],
      vendors: [{ id: 1, name: 'TestVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })
    await screen.findByText('TestModel')

    const hero = getHeroSection()
    // The "available models" tile consumes the pricing model count,
    // NOT the stats active_vendor_count. The two numbers describe
    // different things and the hero tile is bound to the model count.
    const available = within(hero).getByTestId('hero-stat-available-models')
    expect(available).toBeInTheDocument()
    expect(within(available).getByText('1')).toBeInTheDocument()
    expect(within(available).getByText('Available models')).toBeInTheDocument()

    // The 30-day counts render their values verbatim.
    const successful = within(hero).getByTestId('hero-stat-successful-requests')
    expect(within(successful).getByText('12,345')).toBeInTheDocument()

    const processed = within(hero).getByTestId('hero-stat-processed-tokens')
    // 67.89M in compact notation.
    expect(within(processed).getByText('67.9M')).toBeInTheDocument()

    // The peer-fact trio is the entire hero stat strip.
    const statTiles = [
      'hero-stat-successful-requests',
      'hero-stat-processed-tokens',
      'hero-stat-available-models',
    ]
    for (const id of statTiles) {
      expect(within(hero).getByTestId(id)).toBeInTheDocument()
    }

    // v1.2.0 fact pair stays gone.
    expect(
      within(hero).queryByText('OpenAI-compatible')
    ).not.toBeInTheDocument()
    expect(
      within(hero).queryByText('Unified API and billing')
    ).not.toBeInTheDocument()
  })

  it('v1.12.0 hero stats: pricing is loading → available models tile shows em-dash, vendor count is rendered by ToolsAndAccess instead', async () => {
    // The third tile is no longer a fallback to the vendor count: the
    // hero strictly shows the model count, and the ToolsAndAccess
    // section owns the vendor count tile. With pricing still loading,
    // the hero's third tile is the em-dash placeholder.
    const statsPayload = {
      window_days: 30,
      successful_requests: {
        value: 0,
        availability: 'unavailable' as const,
      },
      processed_tokens: {
        value: 0,
        availability: 'unavailable' as const,
      },
      active_vendor_count: {
        value: 6,
        availability: 'ok' as const,
      },
      available_model_count: {
        value: 0,
        availability: 'unavailable' as const,
      },
      as_of: 1_700_000_000,
    }
    apiGetMock.mockImplementation((url: string) => {
      if (url === '/api/homepage/stats') {
        return Promise.resolve({ data: statsPayload })
      }
      return Promise.resolve({ data: null })
    })

    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    // Never resolve pricing → loading state persists. The hero must
    // still render the third tile, but it must show the em-dash
    // placeholder rather than the vendor count.
    getPricingMock.mockReturnValue(new Promise(() => {}))
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })

    const hero = getHeroSection()
    const available = within(hero).getByTestId('hero-stat-available-models')
    // The available-models tile must NOT show the vendor count
    // (6) when pricing is loading; the label stays "Available
    // models" and the value is the em-dash placeholder.
    expect(within(available).getByText('—')).toBeInTheDocument()
    expect(within(available).getByText('Available models')).toBeInTheDocument()
    expect(within(available).queryByText('6')).not.toBeInTheDocument()
    // The hero must not invent an "Integrated model vendors" label
    // in place of the model count.
    expect(
      within(available).queryByText('Integrated model vendors')
    ).not.toBeInTheDocument()
  })

  it('v1.12.0 hero stats: stats endpoint unreachable → all three tiles show em-dash placeholders', async () => {
    apiGetMock.mockImplementation((url: string) => {
      if (url === '/api/homepage/stats') {
        return Promise.reject(new Error('boom'))
      }
      return Promise.resolve({ data: null })
    })

    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    // Pricing also loading — every aggregate is unknown.
    getPricingMock.mockReturnValue(new Promise(() => {}))
    renderHome()
    await screen.findByRole('heading', {
      level: 1,
      name: 'One API for Chinese frontier and high-performance AI models',
    })

    const hero = getHeroSection()
    const successful = within(hero).getByTestId('hero-stat-successful-requests')
    const processed = within(hero).getByTestId('hero-stat-processed-tokens')
    const available = within(hero).getByTestId('hero-stat-available-models')
    // Every tile shows the em-dash placeholder when its aggregate
    // has not (or cannot) arrived. This is the contract: the hero
    // NEVER shows a spinner or an error — it always renders.
    expect(within(successful).getByText('—')).toBeInTheDocument()
    expect(within(processed).getByText('—')).toBeInTheDocument()
    expect(within(available).getByText('—')).toBeInTheDocument()
  })

  it('StrictMode: single Home instance renders correctly and pricing query deduplicates', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })

    // Abort-sensitive mock: the promise rejects with an AbortError if the
    // signal is already aborted when called, or if it aborts later. This is
    // what surfaces the StrictMode bug — without the fix, the remount reuses
    // the first (now-aborted) promise and the query lands in error state even
    // though getPricing is called exactly once.
    const strictData = {
      success: true,
      data: [
        {
          id: 1,
          model_name: 'StrictModel',
          description: 'test',
          tags: 'featured',
          vendor_id: 1,
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['default'],
          supported_endpoint_types: ['chat'],
        },
      ],
      vendors: [{ id: 1, name: 'StrictVendor' }],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    }
    let releasePricing: (value: typeof strictData) => void = () => {}
    getPricingMock.mockImplementation((signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }
        const onAbort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        if (signal) signal.addEventListener('abort', onAbort, { once: true })
        // Explicit deferred: only releasePricing settles the success path -
        // no timer races. The abort listener above remains armed, so a
        // cancelled request rejects deterministically.
        releasePricing = (value) => {
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(value)
        }
      })
    })

    const sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const router = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(
      <React.StrictMode>
        <QueryClientProvider client={sharedQueryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </React.StrictMode>
    )
    // Wait until the single shared request has actually started.
    await waitFor(() => expect(getPricingMock).toHaveBeenCalledTimes(1))
    // Explicit awaitable lifecycle flush (no real setTimeout/sleep): drain
    // React's pending effects/microtasks so every synchronous observer-abort
    // listener has run. AbortSignal 'abort' listeners fire synchronously, and
    // StrictMode's cleanup→remount already re-subscribed and cleared the
    // hook's delayed cancel, so no timer needs to elapse here. With the old
    // (buggy) implementation the shared promise is already rejected at this
    // point; with the fix the re-subscription kept it alive.
    await act(async () => {})
    // Now hand the data over explicitly.
    await act(async () => {
      releasePricing(strictData)
    })
    // The component should render correctly with pricing data.
    // StrictModel is featured, so it renders in the Flagship module; the
    // marketplace section is no longer mounted in v1.2.0 so the model
    // appears exactly once.
    await waitFor(() =>
      expect(screen.getByText('StrictModel')).toBeInTheDocument()
    )
    // StrictVendor appears in the Flagship card.
    expect(screen.getByText('StrictVendor')).toBeInTheDocument()
    // "Available models" is rendered once in the Hero (inline with the
    // dynamic count) — assert a single, exact occurrence.
    expect(screen.getByText('Available models')).toBeInTheDocument()
    expect(
      screen.getByText('Flagship models — available now')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Live model marketplace',
      })
    ).not.toBeInTheDocument()

    // The pricing hook coalesces in-flight requests per instance, so even
    // React StrictMode's synchronous double-invoke fires exactly one network
    // call per Home instance — not a relaxed 1-2 range.
    expect(getPricingMock).toHaveBeenCalledTimes(1)
  })
})

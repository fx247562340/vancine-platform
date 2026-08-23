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
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
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

const mockStatusValue: Record<string, unknown> = {
  server_address: 'https://vancine.com',
  docs_link: 'https://docs.example.com',
  user_agreement_enabled: false,
  privacy_policy_enabled: false,
}

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

describe('Evidence section', () => {
  it('renders section heading', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })
  })

  it('renders intro text', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByText(
          'One controlled historical run — not a promise that every request will match these numbers.'
        )
      ).toBeInTheDocument()
    })
  })

  it('renders all 4 frozen facts with exact values', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    // Find the evidence section by its heading
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const sectionEl = section as HTMLElement

    // v1.2.0 Evidence: four primary metrics (Test model, Tool calls
    // completed, Test result, Vancine measured usage). The OpenCode
    // version, Duration, and Agent telemetry tokens collapse into a
    // single secondary "Run details" line interpolated from the same
    // source data; primary-metric assertions are below, secondary-line
    // assertions follow in the dedicated "Run details" test below.

    // Test model: kimi-k3
    expect(within(sectionEl).getByText('kimi-k3')).toBeInTheDocument()
    expect(within(sectionEl).getByText('Test model')).toBeInTheDocument()

    // Tool calls completed: 7
    expect(within(sectionEl).getByText('7')).toBeInTheDocument()
    expect(
      within(sectionEl).getByText('Tool calls completed')
    ).toBeInTheDocument()

    // Test result: Passed
    expect(within(sectionEl).getByText('Passed')).toBeInTheDocument()
    expect(within(sectionEl).getByText('Test result')).toBeInTheDocument()

    // Vancine measured usage: $0.19 USD (canonical form with currency)
    expect(within(sectionEl).getByText('$0.19 USD')).toBeInTheDocument()
    expect(
      within(sectionEl).getByText('Vancine measured usage')
    ).toBeInTheDocument()
  })

  it('renders the secondary Run details line with all three source fields', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    const sectionEl = heading.closest('section') as HTMLElement
    // The line keeps the canonical strings from the previous 8-metric
    // design: OpenCode v1.18.3, 84.3s, 28,707 telemetry tokens. They are
    // interpolated by the i18n key "Run details" and must all appear in
    // the same paragraph.
    const runDetailsP = within(sectionEl).getByText(/OpenCode v1\.18\.3/)
    const runText = runDetailsP.textContent ?? ''
    expect(runText).toContain('84.3s')
    expect(runText).toContain('28,707')
  })

  it('renders the mandatory disclaimer', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByText(
          'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.'
        )
      ).toBeInTheDocument()
    })
  })

  it('View Kimi K3 page is a same-origin TanStack Link to /kimi-k3-api', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const kimiLink = screen.getByRole('link', {
      name: 'View Kimi K3 page',
    })
    expect(kimiLink).toHaveAttribute('href', '/kimi-k3-api')
    // Same-origin: no target=_blank
    expect(kimiLink).not.toHaveAttribute('target', '_blank')
  })

  it('View Kimi K3 page fires evidence_link_clicked with correct payload', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const kimiLink = screen.getByRole('link', {
      name: 'View Kimi K3 page',
    })
    await user.click(kimiLink)
    expect(trackEventMock).toHaveBeenCalledWith('evidence_link_clicked', {
      location: 'homepage',
      resource: 'kimi_k3_page',
    })
  })

  it('View starter & verified evidence links to starter repo', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const starterLink = screen.getByRole('link', {
      name: 'View starter & verified evidence',
    })
    expect(starterLink).toHaveAttribute(
      'href',
      'https://github.com/VancineAI/kimi-k3-api-starter'
    )
    expect(starterLink).toHaveAttribute('target', '_blank')
    expect(starterLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('View starter & verified evidence fires evidence_link_clicked', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const starterLink = screen.getByRole('link', {
      name: 'View starter & verified evidence',
    })
    await user.click(starterLink)
    expect(trackEventMock).toHaveBeenCalledWith('evidence_link_clicked', {
      location: 'homepage',
      resource: 'starter_repo',
    })
  })

  it('Verified evidence JSON links to evidence file', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const jsonLink = screen.getByRole('link', {
      name: 'Verified evidence JSON',
    })
    expect(jsonLink.getAttribute('href')).toContain(
      'github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json'
    )
    expect(jsonLink).toHaveAttribute('target', '_blank')
    expect(jsonLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('Verified evidence JSON fires evidence_link_clicked', async () => {
    const user = userEvent.setup()
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const jsonLink = screen.getByRole('link', {
      name: 'Verified evidence JSON',
    })
    await user.click(jsonLink)
    expect(trackEventMock).toHaveBeenCalledWith('evidence_link_clicked', {
      location: 'homepage',
      resource: 'verified_json',
    })
  })

  it('does not contain upstream cost, average, SLA, or multi-model benchmark text', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    const section = heading.closest('section') as HTMLElement
    const text = section.textContent ?? ''

    // No upstream procurement cost
    expect(text).not.toMatch(/upstream cost|procurement cost/i)
    // No average/median/SLA
    expect(text).not.toMatch(/average|median|SLA/i)
    // No multi-model benchmark
    expect(text).not.toMatch(/benchmark|multi.?model/i)
  })

  it('metrics grid uses mobile 2-col and desktop 4-col responsive classes', async () => {
    getHomePageContentMock.mockResolvedValue({ success: false, data: '' })
    renderHome()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Verified in real agent workflows',
        })
      ).toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Verified in real agent workflows',
    })
    const section = heading.closest('section') as HTMLElement
    // Locate the <dl> metrics container
    const dl = section.querySelector('dl')
    expect(dl).not.toBeNull()
    const dlClass = (dl as HTMLElement).className
    expect(dlClass).toContain('grid')
    expect(dlClass).toContain('grid-cols-2')
    expect(dlClass).toContain('md:grid-cols-4')
  })

  // Override-branch coverage for Evidence lives in
  // homepage-acquisition.test.tsx (URL / HTML / Markdown).
})

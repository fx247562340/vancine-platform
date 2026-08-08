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
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import zhLocale from '@/i18n/locales/zh.json'
import { trackEvent } from '@/lib/analytics'
import { Route as AiMediaApiRouteImport } from '@/routes/ai-media-api/index'
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

// Preserve the real console.error so controlled spies can re-emit anything
// they do not explicitly suppress.
// eslint-disable-next-line no-console
const originalConsoleError = console.error.bind(console)

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

// Build a real router around the ACTUAL ai-media-api route module so the
// page renders exactly as wired in routeTree.gen.ts, with stub destinations
// for every internal link target.
const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestAiMediaRoute = AiMediaApiRouteImport.update({
  id: '/ai-media-api/',
  path: '/ai-media-api/',
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
  TestAiMediaRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/docs', 'docs-index-page'),
  stubRoute('/docs/$slug', 'docs-page'),
])

function renderPage(initialPath = '/ai-media-api/'): RenderResult {
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

describe('ai-media-api page structure', () => {
  it('renders exactly one h1 and all required sections', async () => {
    renderPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Access Chinese AI media models through one API.'
    )

    for (const section of [
      'One integration, one account',
      'One integration across the AI media stack',
      'Make your first request in minutes',
      'Built for products that generate more than text',
      'Models and pricing are live',
      'Frequently asked questions',
      'Build your first AI media request today',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })
})

describe('CTA destinations and UTM safety', () => {
  it('points guest CTAs at /sign-up and keeps only allowlisted UTM parameters', async () => {
    renderPage(
      '/ai-media-api/?utm_source=launch&utm_campaign=media&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroCta = await screen.findByRole('button', { name: 'Get started' })
    expect(heroCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=media'
    )
    expect(String(heroCta.getAttribute('href'))).not.toContain('email')
    expect(String(heroCta.getAttribute('href'))).not.toContain('api_key')
    expect(String(heroCta.getAttribute('href'))).not.toContain('redirect')

    const finalCta = await screen.findByRole('button', {
      name: /Get started with Vancine/,
    })
    expect(finalCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=media'
    )
  })

  it('points authenticated CTAs at /playground', async () => {
    setAuthenticated(true)
    renderPage('/ai-media-api/?utm_source=launch&token=abc')

    // Both the hero and the final CTA show the authenticated label.
    const ctas = await screen.findAllByRole('button', {
      name: 'Go to Playground',
    })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/playground?utm_source=launch')
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })
})

describe('API example tabs', () => {
  it('switches between Image, Video, and Speech examples', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', {
      level: 2,
      name: 'Make your first request in minutes',
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Image',
      'Video',
      'Speech',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    expect(
      await screen.findByText(/v1\/images\/generations/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Video' }))
    expect(screen.getByRole('tab', { name: 'Video' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      await screen.findByText(/v1\/video\/generations/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Speech' }))
    expect(await screen.findByText(/v1\/audio\/speech/)).toBeInTheDocument()
  })

  it('moves tab selection with the keyboard and exposes ARIA state', async () => {
    const user = userEvent.setup()
    // Base UI's internal focus scheduling emits a known React act() warning
    // in jsdom that escapes any act() window; silence that single artifact
    // (restored unconditionally in afterEach) and keep asserting the ARIA
    // outcome.
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (String(args[0] ?? '').includes('not wrapped in act')) {
        return
      }
      // eslint-disable-next-line no-console
      originalConsoleError(...(args as []))
    })

    renderPage()

    const firstTab = await screen.findByRole('tab', { name: 'Image' })
    firstTab.focus()
    // Base UI tabs move focus with arrow keys and activate on Enter/Space.
    await user.keyboard('{ArrowRight}{Enter}')

    const videoTab = screen.getByRole('tab', { name: 'Video' })
    await waitFor(() => {
      expect(videoTab).toHaveAttribute('aria-selected', 'true')
    })
    expect(firstTab).toHaveAttribute('aria-selected', 'false')
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

describe('page metadata lifecycle', () => {
  it('applies SEO metadata on mount and restores the head on unmount', async () => {
    document.title = 'Baseline Title'
    const canonicalBefore = document.head.querySelector('link[rel="canonical"]')
    expect(canonicalBefore).toBeNull()

    const result = renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(document.title).toBe(
      'AI Media API: Image, Video, Speech & 3D | Vancine'
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/ai-media-api')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/ai-media-api')

    result.unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()
  })

  it('updates metadata when the language changes', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const englishTitle = document.title

    await act(async () => {
      await i18n.changeLanguage('zhCN')
    })
    await waitFor(() => {
      expect(document.title).not.toBe(englishTitle)
    })
    expect(document.title).toContain('AI 多媒体 API')
  })
})

describe('link safety', () => {
  it('uses same-origin routes for Docs and Pricing without target=_blank', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const pricingLinks = screen.getAllByRole('button', {
      name: /View live pricing and availability/,
    })
    for (const link of pricingLinks) {
      expect(link).toHaveAttribute('href', '/pricing')
      expect(link).not.toHaveAttribute('target')
    }

    const catalogLink = screen.getByRole('button', {
      name: /Browse the Docs model catalog/,
    })
    expect(catalogLink).toHaveAttribute('href', '/docs/models')
    expect(catalogLink).not.toHaveAttribute('target')

    const docsButtons = screen.getAllByRole('button', {
      name: 'Read API documentation',
    })
    expect(docsButtons.length).toBeGreaterThanOrEqual(4)
    for (const button of docsButtons) {
      expect(String(button.getAttribute('href'))).toMatch(/^\/docs(\/|$)/)
      expect(button).not.toHaveAttribute('target')
    }
  })
})

describe('anonymous analytics emissions', () => {
  it('emits only approved events with fixed payload keys on CTA and resource clicks', async () => {
    const user = userEvent.setup()

    // Each click navigates the memory router away from the landing page, so
    // exercise the resource link and the CTA on separate renders.
    const first = renderPage('/ai-media-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getAllByRole('button', {
        name: /View live pricing and availability/,
      })[0]
    )
    first.unmount()

    const second = renderPage('/ai-media-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Get started' }))
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

    const question = 'How does video generation work?'
    const trigger = await screen.findByRole('button', { name: question })
    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(
        screen.getByText(/submit a generation request, receive a task ID/)
      ).toBeVisible()
    })
  })
})

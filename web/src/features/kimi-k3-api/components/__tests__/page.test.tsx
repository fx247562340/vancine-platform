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
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
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
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  stubRoute('/docs/$slug', 'docs-page'),
])

function renderPage(initialPath = '/kimi-k3-api/'): RenderResult {
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

describe('kimi-k3-api page structure', () => {
  it('renders exactly one h1 and all required sections', async () => {
    renderPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Kimi K3 API for Coding Agents')

    for (const section of [
      'OpenAI-compatible quickstart',
      'Agent setup',
      'Live verification evidence',
      'One key, a focused China AI portfolio',
      'Frequently asked questions',
      'Put Kimi K3 in your coding agent today',
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
      '/kimi-k3-api/?utm_source=launch&utm_campaign=kimi&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroCta = await screen.findByRole('button', { name: /Start free/ })
    expect(heroCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=kimi'
    )
    expect(String(heroCta.getAttribute('href'))).not.toContain('email')
    expect(String(heroCta.getAttribute('href'))).not.toContain('api_key')
    expect(String(heroCta.getAttribute('href'))).not.toContain('redirect')

    const finalCta = await screen.findByRole('button', {
      name: /Get started with Vancine/,
    })
    expect(finalCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=kimi'
    )
  })

  it('points authenticated CTAs at /playground', async () => {
    setAuthenticated(true)
    renderPage('/kimi-k3-api/?utm_source=launch&token=abc')

    const heroCta = await screen.findByRole('button', {
      name: /Go to Playground/,
    })
    expect(heroCta).toHaveAttribute('href', '/playground?utm_source=launch')
    expect(String(heroCta.getAttribute('href'))).not.toContain('token')

    const finalCta = await screen.findByRole('button', {
      name: /Run K3 in Playground/,
    })
    expect(finalCta).toHaveAttribute('href', '/playground?utm_source=launch')
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
  it('uses same-origin routes for Docs and Pricing without target=_blank', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const docsLink = screen.getByRole('button', {
      name: /Read API documentation/,
    })
    expect(docsLink).toHaveAttribute('href', '/docs/chat')
    expect(docsLink).not.toHaveAttribute('target')

    const pricingLink = screen.getByRole('button', {
      name: /View live pricing and availability/,
    })
    expect(pricingLink).toHaveAttribute('href', '/pricing')
    expect(pricingLink).not.toHaveAttribute('target')

    const catalogLink = screen.getByRole('button', {
      name: /Browse the Docs model catalog/,
    })
    expect(catalogLink).toHaveAttribute('href', '/docs/models')
    expect(catalogLink).not.toHaveAttribute('target')
  })

  it('opens GitHub evidence links in a new tab with noopener noreferrer', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const evidenceLink = screen.getByRole('button', {
      name: /View public evidence file/,
    })
    const starterLink = screen.getByRole('button', {
      name: /View starter repository/,
    })
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
      screen.getByRole('button', { name: /View live pricing and availability/ })
    )
    first.unmount()

    const second = renderPage('/kimi-k3-api/?utm_source=launch&email=a@b.com')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /Start free/ }))
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

    const question = 'Where can I confirm Kimi K3 availability and pricing?'
    const trigger = await screen.findByRole('button', { name: question })
    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/Check live pricing/)).toBeVisible()
    })
  })
})

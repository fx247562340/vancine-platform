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
  within,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicHeader } from '@/components/layout/components/public-header'
import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

// Header collaborators that would otherwise hit the network: controlled
// boundary mocks; the header itself (module under test) stays real.
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
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    popoverOpen: false,
    setPopoverOpen: () => {},
    unreadCount: 0,
    activeTab: 'notifications',
    setActiveTab: () => {},
    notice: null,
    announcements: [],
    loading: false,
  }),
}))

const useTopNavLinksMock = vi.fn()
vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => useTopNavLinksMock(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// Base UI popup/focus scheduling emits a known React act() warning in jsdom
// that escapes any act() window; silence that single artifact and re-emit
// everything else (restored unconditionally in afterEach).
// eslint-disable-next-line no-console
const originalConsoleError = console.error.bind(console)

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

const testRootRoute = createRootRoute({ component: () => <Outlet /> })

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
    component: () => <PublicHeader />,
  }),
  stubRoute('/kimi-k3-api', 'kimi-page'),
  stubRoute('/glm-api', 'glm-page'),
  stubRoute('/seedance-api', 'seedance-page'),
  stubRoute('/ai-media-api', 'ai-media-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/guides/fast-coding-models', 'fast-coding-models-guide-page'),
])

function renderHeader(): RenderResult {
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

beforeEach(async () => {
  await initTestI18n()
  trackEventMock.mockClear()
  useTopNavLinksMock.mockReset()
  useTopNavLinksMock.mockReturnValue([])
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0] ?? '').includes('not wrapped in act')) {
      return
    }
    originalConsoleError(...(args as []))
  })
})

afterEach(() => {
  // Unconditional spy restoration: success, failure, and thrown assertions
  // all land here, so the filtered console.error spy (and any other spy a
  // case installs) never leaks into the next test.
  vi.restoreAllMocks()
})

describe('desktop API Solutions menu', () => {
  it('opens with the keyboard and lists all four registry entries', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', {
      name: 'API Solutions',
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    // The mobile overlay keeps hidden copies of the registry links in the
    // DOM; scope the assertions to the opened desktop popup (identified by
    // the ui component's data-slot contract).
    const popup = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="navigation-menu-content"]'
      )
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(
      within(popup).getByRole('link', { name: /Kimi K3 API/ })
    ).toHaveAttribute('href', '/kimi-k3-api')
    expect(
      within(popup).getByRole('link', { name: /GLM-5.3 and GLM-5.3 Flash API/ })
    ).toHaveAttribute('href', '/glm-api')
    expect(
      within(popup).getByRole('link', { name: /Seedance 2.5 API/ })
    ).toHaveAttribute('href', '/seedance-api')
    expect(
      within(popup).getByRole('link', { name: /AI Media API/ })
    ).toHaveAttribute('href', '/ai-media-api')
  })

  it('navigates and records the header analytics event on activation', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', {
      name: 'API Solutions',
    })
    trigger.focus()
    await user.keyboard('{Enter}')

    const popup = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="navigation-menu-content"]'
      )
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    const glmLink = within(popup).getByRole('link', {
      name: /GLM-5.3 and GLM-5.3 Flash API/,
    })
    await user.click(glmLink)

    expect(await screen.findByTestId('glm-page')).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'glm_api',
      location: 'header',
    })
  })

  it('keeps dynamic backend-configured nav links untouched', async () => {
    useTopNavLinksMock.mockReturnValue([
      { id: 'custom-backend', title: 'Custom Backend Link', href: '/pricing' },
    ])
    renderHeader()

    // The dynamic link renders as configured (desktop nav and mobile
    // overlay mirror the same list) ...
    const dynamicLinks = await screen.findAllByRole('link', {
      name: 'Custom Backend Link',
    })
    for (const link of dynamicLinks) {
      expect(link).toHaveAttribute('href', '/pricing')
    }
    // ... alongside the API Solutions entry (no replacement, no reordering
    // of the backend list itself).
    expect(
      await screen.findByRole('button', { name: 'API Solutions' })
    ).toBeInTheDocument()
  })
})

describe('mobile menu Developer solutions group', () => {
  it('keeps the mobile solution links out of the accessibility tree while closed', async () => {
    const { container } = renderHeader()
    // Wait for the header (and its overlay) to mount through the router.
    await screen.findByRole('button', { name: 'Toggle navigation menu' })

    const overlay = container.querySelector('.fixed.inset-0')
    expect(overlay).not.toBeNull()
    // Closed state: aria-hidden removes the subtree from the accessibility
    // tree and inert removes every descendant from the tab order.
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(overlay?.hasAttribute('inert')).toBe(true)

    // The registry links exist in the DOM ...
    expect(
      screen.queryAllByRole('link', { name: 'Kimi K3 API', hidden: true })
    ).not.toHaveLength(0)
    expect(
      screen.queryAllByRole('link', {
        name: 'Seedance 2.5 API',
        hidden: true,
      })
    ).not.toHaveLength(0)
    expect(
      screen.queryAllByRole('link', { name: 'AI Media API', hidden: true })
    ).not.toHaveLength(0)
    // ... but are not exposed to the accessibility tree.
    expect(screen.queryByRole('link', { name: 'Kimi K3 API' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Seedance 2.5 API' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'AI Media API' })).toBeNull()
  })

  it('exposes all four solution links in the accessibility tree when the menu opens', async () => {
    const user = userEvent.setup()
    const { container } = renderHeader()

    await user.click(
      await screen.findByRole('button', { name: 'Toggle navigation menu' })
    )

    const overlay = container.querySelector('.fixed.inset-0')
    await waitFor(() => {
      expect(overlay).not.toHaveAttribute('aria-hidden', 'true')
    })
    expect(overlay?.hasAttribute('inert')).toBe(false)

    const kimiLink = await screen.findByRole('link', { name: 'Kimi K3 API' })
    const glmLink = await screen.findByRole('link', {
      name: 'GLM-5.3 and GLM-5.3 Flash API',
    })
    const seedanceLink = await screen.findByRole('link', {
      name: 'Seedance 2.5 API',
    })
    const aiMediaLink = await screen.findByRole('link', {
      name: 'AI Media API',
    })
    expect(kimiLink).toHaveAttribute('href', '/kimi-k3-api')
    expect(glmLink).toHaveAttribute('href', '/glm-api')
    expect(seedanceLink).toHaveAttribute('href', '/seedance-api')
    expect(aiMediaLink).toHaveAttribute('href', '/ai-media-api')
  })

  it('hides the solution links again when the menu closes without navigating', async () => {
    const user = userEvent.setup()
    const { container } = renderHeader()

    const toggle = await screen.findByRole('button', {
      name: 'Toggle navigation menu',
    })
    await user.click(toggle)
    await screen.findByRole('link', { name: 'Kimi K3 API' })

    await user.click(toggle)

    const overlay = container.querySelector('.fixed.inset-0')
    await waitFor(() => {
      expect(overlay).toHaveAttribute('aria-hidden', 'true')
    })
    expect(overlay?.hasAttribute('inert')).toBe(true)
    // Still in the DOM, but gone from the accessibility tree and tab order.
    expect(
      screen.queryAllByRole('link', { name: 'Kimi K3 API', hidden: true })
    ).not.toHaveLength(0)
    expect(
      screen.queryAllByRole('link', {
        name: 'Seedance 2.5 API',
        hidden: true,
      })
    ).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'Kimi K3 API' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Seedance 2.5 API' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'AI Media API' })).toBeNull()
  })

  it('removes the solution links from the accessibility tree after activation', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(
      await screen.findByRole('button', { name: 'Toggle navigation menu' })
    )
    const kimiLink = await screen.findByRole('link', { name: 'Kimi K3 API' })
    await user.click(kimiLink)

    expect(await screen.findByTestId('kimi-page')).toBeInTheDocument()
    // Activating a link closes the menu and navigates; the registry links
    // must be gone from the accessibility tree either way.
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Kimi K3 API' })).toBeNull()
    })
    expect(screen.queryByRole('link', { name: 'Seedance 2.5 API' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'AI Media API' })).toBeNull()
  })

  it('shows the grouped entries and closes the menu after activation', async () => {
    const user = userEvent.setup()
    const { container } = renderHeader()

    const toggle = await screen.findByRole('button', {
      name: 'Toggle navigation menu',
    })
    await user.click(toggle)

    const overlay = container.querySelector('.fixed.inset-0')
    expect(overlay).not.toBeNull()
    await waitFor(() => {
      expect(overlay?.className).toContain('pointer-events-auto')
    })

    // Grouped under the Developer solutions label.
    expect(screen.getByText('Developer solutions')).toBeInTheDocument()
    const kimiLink = await screen.findByRole('link', {
      name: 'Kimi K3 API',
    })
    await user.click(kimiLink)

    expect(await screen.findByTestId('kimi-page')).toBeInTheDocument()
    await waitFor(() => {
      expect(overlay?.className).toContain('pointer-events-none')
    })
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'kimi_k3_api',
      location: 'header',
    })
  })
})

describe('API Solutions menu Guide section', () => {
  it('desktop dropdown groups the guide under a separator and Guides heading', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', {
      name: 'API Solutions',
    })
    trigger.focus()
    await user.keyboard('{Enter}')

    const popup = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="navigation-menu-content"]'
      )
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

    // The four API product links keep their order ...
    expect(
      within(popup).getByRole('link', { name: /Kimi K3 API/ })
    ).toBeInTheDocument()
    expect(
      within(popup).getByRole('link', { name: /AI Media API/ })
    ).toBeInTheDocument()

    // ... and the Guide appears in its own list, visually separated and
    // grouped under the Guides subsection heading.
    expect(within(popup).getByText('Guides')).toBeInTheDocument()
    const guideList = within(popup).getByTestId('developer-guides-menu-list')
    const guideLink = within(guideList).getByRole('link', {
      name: /Fast AI Models/,
    })
    expect(guideLink).toHaveAttribute('href', '/guides/fast-coding-models')
    // The guide list holds only guide entries, never API products.
    expect(
      within(guideList).queryByRole('link', { name: /Kimi K3 API/ })
    ).toBeNull()
  })

  it('navigates to the guide and records the guide analytics event on desktop activation', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', {
      name: 'API Solutions',
    })
    trigger.focus()
    await user.keyboard('{Enter}')

    const popup = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="navigation-menu-content"]'
      )
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    const guideLink = within(popup).getByRole('link', {
      name: /Fast AI Models/,
    })
    await user.click(guideLink)

    expect(
      await screen.findByTestId('fast-coding-models-guide-page')
    ).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'fast_coding_models_guide',
      location: 'header',
    })
  })

  it('mobile menu shows the guide under its own Guides group and closes on activation', async () => {
    const user = userEvent.setup()
    const { container } = renderHeader()

    const toggle = await screen.findByRole('button', {
      name: 'Toggle navigation menu',
    })
    await user.click(toggle)

    const overlay = container.querySelector('.fixed.inset-0')
    await waitFor(() => {
      expect(overlay?.className).toContain('pointer-events-auto')
    })

    // Both groups are present: the API solutions and the Guides.
    expect(screen.getByText('Developer solutions')).toBeInTheDocument()
    expect(screen.getByText('Guides')).toBeInTheDocument()

    const guideList = screen.getByTestId('developer-guides-mobile-list')
    const guideLink = within(guideList).getByRole('link', {
      name: 'Fast AI Models',
    })
    expect(guideLink).toHaveAttribute('href', '/guides/fast-coding-models')

    await user.click(guideLink)
    expect(
      await screen.findByTestId('fast-coding-models-guide-page')
    ).toBeInTheDocument()
    // Activating the guide closes the mobile menu.
    await waitFor(() => {
      expect(overlay?.className).toContain('pointer-events-none')
    })
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'fast_coding_models_guide',
      location: 'header',
    })
  })
})

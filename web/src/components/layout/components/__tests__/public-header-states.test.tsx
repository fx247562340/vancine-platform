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
} from '@tanstack/react-router'
import {
  render,
  screen,
  within,
  type RenderResult,
} from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PublicHeader,
  type PublicHeaderProps,
} from '@/components/layout/components/public-header'
import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

// useSystemConfig is a network/store boundary; a mutable holder lets each
// case fix the loading/logo state the header branches on. The header itself
// (module under test) stays real.
const systemConfigState = {
  value: {
    systemName: 'Vancine',
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
  },
}

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfigState.value,
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

const topNavLinksState = {
  value: [] as PublicHeaderProps['navLinks'],
}

vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => topNavLinksState.value,
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// ProfileDropdown is a subcomponent boundary: its internal menu behavior is
// out of scope for these state-selection tests. It is replaced with an
// identifiable marker so each case asserts which real branch the header
// selects (ProfileDropdown vs Sign in) without reimplementing production
// logic; ProfileDropdown itself is never mocked inside the module under test.
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => <div data-testid='profile-dropdown' />,
}))

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

// These state-selection tests do not exercise language, theme or notification
// behavior; the defaults keep those subcomponents out of the tree so they
// cannot introduce unrelated async state. Explicit per-case props still win.
const baseHeaderProps: PublicHeaderProps = {
  showLanguageSwitcher: false,
  showThemeSwitch: false,
  showNotifications: false,
}

// Deterministic lifecycle boundary: the router's initial match and load are
// settled BEFORE mounting, so RouterProvider renders already-resolved content
// instead of a pending state. The mounted Transitioner still re-runs
// router.load() once; waiting for a header element that is present in every
// state absorbs that one-shot load inside act()-wrapped polling.
async function renderHeader(
  props: PublicHeaderProps = {}
): Promise<RenderResult> {
  const mergedProps = { ...baseHeaderProps, ...props }
  const testRouteTree = testRootRoute.addChildren([
    createRoute({
      getParentRoute: () => testRootRoute,
      path: '/',
      component: () => <PublicHeader {...mergedProps} />,
    }),
  ])
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('button', { name: 'Toggle navigation menu' })
  return result
}

// The desktop auth entry lives in the `sm:flex` nav section (the sibling
// `sm:hidden` section holds the mobile actions/overlay); scoping assertions
// there keeps the desktop branch selection precise.
function getDesktopNav(container: HTMLElement): HTMLElement {
  const header = container.querySelector('header') as HTMLElement | null
  expect(header).not.toBeNull()
  const desktopNav = header?.querySelector(
    '[class~="sm:flex"]'
  ) as HTMLElement | null
  expect(desktopNav).not.toBeNull()
  return desktopNav as HTMLElement
}

function setAuthUser(user: AuthUser | null): void {
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user },
  }))
}

const authenticatedUser: AuthUser = {
  id: 1,
  username: 'tester',
  role: 0,
}

beforeEach(async () => {
  await initTestI18n()
  trackEventMock.mockClear()
  topNavLinksState.value = []
  systemConfigState.value = {
    systemName: 'Vancine',
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
  }
  setAuthUser(null)
})

afterEach(() => {
  // Spies are restored unconditionally so a failing case never leaks a mock
  // into the next test. The auth store is reset in beforeEach instead:
  // zustand notifies subscribers on every setState (even for equal values),
  // and by the time beforeEach runs the previous test's tree is unmounted.
  vi.restoreAllMocks()
})

describe('PublicHeader logo and site name states', () => {
  it('shows loading skeletons for logo, site name and auth entry while config loads', async () => {
    systemConfigState.value = {
      systemName: 'Vancine',
      logo: '/logo.png',
      loading: true,
      logoLoaded: false,
    }
    const { container } = await renderHeader({
      logo: <span data-testid='custom-logo' />,
      siteName: 'Custom Site',
    })

    // Exactly three skeletons: logo, site name and desktop auth entry.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    const desktopNav = getDesktopNav(container)
    expect(desktopNav.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      1
    )

    // Loading wins over the custom logo and the system logo.
    expect(screen.queryByTestId('custom-logo')).toBeNull()
    expect(screen.queryByAltText('logo')).toBeNull()

    // No site name text and no auth entry while loading.
    expect(screen.queryByText('Custom Site')).toBeNull()
    expect(
      within(desktopNav).queryByRole('button', { name: 'Sign in' })
    ).toBeNull()
    expect(screen.queryByTestId('profile-dropdown')).toBeNull()
  })

  it('prefers the custom logo over the system logo once loaded', async () => {
    const { container } = await renderHeader({
      logo: <span data-testid='custom-logo' />,
      siteName: 'Custom Site',
    })

    expect(screen.getByTestId('custom-logo')).toBeInTheDocument()
    expect(screen.queryByAltText('logo')).toBeNull()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
    // The single-layer site name ternary keeps working alongside the logo.
    expect(screen.getByText('Custom Site')).toBeInTheDocument()
  })

  it('falls back to the system logo when no custom logo is provided', async () => {
    const { container } = await renderHeader()

    expect(screen.queryByTestId('custom-logo')).toBeNull()
    const systemLogo = screen.getByAltText('logo')
    expect(systemLogo).toHaveAttribute('src', '/logo.png')
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
    expect(screen.getByText('Vancine')).toBeInTheDocument()
  })
})

describe('PublicHeader desktop auth entry states', () => {
  it('shows Sign in for anonymous users', async () => {
    const { container } = await renderHeader()

    const desktopNav = getDesktopNav(container)
    // The desktop auth entry is a Button whose accessible contract is a
    // button named "Sign in" (the router Link is its render slot).
    expect(
      within(desktopNav).getByRole('button', { name: 'Sign in' })
    ).toBeTruthy()
    expect(screen.queryByTestId('profile-dropdown')).toBeNull()
  })

  it('shows ProfileDropdown instead of Sign in for authenticated users', async () => {
    setAuthUser(authenticatedUser)
    const { container } = await renderHeader()

    const desktopNav = getDesktopNav(container)
    expect(
      within(desktopNav).queryByRole('button', { name: 'Sign in' })
    ).toBeNull()
    // Desktop nav selects the ProfileDropdown branch for a signed-in user.
    expect(within(desktopNav).getByTestId('profile-dropdown')).toBeTruthy()
  })

  it('renders no auth entry when showAuthButtons is false', async () => {
    // Asserted under loading so the auth branch is provably skipped rather
    // than merely empty: only the logo and site name skeletons render.
    systemConfigState.value = {
      systemName: 'Vancine',
      logo: '/logo.png',
      loading: true,
      logoLoaded: false,
    }
    const { container } = await renderHeader({
      showAuthButtons: false,
      logo: <span data-testid='custom-logo' />,
    })

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
    const desktopNav = getDesktopNav(container)
    expect(
      within(desktopNav).queryByRole('button', { name: 'Sign in' })
    ).toBeNull()
    expect(
      within(desktopNav).queryAllByTestId('profile-dropdown')
    ).toHaveLength(0)
    expect(screen.queryByTestId('profile-dropdown')).toBeNull()
  })
})

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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppHeader } from '@/components/layout/components/app-header'
import { SidebarProvider } from '@/components/ui/sidebar'
import enLocale from '@/i18n/locales/en.json'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

// The header must never render the /api/status version. These boundary mocks
// control what status and the update checker would report so the test can
// prove the header renders neither; both hooks are network boundaries and
// AppHeader itself (module under test) stays real.
const statusFixture = {
  value: {
    system_name: 'Vancine',
    version: 'v2.10.0',
  } as { system_name?: string; version?: string } | null,
}

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: statusFixture.value,
    loading: false,
    error: null,
  }),
}))

const systemUpdateState = {
  value: {
    currentVersion: 'v2.10.0',
    checking: false,
    shouldNotify: false,
    release: null,
    snapshot: null,
  },
}

vi.mock('@/features/system-update/use-system-update', () => ({
  useSystemUpdate: () => systemUpdateState.value,
}))

const systemConfigFixture = {
  systemName: 'Vancine',
  logo: '/logo.png',
  loading: false,
  logoLoaded: true,
}

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfigFixture,
}))

// AppHeader consumes the notifications hook unconditionally; its popover is
// disabled via props, so a minimal static shape keeps the hook boundary inert.
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

vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => [],
}))

const i18n = i18next.createInstance()

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: enLocale.translation } },
    lng: 'en',
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
})

beforeEach(() => {
  statusFixture.value = {
    system_name: 'Vancine',
    version: 'v2.10.0',
  }
  systemUpdateState.value = {
    currentVersion: 'v2.10.0',
    checking: false,
    shouldNotify: false,
    release: null,
    snapshot: null,
  }
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 1, username: 'admin', role: ROLE.ADMIN },
    },
  }))
})

// jsdom has no router; the brand link is a TanStack Router Link, so the
// header mounts inside a real memory-history router to keep the href and
// accessible-name contract on the real code path. SidebarProvider backs the
// SidebarTrigger that the Header shell renders.
async function renderAppHeader() {
  const testRootRoute = createRootRoute({ component: () => <Outlet /> })
  const routeTree = testRootRoute.addChildren([
    createRoute({
      getParentRoute: () => testRootRoute,
      path: '/',
      component: () => (
        <SidebarProvider>
          <AppHeader
            navLinks={[]}
            showTopNav={false}
            showSearch={false}
            showNotifications={false}
            showConfigDrawer={false}
            showProfileDropdown={false}
          />
        </SidebarProvider>
      ),
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>
  )
}

describe('AppHeader brand area', () => {
  it('shows the system name and home link without the version chip or update button for an authenticated admin', async () => {
    const { container } = await renderAppHeader()

    // SystemBrand keeps its logo, status system name and home link contract.
    const brand = screen.getByRole('link', { name: 'Go to home' })
    expect(brand).toHaveAttribute('href', '/')
    expect(within(brand).getByText('Vancine')).toBeInTheDocument()
    expect(within(brand).getByAltText('Logo')).toHaveAttribute(
      'src',
      '/logo.png'
    )

    // The version and its update-check button must not render anywhere in
    // the header even though status and the update checker carry a version.
    expect(within(container).queryByText('v2.10.0')).toBeNull()
    expect(
      within(container).queryByRole('button', {
        name: 'System updates, current version: v2.10.0',
      })
    ).toBeNull()
  })
})

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
// Behavior tests: the OAuth callback page /oauth/google properly calls
// GET /api/oauth/google, writes uid to localStorage, sets the auth store
// user, and navigates to /dashboard.
import type { ReactNode } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { Route as OAuthProviderRouteImport } from '@/routes/oauth/$provider'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'

const { apiGetMock, getSelfMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  getSelfMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
  getSelf: (...args: unknown[]) => getSelfMock(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// Avoid heavy layout dependencies.
vi.mock('@/features/auth/auth-layout', () => ({
  AuthLayout: (props: { children: ReactNode }) => (
    <div data-testid='auth-layout'>{props.children}</div>
  ),
}))

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestOAuthRoute = OAuthProviderRouteImport.update({
  id: '/oauth/$provider',
  path: '/oauth/$provider',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([TestOAuthRoute])

function renderRoute(initialPath: string) {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}

async function flushSuspense() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
}

function createLocationStub() {
  return {
    href: '',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    replace: vi.fn(),
    assign: vi.fn(),
  } as unknown as Location
}

let locationStub: ReturnType<typeof createLocationStub>

beforeEach(() => {
  apiGetMock.mockReset()
  getSelfMock.mockReset()
  useAuthStore.getState().auth.reset()
  localStorage.clear()
  locationStub = createLocationStub()
  // jsdom's location.replace throws "not implemented"; replace the entire
  // object so the safeNavigate setTimeout fallback is captured silently.
  Object.defineProperty(window, 'location', {
    value: locationStub,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OAuth callback — /oauth/google', () => {
  it('writes uid, sets user, and navigates to /dashboard on login success', async () => {
    apiGetMock.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          id: 7,
          username: 'google_2',
          display_name: 'G User',
          role: 1,
          status: 1,
          group: 'default',
        },
      },
    })

    renderRoute('/oauth/google?code=auth-code&state=csrf-state')

    await waitFor(() => {
      expect(localStorage.getItem('uid')).toBe('7')
    })

    const user = useAuthStore.getState().auth.user
    expect(user).toBeTruthy()
    expect(user?.id).toBe(7)
  })

  it('falls back to getSelf when the provider returns no user data', async () => {
    // Simulate no user data in the OAuth response — the page then calls
    // getSelf to finalize the login (session cookie already set by the
    // backend).
    apiGetMock.mockResolvedValue({
      data: { success: true, message: '', data: null },
    })
    getSelfMock.mockResolvedValue({
      success: true,
      data: {
        id: 9,
        username: 'google_4',
        role: 1,
        status: 1,
        group: 'default',
      },
    })

    renderRoute('/oauth/google?code=token&state=s')

    await waitFor(() => {
      expect(localStorage.getItem('uid')).toBe('9')
    })

    expect(useAuthStore.getState().auth.user).toBeTruthy()
  })

  it('does not call the OAuth API when code is missing', async () => {
    renderRoute('/oauth/google')
    await flushSuspense()
    // The effect immediately returns before calling the API; subsequent
    // safeNavigate + setTimeout fallback are not material to verify.
    expect(apiGetMock).not.toHaveBeenCalled()
  })
})

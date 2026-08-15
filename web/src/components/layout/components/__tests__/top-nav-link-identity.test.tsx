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
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PublicNavigation } from '@/components/layout/components/public-navigation'
import type { TopNavLink } from '@/components/layout/types'

const useTopNavLinksMock = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => useTopNavLinksMock(),
}))

const originalConsoleError = globalThis.console.error.bind(globalThis.console)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PublicNavigation stable key identity', () => {
  it('renders distinct nav items that share the same href without React duplicate-key error', async () => {
    // post-implementation mutation verification: this scenario exercises the
    // duplicate-key contract that href-based keys (pre-C5-2) could not satisfy
    // when two different navigation identities pointed to the same href.
    const links: TopNavLink[] = [
      { id: 'console', title: 'Console', href: '/dashboard' },
      { id: 'docs', title: 'Docs', href: '/dashboard' },
    ]
    useTopNavLinksMock.mockReturnValue(links)

    const errors: string[] = []
    const spy = vi
      .spyOn(globalThis.console, 'error')
      .mockImplementation((...args: unknown[]) => {
        errors.push(String(args[0] ?? ''))
        originalConsoleError(...args)
      })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <PublicNavigation />,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    try {
      render(<RouterProvider router={router} />)

      const links = await screen.findAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(2)

      const consoleLink = links.filter((l) => l.textContent === 'Console')
      const docsLink = links.filter((l) => l.textContent === 'Docs')
      expect(consoleLink.length).toBeGreaterThanOrEqual(1)
      expect(docsLink.length).toBeGreaterThanOrEqual(1)

      const duplicateKeyErrors = errors.filter((msg) =>
        /Encountered two children.*with the same key/i.test(msg)
      )
      expect(duplicateKeyErrors).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })
})

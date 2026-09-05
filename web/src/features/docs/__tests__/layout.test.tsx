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
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as DocsSlugRouteImport } from '@/routes/docs/$slug'
import { Route as DocsIndexRouteImport } from '@/routes/docs/index'

import { DocsLayout } from '../index'
import { initTestI18n } from './test-i18n'
import { renderWithProviders } from './test-utils'

// Isolate the Docs layout from the full site header/footer.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Avoid the real /api/status network request in jsdom.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

// Build a real router from the actual docs route modules (wired exactly like
// routeTree.gen.ts) so beforeLoad / notFoundComponent are genuinely exercised.
const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestDocsIndexRoute = DocsIndexRouteImport.update({
  id: '/docs/',
  path: '/docs/',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsSlugRoute = DocsSlugRouteImport.update({
  id: '/docs/$slug',
  path: '/docs/$slug',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([
  TestDocsIndexRoute,
  TestDocsSlugRoute,
])

function renderDocsRouter(initialPath: string) {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}

// Wait until the lazily loaded docs content is mounted. waitFor polls
// inside RTL's act-wrapped asyncWrapper, so the bundle load and the
// React.lazy Suspense pings settle under act.
async function suspenseFlushed() {
  await waitFor(() =>
    expect(
      screen.queryByText('Loading docs...') ?? screen.getByRole('navigation')
    ).toBeTruthy()
  )
}

beforeEach(async () => {
  await initTestI18n('en')
})

describe('Docs layout structure', () => {
  it('renders a mobile-stacking / lg three-column container with a usable main', async () => {
    renderWithProviders(<DocsLayout slugParam='quickstart' />)
    await suspenseFlushed()

    const main = await screen.findByRole('main', {}, { timeout: 3000 })
    await waitFor(
      () =>
        expect(screen.getAllByText('Quick Start').length).toBeGreaterThan(0),
      { timeout: 3000 }
    )
    await suspenseFlushed()

    expect(main.className).toContain('min-w-0')
    expect(main.className).toContain('flex-1')

    const container = main.parentElement as HTMLElement
    expect(container.className).toContain('flex-col')
    expect(container.className).toContain('lg:flex-row')

    const tocAside = container.querySelector('aside') as HTMLElement
    expect(tocAside).not.toBeNull()
    expect(tocAside.className).toContain('lg:block')
    expect(tocAside.className).not.toContain('xl:block')
  })
})

describe('Docs unknown-slug routing (real router beforeLoad/notFound)', () => {
  it('navigating to /docs/<unknown> hits beforeLoad → notFound → localized not-found page', async () => {
    renderDocsRouter('/docs/not-a-real-slug')
    await suspenseFlushed()

    await waitFor(
      () => expect(screen.getByText('Page not found')).toBeInTheDocument(),
      { timeout: 3000 }
    )
    // Quickstart (or any nav item) must not be highlighted.
    expect(document.querySelectorAll('[aria-current="page"]').length).toBe(0)
  })

  it('navigating to a known slug renders that page', async () => {
    renderDocsRouter('/docs/chat')
    await suspenseFlushed()
    await waitFor(
      () =>
        expect(screen.getAllByText('Chat Completions').length).toBeGreaterThan(
          0
        ),
      { timeout: 3000 }
    )
    await suspenseFlushed()
  })

  it('DocsLayout defensive branch also handles an invalid slug prop', async () => {
    renderWithProviders(<DocsLayout slugParam='definitely-not-a-page' />)
    await suspenseFlushed()
    await waitFor(
      () => expect(screen.getByText('Page not found')).toBeInTheDocument(),
      { timeout: 3000 }
    )
    expect(document.querySelectorAll('[aria-current="page"]').length).toBe(0)
  })
})

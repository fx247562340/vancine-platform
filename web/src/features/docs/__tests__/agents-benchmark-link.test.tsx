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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocsI18nProvider } from '../i18n/docs-i18n'
import Agents from '../pages/agents'
import {
  EN_DOCS,
  clearDocsBundle,
  initTestI18n,
  setDocsBundle,
} from './test-i18n'

const testRootRoute = createRootRoute({
  component: () => <Outlet />,
})
const agentsRoute = createRoute({
  getParentRoute: () => testRootRoute,
  path: '/',
  component: () => (
    <DocsI18nProvider>
      <Agents baseUrl='https://vancine.com/v1' />
    </DocsI18nProvider>
  ),
})
const benchmarkRoute = createRoute({
  getParentRoute: () => testRootRoute,
  path: '/coding-agent-benchmark',
  component: () => <div data-testid='benchmark-page' />,
})
const testRouteTree = testRootRoute.addChildren([agentsRoute, benchmarkRoute])

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
})

afterEach(() => {
  clearDocsBundle('en')
})

describe.skipIf(typeof document === 'undefined')(
  'docs agents public resource entry',
  () => {
    it('shows a visible link to /coding-agent-benchmark', async () => {
      const router = createRouter({
        routeTree: testRouteTree,
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )

      const link = await screen.findByRole('link', {
        name: 'See the 8-model Pi coding-agent benchmark',
      })
      expect(link).toHaveAttribute('href', '/coding-agent-benchmark')
    })
  }
)

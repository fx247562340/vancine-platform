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
import { render, type RenderResult } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import zhLocale from '@/i18n/locales/zh.json'
import { Route as AiMediaApiRouteImport } from '@/routes/ai-media-api/index'

/**
 * Shared scaffolding for the ai-media-api page tests. Each test file
 * installs its own module-level `vi.mock` factories (`@/components/layout`,
 * `@/hooks/use-status`, `@/hooks/use-system-config`, `@/lib/analytics`,
 * `@/features/pricing/api`) so the helper is purely about rendering.
 */
let i18nReady = false

export async function ensureAiMediaApiI18n(): Promise<void> {
  if (i18nReady) {
    await i18n.changeLanguage('en')
    return
  }
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

export function renderAiMediaApiPage(
  initialPath = '/ai-media-api/'
): RenderResult {
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

/**
 * Like `renderAiMediaApiPage` but with a spied outer retry policy
 * (`retry: outerRetryPolicy`) so the test can assert that the
 * `useLiveModelCatalog` hook pins its own `retry: false` and the
 * outer policy is never invoked. Returns both the render result and
 * the spy so the test can read the call count synchronously.
 */
export function renderAiMediaApiPageWithOuterRetry(
  initialPath = '/ai-media-api/'
): { render: RenderResult; outerRetryPolicy: ReturnType<typeof vi.fn> } {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const outerRetryPolicy = vi.fn((_failureCount: number, _error: Error) => true)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: outerRetryPolicy, retryDelay: 0 },
    },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { render: result, outerRetryPolicy }
}

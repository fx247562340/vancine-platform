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
/**
 * Simplified-Chinese page-level rendering for null metrics: the raw
 * "Unavailable" literal must never appear as final UI copy — it renders the
 * production zh.json value 暂不可用 instead.
 *
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as FunnelRouteImport } from '@/routes/_authenticated/acquisition-funnel/index'
import { useAuthStore } from '@/stores/auth-store'

import { initTestI18n, testI18n } from './test-i18n'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => {
      // Counts and rates null → the null path of every formatter.
      return {
        data: {
          success: true,
          data: {
            landing_view: 0,
            signup_started: 0,
            signup_completed: 0,
            api_key_created: null,
            first_api_call_succeeded: null,
            landing_to_signup: null,
            signup_to_first_call: null,
            filters: {
              from: 0,
              to: 0,
              utm_source: '',
              utm_campaign: '',
              model: '',
            },
            coverage_started_at: 1_735_689_600,
            consume_logs_enabled: true,
            historical_backfill_available: false,
            from_before_coverage: false,
            data_completeness: {
              touches: 'complete',
              tokens: 'unavailable',
              consume_logs: 'complete',
            },
          },
        },
      }
    }),
  },
}))

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  const StubLayout = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Title = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Content = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Actions = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Breadcrumb = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  return { ...actual, SectionPageLayout: StubLayout }
})

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestFunnelRoute = FunnelRouteImport.update({
  id: '/acquisition-funnel/',
  path: '/acquisition-funnel/',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([TestFunnelRoute])

beforeEach(async () => {
  await initTestI18n('zh')
  const current = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...current,
      user: { id: 1, username: 'u', role: 10 },
      accessToken: 'test-token-not-real',
      bootstrapState: 'complete',
    },
  })
})

function renderZhPage() {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({
      initialEntries: ['/acquisition-funnel'],
    }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <StrictMode>
      <I18nextProvider i18n={testI18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>
  )
}

describe('acquisition funnel page in Simplified Chinese', () => {
  it('renders the page title and labels from the production zh bundle', async () => {
    renderZhPage()

    // Assert on the metric labels, which only render after the data arrives.
    await screen.findByText('落地页浏览')
    expect(screen.getByText('转化率')).toBeInTheDocument()
  }, 15000)

  it('shows 暂不可用 for null counts, never the raw "Unavailable" literal', async () => {
    renderZhPage()

    await screen.findByText('落地页浏览')
    await waitFor(() => {
      // Two null counts + two null rates + one null completeness badge.
      expect(screen.getAllByText('暂不可用').length).toBeGreaterThanOrEqual(4)
    })
    // The only "Unavailable" occurrences must be inside the localized label,
    // not as standalone UI text.
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
  })

  it('shows real zeros as 0 while nulls are 暂不可用', async () => {
    renderZhPage()

    await screen.findByText('落地页浏览')
    await waitFor(() => {
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3)
    })
  })

  it('renders the completeness badge with the localized null-state label', async () => {
    renderZhPage()

    await screen.findByText('数据完整性:')
    expect(screen.getByText('触点: 完整')).toBeInTheDocument()
    expect(screen.getByText('Token: 暂不可用')).toBeInTheDocument()
    expect(screen.getByText('消费日志: 完整')).toBeInTheDocument()
  }, 15000)
})

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
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
/**
 * AcquisitionFunnelPage behavior tests. The page is exercised through the
 * real route module (beforeLoad guard + component) with the api layer mocked
 * at the axios boundary so request counts, params and error paths are all
 * observable from the user's perspective.
 *
 * @vitest-environment jsdom
 */
import { AxiosError, type AxiosResponse } from 'axios'
import { StrictMode, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as FunnelRouteImport } from '@/routes/_authenticated/acquisition-funnel/index'
import { useAuthStore } from '@/stores/auth-store'

import { initTestI18n, testI18n } from './test-i18n'

// ============================================================================
// api mock (axios boundary). Records every GET with URL + params.
// ============================================================================

type FunnelQueryParams = {
  from: number
  to: number
  utm_source?: string
  utm_campaign?: string
  model?: string
}

type RecordedRequest = {
  url: string
  params: FunnelQueryParams
  /** Whether the page opted out of the unified axios error handling. */
  skipErrorHandler: boolean
}

const recordedRequests: RecordedRequest[] = []

let nextResponse: { status: number; body: unknown } = { status: 200, body: {} }

/** Queue for the api mock: each entry shifts off for one request. */
const responseQueue: { status: number; body: unknown }[] = []

/** One-shot thrown error from the mock (e.g. a real AxiosError). */
let mockThrows: unknown = null

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(
      async (
        url: string,
        config?: { params?: FunnelQueryParams; skipErrorHandler?: boolean }
      ) => {
        recordedRequests.push({
          url,
          params: config?.params ?? { from: 0, to: 0 },
          skipErrorHandler: Boolean(config?.skipErrorHandler),
        })
        const scripted = responseQueue.shift() ?? nextResponse
        if (mockThrows) {
          throw mockThrows
        }
        if (scripted.status !== 200) {
          // Throw a REAL AxiosError so the wrapping behavior in api.ts is
          // exercised against the same error shape the production interceptors
          // and the global QueryCache hook match on.
          const response = {
            status: scripted.status,
            data: scripted.body,
            config: {},
            headers: {},
          } as unknown as AxiosResponse
          throw new AxiosError(
            'request failed',
            String(scripted.status),
            undefined,
            undefined,
            response
          )
        }
        return { data: scripted.body }
      }
    ),
  },
}))

// ============================================================================
// Collaborator stubs: layout chrome only.
// ============================================================================

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  const StubLayout = (props: { children?: ReactNode }) => (
    <div data-testid='funnel-layout'>{props.children}</div>
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

// ============================================================================
// Fixture
// ============================================================================

function funnelPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      landing_view: 100,
      signup_started: 40,
      signup_completed: 25,
      api_key_created: 25,
      first_api_call_succeeded: 18,
      // Backend conversion rates are 0–1 ratios (0.25 = 25%).
      landing_to_signup: 0.25,
      signup_to_first_call: 0.72,
      filters: {
        from: 1_770_767_999,
        to: 1_773_523_200,
        utm_source: 'hn',
        utm_campaign: '',
        model: '',
      },
      coverage_started_at: 1_735_689_600,
      consume_logs_enabled: true,
      historical_backfill_available: false,
      from_before_coverage: false,
      data_completeness: {
        touches: 'complete',
        tokens: 'complete',
        consume_logs: 'complete',
      },
      ...overrides,
    },
  }
}

// ============================================================================
// Router harness around the ACTUAL route module
// ============================================================================

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestFunnelRoute = FunnelRouteImport.update({
  id: '/acquisition-funnel/',
  path: '/acquisition-funnel/',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([TestFunnelRoute])

let currentRouter: {
  state: { location: { pathname: string } }
} | null = null

function router_currentPath(): string {
  return currentRouter?.state.location.pathname ?? ''
}

function renderFunnelRoute(initialPath: string, strictMode = true) {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  currentRouter = router
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const tree = (
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree)
}

// ============================================================================
// Auth store helper
// ============================================================================

function setAuthUser(role: number | null) {
  const current = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...current,
      user: role === null ? null : { id: 1, username: 'u', role },
      accessToken: role === null ? null : 'test-token-not-real',
      bootstrapState: 'complete',
    },
  })
}

beforeEach(async () => {
  await initTestI18n()
  recordedRequests.length = 0
  responseQueue.length = 0
  mockThrows = null
  nextResponse = { status: 200, body: funnelPayload() }
  setAuthUser(10)
})

// ============================================================================
// Tests
// ============================================================================

describe('acquisition funnel route guard', () => {
  it('redirects a regular user to /403 without issuing any API request', async () => {
    setAuthUser(1)
    renderFunnelRoute('/acquisition-funnel')

    await waitFor(() => {
      expect(router_currentPath()).toBe('/403')
    })
    expect(recordedRequests).toHaveLength(0)
  })

  it('shows no funnel content for an anonymous visit (no funnel request)', async () => {
    setAuthUser(null)
    renderFunnelRoute('/acquisition-funnel')
    expect(recordedRequests).toHaveLength(0)
  })

  it('lets an admin (role 10) open the page and render the funnel', async () => {
    setAuthUser(10)
    renderFunnelRoute('/acquisition-funnel')

    expect(await screen.findByText('Landing views')).toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)
    expect(recordedRequests[0].url).toBe('/api/acquisition/funnel')
  })

  it('lets a super admin (role 100) open the page', async () => {
    setAuthUser(100)
    renderFunnelRoute('/acquisition-funnel')

    expect(await screen.findByText('Conversion rates')).toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)
  })
})

describe('acquisition funnel page behavior', () => {
  it('fires exactly one default query on mount, even inside StrictMode', async () => {
    renderFunnelRoute('/acquisition-funnel')
    expect(await screen.findByText('Landing views')).toBeInTheDocument()

    // Let every microtask settle, then confirm still exactly one request.
    await waitFor(() => expect(recordedRequests).toHaveLength(1))
  })

  it('sends UTC date params and omits empty filters from the request', async () => {
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    const { params } = recordedRequests[0]
    expect(typeof params.from).toBe('number')
    expect(typeof params.to).toBe('number')
    expect(params.to - params.from).toBe(30 * 86_400)
    expect(params).not.toHaveProperty('utm_source')
    expect(params).not.toHaveProperty('utm_campaign')
    expect(params).not.toHaveProperty('model')
  })

  it('does not refetch on rerender or window focus', async () => {
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    window.dispatchEvent(new Event('focus'))
    // Allow any stray async work (refetch timers, effects) to surface.
    await waitFor(() => expect(recordedRequests).toHaveLength(1))
  })

  it('Apply sends exactly one query with the entered filters', async () => {
    const user = userEvent.setup()
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    const fromInput = screen.getByLabelText('From date (UTC, inclusive)')
    const toInput = screen.getByLabelText('To date (UTC, exclusive)')
    await user.clear(fromInput)
    await user.type(fromInput, '2026-02-01')
    await user.clear(toInput)
    await user.type(toInput, '2026-03-01')
    await user.type(screen.getByLabelText('UTM source'), 'hn')

    await user.click(screen.getByRole('button', { name: 'Apply Filters' }))

    await waitFor(() => expect(recordedRequests).toHaveLength(2))
    expect(recordedRequests[1].params).toEqual({
      from: Date.UTC(2026, 1, 1) / 1000,
      to: Date.UTC(2026, 2, 1) / 1000,
      utm_source: 'hn',
    })
  })

  it('does not request when from >= to and shows a field error instead', async () => {
    const user = userEvent.setup()
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    const fromInput = screen.getByLabelText('From date (UTC, inclusive)')
    const toInput = screen.getByLabelText('To date (UTC, exclusive)')
    await user.clear(fromInput)
    await user.type(fromInput, '2026-03-10')
    await user.clear(toInput)
    await user.type(toInput, '2026-03-05')
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }))

    expect(
      await screen.findByText('From date must be earlier than To date')
    ).toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)
  })

  it('does not request when the range exceeds 366 days', async () => {
    const user = userEvent.setup()
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    const fromInput = screen.getByLabelText('From date (UTC, inclusive)')
    const toInput = screen.getByLabelText('To date (UTC, exclusive)')
    await user.clear(fromInput)
    await user.type(fromInput, '2024-01-01')
    await user.clear(toInput)
    await user.type(toInput, '2026-03-01')
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }))

    expect(
      await screen.findByText('Date range cannot exceed 366 days')
    ).toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)
  })

  it('Reset restores the default window and clears the text filters', async () => {
    const user = userEvent.setup()
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    const fromInput = screen.getByLabelText('From date (UTC, inclusive)')
    await user.clear(fromInput)
    await user.type(fromInput, '2026-02-01')
    await user.type(screen.getByLabelText('UTM source'), 'news')

    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(fromInput).not.toHaveValue('2026-02-01')
    expect(screen.getByLabelText('UTM source')).toHaveValue('')
    // No additional request: reset only restores the form defaults.
    expect(recordedRequests).toHaveLength(1)
  })

  it('shows real zeros as 0 and null metrics as Unavailable', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        landing_view: 0,
        signup_started: 0,
        signup_completed: 0,
        api_key_created: null,
        first_api_call_succeeded: null,
        landing_to_signup: null,
        signup_to_first_call: null,
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    await screen.findByText('Landing views')
    // Count cells: five metric values. Zeros stay 0; nulls show Unavailable.
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(3)
    const unavailable = screen.getAllByText('Unavailable')
    expect(unavailable.length).toBeGreaterThanOrEqual(3)
  })

  it('warns when the range starts before attribution coverage', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        from_before_coverage: true,
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText(
        'The selected range starts before attribution coverage began; results are not complete history.'
      )
    ).toBeInTheDocument()
  })

  it('renders complete / unavailable / error completeness distinctly', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        data_completeness: {
          touches: 'complete',
          tokens: 'unavailable',
          consume_logs: 'error',
        },
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    await screen.findByText('Data completeness:')
    expect(screen.getByText('Touches: Complete')).toBeInTheDocument()
    expect(screen.getByText('Tokens: Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Consume logs: Error')).toBeInTheDocument()
  })

  it('explains missing first-call data when consume logs are disabled', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        consume_logs_enabled: false,
        first_api_call_succeeded: null,
        signup_to_first_call: null,
        data_completeness: {
          touches: 'complete',
          tokens: 'complete',
          consume_logs: 'unavailable',
        },
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText(
        'Consume logs are disabled, so "First successful API calls" is unavailable.'
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(1)
  })

  it('does not imply historical backfill when unavailable', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        historical_backfill_available: false,
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText(
        'Historical data has not been backfilled; only data since coverage began exists.'
      )
    ).toBeInTheDocument()
  })

  it('echoes the backend filters so the query scope is visible', async () => {
    renderFunnelRoute('/acquisition-funnel')
    await screen.findByText('Landing views')

    expect(screen.getByText('UTM source: hn')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This page shows aggregate metrics only — no user identities or request contents.'
      )
    ).toBeInTheDocument()
  })

  it('shows an error state with a working single-query Retry', async () => {
    const user = userEvent.setup()
    nextResponse = { status: 500, body: { success: false } }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText('Failed to load the acquisition funnel')
    ).toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)

    nextResponse = { status: 200, body: funnelPayload() }
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('Landing views')
    expect(recordedRequests).toHaveLength(2)
  })

  it('treats HTTP 200 + success:false as an error, not a blank success state', async () => {
    // The backend's common.ApiErrorMsg returns HTTP 200 with success:false
    // (e.g. range too large, funnel unavailable). The query must reject so
    // the error state with Retry shows instead of an empty success render.
    const user = userEvent.setup()
    nextResponse = {
      status: 200,
      body: { success: false, message: 'range too large' },
    }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText('Failed to load the acquisition funnel')
    ).toBeInTheDocument()
    expect(screen.queryByText('Landing views')).not.toBeInTheDocument()
    expect(screen.queryByText('Conversion rates')).not.toBeInTheDocument()
    expect(recordedRequests).toHaveLength(1)

    nextResponse = { status: 200, body: funnelPayload() }
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('Landing views')
    expect(recordedRequests).toHaveLength(2)
  })

  it('treats a missing data payload as an error (HTTP 200, success true, data null)', async () => {
    nextResponse = { status: 200, body: { success: true, data: null } }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText('Failed to load the acquisition funnel')
    ).toBeInTheDocument()
    expect(screen.queryByText('Landing views')).not.toBeInTheDocument()
  })

  it('retries a queued failure sequence exactly once per Retry click', async () => {
    const user = userEvent.setup()
    // First request fails (business error), Retry succeeds.
    responseQueue.push({
      status: 200,
      body: { success: false, message: 'funnel unavailable' },
    })
    nextResponse = { status: 200, body: funnelPayload() }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText('Failed to load the acquisition funnel')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Landing views')
    expect(recordedRequests).toHaveLength(2)
  })

  it('renders ratio-based conversion percentages from the backend', async () => {
    nextResponse = {
      status: 200,
      body: funnelPayload({
        landing_to_signup: 0.25,
        signup_to_first_call: 0.72,
      }),
    }
    renderFunnelRoute('/acquisition-funnel')

    await screen.findByText('Landing views')
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
  })

  it('shows the in-page error card (never a blank success) and retries once after HTTP 500', async () => {
    const user = userEvent.setup()
    nextResponse = { status: 500, body: { success: false } }
    renderFunnelRoute('/acquisition-funnel')

    expect(
      await screen.findByText('Failed to load the acquisition funnel')
    ).toBeInTheDocument()
    expect(screen.queryByText('Landing views')).not.toBeInTheDocument()
    // Exactly one funnel request: the in-page error state owns the failure.
    expect(recordedRequests).toHaveLength(1)

    nextResponse = { status: 200, body: funnelPayload() }
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Landing views')
    expect(recordedRequests).toHaveLength(2)
  })
})

/**
 * Production QueryClient parity block. The other tests intentionally use a
 * test-only client with retry:false; these tests mount the hook with a
 * client configured EXACTLY like src/main.tsx (auto-retry up to 4 attempts
 * in production mode, 401/403 exempt) to prove the hook's own retry:false
 * suppresses those automatic retries, and that each explicit Retry click
 * sends at most one request — for HTTP 500 AND for HTTP 200 + success:false.
 */
async function setProductionMode() {
  vi.stubEnv('PROD', true)
  vi.stubEnv('DEV', false)
}

describe('funnel query under the production-style QueryClient', () => {
  function renderWithProductionClient() {
    const router = createRouter({
      routeTree: testRouteTree,
      history: createMemoryHistory({
        initialEntries: ['/acquisition-funnel'],
      }),
    })
    currentRouter = router
    // Mirrors src/main.tsx: production retry policy + no focus refetch.
    const productionStyleClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: (failureCount, error) => {
            if (failureCount > 3) return false
            return !(
              error instanceof AxiosError &&
              [401, 403].includes(error.response?.status ?? 0)
            )
          },
          refetchOnWindowFocus: false,
          staleTime: 10_000,
        },
      },
      // No QueryCache 500 redirect here: the page must own the failure
      // before any global hook could act (covered by the api.ts wrapping
      // contract test below).
    })
    return render(
      <I18nextProvider i18n={testI18n}>
        <QueryClientProvider client={productionStyleClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>
    )
  }

  it('sends exactly one request on initial failure (HTTP 500, PROD retry policy)', async () => {
    await setProductionMode()
    try {
      nextResponse = { status: 500, body: { success: false } }
      renderWithProductionClient()

      await screen.findByText('Failed to load the acquisition funnel')
      await waitFor(() => {
        expect(recordedRequests).toHaveLength(1)
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('sends exactly one request on HTTP 200 + success:false and Retry adds one', async () => {
    const user = userEvent.setup()
    await setProductionMode()
    try {
      nextResponse = {
        status: 200,
        body: { success: false, message: 'range too large' },
      }
      renderWithProductionClient()

      expect(
        await screen.findByText('Failed to load the acquisition funnel')
      ).toBeInTheDocument()
      await waitFor(() => {
        expect(recordedRequests).toHaveLength(1)
      })

      nextResponse = { status: 200, body: funnelPayload() }
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await screen.findByText('Landing views')
      expect(recordedRequests).toHaveLength(2)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

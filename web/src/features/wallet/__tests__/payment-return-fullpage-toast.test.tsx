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
// the real Route + RootComponent, which mount the real Toaster and the Outlet in
// the production order). Only the Outlet element is mocked to render the wallet
// page; the test does NOT copy the <Toaster/>/<Outlet/> sibling order — that order
// comes from the production file, so reverting the production order is what turns
// this suite RED (proven in the correction pass by a temporary revert/restore).
// The `toast` API is deliberately NOT mocked; assertions read the visible DOM.
/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://app.example.com/wallet"}
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { StrictMode } from 'react'
import { initReactI18next, I18nextProvider } from 'react-i18next'
// Production-form integration regression for F-B12/F-B13: a full-page initial
// load of the wallet route must surface exactly one localized toast through
// the REAL Sonner Toaster. The wallet page's mount effect must not dispatch
// before the Toaster has subscribed, or the toast is dropped.
//
// This test imports and renders the PRODUCTION root shell (`src/routes/__root.tsx`:
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as RootRoute } from '@/routes/__root'
import { Route as WalletRouteImport } from '@/routes/_authenticated/wallet/index'

// ============================================================================
// Real production shell: RootRoute (real beforeLoad/component) + a wallet
// child. The Outlet element from @tanstack/react-router is the ONLY piece
// replaced: it renders the wallet page with the one-shot payment-return props
// so the wallet mounts as a sibling of the real Toaster in the production
// order defined by RootComponent's JSX.
// ============================================================================

interface FullPageProps {
  paymentError?: boolean
  paymentPending?: boolean
  paymentCancel?: boolean
  initialShowHistory?: boolean
}

const shell = vi.hoisted(() => ({ walletProps: {} as FullPageProps }))

vi.mock('@tanstack/react-router', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  const { Wallet } = await import('@/features/wallet')
  const MockOutlet = () => (
    <Wallet
      paymentError={shell.walletProps.paymentError}
      paymentPending={shell.walletProps.paymentPending}
      paymentCancel={shell.walletProps.paymentCancel}
      initialShowHistory={shell.walletProps.initialShowHistory}
    />
  )
  return { ...actual, Outlet: MockOutlet }
})

// Root shell chrome stubs: not under test, and they keep the shell from
// touching analytics / navigation progress / session refresh on mount.
vi.mock('@/features/acquisition/components/acquisition-bootstrap', () => ({
  AcquisitionBootstrap: () => null,
}))
vi.mock('@/components/navigation-progress', () => ({
  NavigationProgress: () => null,
}))
vi.mock('@/lib/auth-session', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/auth-session')>()
  return {
    ...actual,
    bootstrapAuthentication: async () =>
      ({ kind: 'anonymous' }) as Awaited<
        ReturnType<typeof actual.bootstrapAuthentication>
      >,
  }
})
vi.mock('@/lib/auth-session-sync', () => ({
  subscribeAuthSessionEvents: () => () => undefined,
}))

// ============================================================================
// Collaborator stubs (data hooks + presentational cards; toast stays REAL)
// ============================================================================

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  const StubLayout = (props: { children?: React.ReactNode }) => (
    <div data-testid='wallet-layout'>{props.children}</div>
  )
  StubLayout.Title = (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Content = (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  )
  return { ...actual, SectionPageLayout: StubLayout }
})

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { price: 1 }, loading: false, error: null }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    currency: { quotaDisplayType: 'USD', usdExchangeRate: 1 },
  }),
}))

vi.mock('@/lib/api', () => ({
  getSelf: vi.fn(async () => ({
    success: true,
    data: { id: 1, username: 'wallet-tester', quota: 0, aff_quota: 0 },
  })),
  // the root beforeLoad setup check reads /api/setup; a setup-complete
  // response avoids the redirect-to-/setup branch in the real shell
  api: {
    get: vi.fn(async () => ({
      success: true,
      data: { status: true, root_init: true, database_type: 'postgres' },
    })),
  },
}))

vi.mock('@/features/wallet/hooks', () => ({
  useTopupInfo: () => ({
    topupInfo: null,
    presetAmounts: [],
    loading: false,
    refetch: () => Promise.resolve(),
  }),
  usePayment: () => ({
    amount: 0,
    calculating: false,
    processing: false,
    calculatePaymentAmount: vi.fn(async () => undefined),
    processPayment: vi.fn(async () => true),
  }),
  useAffiliate: () => ({
    affiliateLink: '',
    loading: false,
    transferQuota: vi.fn(async () => true),
    transferring: false,
  }),
  useRedemption: () => ({
    redeeming: false,
    redeemCode: vi.fn(async () => true),
  }),
  useCreemPayment: () => ({
    processing: false,
    processCreemPayment: vi.fn(async () => true),
  }),
  useWaffoPayment: () => ({
    processing: false,
    processWaffoPayment: vi.fn(async () => true),
  }),
  useWaffoPancakePayment: () => ({
    processing: false,
    processWaffoPancakePayment: vi.fn(async () => true),
  }),
}))

vi.mock('@/features/wallet/components/wallet-stats-card', () => ({
  WalletStatsCard: () => <div data-testid='wallet-stats' />,
}))
vi.mock('@/features/wallet/components/recharge-form-card', () => ({
  RechargeFormCard: () => <div data-testid='recharge-form' />,
}))
vi.mock('@/features/wallet/components/subscription-plans-card', () => ({
  SubscriptionPlansCard: () => <div data-testid='subscription-plans' />,
}))
vi.mock('@/features/wallet/components/affiliate-rewards-card', () => ({
  AffiliateRewardsCard: () => <div data-testid='affiliate-rewards' />,
}))
vi.mock('@/features/wallet/components/dialogs/payment-confirm-dialog', () => ({
  PaymentConfirmDialog: (props: { open: boolean }) => (
    <div data-testid='payment-confirm' data-open={String(props.open)} />
  ),
}))
vi.mock('@/features/wallet/components/dialogs/transfer-dialog', () => ({
  TransferDialog: (props: { open: boolean }) => (
    <div data-testid='transfer-dialog' data-open={String(props.open)} />
  ),
}))
vi.mock('@/features/wallet/components/dialogs/billing-history-dialog', () => ({
  BillingHistoryDialog: (props: { open: boolean }) => (
    <div data-testid='billing-history' data-open={String(props.open)} />
  ),
}))
vi.mock('@/features/wallet/components/dialogs/creem-confirm-dialog', () => ({
  CreemConfirmDialog: (props: { open: boolean }) => (
    <div data-testid='creem-confirm' data-open={String(props.open)} />
  ),
}))

// ============================================================================
// Test i18n instance
// ============================================================================

const PAYMENT_ERROR_MESSAGE =
  'PayPal payment processing failed. Please try again or contact support.'
const PAYMENT_PENDING_MESSAGE =
  'Your PayPal payment is still being processed. Please check your billing history later.'
const PAYMENT_CANCEL_MESSAGE =
  'PayPal checkout was cancelled. No payment was made and your balance is unchanged.'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  resources: {
    en: {
      translation: {
        Wallet: 'Wallet',
        [PAYMENT_ERROR_MESSAGE]: PAYMENT_ERROR_MESSAGE,
        [PAYMENT_PENDING_MESSAGE]: PAYMENT_PENDING_MESSAGE,
        [PAYMENT_CANCEL_MESSAGE]: PAYMENT_CANCEL_MESSAGE,
      },
    },
  },
})

// ============================================================================
// Router harness around the ACTUAL production root shell
// ============================================================================

const TestWalletRoute = WalletRouteImport.update({
  id: '/wallet/',
  path: '/wallet/',
  getParentRoute: () => RootRoute,
} as never)
const testRouteTree = RootRoute.addChildren([TestWalletRoute])

/**
 * Renders the PRODUCTION RootComponent (real Toaster + real Outlet order from
 * src/routes/__root.tsx) with the wallet page as the Outlet content. The
 * Toaster's subscription effect and the wallet's payment-return effect run in
 * the same commit; the production sibling order decides which fires first.
 */
function renderFullPage(props: FullPageProps, strictMode = false) {
  shell.walletProps = props
  window.localStorage.setItem('setup_status_checked', 'true')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: testRouteTree,
    context: { queryClient },
    history: createMemoryHistory({
      initialEntries: [
        window.location.pathname +
          window.location.search +
          window.location.hash,
      ],
    }),
  })
  const tree = (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree)
}

function setWalletUrl(pathAndQuery: string): void {
  window.history.replaceState(null, '', pathAndQuery)
}

function toastElements(): Element[] {
  return [
    ...document.querySelectorAll('[data-sonner-toast][data-removed="false"]'),
  ]
}

function toastsByType(type: string): Element[] {
  return toastElements().filter((el) => el.getAttribute('data-type') === type)
}

function expectPaymentFlagsConsumed(): void {
  const params = new URLSearchParams(window.location.search)
  expect(params.has('payment_error')).toBe(false)
  expect(params.has('payment_pending')).toBe(false)
  expect(params.has('show_history')).toBe(false)
  expect(params.has('payment_cancel')).toBe(false)
}

function findByTestId(testId: string): Promise<Element> {
  return waitFor(() => {
    const el = document.querySelector(`[data-testid="${testId}"]`)
    if (!el) throw new Error(`missing [data-testid="${testId}"]`)
    return el
  })
}

beforeEach(() => {
  setWalletUrl('/wallet')
})

afterEach(() => {
  cleanup()
  // The sonner toast store is a module singleton: without an explicit
  // dismiss, toasts from a finished test re-mount with the next Toaster and
  // pollute the "exactly one toast" assertions below.
  toast.dismiss()
  vi.restoreAllMocks()
})

// ============================================================================
// Full-page initial load: exactly one localized toast via the real Toaster
// ============================================================================

describe('wallet payment-return full-page load toasts (real Toaster + real root shell)', () => {
  it('shows exactly one error toast in the DOM for a full-page payment_error=true load', async () => {
    setWalletUrl('/wallet?payment_error=true')

    renderFullPage({ paymentError: true })

    await waitFor(() => {
      expect(toastsByType('error').length).toBe(1)
    })
    expect(toastElements().length).toBe(1)
    expect(toastElements()[0]?.textContent).toContain(PAYMENT_ERROR_MESSAGE)
    expect(toastsByType('warning').length).toBe(0)
    expect(toastsByType('info').length).toBe(0)
    expect(toastsByType('success').length).toBe(0)
    const confirm = await findByTestId('payment-confirm')
    expect(confirm.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('shows exactly one pending (warning) toast in the DOM for a full-page payment_pending=true load', async () => {
    setWalletUrl('/wallet?payment_pending=true')

    renderFullPage({ paymentPending: true })

    await waitFor(() => {
      expect(toastsByType('warning').length).toBe(1)
    })
    expect(toastElements().length).toBe(1)
    expect(toastElements()[0]?.textContent).toContain(PAYMENT_PENDING_MESSAGE)
    expect(toastsByType('error').length).toBe(0)
    expect(toastsByType('info').length).toBe(0)
    expect(toastsByType('success').length).toBe(0)
    expectPaymentFlagsConsumed()
  })

  it('shows exactly one cancel (info) toast in the DOM for a full-page payment_cancel=true load and never opens history or claims success', async () => {
    setWalletUrl('/wallet?payment_cancel=true')

    renderFullPage({ paymentCancel: true })

    await waitFor(() => {
      expect(toastsByType('info').length).toBe(1)
    })
    expect(toastElements().length).toBe(1)
    expect(toastElements()[0]?.textContent).toContain(PAYMENT_CANCEL_MESSAGE)
    // cancel must not show success / error / pending
    expect(toastsByType('success').length).toBe(0)
    expect(toastsByType('error').length).toBe(0)
    expect(toastsByType('warning').length).toBe(0)
    // cancel never opens the billing history dialog
    const history = await findByTestId('billing-history')
    expect(history.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('prefers error over pending and cancel with exactly one toast on a full-page load', async () => {
    setWalletUrl(
      '/wallet?payment_error=true&payment_pending=true&payment_cancel=true'
    )

    renderFullPage({
      paymentError: true,
      paymentPending: true,
      paymentCancel: true,
    })

    await waitFor(() => {
      expect(toastsByType('error').length).toBe(1)
    })
    expect(toastElements().length).toBe(1)
    expect(toastElements()[0]?.textContent).toContain(PAYMENT_ERROR_MESSAGE)
    expect(toastsByType('warning').length).toBe(0)
    expect(toastsByType('info').length).toBe(0)
    expectPaymentFlagsConsumed()
  })

  it('consumes the flags once with replaceState, preserving unrelated params and hash', async () => {
    const historyLengthBefore = window.history.length
    setWalletUrl('/wallet?payment_error=true&foo=bar&baz=1#section')

    renderFullPage({ paymentError: true })

    await waitFor(() => {
      expect(toastsByType('error').length).toBe(1)
    })
    expect(window.location.pathname).toBe('/wallet')
    expect(window.location.search).toBe('?foo=bar&baz=1')
    expect(window.location.hash).toBe('#section')
    expect(window.history.length).toBe(historyLengthBefore)
    expectPaymentFlagsConsumed()
  })

  it('does not duplicate the toast under React StrictMode on a full-page load', async () => {
    setWalletUrl('/wallet?payment_error=true')

    renderFullPage({ paymentError: true }, true)

    await waitFor(() => {
      expect(toastsByType('error').length).toBe(1)
    })
    expect(toastElements().length).toBe(1)
    expectPaymentFlagsConsumed()
  })

  it('opens the billing history dialog for show_history=true without any toast on a full-page load', async () => {
    setWalletUrl('/wallet?show_history=true')

    renderFullPage({ initialShowHistory: true })

    const history = await findByTestId('billing-history')
    await waitFor(() => expect(history.getAttribute('data-open')).toBe('true'))
    expect(toastElements().length).toBe(0)
    expectPaymentFlagsConsumed()
  })
})

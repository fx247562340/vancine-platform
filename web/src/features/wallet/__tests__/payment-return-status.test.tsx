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
// PayPal payment-return feedback on the wallet page: visiting
// /wallet?payment_error=true / payment_pending=true / show_history=true shows
// exactly one localized toast (error wins over pending), opens the billing
// history dialog only for show_history, never starts a payment, and consumes
// the status flags from the URL with history.replaceState while preserving
// unrelated query params and the hash. The wallet data hooks and presentational
// cards are stubbed; the route module, search schema and Wallet consumption
// logic under test are real.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, waitFor } from '@testing-library/react'
import i18next from 'i18next'
/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://app.example.com/wallet"}
 */
import { StrictMode, type ReactNode } from 'react'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as WalletRouteImport } from '@/routes/_authenticated/wallet/index'

// ============================================================================
// Collaborator stubs (data hooks + presentational cards)
// ============================================================================

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  const StubLayout = (props: { children?: ReactNode }) => (
    <div data-testid='wallet-layout'>{props.children}</div>
  )
  StubLayout.Title = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  )
  StubLayout.Content = (props: { children?: ReactNode }) => (
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
// Router harness around the ACTUAL wallet route module
// ============================================================================

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestWalletRoute = WalletRouteImport.update({
  id: '/wallet/',
  path: '/wallet/',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([TestWalletRoute])

function renderWalletRoute(initialPath: string, strictMode = false) {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

function expectPaymentFlagsConsumed(): void {
  const params = new URLSearchParams(window.location.search)
  expect(params.has('payment_error')).toBe(false)
  expect(params.has('payment_pending')).toBe(false)
  expect(params.has('show_history')).toBe(false)
  expect(params.has('payment_cancel')).toBe(false)
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  setWalletUrl('/wallet')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('wallet payment-return feedback', () => {
  it('shows exactly one error toast for payment_error=true and does not open any payment flow', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    setWalletUrl('/wallet?payment_error=true')

    const view = renderWalletRoute('/wallet?payment_error=true')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(PAYMENT_ERROR_MESSAGE)
    expect(warningSpy).not.toHaveBeenCalled()

    // No payment confirmation dialog is opened and nothing is re-triggered.
    const confirm = await view.findByTestId('payment-confirm')
    expect(confirm.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('shows exactly one pending toast for payment_pending=true and never claims the payment succeeded', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    const successSpy = vi.spyOn(toast, 'success')
    setWalletUrl('/wallet?payment_pending=true')

    const view = renderWalletRoute('/wallet?payment_pending=true')

    await waitFor(() => expect(warningSpy).toHaveBeenCalledTimes(1))
    expect(warningSpy).toHaveBeenCalledWith(PAYMENT_PENDING_MESSAGE)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()

    const confirm = await view.findByTestId('payment-confirm')
    expect(confirm.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('opens the billing history dialog for show_history=true without any error/pending toast', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    setWalletUrl('/wallet?show_history=true')

    const view = renderWalletRoute('/wallet?show_history=true')

    const dialog = await view.findByTestId('billing-history')
    await waitFor(() => expect(dialog.getAttribute('data-open')).toBe('true'))
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warningSpy).not.toHaveBeenCalled()
    expectPaymentFlagsConsumed()
  })

  it('prefers the error toast and consumes both flags when error and pending are both present', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    setWalletUrl('/wallet?payment_error=true&payment_pending=true')

    renderWalletRoute('/wallet?payment_error=true&payment_pending=true')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(PAYMENT_ERROR_MESSAGE)
    expect(warningSpy).not.toHaveBeenCalled()
    // Both flags are consumed from the URL so no later visit re-prompts.
    expectPaymentFlagsConsumed()
  })

  // CP1 P1-B04 mixed-query priority tests. The deterministic priority order
  // is: error > pending > cancel. cancel is the most benign state and must
  // never displace a more serious one. Every case asserts exactly one toast
  // and clears all return flags.
  it('cancel yields to pending when both are present (pending wins, no cancel toast)', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl('/wallet?payment_pending=true&payment_cancel=true')

    renderWalletRoute('/wallet?payment_pending=true&payment_cancel=true')

    await waitFor(() => expect(warningSpy).toHaveBeenCalledTimes(1))
    expect(warningSpy).toHaveBeenCalledWith(PAYMENT_PENDING_MESSAGE)
    expect(errorSpy).not.toHaveBeenCalled()
    // cancel must not show its toast when pending is also set
    expect(infoSpy).not.toHaveBeenCalled()
    expectPaymentFlagsConsumed()
  })

  it('cancel yields to error when both are present (error wins, no cancel toast)', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl('/wallet?payment_error=true&payment_cancel=true')

    renderWalletRoute('/wallet?payment_error=true&payment_cancel=true')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(PAYMENT_ERROR_MESSAGE)
    expect(warningSpy).not.toHaveBeenCalled()
    // cancel must not show its toast when error is also set
    expect(infoSpy).not.toHaveBeenCalled()
    expectPaymentFlagsConsumed()
  })

  it('error wins over both pending and cancel when all three are present (exactly one toast)', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl(
      '/wallet?payment_error=true&payment_pending=true&payment_cancel=true'
    )

    renderWalletRoute(
      '/wallet?payment_error=true&payment_pending=true&payment_cancel=true'
    )

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(PAYMENT_ERROR_MESSAGE)
    expect(warningSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    // No history dialog for any combined flag set.
    expectPaymentFlagsConsumed()
  })

  it('cancel alone shows the cancel toast and does not open the history dialog', async () => {
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl('/wallet?payment_cancel=true&show_history=true')

    const view = renderWalletRoute(
      '/wallet?payment_cancel=true&show_history=true'
    )

    await waitFor(() => expect(infoSpy).toHaveBeenCalledTimes(1))
    // cancel takes precedence over show_history for the toast branch; the
    // history dialog stays closed because cancel never credits the user.
    const history = await view.findByTestId('billing-history')
    expect(history.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('does not duplicate the toast under React StrictMode', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    setWalletUrl('/wallet?payment_error=true')

    renderWalletRoute('/wallet?payment_error=true', true)

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(errorSpy).toHaveBeenCalledWith(PAYMENT_ERROR_MESSAGE)
    expectPaymentFlagsConsumed()
  })

  it('cleans the status flags with replaceState while preserving other params and hash', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const historyLengthBefore = window.history.length
    setWalletUrl('/wallet?payment_error=true&foo=bar&baz=1#section')

    renderWalletRoute('/wallet?payment_error=true&foo=bar&baz=1#section')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(window.location.pathname).toBe('/wallet')
    expect(window.location.search).toBe('?foo=bar&baz=1')
    expect(window.location.hash).toBe('#section')
    // replaceState must not add a history entry.
    expect(window.history.length).toBe(historyLengthBefore)
    expectPaymentFlagsConsumed()
  })

  // B04 P1-B04 PayPal cancel feedback: cancel is its own feedback distinct
  // from error/pending; cancel does not open history, never claims success,
  // never shows error/pending, and is cleaned from the URL via replaceState.
  it('shows exactly one localized cancel toast for payment_cancel=true and never opens history or claims success', async () => {
    const errorSpy = vi.spyOn(toast, 'error')
    const warningSpy = vi.spyOn(toast, 'warning')
    const successSpy = vi.spyOn(toast, 'success')
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl('/wallet?payment_cancel=true')

    const view = renderWalletRoute('/wallet?payment_cancel=true')

    await waitFor(() => expect(infoSpy).toHaveBeenCalledTimes(1))
    const cancelMessage =
      'PayPal checkout was cancelled. No payment was made and your balance is unchanged.'
    expect(infoSpy).toHaveBeenCalledWith(cancelMessage)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warningSpy).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()

    // No payment flow, no history dialog.
    const confirm = await view.findByTestId('payment-confirm')
    expect(confirm.getAttribute('data-open')).toBe('false')
    const historyDialog = await view.findByTestId('billing-history')
    expect(historyDialog.getAttribute('data-open')).toBe('false')
    expectPaymentFlagsConsumed()
  })

  it('does not duplicate the cancel toast under React StrictMode', async () => {
    const infoSpy = vi.spyOn(toast, 'info')
    setWalletUrl('/wallet?payment_cancel=true')

    renderWalletRoute('/wallet?payment_cancel=true', true)

    await waitFor(() => expect(infoSpy).toHaveBeenCalledTimes(1))
    expectPaymentFlagsConsumed()
  })
})

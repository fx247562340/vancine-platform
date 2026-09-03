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
// Wallet bonus data-source contract, observed through the real user interface:
// the REAL Wallet page, the REAL RechargeFormCard and the REAL
// PaymentConfirmDialog render with only the network boundary mocked. The
// displayed amount must come from the AUTHENTICATED /api/user/topup/info
// response — never from the cached public status. Regression: status
// bonus=500000 + topup-info bonus=250000 + eligible=true must show 250,000
// (not 500,000), and an ineligible user must see no bonus anywhere.

/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://app.example.com/wallet"}
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { Route as WalletRouteImport } from '@/routes/_authenticated/wallet/index'

// ============================================================================
// Mutable server payloads (the single external boundary: HTTP)
// ============================================================================

const server = vi.hoisted(() => ({
  status: {
    price: 1,
    quota_per_unit: 500000,
    // Deliberately DIFFERENT from the login-scoped value: the cached public
    // status must never win over the authenticated response.
    first_topup_bonus_quota: 500000,
    first_topup_bonus_active: true,
  },
  topupInfo: {
    first_topup_bonus_quota: 250000,
    first_topup_bonus_eligible: true,
  },
}))

// Network boundary: the shared axios-backed api module.
vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    getStatus: vi.fn(async () => server.status),
    getSelf: vi.fn(async () => ({
      success: true,
      data: { id: 1, username: 'wallet-tester', quota: 0, aff_quota: 0 },
    })),
  }
})

// Network boundary: the wallet-scoped endpoints.
vi.mock('@/features/wallet/api', async (importActual) => {
  const actual = await importActual<typeof import('@/features/wallet/api')>()
  return {
    ...actual,
    getTopupInfo: vi.fn(async () => ({
      success: true,
      data: {
        enable_online_topup: false,
        enable_stripe_topup: false,
        pay_methods: [],
        min_topup: 1,
        stripe_min_topup: 1,
        amount_options: [],
        discount: {},
        enable_paypal_topup: true,
        paypal_min_topup: 1,
        ...server.topupInfo,
      },
    })),
    calculatePayPalAmount: vi.fn(async () => ({
      success: true,
      data: { amount: 1 },
    })),
    calculateAmount: vi.fn(async () => ({
      success: true,
      data: { amount: 1 },
    })),
    getAffiliateCode: vi.fn(async () => ({
      success: true,
      data: { aff_code: 'TESTAFF', aff_quota: 0 },
    })),
    getUserBillingHistory: vi.fn(async () => ({
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 10 },
    })),
    getAllBillingHistory: vi.fn(async () => ({
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 10 },
    })),
  }
})

// ============================================================================
// Harness
// ============================================================================

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: enLocale },
})

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestWalletRoute = WalletRouteImport.update({
  id: '/wallet/',
  path: '/wallet/',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([TestWalletRoute])

function renderWalletRoute() {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/wallet')
  server.topupInfo.first_topup_bonus_quota = 250000
  server.topupInfo.first_topup_bonus_eligible = true
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Real user path: pick the PayPal payment method on the recharge card, which
// opens the genuine PaymentConfirmDialog. No internal functions are invoked.
async function openPaymentConfirmDialog() {
  const user = userEvent.setup()
  const payPalButton = await screen.findByRole('button', { name: 'PayPal' })
  await user.click(payPalButton)
  await screen.findByRole('heading', { name: 'Confirm Payment' })
}

describe('Wallet first top-up bonus data source (real UI)', () => {
  it('shows the login-scoped 250,000 bonus, not the cached status 500,000', async () => {
    renderWalletRoute()

    // The recharge card itself shows the login-scoped amount and its USD
    // equivalent computed against quota_per_unit.
    await screen.findByRole('button', { name: 'PayPal' })
    expect(await screen.findByText('250,000 Bonus Credits')).toBeInTheDocument()
    expect(
      screen.getByText(
        '250,000 Credits equals $0.5 in API balance. One bonus per account.'
      )
    ).toBeInTheDocument()

    await openPaymentConfirmDialog()

    // The confirmation dialog states the same login-scoped amount.
    expect(screen.getAllByText('First top-up bonus').length).toBeGreaterThan(0)
    expect(screen.getByText('250,000 Credits')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Credited on the first successful top-up; the final result is determined at settlement.'
      )
    ).toBeInTheDocument()

    // The divergent public status value must never leak into the page.
    expect(screen.queryByText('500,000 Bonus Credits')).not.toBeInTheDocument()
    expect(screen.queryByText('500,000 Credits')).not.toBeInTheDocument()
  })

  it('shows no bonus anywhere when the user is not eligible', async () => {
    server.topupInfo.first_topup_bonus_eligible = false
    renderWalletRoute()

    // Wait for the recharge card to render its payment section.
    await screen.findByRole('button', { name: 'PayPal' })

    expect(screen.queryByText('First top-up bonus')).not.toBeInTheDocument()
    expect(
      screen.queryByText('250,000 Bonus Credits · $0.5 API balance')
    ).not.toBeInTheDocument()

    // Opening the real dialog through the user path also shows no bonus.
    await openPaymentConfirmDialog()
    expect(screen.queryByText('First top-up bonus')).not.toBeInTheDocument()
    expect(screen.queryByText('250,000 Credits')).not.toBeInTheDocument()
    expect(screen.getByText('You Pay')).toBeInTheDocument()
  })
})

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
import { cleanup, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BillingHistoryDialog } from '../billing-history-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const hoisted = vi.hoisted(() => ({
  state: {
    records: [] as Array<Record<string, unknown>>,
    total: 0,
    page: 1,
    pageSize: 10,
    keyword: '',
    loading: false,
    completing: false,
    isAdmin: false,
  },
  handlePageChange: vi.fn(),
  handlePageSizeChange: vi.fn(),
  handleSearch: vi.fn(),
  handleCompleteOrder: vi.fn(),
}))

vi.mock('../../../hooks/use-billing-history', () => ({
  useBillingHistory: () => hoisted.state,
}))

vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), copiedText: null }),
}))

afterEach(() => {
  hoisted.state.records = []
  hoisted.state.total = 0
  hoisted.state.keyword = ''
  hoisted.state.loading = false
  cleanup()
})

function renderDialog(): { rerender: (loading: boolean) => void } {
  const view = render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={() => undefined} />
    </I18nextProvider>
  )
  return {
    rerender: (loading: boolean) => {
      hoisted.state.loading = loading
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <BillingHistoryDialog open onOpenChange={() => undefined} />
        </I18nextProvider>
      )
    },
  }
}

describe('BillingHistoryDialog records list states', () => {
  it('shows loading skeletons instead of stale records while loading', () => {
    hoisted.state.records = [
      {
        id: 1,
        user_id: 1,
        amount: 100,
        money: 1,
        trade_no: 'TXN-STALE',
        payment_method: 'paypal',
        create_time: 1700000000,
        status: 'paid',
      },
    ]
    hoisted.state.loading = true
    const { rerender } = renderDialog()

    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('TXN-STALE')).toBeNull()
    expect(screen.queryByText('No billing records found')).toBeNull()

    rerender(false)
    expect(screen.getByText('TXN-STALE')).toBeTruthy()
  })

  it('shows the empty message and default hint when there are no records', () => {
    hoisted.state.records = []
    hoisted.state.loading = false
    renderDialog()

    expect(screen.getByText('No billing records found')).toBeTruthy()
    expect(
      screen.getByText('Your transaction history will appear here')
    ).toBeTruthy()
  })

  it('renders the record list when records exist', () => {
    hoisted.state.records = [
      {
        id: 1,
        user_id: 1,
        amount: 100,
        money: 1,
        trade_no: 'TXN-20240101-001',
        payment_method: 'paypal',
        create_time: 1700000000,
        status: 'paid',
      },
    ]
    hoisted.state.total = 1
    hoisted.state.loading = false
    renderDialog()

    expect(screen.getByText('TXN-20240101-001')).toBeTruthy()
    expect(screen.getByText('Payment Method')).toBeTruthy()
    expect(screen.queryByText('No billing records found')).toBeNull()
  })
})

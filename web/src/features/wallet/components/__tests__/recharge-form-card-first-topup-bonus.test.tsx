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
// Recharge form contract for the first top-up bonus: the disclosure renders
// only when the wallet page computed an eligible payload; ineligible users,
// a disabled promotion, or invalid server data all collapse to the plain
// recharge form. The bonus never changes the payable amounts.

/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import type { TopupInfo } from '../../types'
import { RechargeFormCard } from '../recharge-form-card'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: enLocale },
})

function topupInfoWithPaypal(paypalMinTopup: number): TopupInfo {
  return {
    enable_online_topup: false,
    enable_stripe_topup: false,
    pay_methods: [],
    min_topup: 1,
    stripe_min_topup: 1,
    amount_options: [],
    discount: {},
    enable_paypal_topup: true,
    paypal_min_topup: paypalMinTopup,
  }
}

const fullDisplay = {
  quota: 500000,
  credits: '500,000',
  usd: 1,
  usdText: '$1',
}

function renderCard(
  firstTopUpBonus: {
    quota: number
    credits: string
    usd: number
    usdText: string
  } | null
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={topupInfoWithPaypal(1)}
        presetAmounts={[]}
        selectedPreset={null}
        onSelectPreset={vi.fn()}
        topupAmount={5}
        onTopupAmountChange={vi.fn()}
        paymentAmount={5}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
        firstTopUpBonus={firstTopUpBonus}
      />
    </I18nextProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RechargeFormCard first top-up bonus disclosure', () => {
  it('shows the bonus, the USD equivalent and the settlement note for eligible users', () => {
    renderCard(fullDisplay)

    const alert = screen.getByTestId('first-topup-bonus-eligibility')
    expect(alert).toHaveTextContent('First top-up bonus')
    expect(alert).toHaveTextContent('500,000 Bonus Credits')
    expect(alert).toHaveTextContent('500,000 Credits equals $1 in API balance.')
    expect(alert).toHaveTextContent('One bonus per account.')
    expect(alert).toHaveTextContent(
      'Credited after your first successful top-up; the final result is determined at settlement.'
    )
  })

  it('renders nothing extra when the payload is null (ineligible / disabled / invalid)', () => {
    renderCard(null)

    expect(
      screen.queryByTestId('first-topup-bonus-eligibility')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('First top-up bonus')).not.toBeInTheDocument()
    // The recharge form itself still renders.
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeInTheDocument()
  })
})

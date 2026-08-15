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
// PayPal minimum-topup contract on the recharge form: the button state and
// the emitted onPaymentMethodSelect payload are driven exclusively by the
// server-provided paypal_min_topup value — below it the button is disabled
// and announces the minimum, at it the click selects paypal exactly once.

/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import type { PaymentMethod, TopupInfo } from '../../types'
import { RechargeFormCard } from '../recharge-form-card'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  resources: { en: enLocale },
})

function topupInfoWithPaypalMin(paypalMinTopup?: number): TopupInfo {
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

function renderCard(options: {
  topupAmount: number
  topupInfo: TopupInfo
  onPaymentMethodSelect?: (method: PaymentMethod) => void
}) {
  const onPaymentMethodSelect =
    options.onPaymentMethodSelect ?? vi.fn<(method: PaymentMethod) => void>()
  const view = render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={options.topupInfo}
        presetAmounts={[]}
        selectedPreset={null}
        onSelectPreset={vi.fn()}
        topupAmount={options.topupAmount}
        onTopupAmountChange={vi.fn()}
        paymentAmount={options.topupAmount}
        calculating={false}
        onPaymentMethodSelect={onPaymentMethodSelect}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
      />
    </I18nextProvider>
  )
  return { view, onPaymentMethodSelect }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RechargeFormCard PayPal minimum topup', () => {
  it('disables PayPal below the server minimum and announces the minimum without selecting', async () => {
    const { onPaymentMethodSelect } = renderCard({
      topupAmount: 9,
      topupInfo: topupInfoWithPaypalMin(10),
    })

    const button = screen.getByRole('button', {
      name: 'PayPal. Minimum topup amount: 10',
    })
    expect(button).toBeDisabled()
    // Visible helper text surfaces the server-provided minimum as well.
    expect(screen.getByText('Minimum: 10')).toBeInTheDocument()

    await userEvent
      .setup()
      .click(button)
      .catch(() => undefined)
    expect(onPaymentMethodSelect).not.toHaveBeenCalled()
  })

  it('enables PayPal at the server minimum and selects paypal exactly once with the server min_topup', async () => {
    const { onPaymentMethodSelect } = renderCard({
      topupAmount: 10,
      topupInfo: topupInfoWithPaypalMin(10),
    })

    const button = screen.getByRole('button', { name: 'PayPal' })
    expect(button).toBeEnabled()

    await userEvent.setup().click(button)
    expect(onPaymentMethodSelect).toHaveBeenCalledTimes(1)
    expect(onPaymentMethodSelect).toHaveBeenCalledWith({
      type: 'paypal',
      name: 'PayPal',
      min_topup: 10,
    })
  })

  it('keeps the missing-field compatibility fallback without enforcing a minimum', async () => {
    const { onPaymentMethodSelect } = renderCard({
      topupAmount: 1,
      topupInfo: topupInfoWithPaypalMin(undefined),
    })

    const button = screen.getByRole('button', { name: 'PayPal' })
    expect(button).toBeEnabled()

    await userEvent.setup().click(button)
    expect(onPaymentMethodSelect).toHaveBeenCalledTimes(1)
    expect(onPaymentMethodSelect).toHaveBeenCalledWith({
      type: 'paypal',
      name: 'PayPal',
      min_topup: 0,
    })
  })
})

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
// Vitest + jsdom + RTL. Proves that when ONLY PayPal is enabled, the recharge
// form shows the amount area and a clickable PayPal method instead of the
// "Online topup is not enabled" alert.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TopupInfo } from '../types'
import { RechargeFormCard } from './recharge-form-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const onlyPaypal = {
  enable_online_topup: false,
  enable_stripe_topup: false,
  enable_waffo_topup: false,
  enable_waffo_pancake_topup: false,
  enable_paypal_topup: true,
  enable_creem_topup: false,
  min_topup: 1,
  stripe_min_topup: 1,
  paypal_min_topup: 5,
  pay_methods: [{ type: 'paypal', name: 'PayPal', min_topup: 5 }],
  amount_options: [],
  discount: {},
} as unknown as TopupInfo

const baseProps = {
  topupInfo: onlyPaypal,
  presetAmounts: [],
  selectedPreset: null,
  onSelectPreset: () => {},
  topupAmount: 10,
  onTopupAmountChange: () => {},
  paymentAmount: 0,
  calculating: false,
  onPaymentMethodSelect: () => {},
  paymentLoading: null,
  redemptionCode: '',
  onRedemptionCodeChange: () => {},
  onRedeem: () => {},
  redeeming: false,
}

describe('RechargeFormCard — only PayPal enabled', () => {
  it('renders the amount area and a PayPal method, not the "not enabled" alert', () => {
    render(<RechargeFormCard {...baseProps} />)

    // The "not enabled" alert must NOT appear when only PayPal is enabled.
    expect(
      screen.queryByText(
        'Online topup is not enabled. Please use redemption code or contact administrator.'
      )
    ).toBeNull()

    // The custom amount input is visible.
    expect(screen.getByLabelText('Custom Amount')).toBeInTheDocument()

    // The PayPal payment method button is visible and enabled.
    const paypalButton = screen.getByText('PayPal').closest('button')
    expect(paypalButton).not.toBeNull()
    expect(paypalButton).not.toBeDisabled()
  })

  it('still shows the "not enabled" alert when nothing is enabled', () => {
    const nothing = {
      ...onlyPaypal,
      enable_paypal_topup: false,
      pay_methods: [],
    } as unknown as TopupInfo
    render(<RechargeFormCard {...baseProps} topupInfo={nothing} />)

    expect(
      screen.getByText(
        'Online topup is not enabled. Please use redemption code or contact administrator.'
      )
    ).toBeInTheDocument()
  })
})

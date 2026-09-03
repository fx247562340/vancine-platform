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
// Payment confirmation contract for the first top-up bonus: the bonus row is
// an INDEPENDENT informational line — it must never change "You Pay", never
// appear for ineligible users, and must state that the grant is decided at
// settlement.

/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import { PaymentConfirmDialog } from '../dialogs/payment-confirm-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: enLocale },
})

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onConfirm: vi.fn(),
  topupAmount: 5,
  paymentAmount: 5,
  calculating: false,
  processing: false,
  usdExchangeRate: 1,
}

const fullBonus = {
  quota: 500000,
  credits: '500,000',
  usd: 1,
  usdText: '$1',
}

type BonusInput = {
  quota: number
  credits: string
  usd: number
  usdText: string
} | null

function renderDialog(
  props: Partial<typeof baseProps> & {
    firstTopUpBonus?: BonusInput
  }
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PaymentConfirmDialog
        {...baseProps}
        {...props}
        paymentMethod={undefined}
        firstTopUpBonus={props.firstTopUpBonus ?? null}
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

describe('PaymentConfirmDialog first top-up bonus', () => {
  it('shows an independent bonus row for eligible users without changing You Pay', () => {
    renderDialog({
      firstTopUpBonus: fullBonus,
    })

    expect(screen.getByText('First top-up bonus')).toBeInTheDocument()
    expect(screen.getByText('500,000 Credits')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Credited on the first successful top-up; the final result is determined at settlement.'
      )
    ).toBeInTheDocument()

    // "You Pay" is untouched: the paid amount is still the plain top-up cost.
    expect(screen.getByText('$5')).toBeInTheDocument()
  })

  it('shows no bonus row when the payload is null (ineligible or disabled)', () => {
    renderDialog({ firstTopUpBonus: null })

    expect(screen.queryByText('First top-up bonus')).not.toBeInTheDocument()
    expect(screen.queryByText(/Credits/)).not.toBeInTheDocument()
    // The dialog still renders the payment rows.
    expect(screen.getByText('You Pay')).toBeInTheDocument()
  })

  it('does not add the bonus into the payment amount', () => {
    renderDialog({
      paymentAmount: 5,
      firstTopUpBonus: fullBonus,
    })

    // Only the top-up amount ($5) is charged; no combined 500,000-Credits
    // figure ever appears as a payment amount.
    expect(screen.getByText('$5')).toBeInTheDocument()
    expect(screen.queryByText('500,005')).not.toBeInTheDocument()
  })
})

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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { RiskAcknowledgementDialog } from '@/components/risk-acknowledgement-dialog'

// Real i18n instance explicitly passed to the component under test via
// I18nextProvider — no implicit global state dependency.
const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
})

// Regression protection: this test validates the user-visible segmented
// confirmation text flow (static segments rendered in order, input areas
// matched in sequence, confirm enabled only on full match).
//
// The underlying index-based key implementation would also pass this test;
// the actual RED was the 2 react(no-array-index-key) lint findings
// resolved in L2-C5-3.
describe('RiskAcknowledgementDialog segmented confirmation text flow', () => {
  it('renders static segments and requires sequential input matches to enable confirm', async () => {
    const parts = [
      { id: 'test-static-1', type: 'static' as const, text: 'I agree to the ' },
      { id: 'test-input-1', type: 'input' as const, text: 'terms of service' },
      { id: 'test-static-2', type: 'static' as const, text: ' and ' },
      { id: 'test-input-2', type: 'input' as const, text: 'privacy policy' },
    ]

    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <I18nextProvider i18n={i18n}>
        <RiskAcknowledgementDialog
          open
          onOpenChange={() => {}}
          title='Test Confirmation'
          description='Please confirm the terms.'
          requiredTextParts={parts}
          onConfirm={onConfirm}
        />
      </I18nextProvider>
    )

    // === 1. Static segments visible via precise user-visible element query ===
    // Full concatenated text ('I agree to the terms of service and privacy policy')
    // appears in the dialog prompt area via requiredTextToDisplay join.
    // getByText uses Testing Library's default normalizer which trims whitespace.
    expect(
      screen.getByText('I agree to the terms of service and privacy policy')
    ).toBeVisible()

    // Both static segments individually visible (order and content preserved).
    // 'I agree to the ' has trailing space → normalizer trims to 'I agree to the'.
    expect(screen.getByText('I agree to the')).toBeVisible()
    // ' and ' has leading/trailing space → normalizer trims to 'and'.
    expect(screen.getByText('and')).toBeVisible()

    // === 2. Input fields have correct placeholder order ===
    const textareas = await screen.findAllByRole('textbox')
    expect(textareas.length).toBe(2)
    expect(textareas[0]).toHaveAttribute('placeholder', 'terms of service')
    expect(textareas[1]).toHaveAttribute('placeholder', 'privacy policy')

    // === 3. Initially disabled — all text inputs still empty ===
    const confirmButton = await screen.findByRole('button', {
      name: /confirm|submit/i,
    })
    expect(confirmButton).toBeDisabled()

    // === 4. Only first segment matched → still disabled ===
    await user.type(textareas[0], 'wrong')
    expect(confirmButton).toBeDisabled()
    await user.clear(textareas[0])
    await user.type(textareas[0], 'terms of service')
    expect(confirmButton).toBeDisabled()

    // === 5. All segments matched → enabled ===
    await user.type(textareas[1], 'privacy policy')
    expect(confirmButton).toBeEnabled()

    // === 6. Confirm fires exactly once ===
    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

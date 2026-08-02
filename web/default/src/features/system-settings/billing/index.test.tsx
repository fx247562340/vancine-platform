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
// Vitest. Proves the PayPal option back-fill: the PayPal keys exist in
// defaultBillingSettings (so getOptionValue hydrates them from /api/option/),
// and getOptionValue parses 'true'/'5'/'USD' into boolean/number/string.
import { describe, expect, it } from 'vitest'
import { getOptionValue } from '../hooks/use-system-options'
import { defaultBillingSettings } from './index'

describe('defaultBillingSettings — PayPal keys present', () => {
  it('contains every PayPal key with the correct default', () => {
    expect(defaultBillingSettings.PayPalEnabled).toBe(false)
    expect(defaultBillingSettings.PayPalTestMode).toBe(false)
    expect(defaultBillingSettings.PayPalClientId).toBe('')
    expect(defaultBillingSettings.PayPalClientSecret).toBe('')
    expect(defaultBillingSettings.PayPalWebhookId).toBe('')
    expect(defaultBillingSettings.PayPalSandboxClientId).toBe('')
    expect(defaultBillingSettings.PayPalSandboxClientSecret).toBe('')
    expect(defaultBillingSettings.PayPalSandboxWebhookId).toBe('')
    expect(defaultBillingSettings.PayPalMinTopUp).toBe(1)
    expect(defaultBillingSettings.PayPalCurrency).toBe('USD')
  })
})

describe('getOptionValue — PayPal hydration', () => {
  it('hydrates PayPal options from string option values', () => {
    const result = getOptionValue(
      [
        { key: 'PayPalEnabled', value: 'true' },
        { key: 'PayPalTestMode', value: 'true' },
        { key: 'PayPalClientId', value: 'client-123' },
        { key: 'PayPalMinTopUp', value: '5' },
        { key: 'PayPalCurrency', value: 'EUR' },
      ],
      defaultBillingSettings
    )

    expect(result.PayPalEnabled).toBe(true)
    expect(result.PayPalTestMode).toBe(true)
    expect(result.PayPalClientId).toBe('client-123')
    expect(result.PayPalMinTopUp).toBe(5)
    expect(result.PayPalCurrency).toBe('EUR')
  })

  it('keeps defaults when options are absent', () => {
    const result = getOptionValue([], defaultBillingSettings)
    expect(result.PayPalEnabled).toBe(false)
    expect(result.PayPalMinTopUp).toBe(1)
    expect(result.PayPalCurrency).toBe('USD')
  })

  it('PayPalEnabled "false" hydrates to boolean false', () => {
    const result = getOptionValue(
      [{ key: 'PayPalEnabled', value: 'false' }],
      defaultBillingSettings
    )
    expect(result.PayPalEnabled).toBe(false)
  })
})

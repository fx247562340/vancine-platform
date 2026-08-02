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
// Vitest + jsdom. Mocks the unified axios `api` instance and calls the REAL
// wallet API functions to prove PayPal uses its dedicated endpoints (not the
// generic /api/user/amount or /api/user/pay).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateAmount,
  calculatePayPalAmount,
  calculateStripeAmount,
  requestPayPalPayment,
  requestPayment,
} from './api'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: {
    post: (...args: unknown[]) => postMock(...args),
    get: vi.fn(),
  },
}))

describe('wallet PayPal API endpoint selection', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('calculatePayPalAmount POSTs only /api/user/paypal/amount with skipBusinessError', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: '99.00' } })

    const res = await calculatePayPalAmount({ amount: 100 })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      '/api/user/paypal/amount',
      { amount: 100 },
      { skipBusinessError: true }
    )
    expect(res.data).toBe('99.00')
  })

  it('requestPayPalPayment POSTs only /api/user/paypal/pay with skipBusinessError', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: { pay_link: 'https://paypal.com/checkout/x' },
      },
    })

    const res = await requestPayPalPayment({
      amount: 100,
      payment_method: 'paypal',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      '/api/user/paypal/pay',
      { amount: 100, payment_method: 'paypal' },
      { skipBusinessError: true }
    )
    expect(res.data?.pay_link).toBe('https://paypal.com/checkout/x')
  })

  it('PayPal amount does not touch the generic or Stripe amount endpoints', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: '1.00' } })

    await calculatePayPalAmount({ amount: 5 })

    const urls = postMock.mock.calls.map((c) => c[0])
    expect(urls).toEqual(['/api/user/paypal/amount'])
    expect(urls).not.toContain('/api/user/amount')
    expect(urls).not.toContain('/api/user/stripe/amount')
  })

  it('generic and Stripe amount endpoints remain distinct (non-regression)', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: '1.00' } })
    await calculateAmount({ amount: 5 })
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/user/amount',
      { amount: 5 },
      { skipBusinessError: true }
    )

    await calculateStripeAmount({ amount: 5 })
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/user/stripe/amount',
      { amount: 5 },
      { skipBusinessError: true }
    )
  })

  it('generic requestPayment still POSTs /api/user/pay (non-regression)', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: {} } })
    await requestPayment({ amount: 5, payment_method: 'alipay' })
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/user/pay',
      { amount: 5, payment_method: 'alipay' },
      { skipBusinessError: true }
    )
  })
})

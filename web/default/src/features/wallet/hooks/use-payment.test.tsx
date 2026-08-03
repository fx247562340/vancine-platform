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
// Vitest + jsdom + React Testing Library. Exercises the REAL usePayment hook
// (renderHook/act). The wallet API layer, analytics, toast and i18n t() are
// mocked; the real lib logic (isPayPalPayment / resolvePayPalRedirect /
// isSafeHttpPaymentUrl) runs, while submitPaymentForm and navigateToPaymentUrl
// are spied so we can assert the redirect path without real navigation.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePayment } from './use-payment'

const { apiMock, trackMock, toastMock, libSpies } = vi.hoisted(() => {
  const isApiSuccess = (r?: { success?: boolean; message?: string }) =>
    r?.success === true || r?.message === 'success'
  return {
    apiMock: {
      calculateAmount: vi.fn(),
      calculateStripeAmount: vi.fn(),
      calculateWaffoPancakeAmount: vi.fn(),
      calculatePayPalAmount: vi.fn(),
      requestPayment: vi.fn(),
      requestStripePayment: vi.fn(),
      requestPayPalPayment: vi.fn(),
      isApiSuccess: vi.fn(isApiSuccess),
    },
    trackMock: vi.fn(),
    toastMock: { error: vi.fn(), success: vi.fn() },
    libSpies: {
      submitPaymentForm: vi.fn(),
      navigateToPaymentUrl: vi.fn(),
    },
  }
})

vi.mock('../api', () => apiMock)
vi.mock('@/lib/analytics', () => ({ trackEvent: trackMock }))
vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
// Keep the real pure logic; only spy the two side-effectful redirect helpers.
vi.mock('../lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib')>()
  return {
    ...actual,
    submitPaymentForm: libSpies.submitPaymentForm,
    navigateToPaymentUrl: libSpies.navigateToPaymentUrl,
  }
})

const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

beforeEach(() => {
  trackMock.mockReset()
  toastMock.error.mockReset()
  toastMock.success.mockReset()
  libSpies.submitPaymentForm.mockReset()
  libSpies.navigateToPaymentUrl.mockReset()
  for (const m of Object.values(apiMock)) m.mockReset()
  apiMock.isApiSuccess.mockImplementation(
    (r?: { success?: boolean; message?: string }) =>
      r?.success === true || r?.message === 'success'
  )
  windowOpenSpy.mockClear()
})

describe('usePayment.calculatePaymentAmount — dispatch', () => {
  it('paypal calls only calculatePayPalAmount', async () => {
    apiMock.calculatePayPalAmount.mockResolvedValue({
      success: true,
      data: '99.00',
    })
    const { result } = renderHook(() => usePayment())

    let ret = 0
    await act(async () => {
      ret = await result.current.calculatePaymentAmount(100, 'paypal')
    })

    expect(apiMock.calculatePayPalAmount).toHaveBeenCalledWith({ amount: 100 })
    expect(apiMock.calculateAmount).not.toHaveBeenCalled()
    expect(apiMock.calculateStripeAmount).not.toHaveBeenCalled()
    expect(apiMock.calculateWaffoPancakeAmount).not.toHaveBeenCalled()
    expect(ret).toBe(99)
  })

  it('stripe and regular still dispatch to their own amount APIs', async () => {
    apiMock.calculateStripeAmount.mockResolvedValue({
      success: true,
      data: '1',
    })
    apiMock.calculateAmount.mockResolvedValue({ success: true, data: '1' })
    const { result } = renderHook(() => usePayment())

    await act(async () => {
      await result.current.calculatePaymentAmount(10, 'stripe')
    })
    expect(apiMock.calculateStripeAmount).toHaveBeenCalled()

    await act(async () => {
      await result.current.calculatePaymentAmount(10, 'alipay')
    })
    expect(apiMock.calculateAmount).toHaveBeenCalled()
  })
})

describe('usePayment.processPayment — PayPal', () => {
  it('posts integer amount + payment_method paypal, tracks once, navigates via href helper', async () => {
    apiMock.requestPayPalPayment.mockResolvedValue({
      success: true,
      data: { pay_link: 'https://paypal.com/checkout/x' },
    })
    const { result } = renderHook(() => usePayment())

    let ret = false
    await act(async () => {
      ret = await result.current.processPayment(99.7, 'paypal')
    })

    // Exact request body: Math.floor(99.7) = 99, payment_method 'paypal'.
    expect(apiMock.requestPayPalPayment).toHaveBeenCalledWith({
      amount: 99,
      payment_method: 'paypal',
    })
    expect(ret).toBe(true)
    // checkout_started recorded exactly once with provider paypal + floored amount.
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('checkout_started', {
      provider: 'paypal',
      amount: 99,
    })
    // Current-window redirect via the helper (not window.open / form submit).
    expect(libSpies.navigateToPaymentUrl).toHaveBeenCalledWith(
      'https://paypal.com/checkout/x'
    )
    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(libSpies.submitPaymentForm).not.toHaveBeenCalled()
  })

  it.each([
    ['missing pay_link', { success: true, data: {} }],
    [
      'javascript: pay_link',
      { success: true, data: { pay_link: 'javascript:alert(1)' } },
    ],
    [
      'data: pay_link',
      { success: true, data: { pay_link: 'data:text/html,x' } },
    ],
    [
      'relative pay_link',
      { success: true, data: { pay_link: '/checkout/pay' } },
    ],
  ])('rejects %s: no redirect, no track', async (_label, response) => {
    apiMock.requestPayPalPayment.mockResolvedValue(response)
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })

  it("message='success' but unsafe pay_link shows 'Invalid payment redirect URL', not 'success'", async () => {
    apiMock.requestPayPalPayment.mockResolvedValue({
      message: 'success',
      data: { pay_link: 'javascript:alert(1)' },
    })
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Invalid payment redirect URL')
    expect(toastMock.error).not.toHaveBeenCalledWith('success')
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('business failure prefers the backend message', async () => {
    apiMock.requestPayPalPayment.mockResolvedValue({
      success: false,
      message: 'order failed',
    })
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('order failed')
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })

  it("message='error' with readable data shows the backend data, not 'error'", async () => {
    apiMock.requestPayPalPayment.mockResolvedValue({
      message: 'error',
      data: '拉起支付失败',
    })
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('拉起支付失败')
    expect(toastMock.error).not.toHaveBeenCalledWith('error')
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('business failure without message falls back to Payment request failed', async () => {
    apiMock.requestPayPalPayment.mockResolvedValue({ success: false })
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Payment request failed')
  })

  it('network error: no redirect, no track', async () => {
    apiMock.requestPayPalPayment.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => usePayment())

    let ret = true
    await act(async () => {
      ret = await result.current.processPayment(100, 'paypal')
    })

    expect(ret).toBe(false)
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })
})

describe('usePayment.processPayment — non-regression', () => {
  it('stripe still calls Stripe API + window.open', async () => {
    apiMock.requestStripePayment.mockResolvedValue({
      success: true,
      data: { pay_link: 'https://stripe.com/checkout/x' },
    })
    const { result } = renderHook(() => usePayment())

    let ret = false
    await act(async () => {
      ret = await result.current.processPayment(100, 'stripe')
    })

    expect(apiMock.requestStripePayment).toHaveBeenCalledWith({
      amount: 100,
      payment_method: 'stripe',
    })
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://stripe.com/checkout/x',
      '_blank'
    )
    expect(trackMock).toHaveBeenCalledWith('checkout_started', {
      provider: 'stripe',
      amount: 100,
    })
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(ret).toBe(true)
  })

  it('regular epay still calls generic API + submitPaymentForm', async () => {
    apiMock.requestPayment.mockResolvedValue({
      success: true,
      data: { foo: 'bar' },
      url: 'https://epay.com/pay',
    })
    const { result } = renderHook(() => usePayment())

    let ret = false
    await act(async () => {
      ret = await result.current.processPayment(100, 'alipay')
    })

    expect(apiMock.requestPayment).toHaveBeenCalledWith({
      amount: 100,
      payment_method: 'alipay',
    })
    expect(libSpies.submitPaymentForm).toHaveBeenCalledWith(
      'https://epay.com/pay',
      { foo: 'bar' }
    )
    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(libSpies.navigateToPaymentUrl).not.toHaveBeenCalled()
    expect(ret).toBe(true)
  })
})

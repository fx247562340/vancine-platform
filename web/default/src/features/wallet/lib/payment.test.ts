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
// Run with: node --test src/features/wallet/lib/payment.test.ts
// Uses Node's native test runner (node:test + node:assert/strict); no new test
// dependency. These tests exercise the PURE PayPal decision logic that the
// usePayment hook consumes (type detection + pay_link extraction/validation).
// The hook's side-effects (endpoint dispatch, window.location.href redirect,
// analytics) live in use-payment.ts, which transitively imports the `@/` alias
// and React and therefore cannot be loaded by this runner (see report).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { TopupInfo } from '../types.ts'
import {
  getDefaultPaymentType,
  getMinTopupAmount,
  isPayPalPayment,
  navigateToPaymentUrl,
  resolvePaymentErrorMessage,
  resolvePayPalRedirect,
} from './payment.ts'

describe('isPayPalPayment', () => {
  test('matches the exact "paypal" type', () => {
    assert.equal(isPayPalPayment('paypal'), true)
  })

  test('does not match other payment types', () => {
    for (const t of [
      'stripe',
      'alipay',
      'wxpay',
      'waffo',
      'waffo_pancake',
      'creem',
    ]) {
      assert.equal(isPayPalPayment(t), false, t)
    }
  })

  test('uses exact equality, not prefix/substring matching', () => {
    assert.equal(isPayPalPayment('paypalx'), false)
    assert.equal(isPayPalPayment('xpaypal'), false)
    assert.equal(isPayPalPayment('PayPal'), false)
    assert.equal(isPayPalPayment(''), false)
  })
})

describe('resolvePayPalRedirect', () => {
  test('accepts a safe https pay_link on success', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: 'https://paypal.com/checkout/x' },
    })
    assert.deepEqual(r, { ok: true, url: 'https://paypal.com/checkout/x' })
  })

  test('accepts a safe http pay_link on success', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: 'http://paypal.com/checkout/x' },
    })
    assert.deepEqual(r, { ok: true, url: 'http://paypal.com/checkout/x' })
  })

  test('treats message==="success" as success', () => {
    const r = resolvePayPalRedirect({
      message: 'success',
      data: { pay_link: 'https://paypal.com/x' },
    })
    assert.deepEqual(r, { ok: true, url: 'https://paypal.com/x' })
  })

  test('rejects javascript: URLs', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: 'javascript:alert(1)' },
    })
    assert.deepEqual(r, { ok: false })
  })

  test('rejects data: URLs', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: 'data:text/html,<script>alert(1)</script>' },
    })
    assert.deepEqual(r, { ok: false })
  })

  test('rejects relative URLs', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: '/checkout/pay' },
    })
    assert.deepEqual(r, { ok: false })
  })

  test('rejects when pay_link is missing', () => {
    assert.deepEqual(resolvePayPalRedirect({ success: true, data: {} }), {
      ok: false,
    })
    assert.deepEqual(resolvePayPalRedirect({ success: true }), { ok: false })
  })

  test('rejects when pay_link is a non-string', () => {
    const r = resolvePayPalRedirect({
      success: true,
      data: { pay_link: 12345 },
    })
    assert.deepEqual(r, { ok: false })
  })

  test('rejects when the business result is a failure', () => {
    const r = resolvePayPalRedirect({
      success: false,
      message: 'order failed',
      data: { pay_link: 'https://paypal.com/x' },
    })
    assert.deepEqual(r, { ok: false })
  })
})

describe('navigateToPaymentUrl', () => {
  test('writes href to the provided Location-like object (current-window redirect)', () => {
    const fakeLocation = { href: '' }
    navigateToPaymentUrl('https://paypal.com/checkout/x', fakeLocation)
    assert.equal(fakeLocation.href, 'https://paypal.com/checkout/x')
  })
})

// ---------------------------------------------------------------------------
// Topup info selectors: PayPal must be a first-class topup method, with the
// same min-topup priority order as Classic.
// ---------------------------------------------------------------------------

function topupInfo(overrides: Record<string, unknown>): TopupInfo {
  return {
    enable_online_topup: false,
    enable_stripe_topup: false,
    enable_waffo_topup: false,
    enable_waffo_pancake_topup: false,
    enable_paypal_topup: false,
    min_topup: 1,
    stripe_min_topup: 1,
    paypal_min_topup: 1,
    waffo_min_topup: 1,
    waffo_pancake_min_topup: 1,
    pay_methods: [],
    ...overrides,
  } as unknown as TopupInfo
}

describe('getMinTopupAmount — Classic priority order', () => {
  test('only-paypal uses paypal_min_topup (not the default 1)', () => {
    const info = topupInfo({
      enable_paypal_topup: true,
      paypal_min_topup: 5,
      pay_methods: [{ type: 'paypal', name: 'PayPal', min_topup: 5 }],
    })
    assert.equal(getMinTopupAmount(info), 5)
  })

  test('online wins over paypal', () => {
    const info = topupInfo({
      enable_online_topup: true,
      enable_paypal_topup: true,
      min_topup: 3,
      paypal_min_topup: 5,
    })
    assert.equal(getMinTopupAmount(info), 3)
  })

  test('stripe wins over paypal', () => {
    const info = topupInfo({
      enable_stripe_topup: true,
      enable_paypal_topup: true,
      stripe_min_topup: 4,
      paypal_min_topup: 5,
    })
    assert.equal(getMinTopupAmount(info), 4)
  })

  test('paypal wins over waffo', () => {
    const info = topupInfo({
      enable_paypal_topup: true,
      enable_waffo_topup: true,
      paypal_min_topup: 5,
      waffo_min_topup: 7,
    })
    assert.equal(getMinTopupAmount(info), 5)
  })
})

describe('getDefaultPaymentType', () => {
  test('only-paypal defaults to paypal', () => {
    const info = topupInfo({
      enable_paypal_topup: true,
      pay_methods: [{ type: 'paypal', name: 'PayPal', min_topup: 5 }],
    })
    assert.equal(getDefaultPaymentType(info), 'paypal')
  })

  test('first pay_method wins', () => {
    const info = topupInfo({
      pay_methods: [
        { type: 'alipay', name: 'Alipay' },
        { type: 'paypal', name: 'PayPal' },
      ],
    })
    assert.equal(getDefaultPaymentType(info), 'alipay')
  })
})

// ---------------------------------------------------------------------------
// resolvePaymentErrorMessage: surface the backend's human-readable error.
// Backend failure shape is { message: 'error', data: '拉起支付失败' } — the
// readable text lives in `data`, while `message` is just 'error'.
// ---------------------------------------------------------------------------

describe('resolvePaymentErrorMessage', () => {
  test("message='error' with readable data uses data", () => {
    assert.equal(
      resolvePaymentErrorMessage(
        { message: 'error', data: '拉起支付失败' },
        'fallback'
      ),
      '拉起支付失败'
    )
    assert.equal(
      resolvePaymentErrorMessage(
        { message: 'error', data: '充值数量不能小于 5' },
        'fallback'
      ),
      '充值数量不能小于 5'
    )
  })

  test('a real message (not error/success) is used directly', () => {
    assert.equal(
      resolvePaymentErrorMessage({ message: 'balance insufficient' }, 'fb'),
      'balance insufficient'
    )
  })

  test("message='error' without data falls back", () => {
    assert.equal(resolvePaymentErrorMessage({ message: 'error' }, 'fb'), 'fb')
  })

  test('empty/!string data falls back', () => {
    assert.equal(
      resolvePaymentErrorMessage({ message: 'error', data: '' }, 'fb'),
      'fb'
    )
    assert.equal(
      resolvePaymentErrorMessage({ message: 'error', data: 123 }, 'fb'),
      'fb'
    )
  })

  test('no message and no data falls back', () => {
    assert.equal(resolvePaymentErrorMessage({}, 'fb'), 'fb')
  })
})

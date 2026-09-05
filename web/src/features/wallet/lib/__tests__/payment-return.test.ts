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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  getPaymentReturnFeedback,
  withoutPaymentReturnParams,
} from '../payment-return'

describe('payment return feedback priority', () => {
  test('error state wins when only payment_error is set', () => {
    assert.equal(getPaymentReturnFeedback(true, undefined), 'error')
  })

  test('pending state is reported when only payment_pending is set', () => {
    assert.equal(getPaymentReturnFeedback(undefined, true), 'pending')
  })

  test('error takes priority when both states are present', () => {
    assert.equal(getPaymentReturnFeedback(true, true), 'error')
  })

  test('no feedback when neither state is present', () => {
    assert.equal(getPaymentReturnFeedback(undefined, undefined), null)
    assert.equal(getPaymentReturnFeedback(false, false), null)
  })
})

describe('payment return URL cleanup', () => {
  test('removes all payment return params', () => {
    assert.equal(
      withoutPaymentReturnParams(
        'https://app.example.com/wallet?payment_error=true&payment_pending=true&show_history=true'
      ),
      '/wallet'
    )
  })

  test('preserves unrelated query params and hash', () => {
    assert.equal(
      withoutPaymentReturnParams(
        'https://app.example.com/wallet?payment_pending=true&foo=bar&baz=1#section'
      ),
      '/wallet?foo=bar&baz=1#section'
    )
  })

  test('keeps the URL unchanged when no payment return params exist', () => {
    assert.equal(
      withoutPaymentReturnParams('https://app.example.com/wallet?foo=bar#top'),
      '/wallet?foo=bar#top'
    )
  })

  test('does not remove look-alike params', () => {
    assert.equal(
      withoutPaymentReturnParams(
        'https://app.example.com/wallet?payment_error_extra=1&payment_errors=true'
      ),
      '/wallet?payment_error_extra=1&payment_errors=true'
    )
  })

  // B04 P1-B04 PayPal cancel feedback: the cancel flag must be cleaned from
  // the URL alongside error/pending/show_history so a re-render never
  // re-prompts and the wallet never confuses cancel with any other state.
  test('removes payment_cancel param so re-render does not re-toast', () => {
    assert.equal(
      withoutPaymentReturnParams(
        'https://app.example.com/wallet?payment_cancel=true&foo=bar#top'
      ),
      '/wallet?foo=bar#top'
    )
  })

  test('payment_cancel does not collide with reserved status flags', () => {
    assert.equal(
      withoutPaymentReturnParams(
        'https://app.example.com/wallet?payment_cancel=true&payment_error=true&show_history=true'
      ),
      '/wallet'
    )
  })
})

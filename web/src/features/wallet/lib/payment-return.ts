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
/**
 * Payment-return status handling for the wallet page.
 *
 * The PayPal return flow redirects back with one-shot status flags
 * (payment_error / payment_pending / show_history). These helpers decide
 * which feedback to show and how to clean the consumed flags out of the URL
 * without touching unrelated query params or the hash.
 */

/** Query params consumed when the wallet renders a payment-return status. */
export const PAYMENT_RETURN_PARAMS = [
  'payment_error',
  'payment_pending',
  'show_history',
  'payment_cancel',
] as const

export type PaymentReturnFeedback = 'error' | 'pending'

/**
 * Decide the single feedback to surface for a payment return. Error state
 * always takes priority over pending so a malformed URL carrying both flags
 * produces exactly one message.
 */
export function getPaymentReturnFeedback(
  paymentError: boolean | undefined,
  paymentPending: boolean | undefined
): PaymentReturnFeedback | null {
  if (paymentError === true) {
    return 'error'
  }
  if (paymentPending === true) {
    return 'pending'
  }
  return null
}

/**
 * Build the cleaned same-origin URL (path + remaining search + hash) with the
 * consumed payment-return params removed. Unrelated query params and the
 * fragment are preserved; the caller applies it via history.replaceState so
 * no extra history entry is created.
 */
export function withoutPaymentReturnParams(href: string): string {
  const url = new URL(href)
  for (const key of PAYMENT_RETURN_PARAMS) {
    url.searchParams.delete(key)
  }
  return url.pathname + url.search + url.hash
}

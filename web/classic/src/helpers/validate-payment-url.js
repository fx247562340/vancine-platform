/*
Copyright (C) 2025 QuantumNous

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
 * Shared guard for backend-provided payment redirect targets (classic theme).
 *
 * A checkout URL (Stripe pay_link, Epay action url, Creem checkout_url,
 * Waffo payment_url, Waffo Pancake checkout_url) must be an absolute http(s)
 * URL before it is opened or submitted to. This prevents a malformed or
 * malicious backend response (e.g. `javascript:`, `data:`, `file:`, or a
 * relative path) from ever being used as a payment redirect. Only when this
 * returns true may `checkout_started` be recorded and the user navigated to
 * the URL.
 *
 * @param {unknown} value - The candidate URL (usually from an API response field).
 * @returns {boolean} true only when `value` is a string that parses to an
 *   http/https URL.
 */
export function isSafeHttpPaymentUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

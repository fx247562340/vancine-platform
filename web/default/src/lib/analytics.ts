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
 * Lightweight, privacy-preserving Umami analytics helper.
 *
 * Design constraints:
 * - Only reports on the production hostnames (vancine.com / www.vancine.com),
 *   so localhost and 127.0.0.1 never send data.
 * - Never throws: a missing script, an ad-blocker, or a throwing `track`
 *   must not break registration, playground calls, navigation, or payments.
 * - Never sends user-identifying data (no username/email/phone, user id,
 *   affiliate id, password/code, api key/token/cookie, prompts/replies,
 *   uploaded files/urls, order ids/payment links, or IP addresses).
 * - Does not call `umami.identify`; Umami never receives a user identity.
 */

type AnalyticsEventData = Record<string, string | number | boolean>

/**
 * Minimal, accurate declaration of the subset of the Umami tracker API we use.
 * Only `track` is declared because that is the only method we call.
 */
declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: AnalyticsEventData) => void
    }
  }
}

const PRODUCTION_HOSTS = new Set<string>(['vancine.com', 'www.vancine.com'])

/**
 * Returns true only when running on a production hostname. Any other host
 * (localhost, 127.0.0.1, preview/staging domains, SSR without a window) is
 * treated as non-reporting so local and CI traffic never reaches Umami.
 */
function isProductionHostname(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location?.hostname
  if (!hostname) return false
  return PRODUCTION_HOSTS.has(hostname)
}

/**
 * Send a single analytics event to Umami. Silently no-ops when off the
 * production hostname, when the Umami script is unavailable, or when `track`
 * throws. Callers never need to handle errors.
 */
export function trackEvent(
  eventName: string,
  eventData?: AnalyticsEventData
): void {
  if (!isProductionHostname()) return

  try {
    window.umami?.track(eventName, eventData)
  } catch {
    // Intentionally swallowed: analytics must never break app flows.
    // (e.g. script blocked, `track` threw on malformed input.)
  }
}

export type { AnalyticsEventData }

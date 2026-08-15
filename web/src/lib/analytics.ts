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
 * Lightweight, privacy-preserving Umami analytics helper shared by the
 * public landing pages.
 *
 * Design constraints:
 * - Only reports on the exact production hostnames (vancine.com /
 *   www.vancine.com). localhost, 127.0.0.1, staging/preview domains, any
 *   other subdomain, and SSR/worker environments without a window never
 *   send data.
 * - Never throws: a missing Umami script, an ad-blocker, or a throwing
 *   `track` must not break navigation or page rendering.
 * - Never calls `umami.identify`; Umami never receives a user identity.
 * - Never reads cookies, localStorage, user stores, or auth state, and never
 *   attaches user ids, emails, URLs, query strings, referrers, or IPs.
 * - Page event payloads are restricted to the fixed keys `location`,
 *   `resource`, and `model`; anything else is dropped before it can reach
 *   the tracker.
 */

/** The only payload keys a page event may carry. */
const ALLOWED_PAYLOAD_KEYS = ['location', 'resource', 'model'] as const

/** Fixed, enumerated page event payload. No free-form fields allowed. */
export interface AnalyticsEventData {
  location?: string
  resource?: string
  model?: string
}

/**
 * Minimal declaration of the Umami tracker surface we use. Only `track` is
 * declared because that is the only method we ever call.
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
 * Returns true only on an exact production hostname match. Any other host is
 * treated as non-reporting so local, CI, staging, and preview traffic never
 * reaches Umami.
 */
function isProductionHostname(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location?.hostname
  if (!hostname) return false
  return PRODUCTION_HOSTS.has(hostname)
}

/**
 * Send a single anonymous analytics event to Umami. Silently no-ops when off
 * the production hostnames, when the Umami script is unavailable, or when
 * `track` throws. Payload keys outside the fixed `location` / `resource` /
 * `model` enumeration are dropped. Callers never need to handle errors.
 */
export function trackEvent(
  eventName: string,
  eventData?: AnalyticsEventData
): void {
  if (!isProductionHostname()) return

  let payload: AnalyticsEventData | undefined
  if (eventData) {
    payload = {}
    for (const key of ALLOWED_PAYLOAD_KEYS) {
      const value = eventData[key]
      if (value !== undefined) {
        payload[key] = value
      }
    }
  }

  try {
    window.umami?.track(eventName, payload)
  } catch {
    // Intentionally swallowed: analytics must never break app flows.
  }
}

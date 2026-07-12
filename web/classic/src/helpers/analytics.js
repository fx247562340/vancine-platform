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
 * Lightweight, privacy-preserving Umami analytics helper (classic theme).
 *
 * Design constraints (must match the default theme's analytics):
 * - Only reports on the production hostnames (vancine.com / www.vancine.com),
 *   so localhost, 127.0.0.1, and any test/staging host never send data.
 * - Never throws: a missing script, an ad-blocker, or a throwing `track`
 *   must not break registration, playground calls, navigation, or payments.
 * - Never sends user-identifying data (no username/email/phone, user id,
 *   affiliate id, password/code, api key/token/cookie, prompts/replies,
 *   uploaded files/urls, order ids/payment links, or IP addresses).
 * - Does not call `umami.identify`; Umami never receives a user identity.
 */

const PRODUCTION_HOSTS = new Set(['vancine.com', 'www.vancine.com']);

/**
 * Returns true only when running on a production hostname. Any other host
 * (localhost, 127.0.0.1, preview/staging domains, SSR without a window) is
 * treated as non-reporting so local and CI traffic never reaches Umami.
 */
function isProductionHostname() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location && window.location.hostname;
  if (!hostname) return false;
  return PRODUCTION_HOSTS.has(hostname);
}

/**
 * Send a single analytics event to Umami. Silently no-ops when off the
 * production hostname, when the Umami script is unavailable, or when `track`
 * throws. Callers never need to handle errors.
 *
 * @param {string} eventName - Fixed snake_case event name.
 * @param {Record<string, string|number|boolean>=} eventData - Optional event
 *   properties. Must never contain user-identifying data (see file header).
 */
export function trackEvent(eventName, eventData) {
  if (!isProductionHostname()) return;

  try {
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(eventName, eventData);
    }
  } catch (_err) {
    // Intentionally swallowed: analytics must never break app flows.
  }
}

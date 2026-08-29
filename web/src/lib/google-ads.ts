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
 * Google Ads "sign-up completed" conversion reporting.
 *
 * - The base Google tag and this module's send_to pair are injected by the
 *   backend only when GOOGLE_ADS_ID and GOOGLE_ADS_SIGNUP_CONVERSION_LABEL
 *   are both valid and configured; without that runtime configuration every
 *   call here is a no-op.
 * - Fires only on the exact production hostnames (vancine.com /
 *   www.vancine.com). localhost, 127.0.0.1, staging/preview domains, any
 *   other subdomain, and SSR/worker environments without a window never
 *   send anything to Google, even if the production environment variables
 *   were accidentally inherited.
 * - The conversion event overrides page_location with origin + pathname
 *   (never query or hash), so OAuth callback parameters such as code,
 *   state, or error are never sent to Google by the event.
 * - The event payload is exactly `{ send_to, page_location }` - no
 *   usernames, emails, user ids, or any other personal data ever reach
 *   Google.
 * - Never throws and never blocks the caller: a missing gtag (ad blocker or
 *   script failure), a throwing gtag, or missing configuration are all
 *   silent no-ops that must never break registration, login, or navigation.
 * - Deduplication is per real signup, not per module lifetime: every caller
 *   passes the server-confirmed per-signup key (the new account's id from
 *   the auth bundle or the register response). Repeated calls for the same
 *   signup (StrictMode double effects, repeated OAuth callback executions,
 *   duplicate renders) fire at most one conversion, while a second,
 *   genuinely different signup in the same SPA session is never blocked by
 *   the earlier one. The key is stored only in local memory and is never
 *   included in anything sent to Google. When gtag is unavailable the key
 *   is NOT marked as reported, so a later retry (script recovered) can
 *   still send the conversion.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    __VANCINE_GOOGLE_ADS__?: { signupSendTo?: string }
  }
}

const PRODUCTION_HOSTS = new Set<string>(['vancine.com', 'www.vancine.com'])

/**
 * Per-signup dedup state. A completed report marks the signup key so
 * retries and duplicate render effects for the same signup never send
 * twice, while a different signup key (a second, genuinely new account)
 * still sends. Local memory only - never persisted, never sent to Google.
 */
const reportedSignupKeys = new Set<string>()

function isProductionHostname(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location?.hostname
  if (!hostname) return false
  return PRODUCTION_HOSTS.has(hostname)
}

/**
 * Safe page_location for the conversion event: origin + pathname only,
 * never the query string or hash, so OAuth callback parameters (code,
 * state, error, redirect) can never reach Google.
 */
function safePageLocation(): string | undefined {
  try {
    const { origin, pathname } = window.location
    if (!origin || !pathname) return undefined
    return `${origin}${pathname}`
  } catch {
    return undefined
  }
}

/**
 * Send the Google Ads signup conversion event. A silent no-op when the
 * deployment has no Ads conversion configured, when the current hostname is
 * not a production host, when this signup was already reported, or when
 * gtag is unavailable. Callers never need to handle errors.
 *
 * The signup key is the server-confirmed identifier of this real signup
 * (the new account's id). It is opaque to Google and never included in
 * anything sent there.
 */
export function reportGoogleAdsSignupConversion(
  signupKey: string | number
): void {
  if (!isProductionHostname()) return
  const sendTo = window.__VANCINE_GOOGLE_ADS__?.signupSendTo
  if (typeof sendTo !== 'string' || sendTo === '') return
  const gtag = window.gtag
  // Missing gtag (ad blocker or failed script): return before marking the
  // key so a later retry can still send once the script is available.
  if (typeof gtag !== 'function') return
  const dedupKey = normalizeSignupKey(signupKey)
  if (dedupKey !== undefined && reportedSignupKeys.has(dedupKey)) return
  try {
    const pageLocation = safePageLocation()
    const payload: { send_to: string; page_location?: string } = {
      send_to: sendTo,
    }
    if (pageLocation) payload.page_location = pageLocation
    gtag('event', 'conversion', payload)
    // Mark this signup only after a successful send attempt that did not
    // throw: duplicate calls for the same signup (effect re-run, callback
    // retry) must not double-report.
    if (dedupKey !== undefined) reportedSignupKeys.add(dedupKey)
  } catch {
    // Intentionally swallowed: conversion tracking must never break
    // registration, login, or navigation. A throwing gtag does not mark
    // the key, so the conversion is not silently lost either.
  }
}

function normalizeSignupKey(signupKey: string | number): string | undefined {
  if (typeof signupKey === 'number') return `signup-user-${signupKey}`
  if (typeof signupKey === 'string' && signupKey !== '') {
    return `signup-${signupKey}`
  }
  return undefined
}

/**
 * True only when the server has confirmed inside an auth-bundle response
 * that a brand-new user account was durably created server-side during this
 * request. Existing-user logins, OAuth account binds, and client-forged
 * values never satisfy this - the flag is set exclusively by the backend's
 * user-creation paths and validated by isAuthBundle to be exactly `true`.
 */
export function isServerConfirmedNewUser(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return (value as { signup_completed?: unknown }).signup_completed === true
}

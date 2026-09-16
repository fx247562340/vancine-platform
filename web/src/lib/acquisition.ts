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
 * First-party acquisition attribution capture.
 *
 * - Sends at most one `landing_view` per full page load and at most one
 *   `signup_started` per full page load to POST /api/acquisition/touch.
 * - The server owns all attribution state; this module only reports
 *   milestones so the HttpOnly first-touch cookie can be established.
 * - Never reads the HttpOnly cookie, never persists touch ids, never throws:
 *   attribution failures must not block registration or OAuth.
 * - `reportSignupStarted` runs under a single total budget and always waits
 *   for the landing_view capture to settle first, so events never arrive
 *   out of order.
 */

export type AcquisitionUtmFields = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

export type ReportAcquisitionOptions = {
  /** Use fetch keepalive so a navigation does not cancel the request. */
  keepalive?: boolean
}

const TOUCH_ENDPOINT = '/api/acquisition/touch'

/** Cap for the single global landing_view request. */
const LANDING_VIEW_TIMEOUT_MS = 1500

/** Total wait budget for reportSignupStarted, covering the landing_view wait
 * and the signup_started request together (never two serial budgets). */
const SIGNUP_TOTAL_BUDGET_MS = 1500

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

let landingViewPromise: Promise<void> | null = null
let landingAbortController: AbortController | null = null
let signupStartedPromise: Promise<void> | null = null

function readLocation(): { pathname: string; search: string } {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return {
        pathname: window.location.pathname || '',
        search: window.location.search || '',
      }
    }
  } catch {
    /* location unavailable: report without landing context */
  }
  return { pathname: '', search: '' }
}

/**
 * Extract the allowlisted UTM fields from a query string (with or without a
 * leading `?`). Non-allowlisted parameters are dropped; empty values are
 * omitted.
 */
export function extractUtm(search: string): AcquisitionUtmFields {
  const utm: AcquisitionUtmFields = {}
  if (!search) return utm
  try {
    const query = search.startsWith('?') ? search.slice(1) : search
    const params = new URLSearchParams(query)
    for (const key of UTM_KEYS) {
      const value = params.get(key)
      if (value != null && value !== '') {
        utm[key] = value
      }
    }
  } catch {
    /* malformed query string: keep whatever was parsed so far */
  }
  return utm
}

/**
 * Reduce a pathname to the minimal landing path sent to the server: absolute
 * paths only, no protocol-relative paths, no query or fragment. The server
 * re-validates; this is only a first line of minimization.
 */
export function extractLandingPath(pathname: string): string {
  if (!pathname || !pathname.startsWith('/')) return ''
  if (pathname.startsWith('//')) return ''
  const queryIndex = pathname.search(/[?#]/)
  if (queryIndex === -1) return pathname
  return pathname.slice(0, queryIndex)
}

/**
 * Internal, unlisted admin-only SPA paths. They are not acquisition landings:
 * reporting a landing_view for one would leak an internal path into
 * first-party attribution and inflate the funnel's landing counts. Both the
 * bare and the trailing-slash form are listed because the SPA router accepts
 * either. Matching is exact, so prefixes, siblings, sub-paths and case
 * variants stay ordinary public paths.
 */
const INTERNAL_ADMIN_PATHNAMES: ReadonlySet<string> = new Set([
  '/acquisition-funnel',
  '/acquisition-funnel/',
])

/**
 * Report whether `pathname` is an internal admin-only SPA path that must stay
 * out of acquisition attribution. Callers pass `window.location.pathname`,
 * which never carries a query string or fragment, so the exact-match rule
 * cannot be widened by request parameters.
 *
 * The pathname is percent-decoded once first, because the two sides of this
 * boundary see different encodings: Go's net/http hands the router an
 * already-decoded `URL.Path`, while the browser keeps `window.location.pathname`
 * percent-encoded. Without decoding, an encoded internal URL
 * (/%61cquisition-funnel) would be served the analytics-free private shell by
 * the router yet still be treated as a public landing here, recording a
 * first-party touch for a bounce off an internal admin path.
 *
 * Decoding must never throw: `decodeURIComponent` raises URIError on a
 * malformed escape (/%zz, a truncated %E0%A4%A), and this runs during module
 * evaluation, so an uncaught error would break app startup. On failure the raw
 * pathname is kept, which cannot match the exact internal set.
 *
 * Exactly one decode pass, matching net/http: double-encoded input
 * (/%2561cquisition-funnel) decodes to /%61cquisition-funnel and stays public
 * on both sides. No prefix, substring, regex-prefix or case folding is used,
 * so near-misses, sub-paths, repeated slashes and case variants never match.
 */
export function isInternalAdminPath(pathname: string): boolean {
  let normalized = pathname
  try {
    normalized = decodeURIComponent(pathname)
  } catch {
    /* malformed percent-escape: keep the raw pathname */
  }
  return INTERNAL_ADMIN_PATHNAMES.has(normalized)
}

type PostTouchOptions = {
  keepalive?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * POST one touch event. Never throws: network errors, non-2xx responses,
 * aborts and unexpected exceptions are all swallowed so attribution can never
 * break authentication flows.
 *
 * This intentionally uses direct fetch instead of the shared Axios `api`
 * instance: the request needs fetch-only keepalive across navigations, an
 * AbortSignal that shares the signup total budget, and anonymous same-origin
 * cookie handling, and its failures must stay silent instead of entering the
 * global authentication/error interceptor pipeline.
 */
async function postTouch(
  body: Record<string, string>,
  options: PostTouchOptions
): Promise<void> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  if (options.timeoutMs != null && options.timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), options.timeoutMs)
  }
  const externalSignal = options.signal
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort)
    }
  }
  try {
    await fetch(TOUCH_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(options.keepalive),
      signal: controller.signal,
    })
  } catch {
    /* soft-fail by design */
  } finally {
    if (timer != null) clearTimeout(timer)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }
}

function buildLandingViewBody(): Record<string, string> {
  const { pathname, search } = readLocation()
  const body: Record<string, string> = { event: 'landing_view' }
  const utm = extractUtm(search)
  for (const key of UTM_KEYS) {
    const value = utm[key]
    if (value) body[key] = value
  }
  const landingPath = extractLandingPath(pathname)
  if (landingPath) body.landing_path = landingPath
  return body
}

/**
 * Capture the landing_view milestone for this page load. Deduplicated with a
 * module-level promise: StrictMode double effects, remounts and SPA route
 * changes never trigger a second request. The request aborts itself after a
 * short timeout so it can never pend forever.
 */
export function captureLandingView(): Promise<void> {
  if (landingViewPromise) return landingViewPromise
  const controller = new AbortController()
  landingAbortController = controller
  landingViewPromise = postTouch(buildLandingViewBody(), {
    timeoutMs: LANDING_VIEW_TIMEOUT_MS,
    signal: controller.signal,
  })
  return landingViewPromise
}

async function runSignupStarted(
  options?: ReportAcquisitionOptions
): Promise<void> {
  const budgetAbort = new AbortController()
  let budgetExpired = false
  let releaseBudget = () => {}
  const budgetDeadline = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      budgetExpired = true
      budgetAbort.abort()
      resolve()
    }, SIGNUP_TOTAL_BUDGET_MS)
    releaseBudget = () => {
      clearTimeout(timer)
      resolve()
    }
  })

  try {
    // Wait for the (possibly just started) landing_view capture so the server
    // always sees landing_view before signup_started.
    await Promise.race([captureLandingView(), budgetDeadline])
    if (budgetExpired) {
      // Landing did not settle inside the budget: stop it and let the auth
      // flow proceed. Never send signup_started ahead of an unresolved
      // landing_view.
      landingAbortController?.abort()
      return
    }

    await Promise.race([
      postTouch(
        { event: 'signup_started' },
        { keepalive: Boolean(options?.keepalive), signal: budgetAbort.signal }
      ),
      budgetDeadline,
    ])
  } finally {
    releaseBudget()
  }
}

/**
 * Report signup_started against the existing first touch (server no-create).
 * Deduplicated per page load. Total waiting time is bounded by a single
 * SIGNUP_TOTAL_BUDGET_MS budget shared with the landing_view wait, so
 * awaiting this never blocks registration/OAuth for more than that budget.
 * Never throws.
 */
export function reportSignupStarted(
  options?: ReportAcquisitionOptions
): Promise<void> {
  if (!signupStartedPromise) {
    signupStartedPromise = runSignupStarted(options)
  }
  return signupStartedPromise
}

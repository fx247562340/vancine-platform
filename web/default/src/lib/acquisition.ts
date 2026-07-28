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
 * First-party acquisition attribution helper (default theme).
 *
 * - Captures first landing snapshot via POST /api/acquisition/touch
 * - Never throws; never blocks register/OAuth
 * - Complements Umami trackEvent; does not replace it
 * - Does not read the HttpOnly cookie (browser sends it automatically)
 * - reportSignupStarted always waits for any in-flight landing_view first
 */

export type AcquisitionUtmFields = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

export type AcquisitionEvent = 'landing_view' | 'signup_started'

export type ReportAcquisitionOptions = {
  /** Use fetch keepalive so navigations don't cancel the request. */
  keepalive?: boolean
}

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

const inFlight = new Map<string, Promise<void>>()

/** Shared landing_view promise for the current page (if any). */
let landingViewPromise: Promise<void> | null = null

/**
 * Extract allowlisted UTM keys from a query string (with or without leading ?).
 */
export function extractUtm(search: string): AcquisitionUtmFields {
  const out: AcquisitionUtmFields = {}
  if (!search) return out
  try {
    const q = search.startsWith('?') ? search.slice(1) : search
    const params = new URLSearchParams(q)
    for (const key of UTM_KEYS) {
      const raw = params.get(key)
      if (raw != null && raw !== '') {
        out[key] = raw
      }
    }
  } catch {
    // ignore malformed search
  }
  return out
}

/**
 * Client-side path extract; server re-validates.
 */
export function extractLandingPath(
  pathname?: string,
  search?: string,
  hash?: string
): string {
  try {
    const path =
      pathname ??
      (typeof window !== 'undefined' ? window.location?.pathname : '') ??
      ''
    if (!path || !path.startsWith('/')) return ''
    if (path.startsWith('//')) return ''
    // Drop query/fragment if somehow included
    const clean = path.split(/[?#]/)[0] || ''
    void search
    void hash
    return clean
  } catch {
    return ''
  }
}

/**
 * POST an acquisition event. Never throws.
 * landing_view may carry UTM/path; signup_started sends event only.
 */
export async function reportAcquisitionEvent(
  event: AcquisitionEvent,
  fields?: AcquisitionUtmFields & { landing_path?: string },
  opts?: ReportAcquisitionOptions
): Promise<void> {
  try {
    const body: Record<string, string> = { event }
    if (event === 'landing_view') {
      const utm = fields || {}
      for (const key of UTM_KEYS) {
        const v = utm[key]
        if (typeof v === 'string' && v !== '') body[key] = v
      }
      if (fields?.landing_path) body.landing_path = fields.landing_path
    }

    const res = await fetch('/api/acquisition/touch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(opts?.keepalive),
    })
    void res
  } catch {
    // Intentionally swallowed
  }
}

/**
 * Global first-touch capture for the current page load.
 * Dedupes in-tab double mount (React StrictMode) via in-memory Promise lock.
 */
export function captureAndReportFirstTouch(): Promise<void> {
  if (landingViewPromise) return landingViewPromise

  const key = 'landing_view'
  const existing = inFlight.get(key)
  if (existing) {
    landingViewPromise = existing
    return existing
  }

  const p = (async () => {
    try {
      const search =
        typeof window !== 'undefined' ? window.location?.search || '' : ''
      const pathname =
        typeof window !== 'undefined' ? window.location?.pathname || '' : ''
      const utm = extractUtm(search)
      const landing_path = extractLandingPath(pathname)
      await reportAcquisitionEvent('landing_view', { ...utm, landing_path })
    } catch {
      // never throw
    }
  })()

  inFlight.set(key, p)
  landingViewPromise = p
  return p
}

/**
 * Fire signup_started against an existing touch only (server no-create).
 * Always waits for any in-flight/page landing_view capture to settle first so
 * the server receives landing_view before signup_started (ordering guarantee).
 * Does not itself create touches. Never throws.
 */
export async function reportSignupStarted(
  opts?: ReportAcquisitionOptions
): Promise<void> {
  try {
    // Ensure landing_view runs (or has run) before signup_started.
    // If global capture was never started, start it now so order is preserved.
    await captureAndReportFirstTouch()
  } catch {
    // soft-fail
  }

  const key = 'signup_started'
  const existing = inFlight.get(key)
  if (existing) {
    try {
      await existing
    } catch {
      /* empty */
    }
    return
  }

  const p = reportAcquisitionEvent('signup_started', undefined, {
    keepalive: opts?.keepalive,
  })
  inFlight.set(key, p)
  try {
    await p
  } catch {
    /* empty */
  }
}

/** Test-only: clear in-tab dedupe locks. */
export function __resetAcquisitionLocksForTests(): void {
  inFlight.clear()
  landingViewPromise = null
}

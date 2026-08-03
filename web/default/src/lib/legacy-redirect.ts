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
 * Shared helpers for Classic → Default legacy URL redirect routes.
 *
 * TanStack Router's `redirect({ search: true, hash: true })` does NOT
 * reliably preserve the incoming query string and hash in this version
 * when the source route has no `validateSearch`. The parsed `location.search`
 * becomes `{}`, so `search: true` forwards an empty object.
 *
 * The fix is twofold:
 *   1. Each legacy route declares `validateSearch: legacySearchSchema`
 *      (a `z.record` catch-all) so the incoming query is captured.
 *   2. The redirect explicitly forwards `location.search` and
 *      `location.hash` from the `beforeLoad` context.
 *
 * `buildLegacyRedirect` constructs the redirect options object from
 * the route's location and an optional target + params. It is exported
 * for unit testing so that regressions in query/hash forwarding are
 * caught by executable tests, not just source-string assertions.
 */
import z from 'zod'

/**
 * Catch-all search schema used by every legacy redirect route.
 * Captures all incoming query params as a Record so they can be
 * forwarded to the target route.
 */
export const legacySearchSchema = z
  .record(z.string(), z.unknown())
  .catch({})

/** Shape of the location object passed to buildLegacyRedirect. */
export interface LegacyRedirectLocation {
  search: Record<string, unknown>
  hash: string
}

/** Options accepted by buildLegacyRedirect. */
export interface LegacyRedirectOptions {
  /** Target route path (e.g. '/wallet', '/dashboard/$section') */
  to: string
  /** The current location from beforeLoad context */
  location: LegacyRedirectLocation
  /** Optional typed path params for the target route */
  params?: Record<string, string>
}

/**
 * The subset of TanStack redirect options that buildLegacyRedirect
 * produces. Typed loosely so the return value can be spread into
 * `redirect()` without cross-schema type conflicts.
 */
export interface LegacyRedirectResult {
  to: string
  search: Record<string, unknown>
  hash: string
  replace: true
  params?: Record<string, string>
}

/**
 * Build redirect options that preserve the incoming query string and
 * hash fragment. The result is intended to be spread into TanStack
 * Router's `redirect()` call.
 *
 *   throw redirect({ ...buildLegacyRedirect({ to: '/wallet', location }) })
 *
 * Extracted as a pure function for testability: given a location with
 * known search and hash, the output must include them verbatim.
 */
export function buildLegacyRedirect(
  opts: LegacyRedirectOptions
): LegacyRedirectResult {
  const result: LegacyRedirectResult = {
    to: opts.to,
    search: opts.location.search,
    hash: opts.location.hash,
    replace: true,
  }
  if (opts.params) {
    result.params = opts.params
  }
  return result
}

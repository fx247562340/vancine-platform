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
 * Classic → Default route compatibility manifest.
 *
 * Audit manifest that documents the expected mapping from every Classic
 * legacy path to its Default target. The route implementations in
 * `routes/console/*`, `(auth)/login.tsx`, `(auth)/forbidden.tsx`, etc.
 * mirror this manifest independently. Contract tests verify that both
 * stay in sync.
 *
 * This manifest is NOT consumed at runtime by the route files; it is
 * a documentation and testing artifact.
 *
 * Query parameters and hash fragments are preserved through TanStack
 * `redirect()` using `search: true` and `hash: true` options.
 * See the test file for per-route source contract verification.
 *
 * Design decisions:
 *   - `/console/chat` (no id) → `/dashboard/overview`
 *     Rationale: Classic's /console/chat without an id shows a loading
 *     spinner (no iframe URL can be built). Dashboard is an intentional
 *     safe recovery target, not equivalent behavior.
 *   - `/console/topup` → `/wallet` (no show_history)
 *     Rationale: Classic opens the top-up page, not billing history.
 *   - `/docs` is intentionally NOT mapped — Default's internal Docs
 *     feature is deferred to a later package.
 */

export interface ClassicRouteMapping {
  /** Classic legacy path (may contain :param for dynamic segments) */
  readonly classicPath: string
  /** Default target path (may contain $param for TanStack dynamic segments) */
  readonly defaultPath: string
  /** Whether query parameters are forwarded (always true for these mappings) */
  readonly preserveQuery: boolean
  /** Human-readable rationale for non-obvious mappings */
  readonly rationale?: string
}

/**
 * The complete Classic → Default route compatibility manifest.
 * Every entry here MUST have a corresponding TanStack Router redirect
 * route file (or component) that implements the mapping.
 */
export const CLASSIC_ROUTE_MAPPINGS: readonly ClassicRouteMapping[] = [
  // --- Console routes (authenticated) ---
  {
    classicPath: '/console',
    defaultPath: '/dashboard/overview',
    preserveQuery: true,
  },
  {
    classicPath: '/console/channel',
    defaultPath: '/channels',
    preserveQuery: true,
  },
  {
    classicPath: '/console/token',
    defaultPath: '/keys',
    preserveQuery: true,
  },
  {
    classicPath: '/console/models',
    defaultPath: '/models/metadata',
    preserveQuery: true,
  },
  {
    classicPath: '/console/deployment',
    defaultPath: '/models/deployments',
    preserveQuery: true,
  },
  {
    classicPath: '/console/subscription',
    defaultPath: '/subscriptions',
    preserveQuery: true,
  },
  {
    classicPath: '/console/redemption',
    defaultPath: '/redemption-codes',
    preserveQuery: true,
  },
  {
    classicPath: '/console/user',
    defaultPath: '/users',
    preserveQuery: true,
  },
  {
    classicPath: '/console/setting',
    defaultPath: '/system-settings/site',
    preserveQuery: true,
  },
  {
    classicPath: '/console/personal',
    defaultPath: '/profile',
    preserveQuery: true,
  },
  {
    classicPath: '/console/playground',
    defaultPath: '/playground',
    preserveQuery: true,
  },
  {
    classicPath: '/console/log',
    defaultPath: '/usage-logs/common',
    preserveQuery: true,
  },
  {
    classicPath: '/console/midjourney',
    defaultPath: '/usage-logs/drawing',
    preserveQuery: true,
  },
  {
    classicPath: '/console/task',
    defaultPath: '/usage-logs/task',
    preserveQuery: true,
  },
  {
    classicPath: '/console/chat/:id',
    defaultPath: '/chat/$chatId',
    preserveQuery: true,
    rationale:
      'Dynamic segment :id maps to TanStack $chatId. Both identify the chat session.',
  },
  {
    classicPath: '/console/chat',
    defaultPath: '/dashboard/overview',
    preserveQuery: true,
    rationale:
      "Classic's /console/chat without an id shows a loading spinner (no iframe URL can be built). Dashboard is an intentional safe recovery target.",
  },
  {
    classicPath: '/console/topup',
    defaultPath: '/wallet',
    preserveQuery: true,
    rationale:
      'Classic opens the top-up page, not billing history. Redirect to /wallet without forcing show_history.',
  },

  // --- Public / auth routes ---
  {
    classicPath: '/forbidden',
    defaultPath: '/403',
    preserveQuery: true,
  },
  {
    classicPath: '/login',
    defaultPath: '/sign-in',
    preserveQuery: true,
  },
  {
    classicPath: '/register',
    defaultPath: '/sign-up',
    preserveQuery: true,
  },
] as const

/**
 * Lookup helper: given a Classic path, return its mapping or undefined.
 * Handles both static paths and parameterized paths (e.g. `/console/chat/abc`
 * matches the `/console/chat/:id` mapping).
 */
export function findClassicMapping(classicPath: string): ClassicRouteMapping | undefined {
  // Exact match first
  const exact = CLASSIC_ROUTE_MAPPINGS.find((m) => m.classicPath === classicPath)
  if (exact) return exact

  // Parameterized match: /console/chat/some-id → /console/chat/:id
  for (const mapping of CLASSIC_ROUTE_MAPPINGS) {
    if (!mapping.classicPath.includes(':')) continue
    const pattern = mapping.classicPath.replace(/:[^/]+/g, '[^/]+')
    const regex = new RegExp(`^${pattern}$`)
    if (regex.test(classicPath)) return mapping
  }

  return undefined
}

/**
 * Extract dynamic segment values from a Classic path given a mapping.
 * Returns a record of param name → value, e.g. { id: 'abc' }.
 */
export function extractParams(
  classicPath: string,
  mapping: ClassicRouteMapping
): Record<string, string> {
  const params: Record<string, string> = {}
  const patternParts = mapping.classicPath.split('/')
  const actualParts = classicPath.split('/')

  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i]
    if (part.startsWith(':')) {
      params[part.slice(1)] = actualParts[i] ?? ''
    }
  }
  return params
}

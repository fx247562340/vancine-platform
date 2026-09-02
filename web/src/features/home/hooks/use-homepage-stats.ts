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
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Public aggregate shape served by GET /api/homepage/stats.
//
// Mirrors controller.HomepageStatsResponse on the Go side. The wire
// shape uses an explicit "value" + "availability" pair on every tile
// instead of a magic number so the frontend can tell apart a real
// "0 in the last 30 days" from a "we could not refresh this tile
// right now" without ever displaying a misleading zero.
//
// Field semantics:
//   - window_days — rolling window in days, always 30 today.
//   - successful_requests — distinct request_id of LogTypeConsume
//     rows in [now-30d, now] that prove a successful client
//     request. Successful async image / video / 3D submissions
//     (is_task=true, non-empty request_id, no failure marker)
//     ARE counted. Subsequent task-settlement rows without a
//     request_id, streaming rows that never delivered tokens,
//     zero-token zero-quota rows, and rows with corrupt counters
//     or explicit failure markers (stream_status.status=error,
//     violation_fee=true) are excluded. "value" is the count;
//     "availability" is "ok" when the count is real (a real 0
//     stays 0/ok) and "unavailable" when the underlying query
//     failed. The frontend MUST render the em-dash placeholder
//     on "unavailable".
//   - processed_tokens — sum(prompt_tokens) + sum(completion_tokens)
//     over the same window, including task settlements (tokens are
//     real platform usage regardless of the row's role).
//   - active_vendor_count — distinct vendors behind the anonymous
//     public-available pricing set (same group filter as the
//     public /api/pricing endpoint; private-group-only models
//     never count). Always "ok"; 0 means nothing is public.
//   - available_model_count — same single anonymous public set as
//     the vendor count, so the two tiles never disagree. Never
//     falls back to the vendor count.
//   - as_of — unix seconds when the envelope was assembled. Cached
//     envelopes keep their original as_of so a consumer that wants
//     the snapshot age can read it from the wire payload. The
//     current homepage does not render this timestamp.
// ---------------------------------------------------------------------------
export interface StatTriple {
  value: number
  availability: 'ok' | 'unavailable'
}

export interface HomepageStats {
  window_days: number
  successful_requests: StatTriple
  processed_tokens: StatTriple
  active_vendor_count: StatTriple
  available_model_count: StatTriple
  as_of: number
}

export type HomepageStatsStatus = 'loading' | 'ready' | 'error'

export interface HomepageStatsState {
  status: HomepageStatsStatus
  stats: HomepageStats | null
}

const EMPTY: HomepageStatsState = {
  status: 'loading',
  stats: null,
}

// UNAVAILABLE is the placeholder returned when the network call
// fails. The frontend renders an em-dash for every "unavailable"
// triple so the homepage can never accidentally claim "0
// successful requests" because the DB blipped.
const UNAVAILABLE: HomepageStats = {
  window_days: 30,
  successful_requests: { value: 0, availability: 'unavailable' },
  processed_tokens: { value: 0, availability: 'unavailable' },
  active_vendor_count: { value: 0, availability: 'unavailable' },
  available_model_count: { value: 0, availability: 'unavailable' },
  as_of: 0,
}

// Parse a single aggregate triple. The backend uses snake_case
// keys; the frontend types use the same names. The parse is
// deliberately strict — anything the contract does not guarantee
// downgrades to "unavailable" so the tile renders the em-dash
// placeholder instead of a misleading number:
//   - missing / non-object triple → unavailable
//   - availability anything other than the literal "ok" (unknown,
//     misspelled, missing) → unavailable
//   - value missing, non-numeric, non-finite, non-integer, negative,
//     or larger than Number.MAX_SAFE_INTEGER → unavailable
// A real 0 with availability "ok" stays 0/ok and renders "0".
function parseStatTriple(raw: unknown): StatTriple {
  if (!raw || typeof raw !== 'object') {
    return { value: 0, availability: 'unavailable' }
  }
  const r = raw as { value?: unknown; availability?: unknown }
  if (r.availability !== 'ok') {
    return { value: 0, availability: 'unavailable' }
  }
  const v = r.value
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    return { value: 0, availability: 'unavailable' }
  }
  return { value: v, availability: 'ok' }
}

function parseStats(raw: unknown): HomepageStats | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    window_days: typeof r.window_days === 'number' ? r.window_days : 30,
    successful_requests: parseStatTriple(r.successful_requests),
    processed_tokens: parseStatTriple(r.processed_tokens),
    active_vendor_count: parseStatTriple(r.active_vendor_count),
    available_model_count: parseStatTriple(r.available_model_count),
    as_of: typeof r.as_of === 'number' ? r.as_of : 0,
  }
}

// The handler serves the bare payload — there is NO success/data
// envelope on this endpoint. The axios response interceptor passes
// response.data through unchanged, so res.data IS the stats object.
// (The {success, data} shape the rest of the API uses does not
// apply here; parsing it would reject every real response.)

interface UseHomepageStatsOptions {
  /**
   * When true, the hook does not fire its network request. The
   * built-in homepage uses this when an admin-configured custom
   * home page (URL / HTML / Markdown) is in effect — the custom
   * page owns the render surface and the in-built stats tile
   * must not request aggregate work it does not display.
   */
  enabled?: boolean
}

/**
 * Public homepage stats hook. Reads GET /api/homepage/stats with
 * a 5-minute staleTime so a returning visitor never blocks on
 * the first request. The aggregate is allowed to fail silently —
 * when the network is down the homepage must still render. On
 * error the hook returns an "all-unavailable" payload so every
 * tile shows the em-dash placeholder.
 */
export function useHomepageStats(
  options: UseHomepageStatsOptions = {}
): HomepageStatsState {
  const { enabled = true } = options
  const query = useQuery<HomepageStats, Error>({
    queryKey: ['homepage-stats'],
    queryFn: async () => {
      // Bare payload: the handler serves HomepageStatsResponse
      // directly. skipErrorHandler keeps a transient outage from
      // toasting on the marketing page; skipBusinessError is
      // irrelevant (no success field exists to trip it).
      const res = await api.get<HomepageStats>('/api/homepage/stats', {
        skipErrorHandler: true,
      })
      const stats = parseStats(res.data)
      if (!stats) {
        throw new Error('homepage stats: malformed payload')
      }
      return stats
    },
    // Public aggregate; 5 minutes is plenty of staleness for a
    // marketing tile and matches the server-side cache TTL.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled,
  })

  if (!enabled) {
    return EMPTY
  }
  if (query.isError) {
    return {
      status: 'ready',
      stats: UNAVAILABLE,
    }
  }
  if (query.data) {
    return {
      status: 'ready',
      stats: query.data,
    }
  }
  return EMPTY
}

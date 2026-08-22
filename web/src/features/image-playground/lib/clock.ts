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
 * Tab-scoped "now" and session id. Both values are deterministic in tests
 * (see __setTestClock / __setTestSessionId). Production code reads the
 * real Date.now and a stable sessionStorage value; the heartbeat lease
 * (see image-playground-store.ts) relies on them.
 */

let nowOverride: number | null = null
let sessionIdOverride: string | null = null
let cachedSessionId: string | null = null

const SESSION_STORAGE_KEY = 'vancine.image-playground.session.v1'

// Heartbeat lease windows. The owner tab refreshes the heartbeat on every
// state mutation; other tabs treat a run as still-executing while the
// heartbeat is within LEASE_EXPIRY_MS.
//
// P13-B R16: the expiry window is 30s (was 5s). Background browser tabs
// throttle setInterval to once per minute (or worse), system sleep pauses
// timers entirely, and page jank can stall the ticker - a 5s window
// converted those ordinary conditions into "interrupted" runs. 30s
// survives the common throttling regimes. NOTE: no matter how stale the
// lease becomes, a stale lease NEVER re-enables Retry (see the
// outcome-unknown status in image-playground-store.ts); a stale run can
// only transition to 'unknown', never back to a retryable 'error'.
export const LEASE_HEARTBEAT_INTERVAL_MS = 1000
export const LEASE_EXPIRY_MS = 30_000
export const LEASE_GRACE_MS = 500

function resolveSessionStorage(): Storage | null {
  try {
    if (
      typeof globalThis === 'undefined' ||
      typeof globalThis.sessionStorage === 'undefined'
    ) {
      return null
    }
    return globalThis.sessionStorage
  } catch {
    return null
  }
}

function generateSessionId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi != null && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `sid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getCurrentSessionId(): string {
  if (sessionIdOverride != null) {
    return sessionIdOverride
  }
  if (cachedSessionId != null) {
    return cachedSessionId
  }
  const storage = resolveSessionStorage()
  if (storage == null) {
    // No sessionStorage (e.g. some test harnesses). The caller is expected
    // to inject a session id via __setTestSessionId so lease semantics
    // remain deterministic.
    cachedSessionId = generateSessionId()
    return cachedSessionId
  }
  const existing = storage.getItem(SESSION_STORAGE_KEY)
  if (typeof existing === 'string' && existing !== '') {
    cachedSessionId = existing
    return existing
  }
  const fresh = generateSessionId()
  try {
    storage.setItem(SESSION_STORAGE_KEY, fresh)
  } catch {
    // Quota / privacy mode: keep the in-memory cache so the rest of the
    // lease machinery still works for the lifetime of the page.
  }
  cachedSessionId = fresh
  return fresh
}

export function getCurrentTimeMs(): number {
  if (nowOverride != null) {
    return nowOverride
  }
  return Date.now()
}

export function __setTestClock(value: number | null): void {
  nowOverride = value
}

export function __setTestSessionId(value: string | null): void {
  sessionIdOverride = value
  cachedSessionId = null
}

export function __resetTestOverrides(): void {
  nowOverride = null
  sessionIdOverride = null
  cachedSessionId = null
}

export function isLeaseFresh(
  heartbeatAt: number,
  ownerSessionId: string | null | undefined,
  currentSessionId: string
): boolean {
  if (!ownerSessionId || ownerSessionId === currentSessionId) {
    return false
  }
  const age = getCurrentTimeMs() - heartbeatAt
  return age < LEASE_EXPIRY_MS
}

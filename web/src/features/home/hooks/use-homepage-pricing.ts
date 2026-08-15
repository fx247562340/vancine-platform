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
import { useRef } from 'react'

import { getPricing } from '@/features/pricing/api'
import type { PricingData } from '@/features/pricing/types'

import {
  normalizePricingResponse,
  LOADING_STATE,
  ERROR_STATE,
  type HomepagePricingState,
} from '../lib/homepage-pricing'

export type { HomepagePricingState }

let _instanceCounter = 0
const _instanceIds = new WeakMap<object, number>()

// An in-flight pricing request. Each entry owns an independent AbortController
// so the underlying fetch is never bound to any single observer's signal —
// that is what prevents an observer abort (e.g. React StrictMode's synchronous
// unmount) from cancelling a request that a sibling observer still needs.
//
// Lifetime is managed by explicit subscribe/cancel, NOT by a TTL. The entry
// lives only while at least one observer is subscribed; it is cleared
// immediately on promise settlement.
interface InFlightEntry {
  promise: Promise<PricingData>
  controller: AbortController
  // Number of currently-subscribed observers. Bumped on subscribe, decremented
  // when an observer's signal aborts. The controller is aborted only after the
  // count reaches zero AND a short delay elapses with no re-subscription — the
  // delay is what lets StrictMode's synchronous cleanup/remount reuse the
  // same successful request instead of racing a cancel.
  subscriberCount: number
  // Non-zero while a delayed cancel is pending. Cleared by re-subscription or
  // by the cancel firing.
  cancelTimer: ReturnType<typeof setTimeout> | null
}

const inFlightPricing = new Map<number, InFlightEntry>()

// How long to wait after the last observer unsubscribes before cancelling the
// underlying fetch. Long enough for React StrictMode's synchronous
// cleanup→remount to re-subscribe; short enough that a genuine unmount is
// cancelled promptly. setTimeout(0) defers to the next macrotask, which is
// after all synchronous work and pending microtasks in the current task.
const CANCEL_DELAY_MS = 0

// Subscribe an observer (identified by its AbortSignal) to the in-flight
// request for one homepage instance. Returns the shared promise. Coalesces
// concurrent observers for the same instance — including React StrictMode's
// synchronous double-invoke — into exactly one network call.
//
// Lifecycle rules:
//   - A promise whose controller has already been aborted is never reused; a
//     fresh request is started instead.
//   - Re-subscription within the delay window cancels any pending cancel timer
//     so the existing successful request is reused.
//   - When the last observer unsubscribes, a delayed cancel is scheduled; if no
//     observer re-subscribes in time, the controller is aborted.
//   - The entry is removed from the map the moment the promise settles, so
//     this is pure request coalescing with no TTL data cache and no cross-
//     instance data reuse.
function subscribeToPricing(
  instanceId: number,
  observerSignal: AbortSignal
): Promise<PricingData> {
  let entry = inFlightPricing.get(instanceId)

  // A promise bound to an already-aborted controller must not be reused —
  // its signal will never resolve successfully. Drop the dead entry and start
  // over.
  if (entry && entry.controller.signal.aborted) {
    inFlightPricing.delete(instanceId)
    entry = undefined
  }

  if (!entry) {
    const controller = new AbortController()
    const promise = getPricing(controller.signal).finally(() => {
      inFlightPricing.delete(instanceId)
    })
    entry = {
      promise,
      controller,
      subscriberCount: 0,
      cancelTimer: null,
    }
    inFlightPricing.set(instanceId, entry)
  }

  // A re-subscription within the delay window revives the pending cancel: the
  // observer count is about to go back up, so the controller must stay alive.
  if (entry.cancelTimer !== null) {
    clearTimeout(entry.cancelTimer)
    entry.cancelTimer = null
  }

  // An already-aborted observer signal never fires its event listener, so we
  // must not count it — otherwise the subscriber count would never decrement
  // and the entry would leak. We still hand back the shared promise so the
  // caller's useQuery sees whatever the request produces.
  if (observerSignal.aborted) {
    return entry.promise
  }

  entry.subscriberCount++

  observerSignal.addEventListener(
    'abort',
    () => {
      entry.subscriberCount--
      if (entry.subscriberCount > 0) return
      if (entry.cancelTimer !== null) return
      entry.cancelTimer = setTimeout(() => {
        entry.cancelTimer = null
        if (entry.subscriberCount <= 0) {
          entry.controller.abort()
        }
      }, CANCEL_DELAY_MS)
    },
    { once: true }
  )

  return entry.promise
}

/**
 * Instance-scoped pricing state for the homepage. Each Home mount gets a
 * unique query key via a WeakMap keyed on the ref object, so two Home
 * instances never share cached data. The 5-second gcTime allows the query
 * to survive React StrictMode's synchronous double-invocation (where the
 * component unmounts and immediately remounts with a new ref) without
 * leaking stale data across real navigational remounts — instance-scoped
 * keys ensure the cached entry is invisible to any other instance.
 *
 * Within a single mount, Hero and AvailableNow share the same query
 * instance (same key) so only one network request fires.
 *
 * When `enabled` is false (e.g. custom homepage override is active), the
 * query is skipped entirely — no network request is made.
 */
export function useHomepagePricing(
  enabled: boolean = true
): HomepagePricingState {
  const instanceRef = useRef<object>(null)
  if (instanceRef.current === null) {
    instanceRef.current = {}
  }
  let instanceId = _instanceIds.get(instanceRef.current)
  if (instanceId === undefined) {
    instanceId = ++_instanceCounter
    _instanceIds.set(instanceRef.current, instanceId)
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['homepage-pricing', instanceId],
    // The observer signal from the query context drives subscribeToPricing's
    // lifecycle management only - the actual fetch uses the entry's own
    // AbortController, so TanStack's signal can be forwarded directly.
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      subscribeToPricing(instanceId, signal),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 5_000,
  })

  if (!enabled) return LOADING_STATE
  if (isLoading) return LOADING_STATE
  if (isError) return ERROR_STATE
  if (data === undefined) return LOADING_STATE
  return normalizePricingResponse(data)
}

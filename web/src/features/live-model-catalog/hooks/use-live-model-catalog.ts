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

import { getPricing } from '@/features/pricing/api'

import { buildLiveModelCatalog } from '../lib/catalog'
import type { LiveModelCatalog, LiveModelCatalogStatus } from '../types'

/**
 * Stable, shared query key for the live model catalog. Re-uses the same
 * `['pricing']` cache namespace as the existing `usePricingData` hook so
 * a single network round-trip serves both the catalog and the pricing
 * page (or any future consumer).
 */
export const LIVE_MODEL_CATALOG_QUERY_KEY = ['pricing'] as const

export interface UseLiveModelCatalogResult {
  catalog: LiveModelCatalog
  /**
   * Convenience refetch: surfaces the same TanStack Query `refetch` so
   * consumers can build a retry button without re-importing the hook.
   */
  refetch: () => Promise<unknown>
}

const INITIAL_CATALOG: LiveModelCatalog = {
  status: 'loading',
  textModels: [],
  imageModels: [],
  videoModels: [],
  exampleImageModel: null,
  exampleVideoModel: null,
  totalCount: 0,
}

/**
 * Read the live model catalog. Wraps the existing `getPricing` request
 * through the shared `['pricing']` cache and projects the payload into
 * the Vancine-owned catalog shape.
 */
export function useLiveModelCatalog(
  options: { enabled?: boolean } = {}
): UseLiveModelCatalogResult {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: [...LIVE_MODEL_CATALOG_QUERY_KEY],
    queryFn: getPricing,
    enabled,
    // Pin retries at the consumer level: the project-wide QueryClient
    // enables auto-retry, but a transient /api/pricing failure must
    // surface as a single, user-controllable "Retry" event. Otherwise
    // a user pressing the Retry button during a sustained outage
    // would multiply into retry:1 (auto) + retry:1 (manual) for the
    // same query key.
    retry: false,
  })

  if (query.isError) {
    return {
      catalog: { ...INITIAL_CATALOG, status: 'error' },
      refetch: query.refetch,
    }
  }
  if (query.isPending) {
    return {
      catalog: { ...INITIAL_CATALOG, status: 'loading' },
      refetch: query.refetch,
    }
  }
  const catalog = buildLiveModelCatalog(query.data)
  // Belt-and-braces: if the upstream array is `[]` or contains only
  // invalid records, the catalog builder returns `empty`. Map the
  // `success !== true` path here too so a stale-but-flagged-failure
  // payload never renders as a normal "ready" state.
  const status: LiveModelCatalogStatus =
    !query.data || (query.data as { success?: boolean }).success !== true
      ? 'error'
      : catalog.status
  return {
    catalog: { ...catalog, status },
    refetch: query.refetch,
  }
}

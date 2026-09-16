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
import { useCallback, useState } from 'react'

import { getAcquisitionFunnel } from '../api'
import { buildFunnelFormDefaults, buildFunnelRequestParams } from '../lib'
import type {
  AcquisitionFunnelFormValues,
  AcquisitionFunnelResult,
} from '../types'

/**
 * Internal query state shared by the page and the filter panel: the committed
 * filters (what the current/last query used) plus the outcome of that query.
 */
export interface FunnelQueryState {
  /** Filters the current result was fetched with. */
  appliedFilters: AcquisitionFunnelFormValues
  data: AcquisitionFunnelResult | undefined
  isLoading: boolean
  isError: boolean
  /** Commit a new validated filter set and run exactly one query for it. */
  applyFilters: (values: AcquisitionFunnelFormValues) => void
  /** Re-run the currently committed query once. */
  refetch: () => void
}

/**
 * Single-query funnel loader. The query key includes the committed filters,
 * so a fetch happens exactly once per applied filter set: the initial mount
 * fires one default-window query, and only pressing Apply commits new
 * filters.
 *
 * `retry: false` overrides the app-wide QueryClient (src/main.tsx), which
 * auto-retries normal queries several times in production: with it, the
 * initial failure and each Retry click each send at most one funnel request.
 *
 * While the page stays mounted, staleTime: Infinity keeps the result fresh
 * so rerenders and window focus never refetch (focus refetching only acts
 * on stale queries). gcTime: 0 drops the cache entry as soon as the page
 * unmounts — re-entering the page therefore issues a fresh request by
 * design; nothing here relies on remount caching to suppress requests.
 */
export function useFunnelQuery(): FunnelQueryState {
  const [appliedFilters, setAppliedFilters] =
    useState<AcquisitionFunnelFormValues>(() => buildFunnelFormDefaults())
  const params = buildFunnelRequestParams(appliedFilters)

  const query = useQuery({
    queryKey: ['acquisition-funnel', params],
    queryFn: () => getAcquisitionFunnel(params),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })

  const applyFilters = useCallback((values: AcquisitionFunnelFormValues) => {
    setAppliedFilters(values)
  }, [])

  const refetch = useCallback(() => {
    void query.refetch()
  }, [query])

  return {
    appliedFilters,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    applyFilters,
    refetch,
  }
}

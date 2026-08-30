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
import { useMemo } from 'react'

import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

import {
  selectFastCodingModelsPricing,
  type FastCodingModelsPricingSlot,
} from '../lib/fast-coding-models'

export interface FastCodingModelsPricingState {
  /** Exactly four slots in the fixed guide order; never substituted. */
  slots: FastCodingModelsPricingSlot[]
  isLoading: boolean
  /** Non-null when the /api/pricing request failed. */
  error: Error | null
  refetch: () => unknown
}

/**
 * Live pricing for exactly the four guide models. Reads the shared
 * ['pricing'] react-query cache through usePricingData, so this page
 * never duplicates the pricing fetch contract, and selects the exact
 * model ids with strict equality. A failed request surfaces as
 * `error` and must only degrade the pricing sections — never the
 * article, navigation, or CTAs.
 */
export function useFastCodingModelsPricing(): FastCodingModelsPricingState {
  const { models, isLoading, error, refetch } = usePricingData()

  const slots = useMemo(() => selectFastCodingModelsPricing(models), [models])

  return { slots, isLoading, error: error ?? null, refetch }
}

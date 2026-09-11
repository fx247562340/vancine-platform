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

import { resolveLandingTokenPrice } from '../lib/resolve-token-price'
import type { LandingModelPrice, LandingPricingState } from '../types'

const LOADING_PRICE: LandingModelPrice = { status: 'loading' }
const ERROR_PRICE: LandingModelPrice = { status: 'error' }

/**
 * Shared landing-page adapter over the existing ['pricing'] query.
 *
 * Call this once from a page root and pass `resolve` results down as
 * props. Children must not call `usePricingData` themselves.
 */
export function useLandingPricing(): LandingPricingState {
  const { models, isLoading, error } = usePricingData()

  return useMemo((): LandingPricingState => {
    if (isLoading) {
      return { resolve: () => LOADING_PRICE }
    }
    if (error) {
      return { resolve: () => ERROR_PRICE }
    }
    return {
      resolve: (modelId: string) => resolveLandingTokenPrice(models, modelId),
    }
  }, [models, isLoading, error])
}

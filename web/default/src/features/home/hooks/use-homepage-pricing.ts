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
import { useEffect, useState } from 'react'
import { getPricing } from '@/features/pricing/api'
import {
  normalizePricingResponse,
  type PricingModel,
  type PricingVendor,
} from '../lib/homepage-pricing'

export type HomepagePricingStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface HomepagePricingState {
  status: HomepagePricingStatus
  count: number | null
  models: PricingModel[]
  featured: PricingModel[]
  marketplace: PricingModel[]
  vendors: string[]
  rawVendors: PricingVendor[]
}

const LOADING_STATE: HomepagePricingState = {
  status: 'loading',
  count: null,
  models: [],
  featured: [],
  marketplace: [],
  vendors: [],
  rawVendors: [],
}

const ERROR_STATE: HomepagePricingState = {
  status: 'error',
  count: null,
  models: [],
  featured: [],
  marketplace: [],
  vendors: [],
  rawVendors: [],
}

/**
 * Shared pricing state for the homepage. Fetches /api/pricing once per
 * component instance and normalizes it. Consumed by Hero stats, Available
 * now, Marketplace and Connected providers. No client-side TTL cache.
 */
export function useHomepagePricing(): HomepagePricingState {
  const [state, setState] = useState<HomepagePricingState>(LOADING_STATE)

  useEffect(() => {
    let mounted = true
    getPricing()
      .then((data) => {
        if (!mounted) return
        const normalized = normalizePricingResponse(data)
        setState({
          status: normalized.status,
          count: normalized.count,
          models: normalized.models,
          featured: normalized.featured,
          marketplace: normalized.marketplace,
          vendors: normalized.vendors,
          rawVendors: normalized.rawVendors,
        })
      })
      .catch(() => {
        if (mounted) setState(ERROR_STATE)
      })
    return () => {
      mounted = false
    }
  }, [])

  return state
}

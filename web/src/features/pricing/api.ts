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
import { api } from '@/lib/api'

import type { PricingData } from './types'

// ----------------------------------------------------------------------------
// Pricing APIs
// ----------------------------------------------------------------------------

// Get model pricing data — bypasses global GET dedup and supports abort.
// Works both as a direct call with AbortSignal and as a TanStack Query queryFn.
export async function getPricing(
  signalOrContext?: AbortSignal | { signal?: AbortSignal }
): Promise<PricingData> {
  let signal: AbortSignal | undefined
  if (signalOrContext instanceof AbortSignal) {
    signal = signalOrContext
  } else if (signalOrContext && 'signal' in signalOrContext) {
    signal = signalOrContext.signal
  }
  const res = await api.get('/api/pricing', {
    signal,
    disableDuplicate: true,
  })
  return res.data
}

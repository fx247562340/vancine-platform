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
import { hasTaskUsageSchema } from '@/features/pricing/lib/dynamic-price'
import {
  getDisplayGroupRatio,
  isTokenBasedModel,
} from '@/features/pricing/lib/model-helpers'
import type { PricingModel } from '@/features/pricing/types'

import type { LandingModelPrice } from '../types'

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Resolve a single model's Vancine token price from a /api/pricing list.
 *
 * Formula (USD / 1M tokens), matching the Pricing page:
 *   groupRatio = getDisplayGroupRatio(model)
 *   inputUsd   = model_ratio * 2 * groupRatio
 *   outputUsd  = inputUsd * completion_ratio
 *   cacheReadUsd = inputUsd * cache_ratio when cache_ratio is finite
 *
 * Exact `model_name` match only. No static-price fallback.
 */
export function resolveLandingTokenPrice(
  models: readonly PricingModel[],
  modelId: string
): LandingModelPrice {
  const model = models.find((entry) => entry.model_name === modelId)
  if (!model) {
    return { status: 'missing' }
  }

  if (
    !isTokenBasedModel(model) ||
    hasTaskUsageSchema(model) ||
    model.billing_mode === 'tiered_expr'
  ) {
    return { status: 'unsupported' }
  }

  const enabledGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []
  const configuredGroupRatio = model.group_ratio || {}
  const hasUsableGroupRatio =
    enabledGroups.length === 0 ||
    enabledGroups.some((group) =>
      isFiniteNonNegative(configuredGroupRatio[group])
    )
  const groupRatio = getDisplayGroupRatio(model)
  if (
    !hasUsableGroupRatio ||
    !isFiniteNonNegative(model.model_ratio) ||
    !isFiniteNonNegative(model.completion_ratio) ||
    !isFiniteNonNegative(groupRatio)
  ) {
    return { status: 'unsupported' }
  }

  const inputUsd = model.model_ratio * 2 * groupRatio
  const outputUsd = inputUsd * model.completion_ratio
  if (!isFiniteNonNegative(inputUsd) || !isFiniteNonNegative(outputUsd)) {
    return { status: 'unsupported' }
  }

  const cacheReadUsd = isFiniteNonNegative(model.cache_ratio)
    ? inputUsd * model.cache_ratio
    : null
  const cacheAmount =
    cacheReadUsd === null || isFiniteNonNegative(cacheReadUsd)
      ? cacheReadUsd
      : null

  return {
    status: 'ready',
    amounts: {
      inputUsd,
      outputUsd,
      cacheReadUsd: cacheAmount,
    },
  }
}

/**
 * Format a USD / 1M token amount for landing pages.
 *
 * Input/output use two fraction digits. Cache may use up to three so
 * small prices such as $0.208 stay visible without long floats.
 */
export function formatLandingUsd(
  value: number,
  maxFractionDigits: 2 | 3 = 2
): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  const factor = 10 ** maxFractionDigits
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor
  if (maxFractionDigits === 2) {
    return `$${rounded.toFixed(2)}`
  }
  const asThree = rounded.toFixed(3)
  if (asThree.endsWith('0')) {
    return `$${Number(asThree).toFixed(2)}`
  }
  return `$${asThree}`
}

export function formatLandingTokenUsd(value: number): string {
  return formatLandingUsd(value, 2)
}

export function formatLandingCacheUsd(value: number): string {
  return formatLandingUsd(value, 3)
}

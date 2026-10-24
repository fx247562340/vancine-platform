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
/** USD / 1M token amounts resolved from live /api/pricing. */
export type LandingTokenAmounts = {
  inputUsd: number
  outputUsd: number
  /** Null when cache_ratio is missing or not a finite non-negative number. */
  cacheReadUsd: number | null
}

export type LandingModelPrice =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'unsupported' }
  | { status: 'ready'; amounts: LandingTokenAmounts }

/**
 * Opt-in for a single unconditional linear token expression.
 * Omitted or false keeps the ratio-only path used by other landing pages.
 */
export type LandingTokenPriceOptions = {
  allowSimpleLinearExpression?: boolean
}

export type LandingPricingState = {
  resolve: (
    modelId: string,
    options?: LandingTokenPriceOptions
  ) => LandingModelPrice
}

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
import { describe, expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import {
  formatLandingUsd,
  resolveLandingTokenPrice,
} from '../resolve-token-price'

function tokenModel(
  overrides: Partial<PricingModel> & Pick<PricingModel, 'model_name'>
): PricingModel {
  return {
    id: 1,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

describe('resolveLandingTokenPrice', () => {
  test('computes input as model_ratio * 2 * groupRatio', () => {
    const models = [
      tokenModel({
        model_name: 'kimi-k3',
        model_ratio: 5,
        completion_ratio: 2,
      }),
    ]
    const result = resolveLandingTokenPrice(models, 'kimi-k3')
    expect(result).toEqual({
      status: 'ready',
      amounts: {
        inputUsd: 10,
        outputUsd: 20,
        cacheReadUsd: null,
      },
    })
  })

  test('computes output as inputUsd * completion_ratio', () => {
    const models = [
      tokenModel({
        model_name: 'glm-5.3',
        model_ratio: 0.56,
        completion_ratio: 3.142857142857143,
        cache_ratio: 0.1857142857142857,
      }),
    ]
    const result = resolveLandingTokenPrice(models, 'glm-5.3')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.amounts.inputUsd).toBeCloseTo(1.12, 10)
    expect(result.amounts.outputUsd).toBeCloseTo(1.12 * 3.142857142857143, 10)
  })

  test('computes cache as inputUsd * cache_ratio when cache_ratio is finite', () => {
    const models = [
      tokenModel({
        model_name: 'glm-5.3',
        model_ratio: 0.56,
        completion_ratio: 3.142857142857143,
        cache_ratio: 0.1857142857142857,
      }),
    ]
    const result = resolveLandingTokenPrice(models, 'glm-5.3')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.amounts.cacheReadUsd).toBeCloseTo(
      result.amounts.inputUsd * 0.1857142857142857,
      10
    )
  })

  test('applies the display group ratio from getDisplayGroupRatio', () => {
    const models = [
      tokenModel({
        model_name: 'promo',
        model_ratio: 10,
        completion_ratio: 2,
        cache_ratio: 0.1,
        enable_groups: ['default', 'vip'],
        group_ratio: { default: 1, vip: 0.5 },
      }),
    ]
    const result = resolveLandingTokenPrice(models, 'promo')
    expect(result).toEqual({
      status: 'ready',
      amounts: {
        inputUsd: 10,
        outputUsd: 20,
        cacheReadUsd: 1,
      },
    })
  })

  test('returns ready with a null cache price when cache_ratio is missing', () => {
    const models = [
      tokenModel({
        model_name: 'glm-5.3',
        model_ratio: 37.5,
        completion_ratio: 1,
      }),
    ]
    const result = resolveLandingTokenPrice(models, 'glm-5.3')
    expect(result).toEqual({
      status: 'ready',
      amounts: {
        inputUsd: 75,
        outputUsd: 75,
        cacheReadUsd: null,
      },
    })
  })

  test('treats null, NaN, Infinity, and negative cache_ratio as unavailable cache', () => {
    for (const cache_ratio of [null, Number.NaN, Infinity, -0.1]) {
      const result = resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'cache-case',
            model_ratio: 1,
            completion_ratio: 1,
            cache_ratio,
          }),
        ],
        'cache-case'
      )
      expect(result.status).toBe('ready')
      if (result.status !== 'ready') return
      expect(result.amounts.cacheReadUsd).toBeNull()
    }
  })

  test('does not render NaN, Infinity, or negative model/completion/group ratios as prices', () => {
    const cases: Array<Partial<PricingModel>> = [
      { model_ratio: Number.NaN },
      { model_ratio: Infinity },
      { model_ratio: -1 },
      { completion_ratio: Number.NaN },
      { completion_ratio: Infinity },
      { completion_ratio: -0.5 },
      { enable_groups: ['bad'], group_ratio: { bad: Number.NaN } },
      { enable_groups: ['bad'], group_ratio: { bad: -2 } },
    ]
    for (const overrides of cases) {
      const result = resolveLandingTokenPrice(
        [tokenModel({ model_name: 'invalid', ...overrides })],
        'invalid'
      )
      expect(result.status).not.toBe('ready')
    }
  })

  test('returns missing when the model_name is absent', () => {
    const result = resolveLandingTokenPrice(
      [tokenModel({ model_name: 'kimi-k3' })],
      'glm-5.3'
    )
    expect(result).toEqual({ status: 'missing' })
  })

  test('matches model_name exactly and does not substitute another model', () => {
    const models = [
      tokenModel({
        model_name: 'kimi-k3-preview',
        model_ratio: 1,
        completion_ratio: 1,
      }),
      tokenModel({
        id: 2,
        model_name: 'Kimi-K3',
        model_ratio: 9,
        completion_ratio: 9,
      }),
    ]
    expect(resolveLandingTokenPrice(models, 'kimi-k3')).toEqual({
      status: 'missing',
    })
  })

  test('returns unsupported for per-request, task, and expression billing', () => {
    expect(
      resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'per-request',
            quota_type: 1,
            model_price: 0.02,
          }),
        ],
        'per-request'
      )
    ).toEqual({ status: 'unsupported' })

    expect(
      resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'task-bill',
            billing_usage_schema: {
              seconds: { type: 'number', unit: 'second' },
            },
          }),
        ],
        'task-bill'
      )
    ).toEqual({ status: 'unsupported' })

    expect(
      resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'expr-bill',
            billing_mode: 'tiered_expr',
            billing_expr: 'input * 2',
          }),
        ],
        'expr-bill'
      )
    ).toEqual({ status: 'unsupported' })
  })

  test('treats billing_mode tiered_expr as unsupported even without a usable expression', () => {
    const cases: Array<Partial<PricingModel>> = [
      { billing_mode: 'tiered_expr', billing_expr: 'input * 2' },
      { billing_mode: 'tiered_expr', billing_expr: '' },
      { billing_mode: 'tiered_expr' },
    ]
    for (const overrides of cases) {
      const result = resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'tiered',
            model_ratio: 5,
            completion_ratio: 2,
            ...overrides,
          }),
        ],
        'tiered'
      )
      expect(result).toEqual({ status: 'unsupported' })
    }
  })
})

describe('formatLandingUsd', () => {
  test('formats regular input/output prices to two decimal places', () => {
    expect(formatLandingUsd(75)).toBe('$75.00')
    expect(formatLandingUsd(10)).toBe('$10.00')
    expect(formatLandingUsd(1.12)).toBe('$1.12')
    expect(formatLandingUsd(2.4)).toBe('$2.40')
  })

  test('formats small cache prices with up to three decimals and no long floats', () => {
    expect(formatLandingUsd(0.208, 3)).toBe('$0.208')
    expect(formatLandingUsd(0.012, 3)).toBe('$0.012')
    expect(formatLandingUsd(0.2, 3)).toBe('$0.20')
    expect(formatLandingUsd(0.2080000000001, 3)).toBe('$0.208')
    expect(formatLandingUsd(1.12, 3)).toBe('$1.12')
  })

  test('never emits a long floating-point string', () => {
    const formatted = formatLandingUsd(0.1 + 0.2, 3)
    expect(formatted).toBe('$0.30')
    expect(formatted).not.toMatch(/\d{5,}/)
  })
})

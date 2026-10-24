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

  test('keeps a simple linear expression unsupported unless the caller opts in', () => {
    const models = [
      tokenModel({
        model_name: 'kimi-k3.1-pro',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", p * 1.6 + c * 8 + cr * 0.16)',
        model_ratio: 99,
        completion_ratio: 99,
      }),
    ]
    expect(resolveLandingTokenPrice(models, 'kimi-k3.1-pro')).toEqual({
      status: 'unsupported',
    })
  })

  test('resolves the two Kimi K3.1 linear expressions without reading model_ratio', () => {
    const models = [
      tokenModel({
        model_name: 'kimi-k3.1-pro',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", p * 1.6 + c * 8 + cr * 0.16)',
        model_ratio: 99,
        completion_ratio: 9,
        quota_type: 1,
      }),
      tokenModel({
        id: 2,
        model_name: 'kimi-k3.1-pro-highspeed',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", p * 3.2 + c * 16 + cr * 0.16)',
        model_ratio: 50,
        completion_ratio: 8,
      }),
    ]
    const options = { allowSimpleLinearExpression: true }
    expect(resolveLandingTokenPrice(models, 'kimi-k3.1-pro', options)).toEqual({
      status: 'ready',
      amounts: { inputUsd: 1.6, outputUsd: 8, cacheReadUsd: 0.16 },
    })
    expect(
      resolveLandingTokenPrice(models, 'kimi-k3.1-pro-highspeed', options)
    ).toEqual({
      status: 'ready',
      amounts: { inputUsd: 3.2, outputUsd: 16, cacheReadUsd: 0.16 },
    })
  })

  test('applies the display group ratio to a linear expression', () => {
    const result = resolveLandingTokenPrice(
      [
        tokenModel({
          model_name: 'kimi-k3.1-pro',
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 1.6 + c * 8 + cr * 0.16)',
          enable_groups: ['vip'],
          group_ratio: { vip: 2 },
        }),
      ],
      'kimi-k3.1-pro',
      { allowSimpleLinearExpression: true }
    )
    expect(result).toEqual({
      status: 'ready',
      amounts: { inputUsd: 3.2, outputUsd: 16, cacheReadUsd: 0.32 },
    })
  })

  test('leaves cache null when a linear expression has no cache read term', () => {
    expect(
      resolveLandingTokenPrice(
        [
          tokenModel({
            model_name: 'linear',
            billing_mode: 'tiered_expr',
            billing_expr: 'tier("base", p * 1.6 + c * 8)',
          }),
        ],
        'linear',
        { allowSimpleLinearExpression: true }
      )
    ).toEqual({
      status: 'ready',
      amounts: { inputUsd: 1.6, outputUsd: 8, cacheReadUsd: null },
    })
  })

  test('degrades complex, missing, and abnormal expressions instead of guessing', () => {
    const options = { allowSimpleLinearExpression: true }
    const cases: Array<Partial<PricingModel>> = [
      { billing_expr: '' },
      { billing_expr: 'tier("base", p * 1.6 + c * 8) * 2' },
      {
        billing_expr:
          'param("premium") ? tier("pro", p * 4 + c * 16) : tier("base", p * 2 + c * 8)',
      },
      {
        billing_expr: 'tier("base", u("seconds") * 0.4)',
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
      {
        billing_expr: 'tier("base", p * 1.6 + c * 8)',
        billing_plugin_variants: [
          {
            plugin_key: 'alt',
            plugin_name: 'Alt',
            billing_expr: 'tier("base", p * 2 + c * 4)',
            billing_mode: 'tiered_expr',
            billing_usage_schema: {},
          },
        ],
      },
    ]
    for (const overrides of cases) {
      expect(
        resolveLandingTokenPrice(
          [
            tokenModel({
              model_name: 'bad',
              billing_mode: 'tiered_expr',
              model_ratio: 5,
              completion_ratio: 2,
              ...overrides,
            }),
          ],
          'bad',
          options
        )
      ).toEqual({ status: 'unsupported' })
    }
    expect(resolveLandingTokenPrice([], 'kimi-k3.1-pro', options)).toEqual({
      status: 'missing',
    })
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

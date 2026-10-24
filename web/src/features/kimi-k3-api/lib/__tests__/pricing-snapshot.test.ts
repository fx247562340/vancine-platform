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

import {
  formatKimiK3Usd,
  getKimiK31Model,
  getKimiK31PricingPath,
  getKimiK3PageMetadata,
  KIMI_K31_CACHE_DISCLAIMER_KEY,
  KIMI_K31_MODELS,
  KIMI_K31_MODEL_PROFILES,
  KIMI_K31_OFFICIAL_GUIDE_URL,
  KIMI_K31_OFFICIAL_PRICING_URL,
  KIMI_K31_OPENROUTER_DISCLAIMER_KEY,
  KIMI_K31_OPENROUTER_INPUT_USD,
  KIMI_K31_OPENROUTER_MODEL_URL,
  KIMI_K31_OPENROUTER_OUTPUT_USD,
  KIMI_K31_OPENROUTER_PRICE_VERIFIED_ON,
  KIMI_K31_PRICE_VERIFIED_ON,
  KIMI_K3_FAQ,
  KIMI_K3_PRICE_DISCLAIMER_KEYS,
  KIMI_K3_PRICE_UNIT_KEY,
} from '../landing'

describe('Kimi K3.1 dated official price snapshot', () => {
  test('keeps Pro and Highspeed official input and output prices', () => {
    expect(KIMI_K31_MODELS.map((model) => model.id)).toEqual([
      'kimi-k3.1-pro',
      'kimi-k3.1-pro-highspeed',
    ])
    expect(getKimiK31Model('kimi-k3.1-pro')).toMatchObject({
      officialInputUsd: 2,
      officialOutputUsd: 10,
    })
    expect(getKimiK31Model('kimi-k3.1-pro-highspeed')).toMatchObject({
      officialInputUsd: 4,
      officialOutputUsd: 20,
    })
    expect(KIMI_K3_PRICE_UNIT_KEY).toBe('USD per 1M tokens')
    expect(KIMI_K31_PRICE_VERIFIED_ON).toBe('2026-10-24')
  })

  test('points each model at its own live Pricing path', () => {
    expect(getKimiK31PricingPath('kimi-k3.1-pro')).toBe(
      '/pricing/kimi-k3.1-pro'
    )
    expect(getKimiK31PricingPath('kimi-k3.1-pro-highspeed')).toBe(
      '/pricing/kimi-k3.1-pro-highspeed'
    )
  })

  test('cites the official pricing page and the dated OpenRouter same-model reference', () => {
    expect(KIMI_K31_OFFICIAL_PRICING_URL).toBe(
      'https://platform.moonshot.ai/docs/pricing/chat'
    )
    expect(KIMI_K31_OFFICIAL_GUIDE_URL).toBe(
      'https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart'
    )
    expect(KIMI_K31_OPENROUTER_MODEL_URL).toBe(
      'https://openrouter.ai/moonshotai/kimi-k3.1-pro'
    )
    expect(KIMI_K31_OPENROUTER_PRICE_VERIFIED_ON).toBe('2026-10-24')
    expect(KIMI_K31_OPENROUTER_INPUT_USD).toBe(2)
    expect(KIMI_K31_OPENROUTER_OUTPUT_USD).toBe(10)
    // Footnotes collapse to a single standing line; the OpenRouter date
    // lives in its Pro-only note constant, cache detail in its own constant.
    expect(KIMI_K3_PRICE_DISCLAIMER_KEYS).toHaveLength(1)
    const joined = KIMI_K3_PRICE_DISCLAIMER_KEYS.join(' ')
    expect(joined).toMatch(/per 1M tokens/)
    expect(joined).toMatch(/October 24, 2026/)
    expect(joined).toMatch(/governed by the Vancine Pricing page/)
    expect(KIMI_K31_OPENROUTER_DISCLAIMER_KEY).toMatch(/October 24, 2026/)
    expect(KIMI_K31_OPENROUTER_DISCLAIMER_KEY).toMatch(/same model ID/)
    expect(KIMI_K31_CACHE_DISCLAIMER_KEY).toMatch(/priced separately/)
    expect(KIMI_K31_CACHE_DISCLAIMER_KEY).toMatch(/Vancine Pricing page/)
    expect(joined).not.toMatch(/fixed 20%/)
    expect(joined).not.toMatch(/September 9, 2026/)
  })

  test('profiles restrict the official speed note to Highspeed', () => {
    expect(KIMI_K31_MODEL_PROFILES['kimi-k3.1-pro']).toMatchObject({
      positioningKey: 'For cost-sensitive coding tasks',
      officialSpeedNote: false,
    })
    expect(KIMI_K31_MODEL_PROFILES['kimi-k3.1-pro-highspeed']).toMatchObject({
      positioningKey: 'For interactive tasks where response speed matters',
      officialSpeedNote: true,
    })
    for (const profile of Object.values(KIMI_K31_MODEL_PROFILES)) {
      expect(profile.useCaseKeys).toEqual([
        'Code modification and refactoring',
        'Test tasks',
        'Long-context project analysis',
      ])
    }
  })

  test('FAQ and metadata do not hardcode a Vancine price or a fixed discount', () => {
    expect(KIMI_K3_FAQ).toHaveLength(5)
    const answer = KIMI_K3_FAQ.map((entry) => entry.answerKey).join(' ')
    expect(answer).toMatch(/Vancine Pricing page/)
    expect(answer).toMatch(/dated references from their own pricing pages/)
    expect(answer).toMatch(/about 2–3× the speed of Kimi K3.1 Pro/)
    expect(answer).not.toMatch(/official guide/)
    expect(answer).not.toMatch(/Not a Vancine measurement/)
    expect(answer).not.toMatch(/fixed 20%/)
    expect(answer).not.toMatch(/\$1\.60/)
    expect(answer).not.toMatch(/\$2\.40/)
    expect(answer).not.toMatch(/retired model kimi-k3/)
    expect(answer).not.toMatch(/not Kimi K3\.1 results/)

    const metadata = getKimiK3PageMetadata('en')
    expect(metadata.description).toMatch(/October 24, 2026/)
    expect(metadata.description).not.toMatch(/20%/)
    expect(metadata.canonical).toBe('https://vancine.com/kimi-api')
  })
})

describe('formatKimiK3Usd', () => {
  test('renders two decimal places for the snapshot prices', () => {
    expect(formatKimiK3Usd(2)).toBe('$2.00')
    expect(formatKimiK3Usd(10)).toBe('$10.00')
    expect(formatKimiK3Usd(4)).toBe('$4.00')
    expect(formatKimiK3Usd(20)).toBe('$20.00')
  })
})

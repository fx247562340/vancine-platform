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
  KIMI_K31_MODELS,
  KIMI_K31_OFFICIAL_GUIDE_URL,
  KIMI_K31_OFFICIAL_PRICING_URL,
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

  test('cites the official pricing page and does not invent an OpenRouter row', () => {
    expect(KIMI_K31_OFFICIAL_PRICING_URL).toBe(
      'https://platform.moonshot.ai/docs/pricing/chat'
    )
    expect(KIMI_K31_OFFICIAL_GUIDE_URL).toBe(
      'https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart'
    )
    const joined = KIMI_K3_PRICE_DISCLAIMER_KEYS.join(' ')
    expect(joined).toMatch(/October 24, 2026/)
    expect(joined).toMatch(/no separate Highspeed model ID/)
    expect(joined).toMatch(/Cache write prices and TTL tiers are excluded/)
    expect(joined).toMatch(/hidden when those prices do not confirm/)
    expect(joined).not.toMatch(/OpenRouter Models API/)
    expect(joined).not.toMatch(/fixed 20%/)
    expect(joined).not.toMatch(/September 9, 2026/)
  })

  test('FAQ and metadata do not hardcode a Vancine price or a fixed discount', () => {
    const answer = KIMI_K3_FAQ.map((entry) => entry.answerKey).join(' ')
    expect(answer).toMatch(/live Pricing/)
    expect(answer).toMatch(/not a promise that the total bill/)
    expect(answer).not.toMatch(/fixed 20%/)
    expect(answer).not.toMatch(/\$1\.60/)
    expect(answer).not.toMatch(/\$2\.40/)

    const metadata = getKimiK3PageMetadata('en')
    expect(metadata.description).toMatch(/October 24, 2026/)
    expect(metadata.description).not.toMatch(/20%/)
    expect(metadata.description).not.toMatch(/OpenRouter/)
    expect(metadata.canonical).toBe('https://vancine.com/kimi-k3-api')
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

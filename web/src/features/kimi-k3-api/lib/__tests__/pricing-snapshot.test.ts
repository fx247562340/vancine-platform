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
  getKimiK3PageMetadata,
  KIMI_K3_FAQ,
  KIMI_K3_OFFICIAL_PRICING_URL,
  KIMI_K3_OPENROUTER_PRICING_URL,
  KIMI_K3_PRICE_DISCLAIMER_KEYS,
  KIMI_K3_PRICE_PROVIDERS,
  KIMI_K3_PRICE_UNIT_KEY,
  KIMI_K3_VANCINE_PRICING_PATH,
} from '../landing'

describe('Kimi K3 dated public price snapshot', () => {
  const [vancine, openrouter, official] = KIMI_K3_PRICE_PROVIDERS

  test('lists Vancine, OpenRouter, and Kimi official in that order', () => {
    expect(KIMI_K3_PRICE_PROVIDERS.map((provider) => provider.id)).toEqual([
      'vancine',
      'openrouter',
      'kimi_official',
    ])
    expect(KIMI_K3_PRICE_PROVIDERS.map((provider) => provider.nameKey)).toEqual(
      ['Vancine', 'OpenRouter', 'Kimi official']
    )
  })

  test('keeps dated OpenRouter and Kimi official snapshot prices', () => {
    expect(vancine.id).toBe('vancine')
    expect(openrouter.id).toBe('openrouter')
    expect(openrouter.inputUsd).toBe(3)
    expect(openrouter.outputUsd).toBe(15)
    expect(official.id).toBe('kimi_official')
    expect(official.inputUsd).toBe(3)
    expect(official.outputUsd).toBe(15)
    expect(KIMI_K3_PRICE_UNIT_KEY).toBe('USD per 1M tokens')
  })

  test('keeps the fixed 20% marketing copy without computing a discount from live prices', () => {
    expect(openrouter.differenceKey).toBe(
      'Vancine is 20% lower on both input and output'
    )
    expect(official.differenceKey).toBe(
      'Vancine is 20% lower on both input and output'
    )
  })

  test('never revives the retired 33% / 25% or "up to" discount copy', () => {
    expect(vancine.differenceKey).toBe('Current Vancine price')
    for (const provider of KIMI_K3_PRICE_PROVIDERS) {
      expect(provider.differenceKey).not.toMatch(/33%|25%|up to|at least/i)
    }
  })

  test('OpenRouter and Kimi official stay distinct identities with distinct sources', () => {
    expect(openrouter.inputUsd).toBe(official.inputUsd)
    expect(openrouter.outputUsd).toBe(official.outputUsd)
    expect(openrouter.id).not.toBe(official.id)
    expect(openrouter.nameKey).not.toBe(official.nameKey)
    expect(openrouter.sourceHref).not.toBe(official.sourceHref)
    expect(openrouter.sourceLabelKey).not.toBe(official.sourceLabelKey)
    expect(openrouter.resource).not.toBe(official.resource)
  })

  test('source URLs are the approved public pages', () => {
    expect(vancine.sourceHref).toBe(KIMI_K3_VANCINE_PRICING_PATH)
    expect(KIMI_K3_VANCINE_PRICING_PATH).toBe('/pricing/kimi-k3')
    expect(vancine.sourceKind).toBe('internal')
    expect(vancine.sourceLabelKey).toBe('Vancine live Pricing')
    expect(openrouter.sourceHref).toBe(KIMI_K3_OPENROUTER_PRICING_URL)
    expect(KIMI_K3_OPENROUTER_PRICING_URL).toBe(
      'https://openrouter.ai/api/v1/models'
    )
    expect(openrouter.sourceKind).toBe('external')
    expect(openrouter.sourceLabelKey).toBe(
      'OpenRouter Models API standard pricing'
    )
    expect(official.sourceHref).toBe(KIMI_K3_OFFICIAL_PRICING_URL)
    expect(KIMI_K3_OFFICIAL_PRICING_URL).toBe(
      'https://platform.kimi.ai/docs/pricing/chat-k3'
    )
    expect(official.sourceKind).toBe('external')
    expect(official.sourceLabelKey).toBe('Kimi official pricing')
  })

  test('notes name the snapshot date, the Models API basis, and live Pricing', () => {
    const joined = KIMI_K3_PRICE_DISCLAIMER_KEYS.join(' ')
    expect(joined).toMatch(/per 1M tokens/)
    expect(joined).toMatch(/September 9, 2026/)
    expect(joined).toMatch(/OpenRouter Models API/)
    expect(joined).toMatch(/under default conditions/)
    expect(joined).toMatch(
      /Provider prices shown on OpenRouter model pages can differ/
    )
    expect(joined).toMatch(
      /Free variants, promotional prices, cached input prices/
    )
    expect(joined).toMatch(/Third-party prices may change/)
    expect(joined).toMatch(/Vancine Pricing/)
    // The retired model-page headline basis must not come back.
    expect(joined).not.toMatch(/headline price/i)
    expect(joined).not.toMatch(/September 8, 2026/)
  })

  test('FAQ and metadata do not claim a hardcoded Vancine live price', () => {
    const comparison = KIMI_K3_FAQ.find((entry) =>
      entry.questionKey.includes('Kimi official and OpenRouter')
    )
    expect(comparison).toBeDefined()
    const answer = comparison?.answerKey ?? ''
    expect(answer).toMatch(/See live Vancine pricing for Kimi K3/)
    expect(answer).toMatch(/fixed 20% discount/)
    expect(answer).toMatch(/\$3\.00 \/ \$15\.00/)
    expect(answer).toMatch(/OpenRouter standard API pricing/)
    expect(answer).toMatch(/September 9, 2026/)
    expect(answer).not.toMatch(/Vancine lists \$2\.40/)
    expect(answer).not.toMatch(/\$12\.00 output/)
    for (const retired of [
      /\$2\.00/,
      /\$11\.20/,
      /\$2\.50/,
      /\$14\.00/,
      /33%/,
      /25%/,
      /September 8, 2026/,
    ]) {
      expect(answer).not.toMatch(retired)
    }

    const metadata = getKimiK3PageMetadata('en')
    expect(metadata.description).toMatch(/See live Vancine pricing for Kimi K3/)
    expect(metadata.description).toMatch(/fixed 20% discount/)
    expect(metadata.description).toMatch(/OpenRouter Models API standard price/)
    expect(metadata.description).toMatch(/September 9, 2026/)
    expect(metadata.description).not.toMatch(/\$2\.40/)
    expect(metadata.description).not.toMatch(/\$12\.00/)
    for (const retired of [
      /\$2\.00/,
      /\$11\.20/,
      /\$2\.50/,
      /\$14\.00/,
      /33%/,
      /25%/,
      /September 8, 2026/,
    ]) {
      expect(metadata.description).not.toMatch(retired)
    }
  })
})

describe('formatKimiK3Usd', () => {
  test('renders two decimal places for the snapshot prices', () => {
    expect(formatKimiK3Usd(2.4)).toBe('$2.40')
    expect(formatKimiK3Usd(12)).toBe('$12.00')
    expect(formatKimiK3Usd(3)).toBe('$3.00')
    expect(formatKimiK3Usd(15)).toBe('$15.00')
  })
})

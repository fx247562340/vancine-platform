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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  formatGlm53Usd,
  GLM53_API_CTA_DESTINATION_AUTH,
  getGlm53ApiCtaDestination,
  getGlm53ApiCtaLabelKey,
  getGlm53ApiPageMetadata,
  GLM53_API_CANONICAL,
  GLM53_API_COMPARISON_ROWS,
  GLM53_API_EVIDENCE_KEYS,
  GLM53_API_FAQ,
} from '../glm-5-3-api'

/**
 * Pure business contract tests for the /glm-api acquisition page.
 * Locked values:
 *   - the two model ids (glm-5.3, glm-5.3-flash);
 *   - OpenRouter reference prices with display accuracy (e.g. $0.15,
 *     $0.50, $0.03, $1.40, $4.40, $0.26);
 *   - source URLs;
 *   - seven-language metadata with byte-identical English vs. Go server
 *     metadata (router/web_metadata.go /glm-api entry);
 *   - restrained claims (no "all models cheaper", no absolutes);
 *   - CTA auth parity, UTM allowlist, sensitive-parameter scrubbing,
 *     and no open redirect.
 */

// The canonical English metadata block served by router/web_metadata.go.
// Byte-identical parity with getGlm53ApiPageMetadata('en') is asserted
// in metadataParity below; keep this in sync with the Go entry only via
// the shared contract, never by loosening an assertion.
const GO_EN_METADATA = {
  title: 'GLM-5.3 & GLM-5.3 Flash API Pricing | Vancine',
  description:
    'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
  ogTitle: 'GLM-5.3 & GLM-5.3 Flash API Pricing',
  ogDescription:
    'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
  twitterTitle: 'GLM-5.3 & GLM-5.3 Flash API Pricing',
  twitterDescription:
    'Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.',
}

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getGlm53ApiCtaDestination(false), '/sign-up')
    assert.equal(getGlm53ApiCtaDestination(true), '/playground')
    assert.equal(GLM53_API_CTA_DESTINATION_AUTH.guest, '/sign-up')
    assert.equal(GLM53_API_CTA_DESTINATION_AUTH.authenticated, '/playground')
  })

  test('retains only allowlisted UTM parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    assert.equal(
      getGlm53ApiCtaDestination(false, search),
      '/sign-up?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    )
  })

  test('drops email, phone, token, api_key, redirect, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&token=t&api_key=k&redirect=/evil&unknown=1&utm_source=ok'
    assert.equal(
      getGlm53ApiCtaDestination(true, search),
      '/playground?utm_source=ok'
    )
  })

  test('never produces an external redirect or user-controlled target', () => {
    for (const auth of [false, true]) {
      const dest = getGlm53ApiCtaDestination(
        auth,
        '?redirect=https://evil.example.com&url=//evil.example.com'
      )
      assert.ok(
        dest.startsWith('/sign-up') || dest.startsWith('/playground'),
        `destination ${dest} must be one of the two fixed paths`
      )
      assert.ok(
        !dest.includes('evil.example.com'),
        `destination ${dest} must not reflect user-controlled hosts`
      )
    }
  })
})

describe('CTA label / destination parity', () => {
  test('guest label is "Create an API key" and the destination is /sign-up', () => {
    assert.equal(getGlm53ApiCtaLabelKey(false), 'Create an API key')
    assert.equal(getGlm53ApiCtaDestination(false), '/sign-up')
  })

  test('authenticated label is "Open Playground" and the destination is /playground', () => {
    assert.equal(getGlm53ApiCtaLabelKey(true), 'Open Playground')
    assert.equal(getGlm53ApiCtaDestination(true), '/playground')
  })
})

describe('canonical and metadata', () => {
  test('canonical URL is the fixed public origin without query or UTM', () => {
    assert.equal(GLM53_API_CANONICAL, 'https://vancine.com/glm-api')
    assert.ok(!GLM53_API_CANONICAL.includes('?'))
  })

  test('English metadata is byte-identical to the Go server-rendered block', () => {
    const enMeta = getGlm53ApiPageMetadata('en')
    assert.equal(enMeta.title, GO_EN_METADATA.title)
    assert.equal(enMeta.description, GO_EN_METADATA.description)
    assert.equal(enMeta.ogTitle, GO_EN_METADATA.ogTitle)
    assert.equal(enMeta.ogDescription, GO_EN_METADATA.ogDescription)
    assert.equal(enMeta.twitterTitle, GO_EN_METADATA.twitterTitle)
    assert.equal(enMeta.twitterDescription, GO_EN_METADATA.twitterDescription)
    assert.equal(enMeta.canonical, 'https://vancine.com/glm-api')
    assert.equal(enMeta.ogUrl, 'https://vancine.com/glm-api')
  })

  test('metadata falls back to English for unknown language', () => {
    const fallback = getGlm53ApiPageMetadata('xx-YY')
    assert.deepEqual(fallback, getGlm53ApiPageMetadata('en'))
  })

  test('all seven supported languages return the fixed canonical', () => {
    for (const lang of ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const meta = getGlm53ApiPageMetadata(lang)
      assert.equal(meta.canonical, 'https://vancine.com/glm-api', lang)
      assert.equal(meta.ogUrl, 'https://vancine.com/glm-api', lang)
      assert.ok(!meta.canonical.includes('?'))
      assert.ok(!meta.ogUrl.includes('?'))
    }
  })

  test('non-English metadata translations exist for all interface languages', () => {
    // All languages resolve to non-English titles except English itself;
    // every locale must produce a title carrying the brand suffix.
    for (const lang of ['zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const meta = getGlm53ApiPageMetadata(lang)
      assert.ok(
        meta.title.endsWith('| Vancine'),
        `${lang} title must keep the brand suffix`
      )
      assert.notEqual(
        meta.title,
        GO_EN_METADATA.title,
        `${lang} must be translated, not the English copy`
      )
    }
  })
})

describe('price comparison — two models, three OpenRouter dimensions', () => {
  test('contains exactly the two approved model rows', () => {
    assert.deepEqual(
      GLM53_API_COMPARISON_ROWS.map((row) => row.modelId),
      ['glm-5.3', 'glm-5.3-flash']
    )
  })

  test('static rows keep OpenRouter reference prices and omit Vancine amounts', () => {
    const byId = new Map(
      GLM53_API_COMPARISON_ROWS.map((row) => [row.modelId, row])
    )
    assert.deepEqual(byId.get('glm-5.3'), {
      modelId: 'glm-5.3',
      openrouterInputUsd: 1.4,
      openrouterOutputUsd: 4.4,
      openrouterCacheReadUsd: 0.26,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3',
    })
    assert.deepEqual(byId.get('glm-5.3-flash'), {
      modelId: 'glm-5.3-flash',
      openrouterInputUsd: 0.15,
      openrouterOutputUsd: 0.5,
      openrouterCacheReadUsd: 0.03,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3-flash',
    })
  })

  test('OpenRouter reference prices render exactly to the expected display', () => {
    // Locked against the PRODUCTION formatter (formatGlm53Usd), never a
    // local copy. The six values are the current OpenRouter reference
    // prices shown in the comparison table and mobile cards.
    assert.equal(formatGlm53Usd(0.15), '$0.15')
    assert.equal(formatGlm53Usd(0.5), '$0.50')
    assert.equal(formatGlm53Usd(0.03), '$0.03')
    assert.equal(formatGlm53Usd(1.4), '$1.40')
    assert.equal(formatGlm53Usd(4.4), '$4.40')
    assert.equal(formatGlm53Usd(0.26), '$0.26')
  })

  test('every row carries the public OpenRouter comparison source URL', () => {
    for (const row of GLM53_API_COMPARISON_ROWS) {
      assert.match(
        row.openrouterSourceUrl,
        /^https:\/\/openrouter\.ai\/z-ai\/glm-5\.3(-flash)?$/
      )
    }
  })
})

describe('scope, disclaimers, and restrained claims', () => {
  test('the saving claim still anchors to the linked OpenRouter prices currently displayed', () => {
    const joined = GLM53_API_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      joined.includes(
        'Vancine is 20% lower than the linked OpenRouter prices currently displayed for these two models.'
      ),
      'must use the approved saving formulation'
    )
    assert.ok(
      !joined.includes('standard paid model listings'),
      'the excluded-promotions formulation must be gone'
    )
    assert.ok(
      !joined.includes('Last verified'),
      'the verified-date phrase must be gone from page copy'
    )
    assert.ok(
      /\/pricing/.test(joined) || /live pricing/i.test(joined),
      'must link to Vancine live pricing'
    )
  })

  test('the pricing note still anchors the comparison to the displayed linked prices', () => {
    const joined = GLM53_API_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      joined.includes(
        'USD per 1M tokens, verified against the linked OpenRouter prices displayed on August 28, 2026. Vancine live pricing is authoritative.'
      ),
      'the pricing note must still cite the displayed linked OpenRouter prices'
    )
    assert.ok(
      !joined.includes(
        'verified against the linked OpenRouter standard paid listings'
      ),
      'the standard-paid-listings note must be gone'
    )
  })

  test('the 20% FAQ answer discloses the displayed public prices including promotions', () => {
    const answer = GLM53_API_FAQ.find(
      (entry) =>
        entry.questionKey === 'What exactly does the 20% comparison cover?'
    )?.answerKey
    assert.ok(answer, 'the 20% FAQ entry must exist')
    assert.ok(
      answer?.includes(
        'linked OpenRouter public prices displayed for glm-5.3 and glm-5.3-flash on August 28, 2026'
      ),
      'must anchor the comparison to the displayed linked public prices'
    )
    assert.ok(
      answer?.includes('It includes active provider promotions'),
      'must disclose that promotions are included'
    )
    assert.ok(
      answer?.includes('makes no claim about other models'),
      'must keep the other-models disclaimer'
    )
  })

  test('the price-change FAQ answer points at the linked OpenRouter pages', () => {
    const answer = GLM53_API_FAQ.find(
      (entry) => entry.questionKey === 'Can the prices change?'
    )?.answerKey
    assert.ok(answer, 'the price-change FAQ entry must exist')
    assert.ok(
      answer?.startsWith('Yes. Prices and promotions may change.'),
      'must open with the approved sentences'
    )
    assert.ok(
      answer?.includes(
        'Verify the linked OpenRouter pages for their current prices before purchasing.'
      ),
      'must direct readers to the linked OpenRouter pages'
    )
    assert.ok(
      !answer?.includes('excluded'),
      'the excluded-promotions wording must be gone'
    )
  })

  test('no forbidden absolute or superiority claims anywhere on the page copy', () => {
    const joined = (
      GLM53_API_EVIDENCE_KEYS.join(' | ') +
      ' | ' +
      GLM53_API_FAQ.map((e) => `${e.questionKey} ${e.answerKey}`).join(' | ')
    ).toLowerCase()
    for (const forbidden of [
      'all models are cheaper',
      'cheaper on every model',
      'always 20%',
      'always cheaper',
      'cheapest',
      'best',
      'fastest',
      'lower latency',
      'more stable than openrouter',
      'faster than openrouter',
    ]) {
      assert.ok(
        !joined.includes(forbidden),
        `page copy must not contain the claim: ${forbidden}`
      )
    }
  })

  test('compatibility promises stay limited to OpenAI-compatible formats', () => {
    const joined = (
      GLM53_API_EVIDENCE_KEYS.join(' | ') +
      ' | ' +
      GLM53_API_FAQ.map((e) => `${e.questionKey} ${e.answerKey}`).join(' | ')
    ).toLowerCase()
    assert.ok(
      joined.includes(
        'openai-compatible chat completions request, response, and streaming formats'
      ),
      'compatibility copy must name the supported format set'
    )
    assert.ok(
      joined.includes('provider-specific errors may differ'),
      'compatibility copy must disclose provider-specific error differences'
    )
    assert.ok(
      !joined.includes('identical errors'),
      'compatibility copy must not promise identical errors'
    )
  })
})

describe('model guidance', () => {
  test('describes both models without claiming flash is faster untested', () => {
    const joined = GLM53_API_EVIDENCE_KEYS.join(' | ').toLowerCase()
    assert.ok(joined.includes('glm-5.3-flash'), 'flash id must be described')
    assert.ok(!/flash is faster|faster flash/i.test(joined))
  })
})

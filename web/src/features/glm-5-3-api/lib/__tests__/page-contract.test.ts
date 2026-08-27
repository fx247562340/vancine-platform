import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

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
 * Pure business contract tests for the /glm-5-3-api acquisition page.
 * Locked values:
 *   - the two model ids (glm-5.3, glm-5.3-flash) and six prices;
 *   - the exact 0.8 Vancine/OpenRouter ratio on all six figures with
 *     three-decimal display accuracy ($0.012 / $0.015 / $0.075);
 *   - source URLs, verification date, and the mandatory disclaimer;
 *   - seven-language metadata with byte-identical English vs. Go server
 *     metadata (router/web_metadata.go /glm-5-3-api entry);
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
    assert.equal(GLM53_API_CANONICAL, 'https://vancine.com/glm-5-3-api')
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
    assert.equal(enMeta.canonical, 'https://vancine.com/glm-5-3-api')
    assert.equal(enMeta.ogUrl, 'https://vancine.com/glm-5-3-api')
  })

  test('metadata falls back to English for unknown language', () => {
    const fallback = getGlm53ApiPageMetadata('xx-YY')
    assert.deepEqual(fallback, getGlm53ApiPageMetadata('en'))
  })

  test('all seven supported languages return the fixed canonical', () => {
    for (const lang of ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const meta = getGlm53ApiPageMetadata(lang)
      assert.equal(meta.canonical, 'https://vancine.com/glm-5-3-api', lang)
      assert.equal(meta.ogUrl, 'https://vancine.com/glm-5-3-api', lang)
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

describe('price comparison — two models, three dimensions, 0.8 ratio', () => {
  test('contains exactly the two approved model rows', () => {
    assert.deepEqual(
      GLM53_API_COMPARISON_ROWS.map((row) => row.modelId),
      ['glm-5.3', 'glm-5.3-flash']
    )
  })

  test('the six published prices match exactly', () => {
    const byId = new Map(
      GLM53_API_COMPARISON_ROWS.map((row) => [row.modelId, row])
    )
    assert.deepEqual(byId.get('glm-5.3'), {
      modelId: 'glm-5.3',
      vancineInputUsd: 1.12,
      vancineOutputUsd: 3.52,
      vancineCacheReadUsd: 0.208,
      openrouterInputUsd: 1.4,
      openrouterOutputUsd: 4.4,
      openrouterCacheReadUsd: 0.26,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3',
    })
    assert.deepEqual(byId.get('glm-5.3-flash'), {
      modelId: 'glm-5.3-flash',
      vancineInputUsd: 0.06,
      vancineOutputUsd: 0.2,
      vancineCacheReadUsd: 0.012,
      openrouterInputUsd: 0.075,
      openrouterOutputUsd: 0.25,
      openrouterCacheReadUsd: 0.015,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3-flash',
    })
  })

  test('all six Vancine/OpenRouter ratios are exactly 0.8', () => {
    for (const row of GLM53_API_COMPARISON_ROWS) {
      const pairs: ReadonlyArray<[number, number, string]> = [
        [row.vancineInputUsd, row.openrouterInputUsd, 'input'],
        [row.vancineOutputUsd, row.openrouterOutputUsd, 'output'],
        [row.vancineCacheReadUsd, row.openrouterCacheReadUsd, 'cache read'],
      ]
      for (const [vancine, openrouter, dimension] of pairs) {
        // Compare in integer thousandths of a dollar to avoid float dust:
        // 1.12/1.40 = 0.8 exactly in fixed point.
        const ratioMilli =
          Math.round(vancine * 100000) / Math.round(openrouter * 100000)
        assert.ok(
          Math.abs(ratioMilli - 0.8) < 1e-9,
          `${row.modelId} ${dimension}: $${vancine}/$${openrouter} must equal 0.8`
        )
      }
    }
  })

  test('three-decimal display formatting never rounds away precision', () => {
    // Locked against the PRODUCTION formatter (formatGlm53Usd), never a
    // local copy: $0.012, $0.015, and $0.075 can never degrade to two
    // decimals, and two-decimal figures keep their trailing zero.
    assert.equal(formatGlm53Usd(0.012), '$0.012')
    assert.equal(formatGlm53Usd(0.015), '$0.015')
    assert.equal(formatGlm53Usd(0.075), '$0.075')
    assert.equal(formatGlm53Usd(1.12), '$1.12')
    assert.equal(formatGlm53Usd(0.06), '$0.06')
    assert.equal(formatGlm53Usd(0.2), '$0.20')
    assert.equal(formatGlm53Usd(1.4), '$1.40')
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
  test('the mandatory disclaimer text is present verbatim', () => {
    const joined = GLM53_API_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      joined.includes(
        'Prices may change. Vancine live pricing is authoritative.'
      ),
      'must carry the mandatory "Prices may change" sentence'
    )
    assert.ok(
      joined.includes(
        'The OpenRouter comparison uses the linked standard paid listings; free variants, promotions, and temporary provider discounts are excluded.'
      ),
      'must carry the mandatory scope exclusion sentence'
    )
  })

  test('the saving claim names exactly these two standard paid listings', () => {
    const joined = GLM53_API_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      /Vancine is 20% lower than OpenRouter on these two standard paid model listings\./.test(
        joined
      ),
      'must use the approved saving formulation'
    )
    assert.ok(/August 27, 2026/.test(joined), 'must name the verified date')
    assert.ok(
      /\/pricing/.test(joined) || /live pricing/i.test(joined),
      'must link to Vancine live pricing'
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

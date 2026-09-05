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

For commercial licensing, please contact support@quantumnous.com.
*/
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  getOpenRouterAlternativeCtaDestination,
  getOpenRouterAlternativeCtaLabelKey,
  getOpenRouterAlternativePageMetadata,
  OPENROUTER_ALTERNATIVE_CANONICAL,
  OPENROUTER_ALTERNATIVE_COMPARISON_ROWS,
  OPENROUTER_ALTERNATIVE_API_BASE_URL,
  OPENROUTER_ALTERNATIVE_CODE_EXAMPLES,
  OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS,
  OPENROUTER_ALTERNATIVE_FAQ,
  OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS,
  OPENROUTER_ALTERNATIVE_PRICING_DISCLAIMER_KEYS,
} from '../landing'

/**
 * Pure contract tests for the /openrouter-alternative landing page.
 * The page is the SEO-3 Phase 1 high-intent acquisition page; everything
 * here is deterministic and resolves from fixed literals so the suite
 * never reaches the network.
 */

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getOpenRouterAlternativeCtaDestination(false), '/sign-up')
    assert.equal(getOpenRouterAlternativeCtaDestination(true), '/playground')
  })

  test('retains only allowlisted UTM parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    assert.equal(
      getOpenRouterAlternativeCtaDestination(false, search),
      '/sign-up?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    )
  })

  test('drops sensitive, routing, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&token=t&api_key=k&redirect=/evil&unknown=1&utm_source=ok'
    assert.equal(
      getOpenRouterAlternativeCtaDestination(true, search),
      '/playground?utm_source=ok'
    )
  })

  test('never produces an absolute or foreign target', () => {
    for (const auth of [false, true]) {
      const dest = getOpenRouterAlternativeCtaDestination(
        auth,
        '?redirect=https://evil.example.com'
      )
      assert.ok(
        dest.startsWith('/'),
        `destination ${dest} must be a same-origin path`
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
    assert.equal(
      getOpenRouterAlternativeCtaLabelKey(false),
      'Create an API key'
    )
    assert.equal(getOpenRouterAlternativeCtaDestination(false), '/sign-up')
  })

  test('authenticated label is "Open Playground" and the destination is /playground', () => {
    assert.equal(getOpenRouterAlternativeCtaLabelKey(true), 'Open Playground')
    assert.equal(getOpenRouterAlternativeCtaDestination(true), '/playground')
  })
})

describe('canonical and metadata', () => {
  test('canonical URL is the fixed public origin without query/UTM', () => {
    assert.equal(
      OPENROUTER_ALTERNATIVE_CANONICAL,
      'https://vancine.com/openrouter-alternative'
    )
  })

  test('English metadata is byte-identical to the server-rendered block', () => {
    // This is the contract enforced by router/web_seo_test.go: the SPA's
    // English metadata must stay byte-identical to what the Go server
    // injects into <head> so crawlers and humans see the same values.
    const en = getOpenRouterAlternativePageMetadata('en')
    assert.equal(
      en.title,
      'OpenRouter Alternative for Chinese AI Models | Vancine'
    )
    assert.equal(
      en.description,
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.'
    )
    assert.equal(en.ogTitle, 'OpenRouter Alternative for Chinese AI Models')
    assert.equal(
      en.ogDescription,
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.'
    )
    assert.equal(
      en.twitterTitle,
      'OpenRouter Alternative for Chinese AI Models'
    )
    assert.equal(
      en.twitterDescription,
      'Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.'
    )
    assert.equal(en.ogUrl, 'https://vancine.com/openrouter-alternative')
    assert.equal(en.canonical, 'https://vancine.com/openrouter-alternative')
  })

  test('metadata falls back to English for unknown language', () => {
    const en = getOpenRouterAlternativePageMetadata('en')
    const fallback = getOpenRouterAlternativePageMetadata('xx-YY')
    assert.deepEqual(fallback, en)
  })

  test('all seven supported languages return the canonical URL', () => {
    for (const lang of ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const meta = getOpenRouterAlternativePageMetadata(lang)
      assert.equal(
        meta.canonical,
        'https://vancine.com/openrouter-alternative',
        `language ${lang} must keep the fixed canonical`
      )
      assert.equal(
        meta.ogUrl,
        'https://vancine.com/openrouter-alternative',
        `language ${lang} must keep the fixed og:url`
      )
      assert.ok(!meta.canonical.includes('?'))
      assert.ok(!meta.ogUrl.includes('?'))
    }
  })
})

describe('comparison table — model rows and 20% savings', () => {
  test('contains exactly four flagship paid comparison rows', () => {
    assert.equal(OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.length, 4)
  })

  test('every model id is in the published Vancine catalog', () => {
    const ids = new Set(
      OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.map((row) => row.modelId)
    )
    for (const id of ['qwen3.8-max', 'kimi-k3', 'glm-5.3', 'MiniMax-M3']) {
      assert.ok(ids.has(id), `comparison table must include ${id}`)
    }
  })

  test('deepseek-v4-flash is never a comparison row', () => {
    const ids = OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.map((row) => row.modelId)
    assert.ok(
      !ids.includes('deepseek-v4-flash'),
      'deepseek-v4-flash must not be in the price comparison table'
    )
  })

  test('every Vancine price is exactly 20% lower than OpenRouter (input and output)', () => {
    for (const row of OPENROUTER_ALTERNATIVE_COMPARISON_ROWS) {
      const expectedInput = +(row.openrouterInputUsd * 0.8).toFixed(2)
      const expectedOutput = +(row.openrouterOutputUsd * 0.8).toFixed(2)
      assert.equal(
        row.vancineInputUsd,
        expectedInput,
        `${row.modelId} input: Vancine $${row.vancineInputUsd} must be 20% lower than OpenRouter $${row.openrouterInputUsd} ($${expectedInput})`
      )
      assert.equal(
        row.vancineOutputUsd,
        expectedOutput,
        `${row.modelId} output: Vancine $${row.vancineOutputUsd} must be 20% lower than OpenRouter $${row.openrouterOutputUsd} ($${expectedOutput})`
      )
    }
  })

  test('comparison rows keep the exact published prices', () => {
    const byId = new Map(
      OPENROUTER_ALTERNATIVE_COMPARISON_ROWS.map((row) => [row.modelId, row])
    )
    assert.deepEqual(byId.get('qwen3.8-max'), {
      modelId: 'qwen3.8-max',
      vancineInputUsd: 1.6,
      vancineOutputUsd: 4.8,
      openrouterInputUsd: 2.0,
      openrouterOutputUsd: 6.0,
      openrouterSourceUrl: 'https://openrouter.ai/qwen/qwen3.8-max',
    })
    assert.deepEqual(byId.get('kimi-k3'), {
      modelId: 'kimi-k3',
      vancineInputUsd: 2.4,
      vancineOutputUsd: 12.0,
      openrouterInputUsd: 3.0,
      openrouterOutputUsd: 15.0,
      openrouterSourceUrl: 'https://openrouter.ai/moonshotai/kimi-k3',
    })
    assert.deepEqual(byId.get('glm-5.3'), {
      modelId: 'glm-5.3',
      vancineInputUsd: 1.12,
      vancineOutputUsd: 3.52,
      openrouterInputUsd: 1.4,
      openrouterOutputUsd: 4.4,
      openrouterSourceUrl: 'https://openrouter.ai/z-ai/glm-5.3',
    })
    assert.deepEqual(byId.get('MiniMax-M3'), {
      modelId: 'MiniMax-M3',
      vancineInputUsd: 0.24,
      vancineOutputUsd: 0.96,
      openrouterInputUsd: 0.3,
      openrouterOutputUsd: 1.2,
      openrouterSourceUrl: 'https://openrouter.ai/MiniMax/MiniMax-M3',
    })
  })

  test('every row carries a public OpenRouter comparison source URL', () => {
    for (const row of OPENROUTER_ALTERNATIVE_COMPARISON_ROWS) {
      assert.ok(
        row.openrouterSourceUrl.startsWith('https://openrouter.ai/'),
        `${row.modelId} source ${row.openrouterSourceUrl} must be a public OpenRouter URL`
      )
    }
  })
})

describe('evidence and disclaimer copy', () => {
  test('every pricing disclaimer key is in the i18n key registry', () => {
    for (const key of OPENROUTER_ALTERNATIVE_PRICING_DISCLAIMER_KEYS) {
      assert.ok(
        OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.includes(key),
        `disclaimer key ${key} must be registered for i18n completeness`
      )
    }
  })

  test('evidence copy names the verified date, the OpenRouter scope, and live pricing as authoritative', () => {
    const joined = OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.join(' | ')
    assert.ok(/August 27, 2026/.test(joined), 'must name the verification date')
    assert.ok(
      /standard paid model listing/i.test(joined),
      'must state the OpenRouter scope is its standard paid listing'
    )
    assert.ok(
      /\/api\/pricing/i.test(joined) || /api\/pricing/.test(joined),
      'must point at /api/pricing as the authoritative live source'
    )
  })

  test('the page never claims "all models are cheaper" or related absolutes', () => {
    const joined = OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.join(' | ')
    for (const forbidden of [
      'all models are cheaper',
      'cheaper than OpenRouter on every model',
      'cheaper for every model',
      'cheapest for every',
    ]) {
      assert.ok(
        !joined.toLowerCase().includes(forbidden),
        `page copy must not contain absolute pricing claim: ${forbidden}`
      )
    }
  })

  test('the page never advertises free models or promotional routes as the price case', () => {
    const joined = OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      /free variants,? promotional routes/i.test(joined) ||
        /excludes free variants/i.test(joined) ||
        /excludes free/i.test(joined),
      'disclaimers must explicitly exclude free variants and promotional routes'
    )
  })
})

describe('FAQ contract', () => {
  test('FAQ covers the five required questions', () => {
    const joined = OPENROUTER_ALTERNATIVE_FAQ.map((e) => e.questionKey).join(
      ' | '
    )
    for (const expected of [
      'OpenAI-compatible',
      'platform fee',
      'catalog',
      'pricing',
      'image, video, speech and 3D',
    ]) {
      assert.ok(
        joined.toLowerCase().includes(expected.toLowerCase()),
        `FAQ must include a question about: ${expected}`
      )
    }
    // Also assert the answer about the curated catalog mentions the term.
    const answerJoined = OPENROUTER_ALTERNATIVE_FAQ.map(
      (e) => e.answerKey
    ).join(' | ')
    assert.ok(
      /curated|catalog|retired/i.test(answerJoined),
      'FAQ answer about catalog size must explain curation'
    )
  })

  test('FAQ never contains an absolute pricing promise', () => {
    const joined = OPENROUTER_ALTERNATIVE_FAQ.map(
      (e) => `${e.questionKey} ${e.answerKey}`
    ).join(' | ')
    for (const forbidden of [
      'cheapest for every model',
      'cheaper than every competitor',
      'always the lowest price',
    ]) {
      assert.ok(
        !joined.toLowerCase().includes(forbidden),
        `FAQ must not contain absolute pricing claim: ${forbidden}`
      )
    }
  })
})

describe('model catalog copy', () => {
  test('lists the five flagship text families and the four media families', () => {
    const expected: ReadonlyArray<string> = [
      'Qwen',
      'Kimi',
      'GLM',
      'MiniMax',
      'DeepSeek',
      'Image',
      'Video',
      'Audio',
      '3D',
    ]
    const tokens =
      OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS as ReadonlyArray<string>
    for (const token of expected) {
      assert.ok(
        tokens.includes(token),
        `model catalog copy must mention ${token}`
      )
    }
  })

  test('does not hardcode a fragile model count that would rot on catalog updates', () => {
    const joined = OPENROUTER_ALTERNATIVE_MODEL_CATALOG_TOKENS.join(' | ')
    assert.ok(
      !/\b25\b/.test(joined) || !/models/.test(joined),
      'model catalog copy must not hardcode a fixed model count (avoid stale counts)'
    )
  })
})

describe('API examples', () => {
  test('public base URL is fixed to vancine.com/v1 and never carries an API key', () => {
    assert.equal(OPENROUTER_ALTERNATIVE_API_BASE_URL, 'https://vancine.com/v1')
    assert.ok(!OPENROUTER_ALTERNATIVE_API_BASE_URL.includes('?'))
  })

  test('the migration section copy documents the OpenRouter→Vancine model-id remap', () => {
    const joined = OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.join(' | ')
    assert.ok(
      joined.includes('qwen/qwen3.8-max') && joined.includes('qwen3.8-max'),
      'the migration section must call out the provider-prefixed model id (qwen/qwen3.8-max) and the Vancine id (qwen3.8-max)'
    )
  })

  test('the Python example uses the official openai SDK, not raw requests', () => {
    const pythonExample = OPENROUTER_ALTERNATIVE_CODE_EXAMPLES.find(
      (e) => e.id === 'python'
    )
    if (!pythonExample) {
      assert.fail('python example must exist')
      return
    }
    const code = pythonExample.code
    assert.ok(
      code.includes('from openai import OpenAI'),
      'python example must import OpenAI from the official openai package'
    )
    assert.ok(
      code.includes('client.chat.completions.create('),
      'python example must use client.chat.completions.create(...)'
    )
    assert.ok(
      !code.includes('import requests'),
      'python example must not import requests'
    )
  })
})

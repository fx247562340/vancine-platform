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
import { describe, test } from 'node:test'

import type { PricingModel } from '@/features/pricing/types'

import {
  buildFastCodingModelsCtaSearch,
  FAST_CODING_MODEL_GUIDANCE_KEY,
  FAST_CODING_MODEL_IDS,
  FAST_CODING_MODEL_PREVIEW,
  FAST_CODING_MODELS_ALTERNATE_MODELS,
  FAST_CODING_MODELS_API_BASE_URL,
  FAST_CODING_MODELS_API_KEY_PLACEHOLDER,
  FAST_CODING_MODELS_CANONICAL,
  FAST_CODING_MODELS_CTA_DESTINATION_AUTH,
  FAST_CODING_MODELS_CURL_EXAMPLE,
  FAST_CODING_MODELS_DEFAULT_MODEL,
  FAST_CODING_MODELS_EVIDENCE_KEYS,
  FAST_CODING_MODELS_FAQ,
  FAST_CODING_MODELS_UTM,
  formatFastCodingModelsTokenCount,
  getFastCodingModelsCtaTarget,
  getFastCodingModelsPageMetadata,
  getFastCodingModelsPriceSummary,
  selectFastCodingModelsPricing,
} from '../fast-coding-models'

/**
 * Pure business contract tests for the /guides/fast-coding-models
 * acquisition guide. Locked values:
 *   - the four exact model ids (closed set, strict selection);
 *   - fixed owned-media UTMs and full inbound-parameter scrubbing;
 *   - seven-language metadata with byte-identical English vs. Go
 *     server metadata (router/web_metadata.go entry);
 *   - the evidence boundary never extrapolates the Pi benchmark to
 *     models that were not tested;
 *   - degradation semantics: missing models and failed requests never
 *     substitute another model.
 */

// The canonical English metadata block served by router/web_metadata.go.
// Byte-identical parity with getFastCodingModelsPageMetadata('en') is
// asserted below; keep this in sync with the Go entry only via the
// shared contract, never by loosening an assertion.
const GO_EN_METADATA = {
  title: 'Four Fast Chinese AI Models for Coding Agents | Vancine',
  description:
    'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
  ogTitle: 'Four Fast Chinese AI Models for Coding Agents',
  ogDescription:
    'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
  twitterTitle: 'Four Fast Chinese AI Models for Coding Agents',
  twitterDescription:
    'Compare Hy4 Preview, DeepSeek V4 Flash Vision Exp, GLM-5.3 Flash, and Qwen3.8 Flash through one OpenAI-compatible API.',
}

function fixtureModel(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'fixture',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

describe('the four-model closed set', () => {
  test('contains exactly the four approved model ids in order', () => {
    assert.deepEqual(
      [...FAST_CODING_MODEL_IDS],
      [
        'hy4-preview',
        'deepseek-v4-flash-vision-exp',
        'glm-5.3-flash',
        'qwen3.8-flash',
      ]
    )
  })

  test('preview flag marks only hy4-preview', () => {
    assert.deepEqual(
      FAST_CODING_MODEL_IDS.map((id) => FAST_CODING_MODEL_PREVIEW[id]),
      [true, false, false, false]
    )
  })

  test('every model id carries neutral editorial guidance', () => {
    for (const modelId of FAST_CODING_MODEL_IDS) {
      const key = FAST_CODING_MODEL_GUIDANCE_KEY[modelId]
      assert.ok(key.length > 0, `${modelId} must have guidance`)
      assert.ok(
        !/best|fastest|cheapest|winner/i.test(key),
        `${modelId} guidance must avoid ranking words`
      )
    }
  })
})

describe('pricing selection', () => {
  test('selects exactly the four ids by strict equality, in guide order', () => {
    const models = [
      fixtureModel({ id: 10, model_name: 'qwen3.8-flash' }),
      fixtureModel({ id: 11, model_name: 'hy4-preview' }),
      fixtureModel({ id: 12, model_name: 'unrelated-model' }),
      fixtureModel({ id: 13, model_name: 'glm-5.3-flash' }),
      fixtureModel({ id: 14, model_name: 'deepseek-v4-flash-vision-exp' }),
    ]
    const slots = selectFastCodingModelsPricing(models)
    assert.equal(slots.length, 4)
    assert.deepEqual(
      slots.map((slot) => slot.modelId),
      [
        'hy4-preview',
        'deepseek-v4-flash-vision-exp',
        'glm-5.3-flash',
        'qwen3.8-flash',
      ]
    )
    assert.deepEqual(
      slots.map((slot) => slot.model?.id),
      [11, 14, 13, 10]
    )
  })

  test('never matches case, prefix, or substring variants', () => {
    const models = [
      fixtureModel({ model_name: 'HY4-PREVIEW' }),
      fixtureModel({ model_name: 'hy4-preview-2' }),
      fixtureModel({ model_name: 'glm-5.3' }),
      fixtureModel({ model_name: 'deepseek-v4-flash' }),
      fixtureModel({ model_name: 'qwen3.8-flash-beta' }),
    ]
    const slots = selectFastCodingModelsPricing(models)
    for (const slot of slots) {
      assert.equal(slot.model, null, `${slot.modelId} must stay missing`)
    }
  })

  test('always yields four slots — a missing model degrades, never substitutes', () => {
    const slots = selectFastCodingModelsPricing([])
    assert.equal(slots.length, 4)
    for (const slot of slots) {
      assert.equal(slot.model, null)
    }
  })
})

describe('price summaries', () => {
  test('token models expose input, output, and cache prices via the shared helpers', () => {
    const model = fixtureModel({
      quota_type: 0,
      model_ratio: 0.03,
      completion_ratio: 4,
      cache_ratio: 0.1,
    })
    const summary = getFastCodingModelsPriceSummary(model)
    assert.ok(summary.input && summary.input !== '-')
    assert.ok(summary.output && summary.output !== '-')
    assert.ok(summary.cache && summary.cache !== '-')
  })

  test('cache price is unavailable when the live data has no cache ratio', () => {
    const model = fixtureModel({ quota_type: 0, cache_ratio: null })
    assert.equal(getFastCodingModelsPriceSummary(model).cache, null)
  })

  test('per-request models expose no token prices and never synthesize them', () => {
    const model = fixtureModel({ quota_type: 1, model_price: 0.01 })
    assert.deepEqual(getFastCodingModelsPriceSummary(model), {
      input: null,
      output: null,
      cache: null,
    })
  })
})

describe('catalog token formatting', () => {
  test('formats millions and thousands with the M/K convention', () => {
    assert.equal(formatFastCodingModelsTokenCount(200_000), '200K')
    assert.equal(formatFastCodingModelsTokenCount(1_000_000), '1M')
    assert.equal(formatFastCodingModelsTokenCount(1_500_000), '1.5M')
    assert.equal(formatFastCodingModelsTokenCount(512), '512')
  })

  test('returns null for missing or unusable values', () => {
    assert.equal(formatFastCodingModelsTokenCount(undefined), null)
    assert.equal(formatFastCodingModelsTokenCount(0), null)
    assert.equal(formatFastCodingModelsTokenCount(Number.NaN), null)
    assert.equal(formatFastCodingModelsTokenCount(-5), null)
  })
})

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getFastCodingModelsCtaTarget(false, 'hero').to, '/sign-up')
    assert.equal(getFastCodingModelsCtaTarget(true, 'hero').to, '/playground')
    assert.equal(FAST_CODING_MODELS_CTA_DESTINATION_AUTH.guest, '/sign-up')
    assert.equal(
      FAST_CODING_MODELS_CTA_DESTINATION_AUTH.authenticated,
      '/playground'
    )
  })

  test('every placement carries only the four fixed owned-media UTMs', () => {
    for (const content of ['hero', 'final', 'pricing', 'docs'] as const) {
      const search = buildFastCodingModelsCtaSearch(content)
      assert.deepEqual(Object.keys(search).sort(), [
        'utm_campaign',
        'utm_content',
        'utm_medium',
        'utm_source',
      ])
      assert.equal(search.utm_source, FAST_CODING_MODELS_UTM.utm_source)
      assert.equal(search.utm_medium, FAST_CODING_MODELS_UTM.utm_medium)
      assert.equal(search.utm_campaign, FAST_CODING_MODELS_UTM.utm_campaign)
      assert.equal(search.utm_content, content)
    }
  })

  test('email, token, api_key, redirect, inbound UTMs, and unknown parameters never propagate', () => {
    const hostile =
      '?email=a@b.com&phone=123&token=t&api_key=k&redirect=https://evil.example.com' +
      '&utm_source=evil&utm_campaign=evil&unknown=1'
    for (const auth of [false, true]) {
      const target = getFastCodingModelsCtaTarget(auth, 'final', hostile)
      assert.deepEqual(target.search, {
        utm_source: 'vancine',
        utm_medium: 'owned',
        utm_campaign: 'fast_coding_models_guide',
        utm_content: 'final',
      })
      assert.ok(
        target.to === '/sign-up' || target.to === '/playground',
        `destination ${target.to} must be one of the two fixed paths`
      )
    }
  })

  test('never produces an external redirect or user-controlled target', () => {
    for (const auth of [false, true]) {
      for (const content of ['hero', 'final', 'pricing', 'docs'] as const) {
        const target = getFastCodingModelsCtaTarget(
          auth,
          content,
          '?redirect=//evil.example.com&url=https://evil.example.com'
        )
        assert.ok(
          target.to === '/sign-up' || target.to === '/playground',
          `destination ${target.to} must be one of the two fixed paths`
        )
      }
    }
  })
})

describe('page metadata', () => {
  test('English metadata is byte-identical to the Go server-rendered block', () => {
    const meta = getFastCodingModelsPageMetadata('en')
    assert.equal(meta.title, GO_EN_METADATA.title)
    assert.equal(meta.description, GO_EN_METADATA.description)
    assert.equal(meta.ogTitle, GO_EN_METADATA.ogTitle)
    assert.equal(meta.ogDescription, GO_EN_METADATA.ogDescription)
    assert.equal(meta.twitterTitle, GO_EN_METADATA.twitterTitle)
    assert.equal(meta.twitterDescription, GO_EN_METADATA.twitterDescription)
  })

  test('canonical and og:url are the fixed guide URL', () => {
    assert.equal(
      FAST_CODING_MODELS_CANONICAL,
      'https://vancine.com/guides/fast-coding-models'
    )
    for (const language of [
      'en',
      'zh',
      'zh-CN',
      'zh-TW',
      'fr',
      'ru',
      'ja',
      'vi',
    ]) {
      const meta = getFastCodingModelsPageMetadata(language)
      assert.equal(meta.canonical, FAST_CODING_MODELS_CANONICAL)
      assert.equal(meta.ogUrl, FAST_CODING_MODELS_CANONICAL)
    }
  })

  test('all seven supported languages have complete metadata', () => {
    for (const language of [
      'en',
      'zh',
      'zh-CN',
      'zh-TW',
      'fr',
      'ru',
      'ja',
      'vi',
    ]) {
      const meta = getFastCodingModelsPageMetadata(language)
      for (const value of [
        meta.title,
        meta.description,
        meta.ogTitle,
        meta.ogDescription,
        meta.twitterTitle,
        meta.twitterDescription,
      ]) {
        assert.ok(typeof value === 'string' && value.trim().length > 0)
      }
    }
  })

  test('unknown languages fall back to English', () => {
    const fallback = getFastCodingModelsPageMetadata('xx-UNKNOWN')
    const english = getFastCodingModelsPageMetadata('en')
    assert.deepEqual(fallback, english)
  })
})

describe('quickstart contract', () => {
  test('the curl example targets the canonical endpoint with the env placeholder', () => {
    assert.ok(
      FAST_CODING_MODELS_CURL_EXAMPLE.includes(
        `${FAST_CODING_MODELS_API_BASE_URL}/chat/completions`
      )
    )
    assert.ok(
      FAST_CODING_MODELS_CURL_EXAMPLE.includes(
        `Bearer ${FAST_CODING_MODELS_API_KEY_PLACEHOLDER}`
      )
    )
    assert.ok(
      !FAST_CODING_MODELS_CURL_EXAMPLE.includes('sk-'),
      'the example must never carry a real-looking key literal'
    )
  })

  test('the default model is glm-5.3-flash and the alternates are the other three exact ids', () => {
    assert.equal(FAST_CODING_MODELS_DEFAULT_MODEL, 'glm-5.3-flash')
    assert.ok(
      FAST_CODING_MODELS_CURL_EXAMPLE.includes(
        `"model": "${FAST_CODING_MODELS_DEFAULT_MODEL}"`
      )
    )
    assert.deepEqual([...FAST_CODING_MODELS_ALTERNATE_MODELS].sort(), [
      'deepseek-v4-flash-vision-exp',
      'hy4-preview',
      'qwen3.8-flash',
    ])
    assert.ok(
      !FAST_CODING_MODELS_ALTERNATE_MODELS.includes(
        FAST_CODING_MODELS_DEFAULT_MODEL
      )
    )
  })
})

describe('evidence boundary', () => {
  test('the benchmark membership facts include only the two tested models', () => {
    const joined = FAST_CODING_MODELS_EVIDENCE_KEYS.join(' ')
    assert.ok(joined.includes('includes glm-5.3-flash and qwen3.8-flash'))
    assert.ok(joined.includes('does not include hy4-preview'))
    assert.ok(joined.includes('does not include deepseek-v4-flash-vision-exp'))
    assert.ok(
      joined.includes('deepseek-v4-flash listed there is a different model ID')
    )
    assert.ok(
      joined.includes(
        'Do not extend those results to models that were not tested'
      )
    )
  })
})

describe('FAQ and disclosure', () => {
  test('covers the four mandatory questions', () => {
    assert.deepEqual(
      FAST_CODING_MODELS_FAQ.map((entry) => entry.questionKey),
      [
        'How do I switch models?',
        'Where does the live price come from?',
        'Are these models officially partnered with Vancine?',
        'Where can I configure OpenCode, Cline, or Roo Code?',
      ]
    )
  })

  test('the partnership answer discloses the non-partner relationship', () => {
    const partnership = FAST_CODING_MODELS_FAQ.find(
      (entry) =>
        entry.questionKey ===
        'Are these models officially partnered with Vancine?'
    )
    assert.ok(partnership)
    assert.match(partnership.answerKey, /^No\./)
    assert.ok(
      partnership.answerKey.includes('not the official vendor, partner')
    )
  })
})

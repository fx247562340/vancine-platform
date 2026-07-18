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
// Run with: node --test src/features/kimi-k3-api/lib/landing.test.ts
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'

const require = createRequire(import.meta.url)
const en = require('../../../i18n/locales/en.json')
const zh = require('../../../i18n/locales/zh.json')
const fr = require('../../../i18n/locales/fr.json')
const ja = require('../../../i18n/locales/ja.json')
const ru = require('../../../i18n/locales/ru.json')
const vi = require('../../../i18n/locales/vi.json')

const NEW_HERO_KEY =
  'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'
const OLD_HERO_KEY =
  'Connect OpenCode, Cline, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'

import {
  KIMI_K3_CANONICAL,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CREDIT_DISCLAIMER,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_CTA_LOCATIONS,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_RESOURCE_EVENT,
  KIMI_K3_RESOURCE_VALUES,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing.ts'

describe('Kimi K3 API landing contract', () => {
  test('copy helper reports an error when the clipboard API is unavailable', async () => {
    assert.equal(await copyTextToClipboard('example', undefined), 'error')
  })

  test('copy helper contains clipboard permission rejection', async () => {
    const deniedClipboard = {
      async writeText() {
        throw new Error('clipboard permission denied')
      },
    }

    assert.equal(await copyTextToClipboard('example', deniedClipboard), 'error')
  })

  test('guest CTA preserves only the approved UTM parameters', () => {
    assert.equal(
      getKimiK3CtaDestination(
        false,
        '?utm_source=search&email=developer@example.com&utm_campaign=k3&token=nope&utm_term=agents'
      ),
      '/sign-up?utm_source=search&utm_campaign=k3&utm_term=agents'
    )
  })

  test('authenticated CTA points to playground and preserves allowed UTM parameters', () => {
    assert.equal(
      getKimiK3CtaDestination(true, 'utm_medium=cpc&ref=discard'),
      '/playground?utm_medium=cpc'
    )
  })

  test('metadata has the exact canonical and approved English title', () => {
    const metadata = getKimiK3Metadata('en')
    assert.equal(KIMI_K3_CANONICAL, 'https://vancine.com/kimi-k3-api')
    assert.equal(metadata.canonical, KIMI_K3_CANONICAL)
    assert.equal(metadata.title, 'Kimi K3 API for Coding Agents | Vancine')
    assert.match(metadata.description, /OpenCode/)
    assert.match(metadata.description, /Cline/)
    assert.match(metadata.description, /OpenAI-compatible/)
    assert.match(metadata.description, /one API key/i)
  })

  test('Chinese metadata is selected for zh variants and all other locales use English', () => {
    assert.notEqual(
      getKimiK3Metadata('zh-CN').title,
      getKimiK3Metadata('en').title
    )
    assert.equal(getKimiK3Metadata('zh').canonical, KIMI_K3_CANONICAL)
    assert.equal(getKimiK3Metadata('fr').title, getKimiK3Metadata('en').title)
    assert.equal(getKimiK3Metadata('ja').title, getKimiK3Metadata('en').title)
  })

  test('analytics contracts use only the approved event names and locations', () => {
    assert.equal(KIMI_K3_CTA_EVENT, 'get_started_clicked')
    assert.deepEqual(KIMI_K3_CTA_LOCATIONS, [
      'kimi_k3_hero',
      'kimi_k3_quickstart',
      'kimi_k3_final_cta',
    ])
    assert.equal(KIMI_K3_RESOURCE_EVENT, 'developer_resource_clicked')
    assert.deepEqual(KIMI_K3_RESOURCE_VALUES, ['docs', 'pricing'])
  })

  test('quickstart examples all use the public Vancine endpoint and Kimi K3', () => {
    assert.deepEqual(
      KIMI_K3_CODE_EXAMPLES.map((example) => example.id),
      ['curl', 'python', 'node']
    )
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.match(
        example.code,
        /POST https:\/\/vancine\.com\/v1\/chat\/completions/
      )
      assert.match(example.code, /kimi-k3/)
      assert.match(example.code, /VANCINE_API_KEY/)
    }
  })

  test('examples never contain legacy hosts, real-looking secrets, or fixed token prices', () => {
    const examples = [
      ...KIMI_K3_CODE_EXAMPLES.map((example) => example.code),
      KIMI_K3_OPENCODE_CONFIG,
    ].join('\n')
    assert.doesNotMatch(examples, /api\.vancine\.com/)
    assert.doesNotMatch(examples, /sk-[a-zA-Z0-9]{12,}/)
    assert.doesNotMatch(
      examples,
      /\$\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:million|1m|token)/i
    )
  })

  test('OpenCode configuration honors the exact Vancine provider contract', () => {
    assert.match(KIMI_K3_OPENCODE_CONFIG, /@ai-sdk\/openai-compatible/)
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"vancine"/)
    assert.match(
      KIMI_K3_OPENCODE_CONFIG,
      /"baseURL": "https:\/\/vancine\.com\/v1"/
    )
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"apiKey": "\{env:VANCINE_API_KEY\}"/)
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"kimi-k3"/)
  })

  test('credit disclaimer uses the approved copy exactly', () => {
    assert.equal(
      KIMI_K3_CREDIT_DISCLAIMER,
      '$1 free credit. No credit card required. Usage varies by model and request.'
    )
  })

  test('all supported locales contain the new hero key and no old key', () => {
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      assert.ok(
        NEW_HERO_KEY in translations,
        `locale must contain the new hero key with Roo Code`
      )
      assert.ok(
        !(OLD_HERO_KEY in translations),
        `locale must not contain the old hero key without Roo Code`
      )
    }
  })
})

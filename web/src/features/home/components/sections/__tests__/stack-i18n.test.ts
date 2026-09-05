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
/**
 * Pure-logic i18n completeness test for the Stack section.
 *
 * Reads locale JSON via direct imports and asserts:
 *  - all 15 frozen Stack keys exist and are non-empty in every locale
 *  - brand titles (OpenCode, Cline, etc.) may stay English in non-English locales
 *  - Pi body, Configuration-ready, and Live-verified must NOT equal English
 *    in any non-English locale
 *
 * Does NOT render React, does NOT read production source, does NOT copy
 * production algorithms.
 */
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

// 15 frozen Stack i18n keys
const STACK_KEYS = [
  'Works with your stack',
  'Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.',
  'OpenCode',
  'Live-verified with Kimi K3 in a controlled coding-agent run. View the evidence section below.',
  'Live-verified',
  'Cline',
  'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
  'Configuration-ready',
  'Roo Code',
  'Claude Code',
  'Compatible via OpenAI-compatible / documented gateway usage patterns. No Vancine-owned end-to-end coding-agent benchmark is claimed on the homepage.',
  'OpenAI SDK',
  'First-class: standard OpenAI SDK against https://vancine.com/v1.',
  'Pi Coding Agent',
  "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.",
] as const

// Keys whose non-English values are allowed to stay identical to English
// (brand/product titles that are never translated).
const BRAND_TITLES: ReadonlySet<string> = new Set([
  'OpenCode',
  'Cline',
  'Roo Code',
  'Claude Code',
  'OpenAI SDK',
  'Pi Coding Agent',
])

// Keys that MUST differ from English in every non-English locale.
const MUST_DIFFER_FROM_EN: ReadonlySet<string> = new Set([
  'Live-verified',
  'Configuration-ready',
  "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.",
])

type TranslationRecord = Record<string, string>

const LOCALES: ReadonlyArray<{
  name: string
  data: { translation: TranslationRecord }
}> = [
  { name: 'en', data: en },
  { name: 'zh', data: zh },
  { name: 'zh-TW', data: zhTW },
  { name: 'fr', data: fr },
  { name: 'ja', data: ja },
  { name: 'ru', data: ru },
  { name: 'vi', data: vi },
]

function getTranslation(locale: (typeof LOCALES)[number]): TranslationRecord {
  return locale.data.translation
}

describe('Stack i18n — 15 frozen keys × 7 locales', () => {
  const enTranslation = getTranslation(LOCALES[0])

  for (const locale of LOCALES) {
    const translation = getTranslation(locale)

    test(`${locale.name}: all 15 Stack keys present and non-empty`, () => {
      const missing: string[] = []
      const empty: string[] = []

      for (const key of STACK_KEYS) {
        if (!(key in translation)) {
          missing.push(key)
        } else if (translation[key] === '') {
          empty.push(key)
        }
      }

      assert.deepEqual(missing, [], `${locale.name}: missing keys`)
      assert.deepEqual(empty, [], `${locale.name}: empty keys`)
    })

    if (locale.name !== 'en') {
      test(`${locale.name}: Pi body, Configuration-ready, Live-verified are not English fallback`, () => {
        const englishFallbacks: string[] = []

        for (const key of MUST_DIFFER_FROM_EN) {
          const enVal = enTranslation[key]
          const locVal = translation[key]
          if (locVal !== undefined && locVal === enVal) {
            englishFallbacks.push(key)
          }
        }

        assert.deepEqual(
          englishFallbacks,
          [],
          `${locale.name}: English fallback for: ${englishFallbacks.join(', ')}`
        )
      })

      test(`${locale.name}: brand titles are present (may stay English)`, () => {
        for (const key of BRAND_TITLES) {
          assert.ok(
            key in translation,
            `${locale.name}: brand title "${key}" missing`
          )
          assert.ok(
            translation[key].length > 0,
            `${locale.name}: brand title "${key}" empty`
          )
        }
      })
    }
  }
})

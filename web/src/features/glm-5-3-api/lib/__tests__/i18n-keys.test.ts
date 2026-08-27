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

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import {
  GLM53_API_EVIDENCE_KEYS,
  GLM53_API_FAQ,
  GLM53_API_MODEL_CARDS,
  GLM53_API_PRICING_DISCLAIMER_KEYS,
} from '../glm-5-3-api'

/**
 * Registry completeness check for the /glm-5-3-api page.
 *
 * The feature uses the "the English source string IS the i18n key"
 * pattern: every label, body sentence, FAQ entry, and model-card key
 * is registered in GLM53_API_EVIDENCE_KEYS as a top-level key, and
 * every locale JSON must carry a non-empty translation under that same
 * key. The dynamic keys consumed at runtime through config objects —
 * GLM53_API_FAQ question/answer keys and GLM53_API_MODEL_CARDS
 * title/body keys — are asserted both as members of the registry and
 * as present-in-all-locales entries, so a config-driven t() lookup can
 * never fall back to a raw key.
 */

const LOCALES: Record<string, Record<string, string>> = {
  en: (en as { translation: Record<string, string> }).translation,
  zh: (zh as { translation: Record<string, string> }).translation,
  zhTW: (zhTW as { translation: Record<string, string> }).translation,
  fr: (fr as { translation: Record<string, string> }).translation,
  ru: (ru as { translation: Record<string, string> }).translation,
  ja: (ja as { translation: Record<string, string> }).translation,
  vi: (vi as { translation: Record<string, string> }).translation,
}

const PLACEHOLDER_PATTERN = /\{\{[^}]+\}\}/g

function placeholdersOf(value: string): string[] {
  return (value.match(PLACEHOLDER_PATTERN) ?? []).sort()
}

function isPlaceholderLike(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized === 'todo' ||
    normalized === 'tbd' ||
    normalized === 'placeholder' ||
    normalized === 'untranslated'
  )
}

const DYNAMIC_CONFIG_KEYS = [
  ...GLM53_API_FAQ.flatMap((entry) => [entry.questionKey, entry.answerKey]),
  ...GLM53_API_MODEL_CARDS.flatMap((card) => [card.titleKey, card.bodyKey]),
  ...GLM53_API_PRICING_DISCLAIMER_KEYS,
]

describe('glm-5-3-api locale completeness', () => {
  test('every registered page key is satisfied in all seven locales', () => {
    const registry = new Set<string>(GLM53_API_EVIDENCE_KEYS)
    for (const key of registry) {
      for (const [locale, table] of Object.entries(LOCALES)) {
        const resolved = table[key]
        if (typeof resolved !== 'string' || resolved.trim() === '') {
          assert.fail(`missing key in ${locale}: ${key}`)
        }
        assert.ok(
          !isPlaceholderLike(resolved),
          `placeholder value in ${locale}: ${key}`
        )
      }
    }
  })

  test('FAQ and model-card dynamic keys are registered and translated everywhere', () => {
    const registry = new Set<string>(GLM53_API_EVIDENCE_KEYS)
    for (const key of DYNAMIC_CONFIG_KEYS) {
      assert.ok(
        registry.has(key),
        `dynamic config key must be registered in GLM53_API_EVIDENCE_KEYS: ${key}`
      )
      for (const [locale, table] of Object.entries(LOCALES)) {
        const resolved = table[key]
        assert.ok(
          typeof resolved === 'string' && resolved.trim() !== '',
          `dynamic config key missing in ${locale}: ${key}`
        )
      }
    }
  })

  test('interpolation placeholder sets match English in every locale', () => {
    for (const key of GLM53_API_EVIDENCE_KEYS) {
      const expected = placeholdersOf(LOCALES.en[key] ?? '')
      for (const locale of Object.keys(LOCALES)) {
        const actual = placeholdersOf(LOCALES[locale][key] ?? '')
        assert.deepEqual(
          actual,
          expected,
          `placeholder mismatch for key in ${locale}: ${key}`
        )
      }
    }
  })

  test('sentence-level copy is translated, not copied from English', () => {
    const sentenceKeys = GLM53_API_EVIDENCE_KEYS.filter(
      (key) => key.length >= 20
    )
    assert.ok(sentenceKeys.length >= 10, 'expected a substantial sentence set')
    for (const key of sentenceKeys) {
      const enValue = LOCALES.en[key] ?? ''
      for (const locale of ['zh', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
        const localeValue = LOCALES[locale][key] ?? ''
        assert.notEqual(
          localeValue,
          enValue,
          `still English in ${locale}: ${key}`
        )
      }
    }
  })

  test('the "Quickstart body" placeholder can never become a missing key again', () => {
    // rev1 root cause: the component called t('Quickstart body'), a key
    // that no locale defined, so the page rendered the raw key. The
    // permanent guard has three parts: the phantom key is gone from the
    // registry, it is not translated anywhere (so a reintroduction is
    // visible), and the real full body is registered and translated.
    assert.ok(
      !GLM53_API_EVIDENCE_KEYS.includes('Quickstart body'),
      'the phantom "Quickstart body" key must stay out of the registry'
    )
    for (const [locale, table] of Object.entries(LOCALES)) {
      assert.ok(
        !('Quickstart body' in table),
        `"Quickstart body" must not gain a ${locale} translation; it must stay undefined`
      )
    }
    const found = GLM53_API_EVIDENCE_KEYS.find((key) =>
      key.startsWith('Point your OpenAI SDK or curl at https://vancine.com/v1')
    )
    assert.ok(found !== undefined, 'the full body key must be registered')
    const fullBody: string = found
    for (const [locale, table] of Object.entries(LOCALES)) {
      const value: string | undefined = table[fullBody]
      assert.ok(
        typeof value === 'string' && value.trim() !== '',
        `the full quickstart body must be translated in ${locale}`
      )
    }
  })
})

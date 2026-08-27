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
import { describe, test } from 'node:test'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS } from '../landing'

/**
 * Manual registry completeness check for the /openrouter-alternative
 * landing page.
 *
 * The feature uses the "the English source string IS the i18n key"
 * pattern: a long body sentence (e.g. the "Why a smaller catalog"
 * paragraph) is the *key* itself, and the section label (e.g.
 * "Why a smaller catalog") is a *short key* whose value is the body
 * sentence. The test therefore accepts the long body sentence as
 * satisfied if it appears either as a top-level key in the locale
 * JSON or as the value of any of the short keys we own.
 *
 * For interpolation placeholders, the test reads the value that
 * satisfies the key (either the top-level translation or the
 * short-key translation) and asserts the placeholder sets match
 * the English source.
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

// Build the "value -> owning key" map from the English locale, so we
// can resolve a long body sentence to the short key whose value is
// the same sentence. This is the same pattern i18n-keys-discovered
// uses; we duplicate the small helper here so the manual test stays
// self-contained.
const EN = LOCALES.en
const OWNED = new Set<string>(OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS)
const LONG_TO_SHORT = new Map<string, string>()
for (const key of Object.keys(EN)) {
  if (!OWNED.has(key)) continue
  // A long body sentence is a value whose English content is
  // identical to the key. Detect by: the value (after trim) is not
  // the same as the key, so it is owned body content.
  const value = EN[key]
  if (typeof value === 'string' && value.length >= 30 && value !== key) {
    LONG_TO_SHORT.set(value, key)
  }
}

function resolveValue(locale: string, key: string): string | undefined {
  // Direct top-level key?
  const direct = LOCALES[locale][key]
  if (typeof direct === 'string' && direct.trim() !== '') {
    return direct
  }
  // Or a short key that owns a long body sentence equal to `key`?
  const shortKey = LONG_TO_SHORT.get(key)
  if (shortKey) {
    const owned = LOCALES[locale][shortKey]
    if (typeof owned === 'string' && owned.trim() !== '') {
      return owned
    }
  }
  return undefined
}

describe('openrouter-alternative locale completeness', () => {
  test('every page key is satisfied in all seven locales', () => {
    for (const key of OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS) {
      for (const locale of Object.keys(LOCALES)) {
        const resolved = resolveValue(locale, key)
        if (resolved === undefined) {
          assert.fail(`missing key in ${locale}: ${key}`)
        }
        assert.ok(
          !isPlaceholderLike(resolved),
          `placeholder value in ${locale}: ${key}`
        )
      }
    }
  })

  test('interpolation placeholder sets match English in every locale', () => {
    for (const key of OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS) {
      const expected = placeholdersOf(resolveValue('en', key) ?? '')
      for (const locale of Object.keys(LOCALES)) {
        const actual = placeholdersOf(resolveValue(locale, key) ?? '')
        assert.deepEqual(
          actual,
          expected,
          `placeholder mismatch for key in ${locale}: ${key}`
        )
      }
    }
  })

  test('sentence-level copy is translated, not copied from English', () => {
    const sentenceKeys = OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS.filter(
      (key) => key.length >= 20
    )
    assert.ok(sentenceKeys.length >= 30, 'expected a substantial sentence set')
    for (const key of sentenceKeys) {
      const enValue = resolveValue('en', key) ?? ''
      for (const locale of ['zh', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
        const localeValue = resolveValue(locale, key) ?? ''
        assert.notEqual(
          localeValue,
          enValue,
          `still English in ${locale}: ${key}`
        )
      }
    }
  })
})

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

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { SEEDANCE_I18N_KEYS } from '../landing'

/**
 * Locale completeness contract for the Seedance 2.5 landing page: every key
 * the page passes to t() must exist, be a real translation, and keep the same
 * interpolation placeholders in all seven supported locales.
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

describe('seedance-api locale completeness', () => {
  test('every page key exists and is a real value in all seven locales', () => {
    for (const key of SEEDANCE_I18N_KEYS) {
      for (const [locale, table] of Object.entries(LOCALES)) {
        const value = table[key]
        assert.equal(typeof value, 'string', `missing key in ${locale}: ${key}`)
        assert.ok(
          !isPlaceholderLike(value),
          `empty or placeholder value in ${locale}: ${key}`
        )
      }
    }
  })

  test('interpolation placeholder sets match English in every locale', () => {
    for (const key of SEEDANCE_I18N_KEYS) {
      const expected = placeholdersOf(LOCALES.en[key])
      for (const [locale, table] of Object.entries(LOCALES)) {
        assert.deepEqual(
          placeholdersOf(table[key]),
          expected,
          `placeholder mismatch for key in ${locale}: ${key}`
        )
      }
    }
  })

  test('sentence-level copy is translated, not copied from English', () => {
    const sentenceKeys = SEEDANCE_I18N_KEYS.filter((key) => key.length >= 20)
    assert.ok(sentenceKeys.length >= 20, 'expected a substantial sentence set')
    for (const key of sentenceKeys) {
      for (const locale of ['zh', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
        assert.notEqual(
          LOCALES[locale][key],
          LOCALES.en[key],
          `still English in ${locale}: ${key}`
        )
      }
    }
  })
})

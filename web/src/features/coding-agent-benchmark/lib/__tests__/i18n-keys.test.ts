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

import { CODING_AGENT_BENCHMARK_I18N_KEYS } from '../coding-agent-benchmark'

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

const KEEP_ENGLISH = new Set(['Pass', 'Tokens', 'Model', 'Result'])

describe('coding-agent-benchmark i18n completeness', () => {
  test('every registered key exists in all seven locales', () => {
    const missing: string[] = []
    for (const key of CODING_AGENT_BENCHMARK_I18N_KEYS) {
      for (const [locale, table] of Object.entries(LOCALES)) {
        if (!(key in table) || isPlaceholderLike(table[key] ?? '')) {
          missing.push(`${locale}: ${key}`)
        }
      }
    }
    assert.deepEqual(missing, [])
  })

  test('English values equal the source keys', () => {
    for (const key of CODING_AGENT_BENCHMARK_I18N_KEYS) {
      assert.equal(LOCALES.en[key], key, key)
    }
  })

  test('non-English locales translate sentence keys', () => {
    const untranslated: string[] = []
    for (const key of CODING_AGENT_BENCHMARK_I18N_KEYS) {
      if (KEEP_ENGLISH.has(key)) continue
      if (key.length < 4) continue
      if (!/[a-zA-Z]{3,}/.test(key)) continue
      for (const locale of ['zh', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
        if (LOCALES[locale][key] === LOCALES.en[key]) {
          untranslated.push(`${locale}: ${key}`)
        }
      }
    }
    assert.deepEqual(untranslated, [])
  })

  test('placeholders are preserved', () => {
    const mismatched: string[] = []
    for (const key of CODING_AGENT_BENCHMARK_I18N_KEYS) {
      const expected = placeholdersOf(key)
      for (const [locale, table] of Object.entries(LOCALES)) {
        const actual = placeholdersOf(table[key] ?? '')
        if (actual.join(',') !== expected.join(',')) {
          mismatched.push(`${locale}: ${key}`)
        }
      }
    }
    assert.deepEqual(mismatched, [])
  })
})

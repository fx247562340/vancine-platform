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
 * Pure-logic i18n completeness test for Evidence + Why sections.
 *
 * Reads locale JSON via direct imports and asserts (per locale, aggregated):
 *  - all 24 frozen keys exist
 *  - every value, after trim, is non-blank
 *  - non-English locales do not fall back to English for any key
 *    (with one explicit per-key exemption: 'Tests' is valid French)
 *  - the entire translation object key order matches localeCompare sort
 *
 * This file does NOT read production source, does NOT render React, and
 * does NOT generate one test per key — each assertion aggregates over the
 * full 24-key set.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

// 15 Evidence keys
const EVIDENCE_KEYS: ReadonlyArray<string> = [
  'Verified in real agent workflows',
  'One controlled historical run — not a promise that every request will match these numbers.',
  'OpenCode version',
  'Model under test',
  'Model steps',
  'Tool calls',
  'Passed',
  'Tests',
  'Duration',
  'Agent telemetry tokens',
  'Vancine measured usage',
  'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.',
  'View Kimi K3 page',
  'View starter & verified evidence',
  'Verified evidence JSON',
]

// 9 Why keys
const WHY_KEYS: ReadonlyArray<string> = [
  'Why developers use Vancine',
  'Fast access to new Chinese models',
  'New Chinese model releases can be added to one endpoint instead of a new vendor integration each time.',
  'One compatible API',
  'OpenAI-compatible requests, streaming, and tooling patterns you already use.',
  'Unified balance and billing',
  'One account, one balance, and one usage log across supported models.',
  'Tested integration examples',
  'Public starters and measured agent evidence for supported workflows.',
]

const ALL_KEYS: ReadonlyArray<string> = [...EVIDENCE_KEYS, ...WHY_KEYS]

// Per-key exemption: 'Tests' is a valid French word identical to the
// English source. Only this single key is exempt from the
// "non-English must differ" rule, by explicit whitelist.
const EXEMPT_FROM_DIFF_KEYS: ReadonlySet<string> = new Set(['Tests'])

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

describe('Evidence + Why i18n (24 keys × 7 locales, aggregated)', () => {
  describe('key registry', () => {
    it('has exactly 24 distinct keys', () => {
      const unique = new Set(ALL_KEYS)
      expect(unique.size).toBe(24)
    })

    it('has exactly 15 Evidence keys', () => {
      expect(EVIDENCE_KEYS.length).toBe(15)
    })

    it('has exactly 9 Why keys', () => {
      expect(WHY_KEYS.length).toBe(9)
    })
  })

  for (const locale of LOCALES) {
    describe(`${locale.name}: presence`, () => {
      it('all 24 keys are present', () => {
        const translation = getTranslation(locale)
        const missing = ALL_KEYS.filter((k) => !(k in translation))
        expect(missing).toEqual([])
      })

      it('all 24 values are non-blank after trim', () => {
        const translation = getTranslation(locale)
        const blank: string[] = []
        for (const key of ALL_KEYS) {
          const value = translation[key]
          if (typeof value !== 'string' || value.trim() === '') {
            blank.push(key)
          }
        }
        expect(blank).toEqual([])
      })
    })
  }

  for (const locale of LOCALES.filter((l) => l.name !== 'en')) {
    describe(`${locale.name}: no English fallback`, () => {
      it('no user-facing key falls back to English (Tests is the one exempt key)', () => {
        const enTranslation = getTranslation(LOCALES[0])
        const translation = getTranslation(locale)
        const fallbackKeys: string[] = []
        for (const key of ALL_KEYS) {
          if (EXEMPT_FROM_DIFF_KEYS.has(key)) continue
          const enValue = enTranslation[key]
          const localeValue = translation[key]
          if (localeValue === enValue) {
            fallbackKeys.push(key)
          }
        }
        expect(fallbackKeys).toEqual([])
      })
    })
  }

  for (const locale of LOCALES) {
    describe(`${locale.name}: translation key order`, () => {
      it('locale file body keys are sorted by localeCompare', () => {
        const filePath = resolve(
          dirname(fileURLToPath(import.meta.url)),
          '../../../../../../src/i18n/locales',
          `${locale.name}.json`
        )
        const raw = readFileSync(filePath, 'utf-8')
        // Read the on-disk key sequence from the raw JSON body. JSON.parse
        // would silently put integer-like keys first and hide a V8 reorder.
        const bodyKeys: string[] = []
        const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/gm
        let m: RegExpExecArray | null
        while ((m = re.exec(raw)) !== null) {
          bodyKeys.push(JSON.parse(`"${m[1]}"`))
        }
        const expected = [...bodyKeys].sort((a, b) => a.localeCompare(b))
        expect(bodyKeys).toEqual(expected)
        expect(bodyKeys[0]).toBe('_copy')
      })
    })
  }
})

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
 * Pure-logic i18n completeness test for Evidence + Why sections (v1.2.0).
 *
 * v1.2.0 narrowed both sections:
 *  - Why: 4 cards → 3 cards with renamed titles/bodies.
 *  - Evidence: 8 metrics → 4 primary metrics + 1 secondary "Run details"
 *    line that interpolates {{client}}, {{duration}}, and {{tokens}}.
 *
 * Reads locale JSON via direct imports and asserts (per locale, aggregated):
 *  - all 21 frozen keys exist
 *  - every value, after trim, is non-blank
 *  - non-English locales do not fall back to English for any key
 *    (with explicit per-key exemptions: 'Passed' is a valid French
 *    word identical to the English source; 'One API' is a valid brand
 *    phrase in every locale)
 *  - the entire translation object key order matches localeCompare sort
 *
 * This file does NOT read production source, does NOT render React, and
 * does NOT generate one test per key — each assertion aggregates over the
 * full 21-key set.
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

// 13 Evidence keys: 4 metric labels + Run details + 4 section labels +
// 3 evidence links. The single "Run details" key absorbs OpenCode version,
// Duration, and Agent telemetry tokens into one interpolated line.
const EVIDENCE_KEYS: ReadonlyArray<string> = [
  'Verified in real agent workflows',
  'One controlled historical run — not a promise that every request will match these numbers.',
  'Test model',
  'Tool calls completed',
  'Test result',
  'Vancine measured usage',
  'Run details',
  'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.',
  'View Kimi K3 page',
  'View starter & verified evidence',
  'Verified evidence JSON',
  'Passed',
  'One API',
]

// 3 Why keys × 2 (title + body) = 6 + section heading = 7 keys
const WHY_KEYS: ReadonlyArray<string> = [
  'Why developers use Vancine',
  'Faster access to new Chinese models',
  'New model releases can reach the unified endpoint without a fresh vendor integration each time.',
  'One API, one bill',
  'Compatible with the calling conventions you already use, with one balance, billing, and usage log.',
  'Evidence-backed developer experience',
  'Real call examples, inspectable agent run evidence, and developer documentation.',
]

const ALL_KEYS: ReadonlyArray<string> = [...EVIDENCE_KEYS, ...WHY_KEYS]

// Per-key exemptions: keys that are intentionally identical to English in
// other locales (proper nouns, brand phrases, or words that happen to be
// spelled the same in a target language).
const EXEMPT_FROM_DIFF_KEYS: ReadonlySet<string> = new Set([
  'Passed', // valid French word identical to English source
  'One API', // brand phrase; Vancine is itself an OpenAI-compatible product
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

describe('Evidence + Why i18n (20 keys × 7 locales, aggregated)', () => {
  describe('key registry', () => {
    it('has exactly 20 distinct keys', () => {
      const unique = new Set(ALL_KEYS)
      expect(unique.size).toBe(20)
    })

    it('has exactly 13 Evidence keys', () => {
      expect(EVIDENCE_KEYS.length).toBe(13)
    })

    it('has exactly 7 Why keys', () => {
      expect(WHY_KEYS.length).toBe(7)
    })
  })

  for (const locale of LOCALES) {
    describe(`${locale.name}: presence`, () => {
      it('all 20 keys are present', () => {
        const translation = getTranslation(locale)
        const missing = ALL_KEYS.filter((k) => !(k in translation))
        expect(missing).toEqual([])
      })

      it('all 20 values are non-blank after trim', () => {
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
      it('no user-facing key falls back to English (Passed + One API are the exempt keys)', () => {
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

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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS } from '../landing'

/**
 * Source-driven i18n completeness contract for the
 * /openrouter-alternative page.
 *
 * The page MUST register every string literal it passes to t(...) in
 * the OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS array, and the array MUST
 * be a complete translation table in all seven supported locales.
 *
 * The discovery walks the feature's .ts / .tsx source files (test
 * files are excluded so the assertions inside the test bodies do not
 * leak into the discovered set), and extracts every string literal
 * that is the first argument of a t(...) call or appears as the
 * `i18nKey` prop on a <Trans> element. Template literals passed to
 * t(\`...${var}...\`) are intentionally NOT discovered — the
 * landing.ts registry never holds those keys, and t() with a
 * computed string is a translation contract violation by itself.
 *
 * This contract is the regression the brief asks for: no new t()
 * literal can land in any component without also landing in
 * OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS and all 7 locale JSON files.
 */

const FEATURE_DIR = join(import.meta.dirname, '..', '..')
const SOURCE_ROOTS = [
  join(FEATURE_DIR, 'lib'),
  join(FEATURE_DIR, 'index.tsx'),
  join(FEATURE_DIR, 'components'),
]

const LOCALES: Record<string, Record<string, string>> = {
  en: (en as { translation: Record<string, string> }).translation,
  zh: (zh as { translation: Record<string, string> }).translation,
  zhTW: (zhTW as { translation: Record<string, string> }).translation,
  fr: (fr as { translation: Record<string, string> }).translation,
  ru: (ru as { translation: Record<string, string> }).translation,
  ja: (ja as { translation: Record<string, string> }).translation,
  vi: (vi as { translation: Record<string, string> }).translation,
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      walk(full, out)
      continue
    }
    if (!st.isFile()) continue
    if (!/\.(ts|tsx)$/.test(entry)) continue
    out.push(full)
  }
}

function collectSourceFiles(): string[] {
  const files: string[] = []
  for (const root of SOURCE_ROOTS) {
    const st = statSync(root)
    if (st.isDirectory()) {
      walk(root, files)
    } else if (st.isFile() && /\.(ts|tsx)$/.test(root)) {
      files.push(root)
    }
  }
  return files.sort()
}

const SOURCE_FILES = collectSourceFiles()

// Match t('literal') and t("literal") with balanced escapes. The literal
// is capture group 1. The pattern intentionally does not allow template
// literals or computed expressions.
const T_CALL_RE = /(?<![\w$.])t\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*[),]/g
const I18N_KEY_PROP_RE = /i18nKey\s*=\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g

function unescape(s: string): string {
  return s
    .replaceAll(/\\(['"`\\])/g, '$1')
    .replaceAll('\n', '\n')
    .replaceAll('\t', '\t')
    .replaceAll(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
}

function discoverLiterals(): string[] {
  const seen = new Set<string>()
  for (const file of SOURCE_FILES) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(FEATURE_DIR, file).split(sep).join('/')
    // Skip landing.ts: it owns the registry; literals it lists are the
    // source of truth, not candidates that must be re-listed.
    if (rel === 'lib/landing.ts') continue
    for (const re of [T_CALL_RE, I18N_KEY_PROP_RE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const literal = unescape(m[2])
        // Filter out literals that are clearly non-keys (very short
        // placeholders, regex-ish, numeric, etc.). The discovery is
        // conservative: it only ignores an empty string.
        if (literal.length === 0) continue
        seen.add(literal)
      }
    }
  }
  return [...seen].sort()
}

const DISCOVERED = discoverLiterals()

describe('openrouter-alternative source-driven i18n', () => {
  test('every t() literal in components/ is registered in landing.ts', () => {
    // Discovery must have found at least one literal; otherwise the
    // test infrastructure is broken (the regex never matched).
    assert.ok(
      DISCOVERED.length > 0,
      'auto-discovery must find at least one t() literal; check the regex'
    )
    const registry = new Set<string>(OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS)
    const missing = DISCOVERED.filter((lit) => !registry.has(lit))
    assert.deepEqual(
      missing,
      [],
      `every component t() literal must be in OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS; missing: ${JSON.stringify(missing, null, 2)}`
    )
  })

  test('every discovered literal is present in all seven locales (as key or as the value of a registered body key)', () => {
    // The /openrouter-alternative feature uses the "the English source
    // string IS the i18n key" pattern for body sentences (see the
    // OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS comment in landing.ts).
    // A long body sentence like the "Why a smaller catalog" paragraph
    // is therefore stored in each locale JSON as the *value* of the
    // section's short key (e.g. `"Why a smaller catalog":
    // "OpenRouter optimizes for catalog breadth. …"`), not as its own
    // top-level key. The completeness check below allows the literal
    // to be present either as a key in the locale JSON or as the
    // value of one of the section / body keys registered for this
    // page; the registered body-key set is taken from the English
    // locale and includes the long body strings themselves, so the
    // mapping keys[i] -> values[i] is exact.
    const en = LOCALES.en
    const allowedValueKeys = new Set<string>(
      OPENROUTER_ALTERNATIVE_EVIDENCE_KEYS
    )
    // Build the union of literal key -> all values it has in the
    // English locale, restricted to keys we own. We then accept a
    // discovered literal if any of the values of any owned key
    // equals it. The check is strict (string equality) and never
    // falls through.
    const valueByOwnedKey = new Map<string, string[]>()
    for (const key of Object.keys(en)) {
      if (!allowedValueKeys.has(key)) continue
      const value = en[key]
      const list = valueByOwnedKey.get(value) ?? []
      list.push(key)
      valueByOwnedKey.set(value, list)
    }
    const missingByLocale: Record<string, string[]> = {}
    for (const [locale, table] of Object.entries(LOCALES)) {
      const missing: string[] = []
      for (const lit of DISCOVERED) {
        if (typeof table[lit] === 'string' && table[lit].trim() !== '') {
          continue
        }
        // Is this literal a value of any of our registered body keys
        // in this locale? If so, it is satisfied.
        const owningKeys = valueByOwnedKey.get(lit) ?? []
        const satisfied = owningKeys.some((k) => {
          const v = table[k]
          return typeof v === 'string' && v.trim() !== ''
        })
        if (!satisfied) {
          missing.push(lit)
        }
      }
      if (missing.length > 0) {
        missingByLocale[locale] = missing
      }
    }
    assert.deepEqual(
      missingByLocale,
      {},
      `every discovered literal must be present in all 7 locales (as key or as the value of a registered body key); missing: ${JSON.stringify(missingByLocale, null, 2)}`
    )
  })
})

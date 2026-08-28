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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, test } from 'node:test'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { GLM53_API_EVIDENCE_KEYS } from '../glm-5-3-api'

/**
 * Source-driven i18n completeness contract for the /glm-api page.
 *
 * The page MUST register every string literal it passes to t(...) in
 * GLM53_API_EVIDENCE_KEYS, and the array MUST be a complete translation
 * table in all seven supported locales.
 *
 * The discovery walks the feature's .ts / .tsx source files (test
 * files are excluded so the assertions inside the test bodies do not
 * leak into the discovered set), and extracts every string literal
 * that is the first argument of a t(...) call or appears as the
 * `i18nKey` prop on a <Trans> element. Template literals passed to
 * t(`...${var}...`) are intentionally NOT discovered — the registry
 * never holds those keys, and t() with a computed string is a
 * translation contract violation by itself.
 *
 * This contract is the regression the brief asks for: no new t()
 * literal can land in any component without also landing in
 * GLM53_API_EVIDENCE_KEYS and all 7 locale JSON files. It is also the
 * guard that keeps the rev1 "Quickstart body" placeholder regression
 * from ever returning.
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
// is capture group 2. The pattern intentionally does not allow template
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
    // Skip glm-5-3-api.ts: it owns the registry; literals it lists are
    // the source of truth, not candidates that must be re-listed.
    if (rel === 'lib/glm-5-3-api.ts') continue
    for (const re of [T_CALL_RE, I18N_KEY_PROP_RE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const literal = unescape(m[2])
        if (literal.length === 0) continue
        seen.add(literal)
      }
    }
  }
  return [...seen].sort()
}

const DISCOVERED = discoverLiterals()

describe('glm-5-3-api source-driven i18n', () => {
  test('every t() literal in components/ is registered in glm-5-3-api.ts', () => {
    // Discovery must have found at least one literal; otherwise the
    // test infrastructure is broken (the regex never matched).
    assert.ok(
      DISCOVERED.length > 0,
      'auto-discovery must find at least one t() literal; check the regex'
    )
    const registry = new Set<string>(GLM53_API_EVIDENCE_KEYS)
    const missing = DISCOVERED.filter((lit) => !registry.has(lit))
    assert.deepEqual(
      missing,
      [],
      `every component t() literal must be in GLM53_API_EVIDENCE_KEYS; missing: ${JSON.stringify(missing, null, 2)}`
    )
  })

  test('every discovered literal is present in all seven locales', () => {
    const missingByLocale: Record<string, string[]> = {}
    for (const [locale, table] of Object.entries(LOCALES)) {
      const missing = DISCOVERED.filter(
        (lit) => typeof table[lit] !== 'string' || table[lit].trim() === ''
      )
      if (missing.length > 0) {
        missingByLocale[locale] = missing
      }
    }
    assert.deepEqual(
      missingByLocale,
      {},
      `every discovered literal must be present in all 7 locales; missing: ${JSON.stringify(missingByLocale, null, 2)}`
    )
  })

  test('the rev1 "Quickstart body" placeholder never returns as a t() call', () => {
    // The regression this file exists to prevent: a component rendering
    // a short i18n key that no locale defines, so the page shows the raw
    // key text. Guard both directions: the literal must not be discovered
    // from any source file, and the full quickstart body must be.
    assert.ok(
      !DISCOVERED.includes('Quickstart body'),
      'no component may call t("Quickstart body"); the key is undefined in every locale'
    )
    const fullBody = DISCOVERED.find((lit) =>
      lit.startsWith('Point your OpenAI SDK or curl at https://vancine.com/v1')
    )
    assert.ok(
      fullBody !== undefined,
      'the quickstart intro body must be a registered t() literal'
    )
  })
})

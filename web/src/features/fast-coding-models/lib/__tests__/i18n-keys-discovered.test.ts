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

import { describe, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { FAST_CODING_MODELS_I18N_KEYS } from '../fast-coding-models'

const FEATURE_DIR = join(import.meta.dirname, '..', '..')
const SOURCE_ROOTS = [
  join(FEATURE_DIR, 'lib'),
  join(FEATURE_DIR, 'index.tsx'),
  join(FEATURE_DIR, 'components'),
  join(FEATURE_DIR, 'hooks'),
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

const T_CALL_RE = /(?<![\w$.])t\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*[),]/g

function unescape(s: string): string {
  return s.replaceAll(/\\(['"`\\])/g, '$1')
}

function discoverLiterals(): string[] {
  const seen = new Set<string>()
  for (const file of SOURCE_FILES) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(FEATURE_DIR, file).split(sep).join('/')
    // The lib module owns the key registry itself; scanning it would
    // only re-discover the registry entries.
    if (rel === 'lib/fast-coding-models.ts') continue
    T_CALL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = T_CALL_RE.exec(text))) {
      const literal = unescape(m[2])
      if (literal.length === 0) continue
      seen.add(literal)
    }
  }
  return [...seen].sort()
}

const DISCOVERED = discoverLiterals()

describe('fast-coding-models source-driven i18n', () => {
  test('every t() literal in components is registered', () => {
    assert.ok(DISCOVERED.length > 0)
    const registry = new Set<string>(FAST_CODING_MODELS_I18N_KEYS)
    const missing = DISCOVERED.filter((lit) => !registry.has(lit))
    assert.deepEqual(missing, [])
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
    assert.deepEqual(missingByLocale, {})
  })
})

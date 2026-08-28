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

import enDocs from '../i18n/locales/en.json'
import frDocs from '../i18n/locales/fr.json'
import jaDocs from '../i18n/locales/ja.json'
import ruDocs from '../i18n/locales/ru.json'
import viDocs from '../i18n/locales/vi.json'
import zhCNDocs from '../i18n/locales/zhCN.json'
import zhTWDocs from '../i18n/locales/zhTW.json'

type DocsLocale = { agents: { benchmarkLink: string } }

const NON_ENGLISH_DOCS_LOCALES: ReadonlyArray<readonly [string, DocsLocale]> = [
  ['fr', frDocs as DocsLocale],
  ['ja', jaDocs as DocsLocale],
  ['ru', ruDocs as DocsLocale],
  ['vi', viDocs as DocsLocale],
  ['zhCN', zhCNDocs as DocsLocale],
  ['zhTW', zhTWDocs as DocsLocale],
]

describe('docs agents benchmarkLink seven-language translation contract', () => {
  const english = (enDocs as DocsLocale).agents.benchmarkLink

  test('every docs locale defines a non-empty benchmarkLink', () => {
    assert.equal(typeof english, 'string')
    assert.ok(english.trim().length > 0)
    for (const [locale, docs] of NON_ENGLISH_DOCS_LOCALES) {
      const value = docs.agents.benchmarkLink
      assert.equal(typeof value, 'string', `${locale} benchmarkLink type`)
      assert.ok(
        value.trim().length > 0,
        `${locale} benchmarkLink must be non-empty`
      )
    }
  })

  test('non-English locales carry real translations, not the English fallback', () => {
    for (const [locale, docs] of NON_ENGLISH_DOCS_LOCALES) {
      assert.notEqual(
        docs.agents.benchmarkLink,
        english,
        `${locale} benchmarkLink must not equal the English copy`
      )
    }
  })
})

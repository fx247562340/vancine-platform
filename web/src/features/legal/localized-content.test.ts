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

import { selectLocalizedContent } from './localized-content'

const MAP = JSON.stringify({
  en: 'English body',
  'zh-CN': '中文正文',
  'zh-TW': '繁體正文',
  fr: 'Corps français',
})

describe('selectLocalizedContent', () => {
  test('selects the exact locale from a localized JSON map', () => {
    assert.equal(selectLocalizedContent(MAP, 'en'), 'English body')
    assert.equal(selectLocalizedContent(MAP, 'zh-CN'), '中文正文')
    assert.equal(selectLocalizedContent(MAP, 'fr'), 'Corps français')
  })

  test('applies the deterministic fallback chain', () => {
    const enOnly = JSON.stringify({ en: 'English body' })
    const cnOnly = JSON.stringify({ 'zh-CN': '中文正文' })

    // zh-TW -> zh-CN -> en
    assert.equal(selectLocalizedContent(MAP, 'zh-TW'), '繁體正文')
    assert.equal(selectLocalizedContent(cnOnly, 'zh-TW'), '中文正文')
    assert.equal(selectLocalizedContent(enOnly, 'zh-TW'), 'English body')

    // other locales -> en -> zh-CN
    assert.equal(selectLocalizedContent(cnOnly, 'ja'), '中文正文')
    assert.equal(selectLocalizedContent(enOnly, 'ru'), 'English body')

    // en -> zh-CN
    assert.equal(selectLocalizedContent(cnOnly, 'en'), '中文正文')

    // nothing matches -> empty, never the raw JSON
    assert.equal(selectLocalizedContent(JSON.stringify({ vi: 'x' }), 'ru'), '')
  })

  test('returns non-map content unchanged', () => {
    assert.equal(
      selectLocalizedContent('# Markdown body', 'en'),
      '# Markdown body'
    )
    assert.equal(selectLocalizedContent('<p>html</p>', 'en'), '<p>html</p>')
    assert.equal(
      selectLocalizedContent('https://example.com/tos', 'en'),
      'https://example.com/tos'
    )
    assert.equal(selectLocalizedContent('', 'en'), '')
    // Invalid JSON that starts with '{' is treated as plain content.
    assert.equal(selectLocalizedContent('{not json', 'en'), '{not json')
    // JSON arrays are not localized maps; keep them as plain content.
    assert.equal(selectLocalizedContent('[1,2]', 'en'), '[1,2]')
  })

  test('never surfaces raw JSON objects as body', () => {
    // Empty object -> empty body (empty state), not '{}'.
    assert.equal(selectLocalizedContent('{}', 'en'), '')
    // Objects with non-string values are not localized maps, but they must
    // not be rendered raw either.
    assert.equal(selectLocalizedContent('{"a": 1}', 'en'), '')
    assert.equal(selectLocalizedContent('{"a": [1]}', 'fr'), '')
  })

  test('empty-string map values are skipped during selection', () => {
    const sparse = JSON.stringify({ en: '', 'zh-CN': '中文正文' })
    assert.equal(selectLocalizedContent(sparse, 'en'), '中文正文')
  })
})

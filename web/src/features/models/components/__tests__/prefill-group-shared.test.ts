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

import { normalizePrefillGroupItemsForSubmit } from '../prefill-group-shared'

describe('normalizePrefillGroupItemsForSubmit', () => {
  test('keeps an endpoint JSON string unchanged', () => {
    const items = '{"openai": {"path": "/v1/chat/completions"}}'
    assert.equal(normalizePrefillGroupItemsForSubmit('endpoint', items), items)
  })

  test('falls back to an empty string when endpoint items are not a string', () => {
    assert.equal(
      normalizePrefillGroupItemsForSubmit('endpoint', ['openai']),
      ''
    )
  })

  test('keeps a model string array unchanged', () => {
    assert.deepEqual(
      normalizePrefillGroupItemsForSubmit('model', ['gpt-4o', 'claude-3']),
      ['gpt-4o', 'claude-3']
    )
  })

  test('keeps a tag string array unchanged', () => {
    assert.deepEqual(
      normalizePrefillGroupItemsForSubmit('tag', ['vip', 'internal']),
      ['vip', 'internal']
    )
  })

  test('falls back to an empty array when model items are not an array', () => {
    assert.deepEqual(normalizePrefillGroupItemsForSubmit('model', 'gpt-4o'), [])
  })

  test('falls back to an empty array when tag items are not an array', () => {
    assert.deepEqual(normalizePrefillGroupItemsForSubmit('tag', 'vip'), [])
  })
})

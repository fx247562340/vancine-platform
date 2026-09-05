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

import { describe, it } from 'vitest'

import { getPageNumbers } from '../utils'

describe('getPageNumbers semantic identity', () => {
  it('small dataset (≤4 pages) renders only page slots', () => {
    assert.deepEqual(getPageNumbers(1, 4), [
      { kind: 'page', page: 1 },
      { kind: 'page', page: 2 },
      { kind: 'page', page: 3 },
      { kind: 'page', page: 4 },
    ])
  })

  it('near-beginning sequence has a single end ellipsis', () => {
    assert.deepEqual(getPageNumbers(2, 10), [
      { kind: 'page', page: 1 },
      { kind: 'page', page: 2 },
      { kind: 'ellipsis', placement: 'end' },
      { kind: 'page', page: 10 },
    ])
  })

  it('middle sequence has distinct start and end ellipses', () => {
    const middle = getPageNumbers(5, 10)
    assert.deepEqual(middle, [
      { kind: 'page', page: 1 },
      { kind: 'ellipsis', placement: 'start' },
      { kind: 'page', page: 5 },
      { kind: 'ellipsis', placement: 'end' },
      { kind: 'page', page: 10 },
    ])

    // The two ellipsis slots carry different placements, hence different
    // semantic identities even though they render identically.
    const ellipses = middle.filter((item) => item.kind === 'ellipsis')
    assert.equal(ellipses.length, 2)
    assert.notEqual(ellipses[0], ellipses[1])
    const keys = new Set(
      middle.map((item) =>
        item.kind === 'page'
          ? `page-${item.page}`
          : `ellipsis-${item.placement}`
      )
    )
    assert.equal(keys.size, middle.length)
  })

  it('near-end sequence has a single start ellipsis', () => {
    assert.deepEqual(getPageNumbers(9, 10), [
      { kind: 'page', page: 1 },
      { kind: 'ellipsis', placement: 'start' },
      { kind: 'page', page: 9 },
      { kind: 'page', page: 10 },
    ])
  })

  it('recomputing the same input yields identical identities (stability)', () => {
    const first = getPageNumbers(5, 10)
    const second = getPageNumbers(5, 10)
    assert.deepEqual(first, second)
    const keyOf = (item: ReturnType<typeof getPageNumbers>[number]) =>
      item.kind === 'page' ? `page-${item.page}` : `ellipsis-${item.placement}`
    assert.deepEqual(first.map(keyOf), second.map(keyOf))
  })
})

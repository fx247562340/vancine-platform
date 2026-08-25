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
import { describe, expect, it } from 'vitest'

import { extractModelIds, filterPlaygroundVideoModels } from '../models'

describe('video playground model filter', () => {
  it('keeps only exact Seedance 2.0 and 2.5 ids returned by the API', () => {
    const ids = extractModelIds({
      data: [
        { id: 'gpt-4o' },
        { id: 'Doubao-Seedance-1.5-pro' },
        { id: 'doubao-seedance-2.5' },
        { id: 'Doubao-Seedance-2.5' },
        { id: 'Doubao-Seedance-2.0' },
      ],
    })
    expect(filterPlaygroundVideoModels(ids).map((item) => item.value)).toEqual([
      'Doubao-Seedance-2.0',
      'Doubao-Seedance-2.5',
    ])
  })

  it('returns an empty list when the key has no matching models', () => {
    expect(
      filterPlaygroundVideoModels(extractModelIds({ data: [{ id: 'gpt-4o' }] }))
    ).toEqual([])
  })
})

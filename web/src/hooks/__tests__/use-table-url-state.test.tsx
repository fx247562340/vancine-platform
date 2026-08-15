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
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTableUrlState, type NavigateFn } from '../use-table-url-state'

const ARRAY_FILTER_CFG = [
  { columnId: 'models', searchKey: 'models', type: 'array' as const },
]

// The hook's public contract navigates with a search updater; applying the
// recorded updater to a fixture previous record yields the resulting search.
function applyRecordedSearch(
  navigate: ReturnType<typeof vi.fn>,
  prev: Record<string, unknown>
): unknown {
  const opts = navigate.mock.calls.at(-1)?.[0] as { search?: unknown }
  const search = opts?.search
  return typeof search === 'function' ? search(prev) : search
}

function setupHook(initialSearch: Record<string, unknown> = {}) {
  const navigate = vi.fn<NavigateFn>()
  const { result } = renderHook(
    ({ search }) =>
      useTableUrlState({
        search,
        navigate,
        pagination: { pageKey: 'page' },
        columnFilters: ARRAY_FILTER_CFG,
      }),
    { initialProps: { search: initialSearch } }
  )
  return { navigate, result }
}

afterEach(() => {
  localStorage.clear()
})

describe('useTableUrlState column filter search contract', () => {
  it('writes a multi-value array filter and resets the page', () => {
    const { navigate, result } = setupHook()

    act(() => {
      result.current.onColumnFiltersChange([
        { id: 'models', value: ['gpt-4o', 'claude-3'] },
      ])
    })

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(applyRecordedSearch(navigate, { page: 4 })).toEqual({
      page: undefined,
      models: ['gpt-4o', 'claude-3'],
    })
  })

  it('clears the search key when the filter is missing or not an array', () => {
    const { navigate, result } = setupHook({ page: 2, models: ['gpt-4o'] })

    act(() => {
      result.current.onColumnFiltersChange([])
    })
    expect(
      applyRecordedSearch(navigate, { page: 2, models: ['gpt-4o'] })
    ).toEqual({
      page: undefined,
      models: undefined,
    })

    act(() => {
      result.current.onColumnFiltersChange([
        { id: 'models', value: 'not-an-array' },
      ])
    })
    expect(
      applyRecordedSearch(navigate, { page: 2, models: ['gpt-4o'] })
    ).toEqual({
      page: undefined,
      models: undefined,
    })
  })

  it('resets the page on every filter update', () => {
    const { navigate, result } = setupHook({ page: 7, models: ['a'] })

    act(() => {
      result.current.onColumnFiltersChange([{ id: 'models', value: ['b'] }])
    })

    expect(applyRecordedSearch(navigate, { page: 7, models: ['a'] })).toEqual({
      page: undefined,
      models: ['b'],
    })
  })
})

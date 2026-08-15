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

import { buildQueryParams } from '../query-params'

describe('buildQueryParams serialization contract', () => {
  it('drops undefined, null and empty strings', () => {
    const params = buildQueryParams({
      a: undefined,
      b: null,
      c: '',
      d: 'kept',
    })
    expect(params.toString()).toBe('d=kept')
  })

  it('keeps the numeric value 0', () => {
    const params = buildQueryParams({ p: 0 })
    expect(params.toString()).toBe('p=0')
  })

  it('keeps the boolean false', () => {
    const params = buildQueryParams({ enabled: false })
    expect(params.toString()).toBe('enabled=false')
  })

  it('stringifies other values', () => {
    const params = buildQueryParams({ n: 42, flag: true })
    expect(params.toString()).toBe('n=42&flag=true')
  })

  it('URL-encodes values that need escaping', () => {
    const params = buildQueryParams({
      filter: 'a b&c=d',
      q: '你好',
    })
    expect(params.toString()).toBe('filter=a+b%26c%3Dd&q=%E4%BD%A0%E5%A5%BD')
  })
})

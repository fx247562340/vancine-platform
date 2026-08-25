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

import {
  extractServerErrorFromBody,
  videoPlaygroundErrorText,
  VideoPlaygroundError,
} from '../errors'

describe('video playground error classification helpers', () => {
  it('extracts 401, 404, and 500 server messages', () => {
    expect(
      extractServerErrorFromBody({ error: { message: 'AUTH_UNAUTHORIZED' } })
    ).toBe('AUTH_UNAUTHORIZED')
    expect(extractServerErrorFromBody({ message: 'task not found' })).toBe(
      'task not found'
    )
    expect(extractServerErrorFromBody({ error: 'boom' })).toBe('boom')
  })

  it('returns undefined for a malformed envelope', () => {
    expect(extractServerErrorFromBody({ success: true, data: {} })).toBe(
      undefined
    )
    expect(extractServerErrorFromBody('not-json')).toBe(undefined)
  })

  it('keeps system and upstream sources distinct', () => {
    const system = new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load video status',
    })
    const upstream = new VideoPlaygroundError({
      kind: 'upstream',
      rawMessage: 'field duration is not allowed',
    })
    expect(system.errorKey).toBe('Failed to load video status')
    expect(system.rawUpstreamMessage).toBeUndefined()
    expect(upstream.errorKey).toBeUndefined()
    expect(upstream.rawUpstreamMessage).toBe('field duration is not allowed')
    expect(videoPlaygroundErrorText(system, (key) => `t:${key}`)).toBe(
      't:Failed to load video status'
    )
    expect(videoPlaygroundErrorText(upstream, (key) => `t:${key}`)).toBe(
      'field duration is not allowed'
    )
  })
})

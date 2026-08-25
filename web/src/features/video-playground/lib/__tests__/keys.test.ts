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

import { API_KEY_STATUS } from '@/features/keys/constants'

import {
  bearerApiKey,
  isUsableVideoApiKey,
  pickDefaultVideoApiKey,
  toVideoApiKeyOption,
} from '../keys'

const now = 1_700_000_000

describe('video playground API key selection', () => {
  it('skips disabled, expired, and exhausted keys', () => {
    expect(
      isUsableVideoApiKey(
        {
          status: API_KEY_STATUS.DISABLED,
          expired_time: -1,
          remain_quota: 100,
          unlimited_quota: false,
        },
        now
      )
    ).toBe(false)
    expect(
      isUsableVideoApiKey(
        {
          status: API_KEY_STATUS.ENABLED,
          expired_time: now - 1,
          remain_quota: 100,
          unlimited_quota: false,
        },
        now
      )
    ).toBe(false)
    expect(
      isUsableVideoApiKey(
        {
          status: API_KEY_STATUS.ENABLED,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: false,
        },
        now
      )
    ).toBe(false)
    expect(
      isUsableVideoApiKey(
        {
          status: API_KEY_STATUS.ENABLED,
          expired_time: -1,
          remain_quota: 10,
          unlimited_quota: false,
        },
        now
      )
    ).toBe(true)
  })

  it('defaults to the earliest created usable key', () => {
    const picked = pickDefaultVideoApiKey([
      {
        id: 3,
        name: 'newer',
        maskedKey: 'sk-***2222',
        status: 1,
        createdTime: 200,
      },
      {
        id: 2,
        name: 'older',
        maskedKey: 'sk-***1111',
        status: 1,
        createdTime: 100,
      },
    ])
    expect(picked?.id).toBe(2)
    expect(pickDefaultVideoApiKey([])).toBeNull()
  })

  it('breaks createdTime ties by ascending id', () => {
    const picked = pickDefaultVideoApiKey([
      {
        id: 5,
        name: 'later-id',
        maskedKey: 'sk-***5555',
        status: 1,
        createdTime: 100,
      },
      {
        id: 2,
        name: 'earlier-id',
        maskedKey: 'sk-***2222',
        status: 1,
        createdTime: 100,
      },
    ])
    expect(picked?.id).toBe(2)
  })

  it('maps only masked public fields and drops unexpected secrets', () => {
    const mapped = toVideoApiKeyOption({
      id: 9,
      name: 'shown',
      key: 'sk-***mask',
      status: 1,
      remain_quota: 10,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 50,
      accessed_time: 50,
      group: 'default',
      auto_groups: null,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      full_key: 'sk-real-full-secret',
      secret: 'sk-real-full-secret',
    } as never)
    expect(mapped).toEqual({
      id: 9,
      name: 'shown',
      maskedKey: 'sk-***mask',
      status: 1,
      createdTime: 50,
    })
    expect(Object.keys(mapped).sort()).toEqual(
      ['createdTime', 'id', 'maskedKey', 'name', 'status'].sort()
    )
    expect(JSON.stringify(mapped)).not.toContain('sk-real-full-secret')
  })

  it('adds the sk- prefix only once', () => {
    expect(bearerApiKey('abc')).toBe('sk-abc')
    expect(bearerApiKey('sk-abc')).toBe('sk-abc')
    expect(bearerApiKey('SK-abc')).toBe('SK-abc')
  })
})

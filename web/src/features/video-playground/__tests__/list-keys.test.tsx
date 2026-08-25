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
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiGet = vi.fn()
const apiPost = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
}))

import { API_KEY_STATUS } from '@/features/keys/constants'

import { listUsableVideoApiKeys, loadVideoApiSecret } from '../api'

function key(partial: Record<string, unknown>) {
  return {
    name: 'k',
    key: 'sk-***mask',
    used_quota: 0,
    unlimited_quota: true,
    expired_time: -1,
    accessed_time: 0,
    group: '',
    auto_groups: null,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    remain_quota: 100,
    status: API_KEY_STATUS.ENABLED,
    created_time: 1,
    ...partial,
  }
}

describe('listUsableVideoApiKeys', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
  })

  it('returns only enabled unused keys and never the full secret', async () => {
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [
            key({
              id: 1,
              name: 'ok',
              created_time: 10,
              key: 'sk-***ok',
              full_key: 'sk-real-full-secret',
            }),
            key({
              id: 2,
              name: 'off',
              status: API_KEY_STATUS.DISABLED,
              created_time: 1,
            }),
            key({
              id: 3,
              name: 'empty',
              unlimited_quota: false,
              remain_quota: 0,
              created_time: 2,
            }),
          ],
          total: 3,
          page: 1,
          page_size: 100,
        },
      },
    })

    const keys = await listUsableVideoApiKeys()
    expect(keys.map((item) => item.id)).toEqual([1])
    expect(keys[0]).toEqual({
      id: 1,
      name: 'ok',
      maskedKey: 'sk-***ok',
      status: API_KEY_STATUS.ENABLED,
      createdTime: 10,
    })
    expect(JSON.stringify(keys)).not.toContain('sk-real-full-secret')
    expect(apiGet).toHaveBeenCalledWith(
      '/api/token/?p=1&size=100',
      expect.objectContaining({
        skipErrorHandler: true,
        skipBusinessError: true,
      })
    )
  })

  it('loads the full secret only for the requested id', async () => {
    apiPost.mockResolvedValue({
      data: { success: true, data: { key: 'plain-secret' } },
    })
    await expect(loadVideoApiSecret(7)).resolves.toBe('plain-secret')
    expect(apiPost).toHaveBeenCalledWith(
      '/api/token/7/key',
      {},
      expect.objectContaining({
        skipErrorHandler: true,
        skipBusinessError: true,
      })
    )
    expect(apiPost).toHaveBeenCalledTimes(1)
  })
})

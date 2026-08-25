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

const apiGetMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { get: apiGetMock, post: vi.fn() },
}))

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

import { getVideoTask } from '../api'

function axiosError(status: number, data: unknown) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data },
    toJSON: () => ({}),
  }
}

describe('video playground task HTTP errors', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it('keeps 401, 404, and 500 server messages as upstream text', async () => {
    apiGetMock.mockRejectedValueOnce(
      axiosError(401, { error: { message: 'AUTH_UNAUTHORIZED' } })
    )
    await expect(getVideoTask('task-1')).rejects.toMatchObject({
      source: { kind: 'upstream', rawMessage: 'AUTH_UNAUTHORIZED' },
    })

    apiGetMock.mockRejectedValueOnce(
      axiosError(404, { message: 'task not found' })
    )
    await expect(getVideoTask('task-1')).rejects.toMatchObject({
      source: { kind: 'upstream', rawMessage: 'task not found' },
    })

    apiGetMock.mockRejectedValueOnce(axiosError(500, { error: 'boom' }))
    await expect(getVideoTask('task-1')).rejects.toMatchObject({
      source: { kind: 'upstream', rawMessage: 'boom' },
    })
  })
})

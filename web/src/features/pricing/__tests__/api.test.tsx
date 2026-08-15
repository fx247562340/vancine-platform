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
import { describe, expect, it, vi } from 'vitest'

const apiGetMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { get: apiGetMock },
}))

// eslint-disable-next-line import/first -- vi.mock must precede the import
import { getPricing } from '../api'

describe('getPricing API wrapper', () => {
  it('calls api.get with signal and disableDuplicate option', async () => {
    const controller = new AbortController()
    apiGetMock.mockResolvedValueOnce({ data: { success: true, data: [] } })

    await getPricing(controller.signal)

    expect(apiGetMock).toHaveBeenCalledWith('/api/pricing', {
      signal: controller.signal,
      disableDuplicate: true,
    })
  })

  it('extracts signal from QueryFunctionContext when passed as object', async () => {
    const controller = new AbortController()
    apiGetMock.mockResolvedValueOnce({ data: { success: true, data: [] } })

    await getPricing({ signal: controller.signal })

    expect(apiGetMock).toHaveBeenCalledWith('/api/pricing', {
      signal: controller.signal,
      disableDuplicate: true,
    })
  })

  it('returns res.data from the response', async () => {
    const mockData = { success: true, data: [{ model_name: 'gpt-4o' }] }
    apiGetMock.mockResolvedValueOnce({ data: mockData })

    const result = await getPricing()
    expect(result).toEqual(mockData)
  })

  it('propagates abort errors when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError'
    )
    apiGetMock.mockRejectedValueOnce(abortError)

    await expect(getPricing(controller.signal)).rejects.toThrow(
      'The operation was aborted.'
    )
  })
})

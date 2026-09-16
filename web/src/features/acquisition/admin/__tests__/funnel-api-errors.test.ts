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
/**
 * Error-contract tests for getAcquisitionFunnel: every failure is surfaced as
 * AcquisitionFunnelRequestError (never a raw AxiosError), so the global
 * QueryCache hook in src/main.tsx cannot hijack HTTP 500 into its /500
 * redirect and the page keeps its own error card + Retry. The axios
 * interceptor's 401/403 handling is untouched (no skipErrorHandler opt-out
 * is sent with the request).
 */
import { AxiosError, type AxiosResponse } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AcquisitionFunnelRequestError, getAcquisitionFunnel } from '../api'

const getMock = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
  },
}))

afterEach(() => {
  getMock.mockReset()
  vi.restoreAllMocks()
})

function axiosErrorWithStatus(status: number): AxiosError {
  const response = {
    status,
    data: { success: false, message: 'boom' },
    config: {},
    headers: {},
  } as unknown as AxiosResponse
  return new AxiosError(
    'request failed',
    String(status),
    undefined,
    undefined,
    response
  )
}

describe('getAcquisitionFunnel error contract', () => {
  it('resolves with the payload data on HTTP 200 + success:true', async () => {
    const data = { landing_view: 1 } as never
    getMock.mockResolvedValue({ data: { success: true, data } })

    await expect(getAcquisitionFunnel({ from: 1, to: 2 })).resolves.toBe(data)
    expect(getMock).toHaveBeenCalledWith(
      '/api/acquisition/funnel',
      expect.objectContaining({ params: { from: 1, to: 2 } })
    )
  })

  it('rejects with the feature error (not AxiosError) on HTTP 200 + success:false', async () => {
    getMock.mockResolvedValue({
      data: { success: false, message: 'range too large' },
    })

    const caught = await getAcquisitionFunnel({ from: 1, to: 2 }).then(
      () => null,
      (error: unknown) => error
    )
    expect(caught).toBeInstanceOf(AcquisitionFunnelRequestError)
    expect((caught as AcquisitionFunnelRequestError).message).toBe(
      'range too large'
    )
    expect(caught).not.toBeInstanceOf(AxiosError)
  })

  it('rejects with the feature error when success:true but data is missing', async () => {
    getMock.mockResolvedValue({ data: { success: true, data: null } })

    await expect(
      getAcquisitionFunnel({ from: 1, to: 2 })
    ).rejects.toBeInstanceOf(AcquisitionFunnelRequestError)
  })

  it('rewraps a real AxiosError so the global QueryCache 500 hook never fires', async () => {
    getMock.mockRejectedValue(axiosErrorWithStatus(500))

    const caught = await getAcquisitionFunnel({ from: 1, to: 2 }).then(
      () => null,
      (error: unknown) => error
    )
    // The app-wide QueryCache hook matches on `error instanceof AxiosError`
    // with status 500 to toast and redirect to /500. The rewrapped plain
    // error fails both conditions, so this page keeps its own error card.
    expect(caught).toBeInstanceOf(AcquisitionFunnelRequestError)
    expect(caught).not.toBeInstanceOf(AxiosError)
    expect((caught as AcquisitionFunnelRequestError).status).toBe(500)
  })

  it('does not swallow the 401/403 contract: the request keeps unified error handling', async () => {
    getMock.mockRejectedValue(axiosErrorWithStatus(403))

    const caught = await getAcquisitionFunnel({ from: 1, to: 2 }).then(
      () => null,
      (error: unknown) => error
    )
    // The interceptor's refresh/redirect logic still ran on the real network
    // layer; this layer only re-wraps afterwards, preserving the status.
    expect(caught).toBeInstanceOf(AcquisitionFunnelRequestError)
    expect((caught as AcquisitionFunnelRequestError).status).toBe(403)
    // And the request was issued WITHOUT the skipErrorHandler opt-out, so
    // the unified axios handling (401/403) stays fully engaged.
    const config = getMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(config.skipErrorHandler).toBeFalsy()
  })

  it('propagates non-axios rejections unchanged', async () => {
    const plain = new Error('cancelled')
    getMock.mockRejectedValue(plain)

    await expect(getAcquisitionFunnel({ from: 1, to: 2 })).rejects.toBe(plain)
  })
})

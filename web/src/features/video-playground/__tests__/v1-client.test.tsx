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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestWithApiKey } from '../lib/v1-client'

describe('requestWithApiKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a Bearer API key and never a dashboard JWT', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestWithApiKey({
      path: '/v1/models',
      apiKey: 'plain-key',
      language: 'zh',
      fallbackErrorKey: 'Failed to load video models',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      {
        headers: Record<string, string>
        cache?: RequestCache
        credentials?: RequestCredentials
      },
    ]
    expect(url).toBe('/v1/models')
    expect(init.headers.Authorization).toBe('Bearer sk-plain-key')
    expect(init.headers['Accept-Language']).toBe('zh')
    expect(init.cache).toBe('no-store')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.stringify(init.headers)).not.toContain('access-token')
    expect(JSON.stringify(init.headers)).not.toContain('JWT')
  })

  it('posts only the provided JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'task-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestWithApiKey({
      path: '/v1/video/generations',
      method: 'POST',
      apiKey: 'sk-already',
      body: { model: 'Doubao-Seedance-2.5', prompt: 'a cat' },
      fallbackErrorKey: 'Video generation failed',
    })

    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>
      body: string
    }
    expect(init.headers.Authorization).toBe('Bearer sk-already')
    expect(JSON.parse(init.body)).toEqual({
      model: 'Doubao-Seedance-2.5',
      prompt: 'a cat',
    })
  })
})

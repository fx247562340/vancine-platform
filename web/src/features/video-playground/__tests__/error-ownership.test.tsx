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
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createVideoPlaygroundI18n,
  fillAndSubmitPrompt,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

const toastError = vi.fn()
const apiGet = vi.fn()
const apiPost = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => {
    let href = to
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value)
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
}))

function productionLikeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: {
        retry: false,
        onError: (error) => {
          toastError(error instanceof Error ? error.message : 'mutation-error')
        },
      },
    },
  })
}

function tokenListResponse() {
  return {
    data: {
      success: true,
      data: {
        items: [
          {
            id: 2,
            name: 'older',
            key: 'sk-***1111',
            status: 1,
            remain_quota: 100,
            used_quota: 0,
            unlimited_quota: true,
            expired_time: -1,
            created_time: 100,
            accessed_time: 100,
            group: 'default',
            model_limits_enabled: false,
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      },
    },
  }
}

describe('VideoPlayground single error owner', () => {
  beforeEach(() => {
    toastError.mockReset()
    apiGet.mockReset()
    apiPost.mockReset()
    stubAuthUser()
    vi.unstubAllGlobals()
  })

  it('shows an inline submit error without a global mutation toast', async () => {
    apiGet.mockImplementation((url: string) => {
      if (String(url).startsWith('/api/token/')) {
        return Promise.resolve(tokenListResponse())
      }
      return Promise.reject(new Error('unexpected get'))
    })
    apiPost.mockResolvedValue({
      data: { success: true, data: { key: 'plain-secret' } },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/v1/models')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ id: 'Doubao-Seedance-2.5' }],
            }),
          }
        }
        return {
          ok: false,
          json: async () => ({ error: { message: 'insufficient quota' } }),
        }
      })
    )

    const i18n = await createVideoPlaygroundI18n()
    renderVideoPlayground(i18n, productionLikeClient())
    await fillAndSubmitPrompt()

    expect(await screen.findByText('insufficient quota')).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/token/'),
      expect.objectContaining({
        skipErrorHandler: true,
        skipBusinessError: true,
      })
    )
    expect(apiPost).toHaveBeenCalledWith(
      '/api/token/2/key',
      {},
      expect.objectContaining({
        skipErrorHandler: true,
        skipBusinessError: true,
      })
    )
  })

  it('owns a key-list business failure without a toast', async () => {
    apiGet.mockResolvedValue({
      data: { success: false, message: 'group not found' },
    })
    const i18n = await createVideoPlaygroundI18n()
    renderVideoPlayground(i18n, productionLikeClient())
    expect(await screen.findByText('group not found')).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })
})

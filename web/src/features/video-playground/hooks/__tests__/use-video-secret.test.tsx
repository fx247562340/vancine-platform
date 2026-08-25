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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadVideoApiSecret } from '../../api'
import {
  isVideoApiSecretCancelled,
  useVideoApiSecret,
} from '../use-video-secret'

vi.mock('../../api', () => ({
  loadVideoApiSecret: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('useVideoApiSecret', () => {
  beforeEach(() => {
    vi.mocked(loadVideoApiSecret).mockReset()
  })

  it('keeps only the later key when a slower first load finishes after a switch', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    vi.mocked(loadVideoApiSecret).mockImplementation((id: number) =>
      id === 1 ? first.promise : second.promise
    )

    const { result } = renderHook(() => useVideoApiSecret())
    let firstOutcome: string | Error | undefined
    act(() => {
      result.current
        .load(1)
        .then((value) => {
          firstOutcome = value
        })
        .catch((error: unknown) => {
          firstOutcome = error as Error
        })
    })

    act(() => {
      result.current.clear()
    })

    let secondValue = ''
    await act(async () => {
      const pending = result.current.load(2)
      second.resolve('key-b')
      secondValue = await pending
    })

    await act(async () => {
      first.resolve('key-a')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(secondValue).toBe('sk-key-b')
    expect(isVideoApiSecretCancelled(firstOutcome)).toBe(true)
    vi.mocked(loadVideoApiSecret).mockClear()
    let cached = ''
    await act(async () => {
      cached = await result.current.load(2)
    })
    expect(cached).toBe('sk-key-b')
    expect(loadVideoApiSecret).not.toHaveBeenCalled()
  })

  it('does not resolve a secret that finishes after unmount', async () => {
    const pending = deferred<string>()
    vi.mocked(loadVideoApiSecret).mockReturnValue(pending.promise)
    const { result, unmount } = renderHook(() => useVideoApiSecret())
    let outcome: unknown
    act(() => {
      result.current.load(1).catch((error: unknown) => {
        outcome = error
      })
    })
    unmount()
    await act(async () => {
      pending.resolve('key-a')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(isVideoApiSecretCancelled(outcome)).toBe(true)
  })

  it('fetches again after clear instead of reusing the previous load', async () => {
    vi.mocked(loadVideoApiSecret).mockResolvedValueOnce('key-a')
    const { result } = renderHook(() => useVideoApiSecret())
    let first = ''
    await act(async () => {
      first = await result.current.load(1)
    })
    expect(first).toBe('sk-key-a')
    act(() => {
      result.current.clear()
    })
    vi.mocked(loadVideoApiSecret).mockResolvedValueOnce('key-b')
    let next = ''
    await act(async () => {
      next = await result.current.load(2)
    })
    expect(next).toBe('sk-key-b')
    expect(loadVideoApiSecret).toHaveBeenNthCalledWith(
      1,
      1,
      expect.any(AbortSignal)
    )
    expect(loadVideoApiSecret).toHaveBeenNthCalledWith(
      2,
      2,
      expect.any(AbortSignal)
    )
  })

  it('aborts an in-flight load when the submission signal aborts', async () => {
    vi.mocked(loadVideoApiSecret).mockImplementation(
      (_id: number, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(
              Object.assign(new Error('video-api-secret-cancelled'), {
                name: 'AbortError',
              })
            )
          })
        })
    )
    const { result } = renderHook(() => useVideoApiSecret())
    const controller = new AbortController()
    let outcome: unknown
    act(() => {
      result.current.load(4, controller.signal).catch((error: unknown) => {
        outcome = error
      })
    })
    await act(async () => {
      controller.abort()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(isVideoApiSecretCancelled(outcome)).toBe(true)
  })

  it('lets a later subscriber abort without cancelling the shared in-flight load', async () => {
    const pending = deferred<string>()
    vi.mocked(loadVideoApiSecret).mockReturnValue(pending.promise)
    const { result } = renderHook(() => useVideoApiSecret())

    let firstValue = ''
    let firstError: unknown
    act(() => {
      result.current
        .load(9)
        .then((value) => {
          firstValue = value
        })
        .catch((error: unknown) => {
          firstError = error
        })
    })

    const secondController = new AbortController()
    let secondError: unknown
    act(() => {
      result.current
        .load(9, secondController.signal)
        .catch((error: unknown) => {
          secondError = error
        })
    })
    expect(loadVideoApiSecret).toHaveBeenCalledTimes(1)

    await act(async () => {
      secondController.abort()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(isVideoApiSecretCancelled(secondError)).toBe(true)

    await act(async () => {
      pending.resolve('shared-secret')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(firstError).toBeUndefined()
    expect(firstValue).toBe('sk-shared-secret')
    expect(loadVideoApiSecret).toHaveBeenCalledTimes(1)
  })
})

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
import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getVideoTask } from '../../api'
import { VideoPlaygroundError } from '../../lib/errors'
import {
  useVideoTask,
  VIDEO_TASK_STATUS_RETRY_COUNT,
  VIDEO_TASK_STATUS_RETRY_DELAY_MS,
} from '../use-video-task'

vi.mock('../../api', () => ({
  getVideoTask: vi.fn(),
}))

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function flushQuery() {
  await act(async () => {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
  })
}

describe('useVideoTask', () => {
  beforeEach(() => {
    notifyManager.setScheduler((fn) => fn())
    vi.useFakeTimers()
    vi.mocked(getVideoTask).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    notifyManager.setScheduler((fn) => fn())
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  it('polls IN_PROGRESS every 5 seconds and stops after SUCCESS', async () => {
    vi.mocked(getVideoTask)
      .mockResolvedValueOnce({
        task_id: 'task-1',
        status: 'IN_PROGRESS',
      })
      .mockResolvedValueOnce({
        task_id: 'task-1',
        status: 'SUCCESS',
        content_url:
          'https://vancine.test/v1/tasks/task-1/artifacts/video/content',
      })
      .mockResolvedValue({
        task_id: 'task-1',
        status: 'SUCCESS',
        content_url:
          'https://vancine.test/v1/tasks/task-1/artifacts/video/content',
      })

    const { result } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    expect(getVideoTask).toHaveBeenCalledTimes(1)
    expect(result.current.data?.status).toBe('IN_PROGRESS')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await flushQuery()
    expect(getVideoTask).toHaveBeenCalledTimes(2)
    expect(result.current.data?.status).toBe('SUCCESS')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(getVideoTask).toHaveBeenCalledTimes(2)
  })

  it('stops polling after FAILURE', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'FAILURE',
      fail_reason: 'upstream generation failed',
    })
    renderHook(() => useVideoTask('task-1'), { wrapper: createWrapper() })
    await flushQuery()
    expect(getVideoTask).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(getVideoTask).toHaveBeenCalledTimes(1)
  })

  it('does not auto-refetch a terminal SUCCESS on window focus or remount', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'SUCCESS',
      content_url:
        'https://vancine.test/v1/tasks/task-1/artifacts/video/content',
    })
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    })
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }
    const { unmount } = renderHook(() => useVideoTask('task-1'), {
      wrapper: Wrapper,
    })
    await flushQuery()
    const settledCalls = vi.mocked(getVideoTask).mock.calls.length
    expect(settledCalls).toBe(1)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(settledCalls)

    unmount()
    renderHook(() => useVideoTask('task-1'), { wrapper: Wrapper })
    await flushQuery()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(settledCalls)
  })

  it('retries a retryable transport failure up to the retry limit', async () => {
    vi.mocked(getVideoTask).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Failed to load video status',
        httpStatus: 503,
      })
    )
    const { result } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    for (let attempt = 0; attempt < VIDEO_TASK_STATUS_RETRY_COUNT; attempt++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(VIDEO_TASK_STATUS_RETRY_DELAY_MS)
      })
      await flushQuery()
    }
    expect(result.current.isError).toBe(true)
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(
      VIDEO_TASK_STATUS_RETRY_COUNT + 1
    )
  })

  it('stops polling after unmount', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'QUEUED',
    })
    const { unmount } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    const calls = vi.mocked(getVideoTask).mock.calls.length
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(getVideoTask).toHaveBeenCalledTimes(calls)
  })

  it('recovers when the first status fetch fails and a later retry succeeds', async () => {
    vi.mocked(getVideoTask)
      .mockRejectedValueOnce(
        new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'Failed to load video status',
        })
      )
      .mockResolvedValue({
        task_id: 'task-1',
        status: 'IN_PROGRESS',
      })

    const { result } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VIDEO_TASK_STATUS_RETRY_DELAY_MS)
    })
    await flushQuery()
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data?.status).toBe('IN_PROGRESS')
  })

  it('does not retry or keep polling on a 401 (fatal client error)', async () => {
    vi.mocked(getVideoTask).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: 'Token is invalid',
        httpStatus: 401,
      })
    )
    const { result } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    expect(result.current.isError).toBe(true)
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    await flushQuery()
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(1)
  })

  it('surfaces an error after status retries are exhausted', async () => {
    vi.mocked(getVideoTask).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Failed to load video status',
      })
    )
    const { result } = renderHook(() => useVideoTask('task-1'), {
      wrapper: createWrapper(),
    })
    await flushQuery()
    for (let attempt = 0; attempt < VIDEO_TASK_STATUS_RETRY_COUNT; attempt++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(VIDEO_TASK_STATUS_RETRY_DELAY_MS)
      })
      await flushQuery()
    }
    expect(result.current.isError).toBe(true)
    expect(vi.mocked(getVideoTask).mock.calls.length).toBe(
      VIDEO_TASK_STATUS_RETRY_COUNT + 1
    )
    expect(result.current.fetchStatus).not.toBe('fetching')
  })
})

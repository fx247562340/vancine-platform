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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VideoPlaygroundError } from '../../lib/errors'
import { useSubmission } from '../use-submission'

const FAKE_BODY = {
  model: 'Doubao-Seedance-2.0',
  prompt: 'a cat',
  duration: 5,
  metadata: {
    ratio: '16:9',
    resolution: '720p',
    generate_audio: true,
    watermark: false,
    return_last_frame: false,
  },
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useSubmission lifecycle (AbortController + epoch)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('cancels pending tasks on unmount — no further POST is fired', async () => {
    const submit = vi.fn(
      () =>
        new Promise<{ id: string }>(() => {
          /* never resolves */
        })
    )

    const { result, unmount } = renderHook(
      () => useSubmission({ submit, batchSize: 3 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })

    expect(submit).toHaveBeenCalledTimes(1)
    const submitting = result.current.tasks.filter(
      (task) => task.status === 'submitting'
    )
    const pending = result.current.tasks.filter(
      (task) => task.status === 'pending'
    )
    expect(submitting).toHaveLength(1)
    expect(pending).toHaveLength(2)

    unmount()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('aborts in-flight task when the API key changes', async () => {
    const submit = vi.fn(
      () =>
        new Promise<{ id: string }>((_resolve, reject) => {
          void reject
        })
    )

    const { result, rerender } = renderHook(
      ({ keyId }: { keyId: number | null }) =>
        useSubmission({ submit, batchSize: 1, keyId }),
      { initialProps: { keyId: 2 as number | null }, wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })
    expect(submit).toHaveBeenCalledTimes(1)

    await act(async () => {
      rerender({ keyId: 3 })
    })
    expect(result.current.tasks[0]?.status).toBe('cancelled')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('cancels a partial batch — already-submitted tasks continue polling, the rest are marked cancelled', async () => {
    let resolveFirst: (value: { id: string }) => void = () => {}
    let secondCallSignal: AbortSignal | undefined
    const submit = vi.fn((_body: unknown, signal?: AbortSignal) => {
      if (submit.mock.calls.length === 1) {
        return new Promise<{ id: string }>((resolve) => {
          resolveFirst = resolve
        })
      }
      secondCallSignal = signal
      return new Promise<{ id: string }>((_resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }
      })
    })

    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 4 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.tasks[0]?.status).toBe('submitting')
    expect(result.current.tasks[1]?.status).toBe('pending')

    await act(async () => {
      resolveFirst({ id: 'task-1' })
    })
    expect(result.current.tasks[0]?.status).toBe('polling')
    expect(result.current.tasks[0]?.taskId).toBe('task-1')

    await act(async () => {
      result.current.cancel()
    })
    expect(secondCallSignal?.aborted).toBe(true)
    expect(result.current.tasks[0]?.status).toBe('polling')
    expect(result.current.tasks[1]?.status).toBe('cancelled')
    expect(result.current.tasks[2]?.status).toBe('cancelled')
    expect(result.current.tasks[3]?.status).toBe('cancelled')
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('keeps a previous failed task failed when a later batch is cancelled', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(
        new VideoPlaygroundError({
          kind: 'upstream',
          rawMessage: 'insufficient quota',
        })
      )
      .mockImplementation(
        () =>
          new Promise<{ id: string }>(() => {
            /* hang */
          })
      )

    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 1 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'first',
      })
    })
    expect(result.current.tasks[0]?.status).toBe('failed')

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.5',
        promptPreview: 'second',
      })
    })
    await act(async () => {
      result.current.cancel()
    })

    expect(result.current.tasks[0]?.status).toBe('failed')
    expect(result.current.tasks[1]?.status).toBe('cancelled')
  })

  it('continues later batch items after one POST fails', async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ id: 'task-1' })
      .mockRejectedValueOnce(
        new VideoPlaygroundError({
          kind: 'upstream',
          rawMessage: 'upstream 503 — service unavailable',
        })
      )
      .mockResolvedValueOnce({ id: 'task-3' })
      .mockResolvedValueOnce({ id: 'task-4' })

    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 4 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })

    expect(submit).toHaveBeenCalledTimes(4)
    expect(result.current.tasks[0]?.status).toBe('polling')
    expect(result.current.tasks[0]?.taskId).toBe('task-1')
    expect(result.current.tasks[1]?.status).toBe('failed')
    expect(result.current.tasks[2]?.status).toBe('polling')
    expect(result.current.tasks[2]?.taskId).toBe('task-3')
    expect(result.current.tasks[3]?.status).toBe('polling')
    expect(result.current.tasks[3]?.taskId).toBe('task-4')
  })

  it('does not mask a real upstream failure as a business failure', async () => {
    const submit = vi.fn().mockRejectedValueOnce(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: 'upstream 503 — service unavailable',
      })
    )
    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 1 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })

    expect(result.current.tasks[0]?.status).toBe('failed')
    expect(result.current.tasks[0]?.submitError?.source).toEqual({
      kind: 'upstream',
      rawMessage: 'upstream 503 — service unavailable',
    })
  })

  it('freezes modelId, promptPreview, and submittedAt at enqueue time', async () => {
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'))
    const submit = vi.fn().mockResolvedValue({ id: 'task-snap' })
    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 1 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'original prompt',
      })
    })

    expect(result.current.tasks[0]?.modelId).toBe('Doubao-Seedance-2.0')
    expect(result.current.tasks[0]?.promptPreview).toBe('original prompt')
    expect(result.current.tasks[0]?.submittedAt).toBe(
      new Date('2026-08-17T00:00:00.000Z').getTime()
    )
  })

  it('does not POST remaining items after an explicit cancel', async () => {
    const submit = vi.fn(
      () =>
        new Promise<{ id: string }>(() => {
          /* hang */
        })
    )
    const { result } = renderHook(
      () => useSubmission({ submit, batchSize: 4 }),
      { wrapper }
    )

    await act(async () => {
      result.current.start({
        body: FAKE_BODY,
        modelId: 'Doubao-Seedance-2.0',
        promptPreview: 'a cat',
      })
    })
    expect(submit).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.cancel()
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(submit).toHaveBeenCalledTimes(1)
  })
})

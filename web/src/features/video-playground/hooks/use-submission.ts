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
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { VideoPlaygroundError } from '../lib/errors'

export type SubmissionStatus =
  | 'pending'
  | 'submitting'
  | 'polling'
  | 'failed'
  | 'cancelled'

export type QueuedSubmission = {
  id: string
  taskId: string | null
  status: SubmissionStatus
  submitError: VideoPlaygroundError | null
  modelId: string
  promptPreview: string
  submittedAt: number
}

export type UseSubmissionOptions = {
  submit: (
    body: unknown,
    signal?: AbortSignal
  ) => Promise<{ id?: string; task_id?: string }>
  batchSize: number
  /** Re-creates the submission pipeline when the active key changes. */
  keyId?: number | null
}

export type UseSubmissionResult = {
  tasks: QueuedSubmission[]
  /** True while at least one queued task is submitting or pending. */
  isBusy: boolean
  start: (params: {
    body: unknown
    modelId: string
    promptPreview: string
  }) => void
  /** Cancel pending/submitting items only. Does NOT abort tasks that already have a task_id. */
  cancel: () => void
}

type MutationVars = {
  body: unknown
  signal?: AbortSignal
}

/**
 * Phase 5 submission lifecycle.
 *
 * Each POST /v1/video/generations is driven by TanStack Query
 * useMutation. The mutationFn still uses the playground's independent
 * fetch + user API key. Errors stay inline — mutation onError is a
 * no-op so the global QueryClient toast is not the owner.
 *
 * Cancellation only flips pending/submitting → cancelled. polling,
 * failed, and cancelled stay as they are. A single POST failure
 * marks that item failed and continues the rest of the batch.
 */
export function useSubmission(
  options: UseSubmissionOptions
): UseSubmissionResult {
  const { submit, batchSize, keyId } = options
  const [tasks, setTasks] = useState<QueuedSubmission[]>([])
  const epochRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const mutation = useMutation({
    mutationFn: (vars: MutationVars) => submit(vars.body, vars.signal),
    gcTime: 0,
    onError: () => {
      // Inline owner: TaskQueueItem / preflight alert. Do not toast.
    },
  })
  const mutateRef = useRef(mutation.mutateAsync)
  mutateRef.current = mutation.mutateAsync

  const invalidate = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    epochRef.current += 1
    setTasks((prev) =>
      prev.map((task) =>
        task.status === 'pending' || task.status === 'submitting'
          ? { ...task, status: 'cancelled' as const }
          : task
      )
    )
  }, [])

  useEffect(() => {
    invalidate()
  }, [keyId, invalidate])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const updateTask = useCallback(
    (id: string, patch: Partial<QueuedSubmission>) => {
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? { ...task, ...patch } : task))
      )
    },
    []
  )

  const start = useCallback(
    (params: { body: unknown; modelId: string; promptPreview: string }) => {
      const generation = epochRef.current
      const submittedAt = Date.now()
      const local: QueuedSubmission[] = []
      for (let index = 0; index < batchSize; index += 1) {
        const id = `sub-${submittedAt}-${index}-${Math.random().toString(36).slice(2, 8)}`
        local.push({
          id,
          taskId: null,
          status: index === 0 ? 'submitting' : 'pending',
          submitError: null,
          modelId: params.modelId,
          promptPreview: params.promptPreview,
          submittedAt: submittedAt + index,
        })
      }
      setTasks((prev) => [...prev, ...local])

      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller

      void (async () => {
        for (let index = 0; index < local.length; index += 1) {
          const entry = local[index]
          if (!entry) continue
          if (generation !== epochRef.current || controller.signal.aborted) {
            updateTask(entry.id, { status: 'cancelled' })
            continue
          }
          if (index > 0) {
            updateTask(entry.id, { status: 'submitting' })
          }
          try {
            const result = await mutateRef.current({
              body: params.body,
              signal: controller.signal,
            })
            const taskId = result.task_id ?? result.id ?? null
            if (taskId) {
              updateTask(entry.id, { status: 'polling', taskId })
              continue
            }
            if (generation !== epochRef.current || controller.signal.aborted) {
              updateTask(entry.id, { status: 'cancelled' })
              continue
            }
            updateTask(entry.id, {
              status: 'failed',
              submitError: new VideoPlaygroundError({
                kind: 'system',
                errorKey: 'Video generation failed',
              }),
            })
          } catch (error) {
            const aborted =
              controller.signal.aborted ||
              (error instanceof Error &&
                (error.name === 'AbortError' || error.name === 'CanceledError'))
            if (aborted || generation !== epochRef.current) {
              updateTask(entry.id, { status: 'cancelled' })
              continue
            }
            const submitError =
              error instanceof VideoPlaygroundError
                ? error
                : new VideoPlaygroundError({
                    kind: 'system',
                    errorKey: 'Video generation failed',
                  })
            updateTask(entry.id, { status: 'failed', submitError })
          }
        }
      })()
    },
    [batchSize, updateTask]
  )

  const cancel = useCallback(() => {
    invalidate()
  }, [invalidate])

  const isBusy = useMemo(
    () =>
      tasks.some(
        (task) => task.status === 'submitting' || task.status === 'pending'
      ),
    [tasks]
  )

  return { tasks, isBusy, start, cancel }
}

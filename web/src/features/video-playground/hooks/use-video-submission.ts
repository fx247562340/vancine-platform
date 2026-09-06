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

For commercial licensing, please contact support@quantumnous.com.
*/
import { useCallback } from 'react'

import { submitVideoGenerationWithApiKey } from '../api'
import { VideoPlaygroundError } from '../lib/errors'
import type { VideoSubmitPayload } from '../types'
import { useSubmission, type UseSubmissionResult } from './use-submission'

export type VideoSubmissionParams = {
  /** Re-creates the pipeline (and cancels pending/submitting) when it changes. */
  keyId: number | null
  language: string
  loadSecret: (id: number, signal?: AbortSignal) => Promise<string>
}

/**
 * The video page's single submission pipeline.
 *
 * It is owned by the page rather than by a composer so the task queue survives
 * switching between the dedicated (Seedance) and the generic composer. Both
 * composers keep their own preflight and serializer, but every accepted body
 * lands in this one queue, which means a task that already has a task_id keeps
 * polling, a POST whose response arrives after a profile switch is still
 * accepted by the same late-response guard, and terminal tasks never disappear.
 *
 * The full API key is loaded per POST from the secret store by id and held only
 * in a local variable: it never enters React state, the DOM, storage, React
 * Query, or an error message.
 */
export function useVideoSubmission(
  params: VideoSubmissionParams
): UseSubmissionResult<VideoSubmitPayload> {
  const { keyId, language, loadSecret } = params

  const submit = useCallback(
    async (body: VideoSubmitPayload, signal?: AbortSignal) => {
      if (keyId == null) {
        throw new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'No API key',
        })
      }
      const rawKey = await loadSecret(keyId, signal)
      const response = await submitVideoGenerationWithApiKey(
        rawKey,
        body,
        language,
        signal
      )
      const id = response.task_id ?? response.id ?? null
      if (!id) {
        throw new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'Video generation failed',
        })
      }
      return { task_id: id, id }
    },
    [keyId, language, loadSecret]
  )

  return useSubmission<VideoSubmitPayload>({ submit, keyId })
}

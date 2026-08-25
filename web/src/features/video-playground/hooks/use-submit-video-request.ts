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

import type { VideoCapability } from '../lib/capabilities'
import { preflightRequestBodySize, preflightResources } from '../lib/preflight'
import {
  buildVideoGenerationRequest,
  VideoRequestError,
  type VideoRequestInput,
} from '../lib/request-serializer'
import { useSubmission } from './use-submission'

export type SubmitVideoRequest = {
  capability: VideoCapability
  modelId: string
  /** Re-creates the pipeline (and aborts in-flight) when the key changes. */
  keyId: number | null
  batchSize: number
  /**
   * Submit closure. The caller builds this in `onSubmit` with the
   * full API key held in a local variable (NOT in React state). The
   * key never enters the DOM, storage, React Query, or any error
   * message.
   */
  submit: (
    body: unknown,
    signal?: AbortSignal
  ) => Promise<{ id?: string; task_id?: string }>
}

export type SubmitVideoResult =
  | { ok: true }
  | { ok: false; reasonKey: string; detail?: string }

/**
 * Production entry point for submitting a video request.
 *
 * `start` runs the canonical preflight against the SAME resource
 * collection it later serializes. On preflight or serializer
 * failure, NO POST is sent, NO task placeholders are created, and
 * the page is NOT locked — the user can fix the input and try again.
 */
export function useSubmitVideoRequest(params: SubmitVideoRequest) {
  const submission = useSubmission({
    submit: params.submit,
    batchSize: params.batchSize,
    keyId: params.keyId,
  })

  const start = useCallback(
    (input: Omit<VideoRequestInput, 'model'>): SubmitVideoResult => {
      try {
        const resources = {
          images: [...input.images],
          videos: [...input.videos],
          audios: [...input.audios],
        }
        const resourcePre = preflightResources(
          params.capability,
          input.mode,
          resources
        )
        if (!resourcePre.ok) {
          return {
            ok: false,
            reasonKey: resourcePre.illegalReason,
            detail: resourcePre.detail,
          }
        }

        const body = buildVideoGenerationRequest({
          model: params.modelId,
          ...input,
          images: resources.images,
          videos: resources.videos,
          audios: resources.audios,
        })

        const bodyPre = preflightRequestBodySize(body, params.capability)
        if (!bodyPre.ok) {
          return {
            ok: false,
            reasonKey: bodyPre.illegalReason,
            detail: bodyPre.detail,
          }
        }

        submission.start({
          body,
          modelId: params.modelId,
          promptPreview: input.prompt,
        })
        return { ok: true }
      } catch (error) {
        if (error instanceof VideoRequestError) {
          return { ok: false, reasonKey: error.reasonKey }
        }
        return {
          ok: false,
          reasonKey: 'videoPlayground.error.compositionIllegal',
        }
      }
    },
    [params.capability, params.modelId, submission]
  )

  return { ...submission, start }
}

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

import type { GenericVideoCapability } from '../lib/capabilities'
import { preflightRequestBodySize } from '../lib/preflight'
import {
  buildGenericVideoGenerationRequest,
  VideoRequestError,
  type GenericVideoRequestInput,
} from '../lib/request-serializer'
import type { VideoSubmitPayload } from '../types'
import type { UseSubmissionResult } from './use-submission'

export type SubmitGenericVideoRequest = {
  capability: GenericVideoCapability
  modelId: string
  batchSize: number
  /**
   * The page-owned queue, shared with the dedicated composer. As there, this
   * hook holds no lifecycle state of its own, so switching profile cannot drop
   * an in-flight POST or an accepted task.
   */
  submission: UseSubmissionResult<VideoSubmitPayload>
}

export type SubmitGenericVideoResult =
  | { ok: true }
  | { ok: false; reasonKey: string; detail?: string }

export type GenericVideoSubmitter = {
  start: (
    input: Omit<GenericVideoRequestInput, 'model'>
  ) => SubmitGenericVideoResult
  cancel: () => void
  isBusy: boolean
}

/**
 * Submission entry point for a video model without a dedicated capability
 * profile.
 *
 * The generic contract is enforced by the serializer, which rejects any
 * resource it cannot honestly send (a second image, a video, an audio track, an
 * inlined base64 payload or a non-public URL) with a translatable reason. On
 * such a rejection NO POST is sent, NO task placeholder is created and the page
 * stays unlocked, so the user can remove the offending asset and try again.
 */
export function useSubmitGenericVideoRequest(
  params: SubmitGenericVideoRequest
): GenericVideoSubmitter {
  const { submission, capability, modelId, batchSize } = params
  const { start: startSubmission, cancel, isBusy } = submission

  const start = useCallback(
    (
      input: Omit<GenericVideoRequestInput, 'model'>
    ): SubmitGenericVideoResult => {
      try {
        const body = buildGenericVideoGenerationRequest({
          model: modelId,
          ...input,
        })
        const bodyPre = preflightRequestBodySize(body, capability)
        if (!bodyPre.ok) {
          return {
            ok: false,
            reasonKey: bodyPre.illegalReason,
            detail: bodyPre.detail,
          }
        }

        startSubmission({
          body,
          modelId,
          promptPreview: input.prompt,
          batchSize,
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
    [batchSize, capability, modelId, startSubmission]
  )

  return { start, cancel, isBusy }
}

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
import { z } from 'zod'

import { api } from '@/lib/api'

import { IMAGE_PLAYGROUND_ENDPOINTS } from './constants'
import {
  extractServerErrorFromBody,
  extractUpstreamErrorMessage,
  ImagePlaygroundError,
} from './lib/errors'
import type { ImageGenerationPayload } from './lib/payload'
import {
  imageCapabilityResponseSchema,
  parseGeneratedImages,
} from './lib/results'
import type {
  GeneratedImage,
  GroupOption,
  ImageCapabilityResponse,
} from './types'

const capabilityEnvelopeSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: imageCapabilityResponseSchema.optional(),
})

export async function getImageCapabilities(
  group: string
): Promise<ImageCapabilityResponse> {
  let res
  try {
    res = await api.get(IMAGE_PLAYGROUND_ENDPOINTS.CAPABILITIES, {
      params: { modality: 'image', group },
      skipErrorHandler: true,
    } as Record<string, unknown>)
  } catch (error) {
    // P13-B R18: an explicit server message in the axios response is the
    // only upstream source; network failures and responses without a
    // message fail closed on the system errorKey.
    const message = extractUpstreamErrorMessage(error)
    if (message) {
      throw new ImagePlaygroundError({ kind: 'upstream', rawMessage: message })
    }
    throw new ImagePlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load image models',
    })
  }
  const parsed = capabilityEnvelopeSchema.safeParse(res.data)
  if (!parsed.success || !parsed.data.success || !parsed.data.data) {
    const message = extractServerErrorFromBody(res.data)
    if (message) {
      throw new ImagePlaygroundError({ kind: 'upstream', rawMessage: message })
    }
    throw new ImagePlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load image models',
    })
  }
  return parsed.data.data
}

export async function getImagePlaygroundGroups(): Promise<GroupOption[]> {
  const res = await api.get(IMAGE_PLAYGROUND_ENDPOINTS.USER_GROUPS)
  const { data } = res
  if (!data.success || !data.data) {
    return []
  }
  const groupData = data.data as Record<string, { desc: string; ratio: number }>
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}

export async function generateImages(
  payload: ImageGenerationPayload,
  signal?: AbortSignal
): Promise<GeneratedImage[]> {
  let res
  try {
    res = await api.post(IMAGE_PLAYGROUND_ENDPOINTS.GENERATIONS, payload, {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>)
  } catch (error) {
    // P13-B R18 P2 closed error sources: an explicit server/upstream
    // message carried by the axios response is the ONLY input that yields
    // kind:'upstream' (rendered verbatim, survives language switches).
    // Network failures, missing responses and undecodable responses fail
    // closed on a system errorKey, which re-translates on language switch.
    const message = extractUpstreamErrorMessage(error)
    if (message) {
      throw new ImagePlaygroundError({ kind: 'upstream', rawMessage: message })
    }
    throw new ImagePlaygroundError({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
  }
  // A 2xx body that still carries an explicit error envelope is a server
  // message and is classified exactly like an axios-carried one.
  const bodyMessage = extractServerErrorFromBody(res.data)
  if (bodyMessage) {
    throw new ImagePlaygroundError({
      kind: 'upstream',
      rawMessage: bodyMessage,
    })
  }
  try {
    return parseGeneratedImages(res.data)
  } catch {
    // Unparseable bodies and empty results are never raw upstream text:
    // they fail closed as system errors.
    throw new ImagePlaygroundError({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
  }
}

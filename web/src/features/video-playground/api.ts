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
import axios from 'axios'

import type { ApiKey, GetApiKeysResponse } from '@/features/keys/types'
import { api } from '@/lib/api'

import { VIDEO_PLAYGROUND_ENDPOINTS } from './constants'
import {
  extractServerErrorFromBody,
  extractUpstreamErrorMessage,
  VideoPlaygroundError,
} from './lib/errors'
import {
  isUsableVideoApiKey,
  pickDefaultVideoApiKey,
  toVideoApiKeyOption,
  type VideoApiKeyOption,
} from './lib/keys'
import { extractModelIds, filterPlaygroundVideoModels } from './lib/models'
import { parseVideoSubmitTaskId } from './lib/submit-response'
import { parseVideoTask } from './lib/task'
import { requestWithApiKey } from './lib/v1-client'
import type { VideoModelOption, VideoSubmitPayload, VideoTask } from './types'

export async function listUsableVideoApiKeys(): Promise<VideoApiKeyOption[]> {
  const pageSize = 100
  let page = 1
  let total = Number.POSITIVE_INFINITY
  const usable: VideoApiKeyOption[] = []

  while ((page - 1) * pageSize < total) {
    let result: GetApiKeysResponse
    try {
      const res = await api.get<GetApiKeysResponse>(
        `/api/token/?p=${page}&size=${pageSize}`,
        {
          skipErrorHandler: true,
          skipBusinessError: true,
        }
      )
      result = res.data
    } catch {
      throw new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Failed to load API keys',
      })
    }
    if (!result.success) {
      const message = result.message?.trim()
      if (message) {
        throw new VideoPlaygroundError({
          kind: 'upstream',
          rawMessage: message,
        })
      }
      throw new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Failed to load API keys',
      })
    }
    const items: ApiKey[] = result.data?.items ?? []
    total = result.data?.total ?? items.length
    usable.push(
      ...items
        .filter((item) => isUsableVideoApiKey(item))
        .map(toVideoApiKeyOption)
    )
    if (items.length === 0) {
      break
    }
    page += 1
  }

  return usable
}

export function defaultVideoApiKey(
  keys: VideoApiKeyOption[]
): VideoApiKeyOption | null {
  return pickDefaultVideoApiKey(keys)
}

export async function loadVideoApiSecret(
  id: number,
  signal?: AbortSignal
): Promise<string> {
  let result
  try {
    const res = await api.post(
      `/api/token/${id}/key`,
      {},
      {
        skipErrorHandler: true,
        skipBusinessError: true,
        signal,
      }
    )
    result = res.data
  } catch (error) {
    if (
      signal?.aborted ||
      axios.isCancel(error) ||
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'CanceledError'))
    ) {
      throw Object.assign(new Error('video-api-secret-cancelled'), {
        name: 'AbortError',
      })
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load API key',
    })
  }
  const raw = result.data?.key?.trim()
  if (!result.success || !raw) {
    const message = result.message?.trim()
    if (message) {
      throw new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: message,
      })
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load API key',
    })
  }
  return raw
}

export async function getVideoModelsWithApiKey(
  apiKey: string,
  language?: string,
  signal?: AbortSignal
): Promise<VideoModelOption[]> {
  const payload = await requestWithApiKey({
    path: VIDEO_PLAYGROUND_ENDPOINTS.V1_MODELS,
    method: 'GET',
    apiKey,
    language,
    signal,
    fallbackErrorKey: 'Failed to load video models',
  })
  return filterPlaygroundVideoModels(extractModelIds(payload))
}

export async function submitVideoGenerationWithApiKey(
  apiKey: string,
  payload: VideoSubmitPayload,
  language?: string,
  signal?: AbortSignal
): Promise<{ id?: string; task_id?: string }> {
  const body = {
    model: payload.model,
    prompt: payload.prompt,
  }
  const response = await requestWithApiKey({
    path: VIDEO_PLAYGROUND_ENDPOINTS.V1_GENERATIONS,
    method: 'POST',
    apiKey,
    body,
    language,
    signal,
    fallbackErrorKey: 'Video generation failed',
  })
  const bodyMessage = extractServerErrorFromBody(response)
  if (bodyMessage) {
    throw new VideoPlaygroundError({
      kind: 'upstream',
      rawMessage: bodyMessage,
    })
  }
  try {
    const taskId = parseVideoSubmitTaskId(response)
    return { task_id: taskId, id: taskId }
  } catch {
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Video generation failed',
    })
  }
}

export async function getVideoTask(taskId: string): Promise<VideoTask> {
  let res
  try {
    res = await api.get(`${VIDEO_PLAYGROUND_ENDPOINTS.TASK}/${taskId}`, {
      skipErrorHandler: true,
      skipBusinessError: true,
    })
  } catch (error) {
    const message = extractUpstreamErrorMessage(error)
    if (message) {
      throw new VideoPlaygroundError({ kind: 'upstream', rawMessage: message })
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load video status',
    })
  }
  try {
    return parseVideoTask(res.data)
  } catch {
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Failed to load video status',
    })
  }
}

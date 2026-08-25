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
  getVideoModelCapabilityOrThrow,
  resolveVideoCapabilities,
  type VideoRatio,
  type VideoResolution,
} from './capabilities'
import { findModeEntry } from './contract'
import type { CreationMode } from './mode'
import type {
  VideoAudioResource,
  VideoImageResource,
  VideoVideoResource,
} from './resource-validation'

/**
 * Build the JSON body sent to POST /v1/video/generations.
 *
 * Phase D contract:
 *  - Top-level `model` is ALWAYS the Vancine public model id.
 *  - Top-level `prompt` is the user prompt. The Go `doubao` adaptor
 *    auto-appends it as a `text` content item, so the frontend must
 *    NOT include its own text content item.
 *  - Fixed duration writes the integer seconds to BOTH the top-level
 *    `duration` (used by the standard /v1/videos schema validation
 *    and the existing per-second billing math) AND
 *    `metadata.duration` (consumed by the current doubao adaptor).
 *    Intelligent duration omits duration in BOTH places — we never
 *    emit -1 or any other "auto" sentinel.
 *  - `metadata.content` uses the official type/role vocabulary
 *    documented at https://docs.byteplus.com/en/docs/byteplus_las/video_gen_enhanced.
 *  - No `mode` field is invented for videoEdit / videoExtend. The
 *    intent is conveyed solely through the official content/role
 *    protocol and the user prompt.
 */

export type DurationMode = 'fixed' | 'intelligent'

export type VideoRequestInput = {
  model: string
  prompt: string
  mode: CreationMode
  images: ReadonlyArray<VideoImageResource>
  videos: ReadonlyArray<VideoVideoResource>
  audios: ReadonlyArray<VideoAudioResource>
  durationMode: DurationMode
  durationSeconds: number
  ratio: VideoRatio
  resolution: VideoResolution
  generateAudio: boolean
  /** Random seed; null omits the field. */
  seed: number | null
  watermark: boolean
  returnLastFrame: boolean
}

export type VideoRequestBody = {
  model: string
  prompt: string
  duration?: number
  metadata?: {
    content?: Array<VideoContentItem>
    ratio: VideoRatio
    resolution: VideoResolution
    generate_audio: boolean
    seed?: number
    watermark: boolean
    return_last_frame: boolean
    /**
     * Mirrored to the top-level `duration` so the doubao adaptor and
     * any future standard-schema adaptor can read it from either place.
     */
    duration?: number
  }
}

export type VideoContentItem =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image_url'
      image_url: { url: string }
      role: 'first_frame' | 'last_frame' | 'reference_image'
    }
  | {
      type: 'video_url'
      video_url: { url: string }
      role: 'reference_video'
    }
  | {
      type: 'audio_url'
      audio_url: { url: string }
      role: 'reference_audio'
    }

export class VideoRequestError extends Error {
  readonly reasonKey: string
  constructor(reasonKey: string, message?: string) {
    super(message ?? reasonKey)
    this.name = 'VideoRequestError'
    this.reasonKey = reasonKey
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return Math.round(value)
}

export function buildVideoGenerationRequest(
  input: VideoRequestInput
): VideoRequestBody {
  const capability = getVideoModelCapabilityOrThrow(input.model)

  const composition = {
    images: input.images.length,
    videos: input.videos.length,
    audios: input.audios.length,
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
  }
  const resolved = resolveVideoCapabilities(capability, input.mode, composition)
  if (resolved.illegal) {
    throw new VideoRequestError(
      'videoPlayground.error.compositionIllegal',
      resolved.illegalReason
    )
  }

  const content = buildContent(
    input.mode,
    input.images,
    input.videos,
    input.audios
  )

  const allowedResolutions = resolved.resolutions
  const finalResolution = allowedResolutions.includes(input.resolution)
    ? input.resolution
    : (allowedResolutions[0] as VideoResolution | undefined)

  if (!finalResolution) {
    throw new VideoRequestError('videoPlayground.error.noResolutionAvailable')
  }

  // Fixed duration: emit seconds in BOTH top-level and metadata.
  // Intelligent duration: omit duration in BOTH places.
  const durationValue =
    input.durationMode === 'intelligent'
      ? undefined
      : clampInt(
          input.durationSeconds,
          resolved.duration.minSeconds,
          resolved.duration.maxSeconds
        )

  const body: VideoRequestBody = {
    model: input.model,
    prompt: input.prompt.trim(),
  }
  if (durationValue !== undefined) {
    body.duration = durationValue
  }

  const metadata: NonNullable<VideoRequestBody['metadata']> = {
    ratio: input.ratio,
    resolution: finalResolution,
    generate_audio: input.generateAudio,
    watermark: input.watermark,
    return_last_frame: input.returnLastFrame,
  }
  if (durationValue !== undefined) {
    metadata.duration = durationValue
  }
  if (input.seed !== null) {
    metadata.seed = input.seed
  }
  if (content.length > 0) {
    metadata.content = content
  }
  body.metadata = metadata
  return body
}

function buildContent(
  mode: CreationMode,
  images: ReadonlyArray<VideoImageResource>,
  videos: ReadonlyArray<VideoVideoResource>,
  audios: ReadonlyArray<VideoAudioResource>
): VideoContentItem[] {
  const items = findModeEntry(mode).resolveContent({
    images,
    videos,
    audios,
  })
  const out: VideoContentItem[] = []
  for (const item of items) {
    if (item.image) {
      out.push({
        type: 'image_url',
        image_url: { url: readImageUrl(item.image) },
        role: item.role as 'first_frame' | 'last_frame' | 'reference_image',
      })
    } else if (item.video) {
      const url =
        item.video.source.kind === 'asset'
          ? `asset://${item.video.source.assetId}`
          : item.video.source.url
      out.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      })
    } else if (item.audio) {
      out.push({
        type: 'audio_url',
        audio_url: { url: readAudioUrl(item.audio) },
        role: 'reference_audio',
      })
    }
  }
  return out
}

function readImageUrl(image: VideoImageResource): string {
  return image.source.kind === 'base64'
    ? image.source.dataUrl
    : image.source.url
}

function readAudioUrl(audio: VideoAudioResource): string {
  return audio.source.kind === 'base64'
    ? audio.source.dataUrl
    : audio.source.url
}

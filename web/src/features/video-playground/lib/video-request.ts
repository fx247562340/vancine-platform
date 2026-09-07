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
import {
  PROVIDER_DEFAULT,
  type DurationFieldValue,
  type ResolutionFieldValue,
} from './composer-schema'
import {
  availableResolutions,
  type VideoModelCapability,
  type VideoWireContract,
} from './model-capabilities'
import type { VideoImageResource } from './resource-validation'

/**
 * The exact bodies POST /v1/video/generations may receive from this page.
 *
 * The route is the platform's legacy task route: Go decodes the request into
 * `relaycommon.TaskSubmitReq` and hands the plugin the re-serialized projection
 * of that struct, so only `prompt`, `model`, `mode`, `image`, `images`, `size`,
 * `duration`, `seconds`, `input_reference` and `metadata` survive. `metadata` is
 * the sole arbitrary passthrough, and each provider's task plugin reads duration,
 * resolution and reference images from a different slot inside that projection:
 *
 *   - Alibaba (Wan3): duration from the top-level int `duration`, resolution
 *     from the top-level `size`, and reference images from `metadata.input.media`
 *     — which `convert()` merges verbatim into the DashScope `input` object.
 *     Top-level `image`/`images` are deliberately NOT sent: `firstImage()` would
 *     collapse them to a single `input.img_url`, i.e. first-frame semantics, and
 *     Wan3 rejects mixing `reference_image` with first/last-frame input.
 *   - Hailuo (MiniMax-H3): duration from the top-level int `duration`,
 *     resolution from `metadata.resolution` (exactly `768P` or `2K`), and
 *     reference images from `metadata.content` with `role: "reference_image"`.
 *     Top-level `images` are deliberately NOT sent: without `metadata.content`
 *     the plugin turns them into at most two frame images. `ratio` is omitted so
 *     the plugin applies its own documented default (`adaptive` with visual
 *     input, `16:9` for text only), which is what MiniMax requires per scenario.
 *   - Doubao (Seedance 2.x): duration from the top-level STRING `seconds` —
 *     Go types it as a string, so a JSON number is a 400 — resolution from
 *     `metadata.resolution` in the plugin's lowercase enum, and reference images
 *     from `metadata.content` with `role: "reference_image"`. The plugin appends
 *     the prompt as the single text item, so no text content is duplicated here.
 *
 * Nothing else is expressible: no ratio, generate_audio, audio, seed, watermark,
 * return_last_frame, frames, mode, batch count, reference video or audio, and no
 * edit/extend intent.
 */
export type VideoReferenceImageContent = {
  type: 'image_url'
  role: 'reference_image'
  image_url: { url: string }
}

export type Wan3ReferenceMedia = {
  type: 'reference_image'
  url: string
}

export type Wan3VideoRequestBody = {
  model: string
  prompt: string
  duration: number
  size: string
  metadata?: { input: { media: ReadonlyArray<Wan3ReferenceMedia> } }
}

export type HailuoH3VideoRequestBody = {
  model: string
  prompt: string
  duration: number
  metadata: {
    resolution: string
    content?: ReadonlyArray<VideoReferenceImageContent>
  }
}

export type SeedanceVideoRequestBody = {
  model: string
  prompt: string
  /** Go's `TaskSubmitReq.Seconds` is a string; a JSON number is rejected. */
  seconds: string
  metadata: {
    resolution: string
    content?: ReadonlyArray<VideoReferenceImageContent>
  }
}

/** A model Vancine holds no parameter evidence for: model plus prompt only. */
export type UnverifiedVideoRequestBody = {
  model: string
  prompt: string
}

export type VideoGenerationRequestBody =
  | Wan3VideoRequestBody
  | HailuoH3VideoRequestBody
  | SeedanceVideoRequestBody
  | UnverifiedVideoRequestBody

export type VideoRequestInput = {
  capability: VideoModelCapability
  prompt: string
  duration: DurationFieldValue
  resolution: ResolutionFieldValue
  images: ReadonlyArray<VideoImageResource>
}

/** i18n key for a serialized body over the model's documented budget. */
export const REQUEST_BODY_TOO_LARGE_KEY = 'videoPlayground.request.bodyTooLarge'

/** i18n key for a reference image attached to a model that accepts none. */
export const IMAGES_NOT_ACCEPTED_KEY =
  'videoPlayground.reference.modelDoesNotAcceptImages'

/** i18n key for more reference images than the model's cap. */
export const TOO_MANY_IMAGES_KEY = 'videoPlayground.reference.tooManyImages'

/**
 * A rejection the page shows inline above the generate button. `reasonKey` is
 * an i18n key; `interpolation` carries any placeholder the copy needs.
 */
export class VideoRequestError extends Error {
  readonly reasonKey: string
  readonly interpolation: Record<string, string | number> | undefined

  constructor(
    reasonKey: string,
    interpolation?: Record<string, string | number>
  ) {
    super(reasonKey)
    this.name = 'VideoRequestError'
    this.reasonKey = reasonKey
    this.interpolation = interpolation
  }
}

export function buildVideoGenerationRequest(
  input: VideoRequestInput
): VideoGenerationRequestBody {
  const capability = input.capability
  const prompt = input.prompt.trim()
  if (prompt === '') {
    throw new VideoRequestError('Prompt is required')
  }

  if (!capability.known || capability.wire === null) {
    // Refuse rather than drop: an unverified model must never receive a
    // silently truncated reference set.
    if (input.images.length > 0) {
      throw new VideoRequestError(IMAGES_NOT_ACCEPTED_KEY)
    }
    return { model: capability.modelId, prompt }
  }

  if (input.images.length > capability.maxReferenceImages) {
    throw new VideoRequestError(TOO_MANY_IMAGES_KEY, {
      max: capability.maxReferenceImages,
    })
  }

  const duration = legalDuration(capability, input.duration)
  const resolution = legalResolution(
    capability,
    input.resolution,
    input.images.length
  )
  const urls = input.images.map((image) =>
    image.source.kind === 'base64' ? image.source.dataUrl : image.source.url
  )

  const body = buildProviderBody(
    capability.wire,
    capability.modelId,
    prompt,
    duration,
    resolution,
    urls
  )
  const serializedBytes = new TextEncoder().encode(JSON.stringify(body)).length
  if (serializedBytes > capability.requestBodyLimitBytes) {
    throw new VideoRequestError(REQUEST_BODY_TOO_LARGE_KEY)
  }
  return body
}

/**
 * The one place that branches per provider wire contract. It switches on the
 * contract the capability table declares, never on a model id substring.
 */
function buildProviderBody(
  wire: VideoWireContract,
  modelId: string,
  prompt: string,
  duration: number,
  resolution: string,
  imageUrls: ReadonlyArray<string>
): VideoGenerationRequestBody {
  switch (wire) {
    case 'alibaba-wan3': {
      const body: Wan3VideoRequestBody = {
        model: modelId,
        prompt,
        duration,
        size: resolution,
      }
      if (imageUrls.length > 0) {
        body.metadata = {
          input: {
            media: imageUrls.map((url) => ({
              type: 'reference_image' as const,
              url,
            })),
          },
        }
      }
      return body
    }
    case 'hailuo-h3': {
      const body: HailuoH3VideoRequestBody = {
        model: modelId,
        prompt,
        duration,
        metadata: { resolution },
      }
      if (imageUrls.length > 0) {
        body.metadata.content = referenceImageContent(imageUrls)
      }
      return body
    }
    case 'doubao-seedance': {
      const body: SeedanceVideoRequestBody = {
        model: modelId,
        prompt,
        seconds: String(duration),
        metadata: { resolution },
      }
      if (imageUrls.length > 0) {
        body.metadata.content = referenceImageContent(imageUrls)
      }
      return body
    }
  }
}

function referenceImageContent(
  imageUrls: ReadonlyArray<string>
): ReadonlyArray<VideoReferenceImageContent> {
  return imageUrls.map((url) => ({
    type: 'image_url' as const,
    role: 'reference_image' as const,
    image_url: { url },
  }))
}

/**
 * Duration and resolution come only from dropdowns built out of the capability
 * table, so a value outside it is a page bug rather than a user error. These
 * guards fail loudly instead of silently correcting the request into something
 * the user never picked.
 */
function legalDuration(
  capability: VideoModelCapability,
  value: DurationFieldValue
): number {
  if (value !== PROVIDER_DEFAULT && capability.durations.includes(value)) {
    return value
  }
  throw new Error(
    `Duration ${String(value)} is not legal for ${capability.modelId}`
  )
}

function legalResolution(
  capability: VideoModelCapability,
  value: ResolutionFieldValue,
  referenceImageCount: number
): string {
  if (
    value !== PROVIDER_DEFAULT &&
    availableResolutions(capability, referenceImageCount).includes(value)
  ) {
    return value
  }
  throw new Error(
    `Resolution ${value} is not legal for ${capability.modelId} with ${referenceImageCount} reference images`
  )
}

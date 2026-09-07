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

/**
 * The single authoritative capability table for the video studio.
 *
 * Every number here is a Vancine product decision backed by the first-party
 * documentation of the provider that actually serves the model in production.
 * The selector, the form defaults, the reference-image validation and the
 * request serializer all read from this table, so no component ever branches
 * on a model id substring.
 *
 * Official sources, one per upstream contract:
 *   - Wan3 (wan3.0-video / wan3.0-video-prime), Alibaba Model Studio:
 *     https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference
 *       input.media[].type = reference_image, at most 10 images
 *       parameters.resolution = 480P | 720P | 1080P (default 1080P)
 *       parameters.duration = integer in [2, 30] (default 5)
 *   - MiniMax-H3, MiniMax platform video generation V2:
 *     https://platform.minimax.io/docs/api-reference/video-generation-v2-create
 *       resolution = 768P | 2K, duration = integer in [4, 15]
 *       content[].role = reference_image, upstream allows 9
 *       request body <= 64 MB
 *   - Doubao Seedance 2.x, Volcengine Ark / BytePlus LAS:
 *     https://docs.byteplus.com/en/docs/byteplus_las/video_gen_enhanced
 *     https://ark.volcengine.com/docs/82379/2301412
 *       Seedance 2.0: resolution 480p | 720p | 1080p | 4k, duration [4, 15],
 *                     1-9 reference images, 1080p rejected with reference images
 *       Seedance 2.5: resolution 480p | 720p | 1080p, duration [4, 30],
 *                     up to 30 reference images, no 4k
 *       request body <= 64 MB
 *
 * A model the server advertises as `openai-video` but that is absent from this
 * table resolves to `UNKNOWN_VIDEO_MODEL_CAPABILITY`: the page still lets the
 * user pick it and still submits, but only `model` and the trimmed prompt go on
 * the wire. Capabilities are never inferred from a model name.
 */

/** Which provider wire contract the serializer must speak for a model. */
export type VideoWireContract = 'alibaba-wan3' | 'hailuo-h3' | 'doubao-seedance'

export type VideoModelCapability = {
  /** Exact model id as returned by GET /v1/models; never rewritten. */
  modelId: string
  /** False only for the safe fallback, which sends model + prompt alone. */
  known: boolean
  /** Null for the safe fallback: there is no contract to serialize into. */
  wire: VideoWireContract | null
  /** Every legal duration in seconds, ascending. Empty for the fallback. */
  durations: ReadonlyArray<number>
  /**
   * Every legal resolution wire value, ascending, so the last entry is the
   * highest resolution the model supports. Empty for the fallback.
   */
  resolutions: ReadonlyArray<string>
  /**
   * Wire value -> what the user sees, for the few tiers whose vendor spelling
   * differs from the conventional one (Seedance `4k` shows as `4K`). A value
   * absent here is displayed verbatim.
   */
  resolutionLabels: Readonly<Record<string, string>>
  /** Hard cap on attached reference images. Zero for the fallback. */
  maxReferenceImages: number
  /**
   * Resolutions the vendor rejects once at least one reference image is
   * attached. The form converges to the highest remaining legal value so an
   * illegal combination can never reach the upstream.
   */
  resolutionsRejectedWithReferenceImages: ReadonlyArray<string>
  /** Serialized request body budget enforced before submit. */
  requestBodyLimitBytes: number
}

/**
 * Vancine-wide reference-image input rules. They are deliberately stricter
 * than every upstream's own limits, so one rule holds for all five models:
 * the accepted MIME types are the intersection of the Wan3, MiniMax-H3 and
 * Seedance image format lists, and 10 MB per image stays below the smallest
 * upstream per-image budget (Wan3 20 MB, MiniMax-H3 and Seedance 30 MB).
 */
export const REFERENCE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024

/** Every known model defaults to a five second clip. */
export const DEFAULT_VIDEO_DURATION_SECONDS = 5

const MB = 1024 * 1024

/**
 * Seedance and MiniMax-H3 both document a 64 MB request body cap, and base64
 * inflates the attached bytes by roughly a third.
 */
const DOCUMENTED_REQUEST_BODY_LIMIT_BYTES = 64 * MB

/**
 * Wan3 documents only a per-image budget, so its cap is the platform's own
 * HTTP request body limit (`MAX_REQUEST_BODY_MB`, default 128 MB in
 * `common/init.go`). A deployment that lowers that variable surfaces the
 * server's own rejection above the generate button instead.
 */
const PLATFORM_REQUEST_BODY_LIMIT_BYTES = 128 * MB

function everySecondFrom(min: number, max: number): number[] {
  const durations: number[] = []
  for (let seconds = min; seconds <= max; seconds += 1) {
    durations.push(seconds)
  }
  return durations
}

const WAN3_VIDEO: VideoModelCapability = {
  modelId: 'wan3.0-video',
  known: true,
  wire: 'alibaba-wan3',
  durations: everySecondFrom(2, 30),
  resolutions: ['480P', '720P', '1080P'],
  resolutionLabels: {},
  maxReferenceImages: 10,
  resolutionsRejectedWithReferenceImages: [],
  requestBodyLimitBytes: PLATFORM_REQUEST_BODY_LIMIT_BYTES,
}

const WAN3_VIDEO_PRIME: VideoModelCapability = {
  ...WAN3_VIDEO,
  modelId: 'wan3.0-video-prime',
}

const MINIMAX_H3: VideoModelCapability = {
  modelId: 'MiniMax-H3',
  known: true,
  wire: 'hailuo-h3',
  durations: everySecondFrom(4, 15),
  resolutions: ['768P', '2K'],
  resolutionLabels: {},
  // MiniMax-H3 prices billed input images separately above a small free tier,
  // so Vancine caps the tray at five even though the upstream accepts nine.
  maxReferenceImages: 5,
  resolutionsRejectedWithReferenceImages: [],
  requestBodyLimitBytes: DOCUMENTED_REQUEST_BODY_LIMIT_BYTES,
}

const SEEDANCE_2_0: VideoModelCapability = {
  modelId: 'Doubao-Seedance-2.0',
  known: true,
  wire: 'doubao-seedance',
  durations: everySecondFrom(4, 15),
  resolutions: ['480p', '720p', '1080p', '4k'],
  resolutionLabels: { '4k': '4K' },
  maxReferenceImages: 9,
  resolutionsRejectedWithReferenceImages: ['1080p'],
  requestBodyLimitBytes: DOCUMENTED_REQUEST_BODY_LIMIT_BYTES,
}

const SEEDANCE_2_5: VideoModelCapability = {
  modelId: 'Doubao-Seedance-2.5',
  known: true,
  wire: 'doubao-seedance',
  durations: everySecondFrom(4, 30),
  // Seedance 2.5 has no 4k tier at all: it must never appear in the selector
  // nor on the wire.
  resolutions: ['480p', '720p', '1080p'],
  resolutionLabels: {},
  maxReferenceImages: 30,
  resolutionsRejectedWithReferenceImages: [],
  requestBodyLimitBytes: DOCUMENTED_REQUEST_BODY_LIMIT_BYTES,
}

const CAPABILITY_REGISTRY: ReadonlyArray<VideoModelCapability> = [
  WAN3_VIDEO,
  WAN3_VIDEO_PRIME,
  MINIMAX_H3,
  SEEDANCE_2_0,
  SEEDANCE_2_5,
]

/**
 * The safe fallback for a video model this page holds no evidence for.
 *
 * It fabricates no duration range, no resolution tier and no reference-image
 * budget. Both selects therefore offer a single "Default" entry, the tray
 * accepts nothing, and the serializer emits `model` plus the trimmed prompt
 * only — the upstream task plugin owns every parameter.
 */
export const UNKNOWN_VIDEO_MODEL_CAPABILITY: Omit<
  VideoModelCapability,
  'modelId'
> = {
  known: false,
  wire: null,
  durations: [],
  resolutions: [],
  resolutionLabels: {},
  maxReferenceImages: 0,
  resolutionsRejectedWithReferenceImages: [],
  requestBodyLimitBytes: DOCUMENTED_REQUEST_BODY_LIMIT_BYTES,
}

/**
 * Resolve the capability for one dynamic model id.
 *
 * Lookup is by exact id: the server's spelling is authoritative, so neither
 * case nor punctuation is normalized here or anywhere else on the page.
 */
export function resolveVideoModelCapability(
  modelId: string
): VideoModelCapability {
  const known = CAPABILITY_REGISTRY.find((entry) => entry.modelId === modelId)
  if (known) {
    return known
  }
  return { ...UNKNOWN_VIDEO_MODEL_CAPABILITY, modelId }
}

/**
 * Resolutions the model accepts for the current reference-image state, still in
 * ascending order. An unknown model has none, which is how the form knows to
 * render the single "Default" entry.
 */
export function availableResolutions(
  capability: VideoModelCapability,
  referenceImageCount: number
): ReadonlyArray<string> {
  if (referenceImageCount === 0) {
    return capability.resolutions
  }
  return capability.resolutions.filter(
    (resolution) =>
      !capability.resolutionsRejectedWithReferenceImages.includes(resolution)
  )
}

/**
 * The highest resolution legal for the current reference-image state, or null
 * when the model has no resolution tier to offer.
 *
 * This is both the form default after a model or API key switch and the value
 * the form converges to when attaching a reference image makes the current
 * selection illegal.
 */
export function highestAvailableResolution(
  capability: VideoModelCapability,
  referenceImageCount: number
): string | null {
  const allowed = availableResolutions(capability, referenceImageCount)
  return allowed.at(-1) ?? null
}

/** The seconds a freshly selected model starts at. */
export function defaultDurationSeconds(
  capability: VideoModelCapability
): number | null {
  if (!capability.durations.includes(DEFAULT_VIDEO_DURATION_SECONDS)) {
    return null
  }
  return DEFAULT_VIDEO_DURATION_SECONDS
}

/**
 * What the user sees for one resolution wire value. Only tiers whose vendor
 * spelling differs from the conventional one carry an override.
 */
export function resolutionLabel(
  capability: VideoModelCapability,
  resolution: string
): string {
  return capability.resolutionLabels[resolution] ?? resolution
}

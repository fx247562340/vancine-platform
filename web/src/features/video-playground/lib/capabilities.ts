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
  PLAYGROUND_VIDEO_MODELS,
  type PlaygroundVideoModel,
} from '../constants'
import { findModeEntry } from './contract'
import type { CreationMode } from './mode'

/**
 * Capability matrix for Vancine's video playground models.
 *
 * This file is the ONLY place that knows per-model capabilities. UI
 * components, preflight, and request serializer all consume the
 * resolved capability instead of branching on the model id.
 *
 * Every numeric fact here is sourced from official first-party docs:
 *   - https://docs.byteplus.com/en/docs/byteplus_las/video_gen_enhanced
 *     (Seedance 2.x operator; both 2.0 and 2.5 video budgets)
 *   - https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5
 *     (Seedance 2.5 launch post; 2.5 multimodal reference budget)
 *   - https://docs.byteplus.com/en/docs/ModelArk/1520757
 *     (CreateContentsGenerationsTasks API reference; content/role vocabulary)
 *
 * `unknown` means the official documentation does not enumerate the
 * field for this model; we neither emit nor render it. We do NOT
 * back-fill unknowns by reading other models' defaults or by
 * guessing from third-party API mirrors.
 */

export type VideoResolution = '480p' | '720p' | '1080p' | '4k'
export type VideoRatio =
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'
  | '21:9'
  | 'adaptive'

export type VideoContentRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'

export type TriStateSupport<T = true> =
  | { supported: true; default?: T }
  | { supported: false }
  | { supported: 'unknown' }

export type ReferenceImageBudget = {
  multimodalMax: number
  perItemMaxBytes: number
  aspectRange: [number, number]
  sideRange: [number, number]
  supportedFormats: string[]
}

/**
 * A duration bound that is either a verified number or explicitly
 * unknown. Unknown MUST NOT be filled in from a related field
 * (output duration, a sibling modality, or another model).
 */
export type DurationBound = number | 'unknown'

export type EvidenceSemantics =
  | 'output-video'
  | 'input-reference-image'
  | 'input-reference-video'
  | 'input-reference-audio'

export type VerifiedEvidence = {
  status: 'verified'
  field: string
  model: PlaygroundVideoModel
  semantics: EvidenceSemantics
  sourceUrl: string
  excerpt: string
}

export type UnknownEvidence = {
  status: 'unknown'
  field: string
  model: PlaygroundVideoModel
  semantics: EvidenceSemantics
  reason: string
}

export type FieldEvidence = VerifiedEvidence | UnknownEvidence

export function isKnownBound(value: DurationBound): value is number {
  return typeof value === 'number'
}

export type ReferenceVideoBudget = {
  maxCount: number
  perItemMinSeconds: DurationBound
  perItemMaxSeconds: DurationBound
  totalMaxSeconds: DurationBound
  perItemMaxBytes: number
  supportedFormats: string[]
  /** INPUT reference-video FPS, never the output FPS. */
  fpsRange: [number, number]
  evidence: {
    maxCount: FieldEvidence
    perItemMinSeconds: FieldEvidence
    perItemMaxSeconds: FieldEvidence
    totalMaxSeconds: FieldEvidence
    perItemMaxBytes: FieldEvidence
    fpsRange: FieldEvidence
  }
}

export type ReferenceAudioBudget = {
  maxCount: number
  perItemMinSeconds: DurationBound
  perItemMaxSeconds: DurationBound
  totalMaxSeconds: DurationBound
  perItemMaxBytes: number
  supportedFormats: string[]
  audioOnlyAllowed: boolean
  evidence: {
    maxCount: FieldEvidence
    perItemMinSeconds: FieldEvidence
    perItemMaxSeconds: FieldEvidence
    totalMaxSeconds: FieldEvidence
    perItemMaxBytes: FieldEvidence
    audioOnlyAllowed: FieldEvidence
  }
}

export type ResolutionRule = {
  resolution: VideoResolution
  when: (composition: ResourceComposition) => boolean
  allow: boolean
  reasonKey: string
}

export type VideoCapability = {
  publicModelId: PlaygroundVideoModel
  officialModelId: string
  officialSources: string[]
  verifiedAt: string
  generationModes: ReadonlyArray<string>
  contentRoles: {
    firstFrame: 'first_frame'
    lastFrame: 'last_frame'
    referenceImage: 'reference_image'
    referenceVideo: 'reference_video'
    referenceAudio: 'reference_audio'
  }
  referenceImage: ReferenceImageBudget
  referenceVideo: ReferenceVideoBudget
  referenceAudio: ReferenceAudioBudget
  resolutions: ReadonlyArray<VideoResolution>
  resolutionRestrictions: ReadonlyArray<ResolutionRule>
  duration: { minSeconds: number; maxSeconds: number }
  ratios: ReadonlyArray<VideoRatio>
  generateAudio: { supported: true; default: true }
  seed: { supported: true }
  watermark: { supported: true; default: false }
  returnLastFrame: { supported: true; default: false }
  frames: { supported: 'unknown' }
  cameraFixed: { supported: false } | { supported: 'unknown' }
  outputFormat: 'mp4'
  outputFps: 24
  requestBodyLimitBytes: number
  /**
   * Fields that exist in some Go adaptor structs but are NOT in the
   * official 2.x parameter table — we must never emit them. Distinct
   * from `unknownFields`, which are official fields whose per-model
   * applicability is not yet bound.
   */
  unsupportedFields: ReadonlyArray<string>
  /**
   * Official fields whose per-model applicability is not stated in the
   * public docs. Distinct from `unsupportedFields` — we will not emit
   * them by default, but they are NOT "unsupported" either.
   */
  unknownFields: ReadonlyArray<string>
  /**
   * Per-field evidence for OUTPUT video parameters. Input reference
   * budgets carry their own evidence objects. Output FPS is never
   * reused to prove input FPS, and output duration is never reused
   * to prove input reference duration.
   */
  evidence: {
    resolutions: FieldEvidence
    duration: FieldEvidence
    outputFps: FieldEvidence
  }
}

export type ResourceComposition = {
  images: number
  videos: number
  audios: number
  durationSeconds?: number
  resolution?: VideoResolution
}

export type CompositionKind =
  | 'textOnly'
  | 'firstFrame'
  | 'firstAndLastFrame'
  | 'imageReference'
  | 'videoReference'
  | 'imageAndAudio'
  | 'imageAndVideo'
  | 'videoAndAudio'
  | 'imageVideoAndAudio'
  | 'audioOnly'

export type ResolvedVideoCapability = {
  model: VideoCapability
  /** The explicit user-selected creation mode. */
  mode: CreationMode
  composition: CompositionKind
  /** The user-supplied or current resolution; not yet filtered. */
  requestedResolution: VideoResolution | undefined
  /** Resolutions actually allowed given model + composition. */
  resolutions: ReadonlyArray<VideoResolution>
  /** Duration range actually allowed given model + composition. */
  duration: { minSeconds: number; maxSeconds: number }
  /** Whether the current composition is rejected by the model. */
  illegal: boolean
  /** Human-readable i18n key for the rejection reason. */
  illegalReason: string | undefined
}

export const BYTEPLUS_VIDEO_GEN_ENHANCED =
  'https://docs.byteplus.com/en/docs/byteplus_las/video_gen_enhanced'
export const BYTEDANCE_SEEDANCE_25_LAUNCH =
  'https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5'

function verified(
  field: string,
  model: PlaygroundVideoModel,
  semantics: EvidenceSemantics,
  sourceUrl: string,
  excerpt: string
): VerifiedEvidence {
  return { status: 'verified', field, model, semantics, sourceUrl, excerpt }
}

function unknown(
  field: string,
  model: PlaygroundVideoModel,
  semantics: EvidenceSemantics,
  reason: string
): UnknownEvidence {
  return { status: 'unknown', field, model, semantics, reason }
}

const SEEDANCE_25_REFERENCE_VIDEO_DURATION_UNKNOWN =
  'BytePlus Input format: video states Seedance 2.0 single-video duration [2, 15] s, then a mislabeled line that reads "Seedance 2.0: Single audio duration [2, 30] s, up to 10 reference audio segments". That line cannot be used as Seedance 2.5 reference-video duration evidence. Seedance 2.5 output duration 4–30 seconds is an output-video parameter, not an input-reference-video bound. No other first-party source enumerates Seedance 2.5 per-item or total reference-video seconds.'

const MB = 1024 * 1024
const REQUEST_BODY_LIMIT_BYTES = 64 * MB

const COMBINED_REFERENCE_MODES = [
  'textToVideo',
  'firstFrame',
  'firstAndLastFrame',
  'multimodalReference',
  'videoEdit',
  'videoExtend',
  'audioVideoCoGen',
] as const

const BASE_RATIOS: ReadonlyArray<VideoRatio> = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
  'adaptive',
]

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const
const AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
] as const

// Fields that exist in some Go adaptor structs but are NOT in the
// official 2.x parameter table — we must never emit them. Distinct
// from `unknownFields` below, which are official fields whose per-model
// applicability is not yet bound.
const KNOWN_UNSUPPORTED_FIELDS = [
  'service_tier',
  'draft',
  'tools',
  'priority',
  'safety_identifier',
] as const

// Official fields whose per-model applicability is not stated in the
// public docs. We do not emit them by default, but they are not
// "unsupported" either. The Go adaptor can still accept them; we just
// do not surface them in the UI.
const KNOWN_UNKNOWN_FIELDS = [
  'execution_expires_after',
  // `frames` is mentioned as an alternative to `duration` in the
  // operator doc but the 2.x tutorials and the launch post do not
  // enumerate it. We treat it as `unknown` to avoid silently dropping
  // a duration the user actually asked for.
  'frames',
] as const

const SEEDANCE_2_0: VideoCapability = {
  publicModelId: 'Doubao-Seedance-2.0',
  officialModelId: 'dreamina-seedance-2-0-260128',
  officialSources: [BYTEPLUS_VIDEO_GEN_ENHANCED],
  verifiedAt: '2026-08-17',
  generationModes: COMBINED_REFERENCE_MODES,
  contentRoles: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame',
    referenceImage: 'reference_image',
    referenceVideo: 'reference_video',
    referenceAudio: 'reference_audio',
  },
  referenceImage: {
    multimodalMax: 9,
    perItemMaxBytes: 30 * MB,
    aspectRange: [0.4, 2.5],
    sideRange: [300, 6000],
    supportedFormats: [...IMAGE_MIME_TYPES],
  },
  referenceVideo: {
    maxCount: 3,
    perItemMinSeconds: 2,
    perItemMaxSeconds: 15,
    totalMaxSeconds: 15,
    perItemMaxBytes: 200 * MB,
    supportedFormats: [...VIDEO_MIME_TYPES],
    fpsRange: [24, 60],
    evidence: {
      maxCount: verified(
        'referenceVideo.maxCount',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Duration: Seedance 2.0: Single video duration [2, 15] s, up to 3 reference videos can be provided'
      ),
      perItemMinSeconds: verified(
        'referenceVideo.perItemMinSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Seedance 2.0: Single video duration [2, 15] s'
      ),
      perItemMaxSeconds: verified(
        'referenceVideo.perItemMaxSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Seedance 2.0: Single video duration [2, 15] s'
      ),
      totalMaxSeconds: verified(
        'referenceVideo.totalMaxSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — the total duration of all videos must not exceed 15 s'
      ),
      perItemMaxBytes: verified(
        'referenceVideo.perItemMaxBytes',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Size: Each video must not exceed 200 MB'
      ),
      fpsRange: verified(
        'referenceVideo.fpsRange',
        'Doubao-Seedance-2.0',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Frame rate (FPS): [24, 60]'
      ),
    },
  },
  referenceAudio: {
    maxCount: 3,
    perItemMinSeconds: 2,
    perItemMaxSeconds: 15,
    totalMaxSeconds: 15,
    perItemMaxBytes: 15 * MB,
    supportedFormats: [...AUDIO_MIME_TYPES],
    audioOnlyAllowed: false,
    evidence: {
      maxCount: verified(
        'referenceAudio.maxCount',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.0: Single audio duration [2, 15] s, up to 3 reference audio segments'
      ),
      perItemMinSeconds: verified(
        'referenceAudio.perItemMinSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.0: Single audio duration [2, 15] s'
      ),
      perItemMaxSeconds: verified(
        'referenceAudio.perItemMaxSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.0: Single audio duration [2, 15] s'
      ),
      totalMaxSeconds: verified(
        'referenceAudio.totalMaxSeconds',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — the total duration of all audio must not exceed 15 s'
      ),
      perItemMaxBytes: verified(
        'referenceAudio.perItemMaxBytes',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Size: Each audio file must not exceed 15 MB'
      ),
      audioOnlyAllowed: verified(
        'referenceAudio.audioOnlyAllowed',
        'Doubao-Seedance-2.0',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Other: Seedance 2.0 does not support inputting audio alone; at least one reference video or image must be included'
      ),
    },
  },
  resolutions: ['480p', '720p', '1080p', '4k'],
  resolutionRestrictions: [
    {
      resolution: '1080p',
      when: (composition) => composition.images > 0,
      allow: false,
      reasonKey:
        '1080p is not supported by Seedance 2.0 in reference image scenarios.',
    },
  ],
  duration: { minSeconds: 4, maxSeconds: 15 },
  ratios: BASE_RATIOS,
  generateAudio: { supported: true, default: true },
  seed: { supported: true },
  watermark: { supported: true, default: false },
  returnLastFrame: { supported: true, default: false },
  frames: { supported: 'unknown' },
  cameraFixed: { supported: false },
  outputFormat: 'mp4',
  outputFps: 24,
  requestBodyLimitBytes: REQUEST_BODY_LIMIT_BYTES,
  unsupportedFields: KNOWN_UNSUPPORTED_FIELDS,
  unknownFields: KNOWN_UNKNOWN_FIELDS,
  evidence: {
    resolutions: verified(
      'output.resolutions',
      'Doubao-Seedance-2.0',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-0-260128: Resolution: 480p, 720p, 1080p, 4k. Request parameter resolution: 1080p is not supported in reference image scenarios; 4k is supported only by Seedance 2.0.'
    ),
    duration: verified(
      'output.duration',
      'Doubao-Seedance-2.0',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-0-260128: Duration: 4–15 seconds'
    ),
    outputFps: verified(
      'output.fps',
      'Doubao-Seedance-2.0',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-0-260128: Frame rate: 24 fps'
    ),
  },
}

const SEEDANCE_2_5: VideoCapability = {
  publicModelId: 'Doubao-Seedance-2.5',
  officialModelId: 'dreamina-seedance-2-5-260628',
  // 2.5 video budget numbers are cited from BOTH the BytePlus LAS
  // operator page (model+resolutions list) and the ByteDance launch
  // post (multimodal reference budget) so a future reviewer can
  // verify any number without guessing.
  officialSources: [BYTEPLUS_VIDEO_GEN_ENHANCED, BYTEDANCE_SEEDANCE_25_LAUNCH],
  verifiedAt: '2026-08-17',
  generationModes: COMBINED_REFERENCE_MODES,
  contentRoles: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame',
    referenceImage: 'reference_image',
    referenceVideo: 'reference_video',
    referenceAudio: 'reference_audio',
  },
  referenceImage: {
    multimodalMax: 30,
    perItemMaxBytes: 30 * MB,
    aspectRange: [0.4, 2.5],
    sideRange: [300, 6000],
    supportedFormats: [...IMAGE_MIME_TYPES],
  },
  referenceVideo: {
    maxCount: 10,
    perItemMinSeconds: 'unknown',
    perItemMaxSeconds: 'unknown',
    totalMaxSeconds: 'unknown',
    perItemMaxBytes: 200 * MB,
    supportedFormats: [...VIDEO_MIME_TYPES],
    fpsRange: [24, 60],
    evidence: {
      maxCount: verified(
        'referenceVideo.maxCount',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        BYTEDANCE_SEEDANCE_25_LAUNCH,
        'Fully upgraded multimodal referencing: Users can now input up to 30 images, 10 video clips, and 10 audio clips as reference materials in a single pass.'
      ),
      perItemMinSeconds: unknown(
        'referenceVideo.perItemMinSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        SEEDANCE_25_REFERENCE_VIDEO_DURATION_UNKNOWN
      ),
      perItemMaxSeconds: unknown(
        'referenceVideo.perItemMaxSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        SEEDANCE_25_REFERENCE_VIDEO_DURATION_UNKNOWN
      ),
      totalMaxSeconds: unknown(
        'referenceVideo.totalMaxSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        SEEDANCE_25_REFERENCE_VIDEO_DURATION_UNKNOWN
      ),
      perItemMaxBytes: verified(
        'referenceVideo.perItemMaxBytes',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Size: Each video must not exceed 200 MB'
      ),
      fpsRange: verified(
        'referenceVideo.fpsRange',
        'Doubao-Seedance-2.5',
        'input-reference-video',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: video — Frame rate (FPS): [24, 60]'
      ),
    },
  },
  referenceAudio: {
    maxCount: 10,
    perItemMinSeconds: 2,
    perItemMaxSeconds: 30,
    totalMaxSeconds: 30,
    perItemMaxBytes: 15 * MB,
    supportedFormats: [...AUDIO_MIME_TYPES],
    audioOnlyAllowed: true,
    evidence: {
      maxCount: verified(
        'referenceAudio.maxCount',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEDANCE_SEEDANCE_25_LAUNCH,
        'Fully upgraded multimodal referencing: Users can now input up to 30 images, 10 video clips, and 10 audio clips as reference materials in a single pass.'
      ),
      perItemMinSeconds: verified(
        'referenceAudio.perItemMinSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.5: Single audio duration [2, 30] s, up to 10 reference audio segments'
      ),
      perItemMaxSeconds: verified(
        'referenceAudio.perItemMaxSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.5: Single audio duration [2, 30] s'
      ),
      totalMaxSeconds: verified(
        'referenceAudio.totalMaxSeconds',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Seedance 2.5: the total duration of all audio must not exceed 30 s'
      ),
      perItemMaxBytes: verified(
        'referenceAudio.perItemMaxBytes',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Size: Each audio file must not exceed 15 MB'
      ),
      audioOnlyAllowed: verified(
        'referenceAudio.audioOnlyAllowed',
        'Doubao-Seedance-2.5',
        'input-reference-audio',
        BYTEPLUS_VIDEO_GEN_ENHANCED,
        'Input format: audio — Other: Seedance 2.5 supports inputting audio alone as a reference for video generation'
      ),
    },
  },
  resolutions: ['480p', '720p'],
  resolutionRestrictions: [],
  duration: { minSeconds: 4, maxSeconds: 30 },
  ratios: BASE_RATIOS,
  generateAudio: { supported: true, default: true },
  seed: { supported: true },
  watermark: { supported: true, default: false },
  returnLastFrame: { supported: true, default: false },
  frames: { supported: 'unknown' },
  cameraFixed: { supported: 'unknown' },
  outputFormat: 'mp4',
  outputFps: 24,
  requestBodyLimitBytes: REQUEST_BODY_LIMIT_BYTES,
  unsupportedFields: KNOWN_UNSUPPORTED_FIELDS,
  unknownFields: KNOWN_UNKNOWN_FIELDS,
  evidence: {
    resolutions: verified(
      'output.resolutions',
      'Doubao-Seedance-2.5',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-5-260628: Resolution: 480p, 720p'
    ),
    duration: verified(
      'output.duration',
      'Doubao-Seedance-2.5',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-5-260628: Duration: 4–30 seconds'
    ),
    outputFps: verified(
      'output.fps',
      'Doubao-Seedance-2.5',
      'output-video',
      BYTEPLUS_VIDEO_GEN_ENHANCED,
      'Output requirements — dreamina-seedance-2-5-260628: Frame rate: 24 fps'
    ),
  },
}

const CAPABILITY_REGISTRY: Record<PlaygroundVideoModel, VideoCapability> = {
  'Doubao-Seedance-2.0': SEEDANCE_2_0,
  'Doubao-Seedance-2.5': SEEDANCE_2_5,
}

export const PLAYGROUND_VIDEO_MODEL_IDS = [...PLAYGROUND_VIDEO_MODELS]

export function getVideoModelCapability(
  publicModelId: string
): VideoCapability | undefined {
  return CAPABILITY_REGISTRY[publicModelId as PlaygroundVideoModel]
}

export function getVideoModelCapabilityOrThrow(
  publicModelId: string
): VideoCapability {
  const cap = getVideoModelCapability(publicModelId)
  if (!cap) {
    throw new Error(
      `Unknown video model id: ${publicModelId}. Known ids: ${PLAYGROUND_VIDEO_MODEL_IDS.join(
        ', '
      )}`
    )
  }
  return cap
}

export function classifyComposition(
  composition: ResourceComposition
): CompositionKind {
  const { images, videos, audios } = composition
  if (images === 0 && videos === 0 && audios === 0) return 'textOnly'
  if (images === 1 && videos === 0 && audios === 0) return 'firstFrame'
  if (images === 2 && videos === 0 && audios === 0) return 'firstAndLastFrame'
  if (images >= 1 && videos === 0 && audios === 0) return 'imageReference'
  if (images === 0 && videos >= 1 && audios === 0) return 'videoReference'
  if (images >= 1 && videos === 0 && audios >= 1) return 'imageAndAudio'
  if (images >= 1 && videos >= 1 && audios === 0) return 'imageAndVideo'
  if (images === 0 && videos >= 1 && audios >= 1) return 'videoAndAudio'
  if (images >= 1 && videos >= 1 && audios >= 1) return 'imageVideoAndAudio'
  return 'audioOnly'
}

export function resolveVideoCapabilities(
  model: VideoCapability,
  mode: CreationMode,
  composition: ResourceComposition
): ResolvedVideoCapability {
  const compositionKind = classifyComposition(composition)
  const requestedResolution = composition.resolution
  const durationMax = model.duration.maxSeconds
  const durationMin = model.duration.minSeconds
  const resolutions = model.resolutions.filter((resolution) =>
    model.resolutionRestrictions.every(
      (rule) =>
        rule.resolution !== resolution || !rule.when(composition) || rule.allow
    )
  )

  let illegal = false
  let illegalReason: string | undefined

  const modeIllegal = findModeEntry(mode).isCompositionLegal({
    images: composition.images,
    videos: composition.videos,
    audios: composition.audios,
  })
  if (modeIllegal) {
    illegal = true
    illegalReason = modeIllegal
  }

  // Reference-budget enforcement (applies to every mode that uses
  // these resources, including firstFrame / firstAndLastFrame).
  if (!illegal && composition.images > model.referenceImage.multimodalMax) {
    illegal = true
    illegalReason = `Too many reference images for this model (max ${model.referenceImage.multimodalMax}).`
  } else if (!illegal && composition.videos > model.referenceVideo.maxCount) {
    illegal = true
    illegalReason = `Too many reference videos for this model (max ${model.referenceVideo.maxCount}).`
  } else if (!illegal && composition.audios > model.referenceAudio.maxCount) {
    illegal = true
    illegalReason = `Too many reference audio tracks for this model (max ${model.referenceAudio.maxCount}).`
  } else if (
    !illegal &&
    compositionKind === 'audioOnly' &&
    !model.referenceAudio.audioOnlyAllowed
  ) {
    illegal = true
    illegalReason =
      'This model does not accept audio-only references. Add at least one image or video.'
  }

  return {
    model,
    mode,
    composition: compositionKind,
    requestedResolution,
    resolutions,
    duration: { minSeconds: durationMin, maxSeconds: durationMax },
    illegal,
    illegalReason,
  }
}

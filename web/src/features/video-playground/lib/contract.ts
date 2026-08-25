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
 * The canonical model × mode × resource matrix.
 *
 * Every layer (capability resolver, UI popovers, preflight, request
 * serializer) reads from THIS matrix. Each row is the single source
 * of truth for:
 *  - whether a mode is legal under a given (model, composition)
 *  - the role each resource plays in the request content
 *  - whether the serializer should add a `mode` field (it never
 *    does for videoEdit / videoExtend — the intent is conveyed via
 *    content/role only)
 *  - which texts the UI shows when the user picks a mode
 *
 * Resources the user attached (and may have @-mentioned in the
 * prompt) are never silently dropped. An illegal extra resource
 * fails preflight with a translatable reason instead.
 */
import type { VideoCapability, VideoContentRole } from './capabilities'
import type { CreationMode } from './mode'
import type {
  VideoAudioResource,
  VideoImageResource,
  VideoVideoResource,
} from './resource-validation'

export type ModeMatrixEntry = {
  mode: CreationMode
  /** What the UI labels the mode (an i18n key). */
  labelKey: string
  /** Human-readable requirement that the UI shows next to the selector. */
  requirementKey: string
  /**
   * Whether this mode may be selected AT ALL. Hidden in the selector
   * rather than silently no-op when unsupported.
   */
  isModeSupportedFor: (model: VideoCapability) => boolean
  /**
   * Whether the current (model, composition) tuple is legal under
   * this mode. UI / preflight / serializer MUST consult this.
   */
  isCompositionLegal: (composition: {
    images: number | ReadonlyArray<unknown>
    videos: number | ReadonlyArray<unknown>
    audios: number | ReadonlyArray<unknown>
  }) => string | null
  /**
   * Map each resource to the content/role it occupies in the
   * outbound body. Returned in order. Empty array means
   * `metadata.content` is OMITTED from the body.
   */
  resolveContent: (resources: CompositionState) => Array<{
    role: VideoContentRole
    image?: VideoImageResource
    video?: VideoVideoResource
    audio?: VideoAudioResource
  }>
}

function countOf(value: number | ReadonlyArray<unknown>): number {
  return typeof value === 'number' ? value : value.length
}

export type CompositionState = {
  images: ReadonlyArray<VideoImageResource>
  videos: ReadonlyArray<VideoVideoResource>
  audios: ReadonlyArray<VideoAudioResource>
}

/**
 * Official multimodal reference content: images, then videos, then
 * audios. This matches @ImageN / @VideoN / @AudioN numbering.
 */
function referenceContent(composition: CompositionState) {
  const out: Array<{
    role: VideoContentRole
    image?: VideoImageResource
    video?: VideoVideoResource
    audio?: VideoAudioResource
  }> = []
  for (const image of composition.images) {
    out.push({ role: 'reference_image', image })
  }
  for (const video of composition.videos) {
    out.push({ role: 'reference_video', video })
  }
  for (const audio of composition.audios) {
    out.push({ role: 'reference_audio', audio })
  }
  return out
}

function extraNonImageReason(
  composition: {
    videos: number | ReadonlyArray<unknown>
    audios: number | ReadonlyArray<unknown>
  },
  reasonKey: string
): string | null {
  if (countOf(composition.videos) > 0 || countOf(composition.audios) > 0) {
    return reasonKey
  }
  return null
}

export const MODE_MATRIX: ReadonlyArray<ModeMatrixEntry> = [
  {
    mode: 'textToVideo',
    labelKey: 'mode.textToVideo',
    requirementKey: 'mode.requirement.textToVideo',
    isModeSupportedFor: () => true,
    isCompositionLegal: (composition) => {
      if (
        countOf(composition.images) > 0 ||
        countOf(composition.videos) > 0 ||
        countOf(composition.audios) > 0
      ) {
        return 'videoPlayground.preflight.textToVideoForbidsReferences'
      }
      return null
    },
    resolveContent: () => [],
  },
  {
    mode: 'firstFrame',
    labelKey: 'mode.firstFrame',
    requirementKey: 'mode.requirement.firstFrame',
    isModeSupportedFor: () => true,
    isCompositionLegal: (composition) => {
      if (countOf(composition.images) !== 1) {
        return 'videoPlayground.preflight.firstFrameRequiresOneImage'
      }
      // BytePlus Input format: image — "Image-to-video - first frame: 1 image".
      // Extra videos/audios are not part of that official combination.
      return extraNonImageReason(
        composition,
        'videoPlayground.preflight.firstFrameForbidsExtraResources'
      )
    },
    resolveContent: (composition) => {
      const image = composition.images[0]
      return image ? [{ role: 'first_frame', image }] : []
    },
  },
  {
    mode: 'firstAndLastFrame',
    labelKey: 'mode.firstAndLastFrame',
    requirementKey: 'mode.requirement.firstAndLastFrame',
    isModeSupportedFor: () => true,
    isCompositionLegal: (composition) => {
      if (countOf(composition.images) !== 2) {
        return 'videoPlayground.preflight.firstAndLastFrameRequiresTwoImages'
      }
      return extraNonImageReason(
        composition,
        'videoPlayground.preflight.firstAndLastFrameForbidsExtraResources'
      )
    },
    resolveContent: (composition) => {
      const first = composition.images[0]
      const last = composition.images[1]
      const out: Array<{ role: VideoContentRole; image?: VideoImageResource }> =
        []
      if (first) out.push({ role: 'first_frame', image: first })
      if (last) out.push({ role: 'last_frame', image: last })
      return out
    },
  },
  {
    mode: 'referenceGeneration',
    labelKey: 'mode.referenceGeneration',
    requirementKey: 'mode.requirement.referenceGeneration',
    isModeSupportedFor: () => true,
    isCompositionLegal: (composition) => {
      if (
        countOf(composition.images) === 0 &&
        countOf(composition.videos) === 0 &&
        countOf(composition.audios) === 0
      ) {
        return 'videoPlayground.preflight.referenceGenerationRequiresResource'
      }
      return null
    },
    resolveContent: referenceContent,
  },
  {
    mode: 'videoEdit',
    labelKey: 'mode.videoEdit',
    requirementKey: 'mode.requirement.videoEdit',
    // BytePlus Model capabilities: Edit video is ✅ for Seedance 2.5
    // AND Seedance 2.0 (and Fast/Mini). Official edit example uses
    // a reference image + reference video together.
    isModeSupportedFor: (model) => model.generationModes.includes('videoEdit'),
    isCompositionLegal: (composition) => {
      if (countOf(composition.videos) < 1) {
        return 'videoPlayground.preflight.editRequiresVideo'
      }
      return null
    },
    resolveContent: referenceContent,
  },
  {
    mode: 'videoExtend',
    labelKey: 'mode.videoExtend',
    requirementKey: 'mode.requirement.videoExtend',
    isModeSupportedFor: (model) =>
      model.generationModes.includes('videoExtend'),
    isCompositionLegal: (composition) => {
      if (countOf(composition.videos) < 1) {
        return 'videoPlayground.preflight.editRequiresVideo'
      }
      return null
    },
    resolveContent: referenceContent,
  },
]

export function findModeEntry(mode: CreationMode): ModeMatrixEntry {
  const entry = MODE_MATRIX.find((item) => item.mode === mode)
  if (!entry) {
    throw new Error(`Unknown mode: ${mode}`)
  }
  return entry
}

export function supportedModesFor(
  model: VideoCapability
): ReadonlyArray<CreationMode> {
  return MODE_MATRIX.filter((entry) => entry.isModeSupportedFor(model)).map(
    (entry) => entry.mode
  )
}

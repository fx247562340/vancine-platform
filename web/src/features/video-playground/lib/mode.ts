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
import type { VideoCapability } from './capabilities'

/**
 * Explicit creation modes.
 *
 * The Phase 2 workbench derived the mode from the number of images
 * ("if 1 image then firstFrame, else referenceGeneration"). That was
 * wrong: a user who wants 9 reference images would silently get the
 * multimodal-reference treatment, while a user who wants one explicit
 * first-frame could not opt out. Phase D makes the mode an explicit
 * user-selected intent. The serializer is the only place that turns
 * the mode into an official content/role payload.
 *
 * `videoEdit` and `videoExtend` are real Seedance 2.x capabilities
 * listed in the official capability table. We do NOT invent any
 * upstream-only "mode" field to express them; they are conveyed
 * purely through the official content/role protocol and a prompt
 * trigger word (handled by the user / model).
 */

export type CreationMode =
  | 'textToVideo'
  | 'firstFrame'
  | 'firstAndLastFrame'
  | 'referenceGeneration'
  | 'videoEdit'
  | 'videoExtend'

export const CREATION_MODES: ReadonlyArray<CreationMode> = [
  'textToVideo',
  'firstFrame',
  'firstAndLastFrame',
  'referenceGeneration',
  'videoEdit',
  'videoExtend',
]

export type ModeRequirement = {
  /** I18n key describing the resource requirements (shown in UI). */
  requirementKey: string
  /** Whether the mode is supported on the given model. */
  supported: boolean
}

export function modeRequirement(
  model: VideoCapability,
  mode: CreationMode
): ModeRequirement {
  // All Seedance 2.x models support every explicit mode in the
  // capability table; we still keep the hook so that future models
  // (e.g. 1.x with no reference-video support) can downgrade.
  void model
  switch (mode) {
    case 'textToVideo':
      return { requirementKey: 'mode.requirement.textToVideo', supported: true }
    case 'firstFrame':
      return {
        requirementKey: 'mode.requirement.firstFrame',
        supported: true,
      }
    case 'firstAndLastFrame':
      return {
        requirementKey: 'mode.requirement.firstAndLastFrame',
        supported: true,
      }
    case 'referenceGeneration':
      return {
        requirementKey: 'mode.requirement.referenceGeneration',
        supported: true,
      }
    case 'videoEdit':
      return { requirementKey: 'mode.requirement.videoEdit', supported: true }
    case 'videoExtend':
      return { requirementKey: 'mode.requirement.videoExtend', supported: true }
  }
}

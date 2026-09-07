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
import { z } from 'zod'

import {
  defaultDurationSeconds,
  highestAvailableResolution,
  type VideoModelCapability,
} from './model-capabilities'

/**
 * The sentinel both selects use for a model whose parameters Vancine cannot
 * substantiate. It never reaches the wire: the serializer omits duration and
 * resolution entirely for such a model.
 */
export const PROVIDER_DEFAULT = 'default' as const

export type ProviderDefault = typeof PROVIDER_DEFAULT

/** A legal dropdown choice: one real value, or the provider's own default. */
export type DurationFieldValue = number | ProviderDefault
export type ResolutionFieldValue = string | ProviderDefault

/**
 * The video studio's composer schema.
 *
 * It carries exactly the three things the user can type or pick, and it owns
 * the only user-triggerable validation on the page: a prompt that is empty
 * after trimming. Duration and resolution come solely from dropdowns built out
 * of the capability table, so there is no illegal-value error state to design
 * for them and no free-text entry to reject.
 */
export const videoComposerSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required'),
  duration: z.union([z.number().int().positive(), z.literal(PROVIDER_DEFAULT)]),
  resolution: z.union([z.string().min(1), z.literal(PROVIDER_DEFAULT)]),
})

export type VideoComposerValues = z.infer<typeof videoComposerSchema>

/**
 * What a freshly selected model starts at: an empty prompt, the five second
 * default and the highest resolution the model supports with no reference image
 * attached. An unverified model starts on the provider's own defaults for both.
 */
export function defaultComposerValues(
  capability: VideoModelCapability
): VideoComposerValues {
  if (!capability.known) {
    return {
      prompt: '',
      duration: PROVIDER_DEFAULT,
      resolution: PROVIDER_DEFAULT,
    }
  }
  return {
    prompt: '',
    duration: defaultDurationSeconds(capability) ?? PROVIDER_DEFAULT,
    resolution: highestAvailableResolution(capability, 0) ?? PROVIDER_DEFAULT,
  }
}

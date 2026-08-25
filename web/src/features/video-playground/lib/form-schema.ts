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

import type { VideoRatio, VideoResolution } from './capabilities'
import type { CreationMode } from './mode'

/**
 * The single source of truth for the composer form schema.
 *
 * The composer component renders this schema via react-hook-form
 * + zodResolver. Every per-field validation message comes from
 * here, so the UI never carries a duplicate Zod schema.
 */

export const CREATION_MODE_VALUES = [
  'textToVideo',
  'firstFrame',
  'firstAndLastFrame',
  'referenceGeneration',
  'videoEdit',
  'videoExtend',
] as const satisfies ReadonlyArray<CreationMode>

export const DURATION_MODES = ['fixed', 'intelligent'] as const
export type DurationMode = (typeof DURATION_MODES)[number]

export const VIDEO_RATIO_VALUES = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
  'adaptive',
] as const satisfies ReadonlyArray<VideoRatio>

export const VIDEO_RESOLUTION_VALUES = [
  '480p',
  '720p',
  '1080p',
  '4k',
] as const satisfies ReadonlyArray<VideoResolution>

const seedString = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^[0-9]+$/.test(value),
    'Seed must be a non-negative integer or empty.'
  )

export const videoFormSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required'),
  mode: z.enum(CREATION_MODE_VALUES),
  durationMode: z.enum(DURATION_MODES),
  durationSeconds: z
    .number()
    .int()
    .min(1, 'Duration must be at least 1 second.')
    .max(60, 'Duration must be at most 60 seconds.'),
  ratio: z.enum(VIDEO_RATIO_VALUES),
  resolution: z.enum(VIDEO_RESOLUTION_VALUES),
  generateAudio: z.boolean(),
  watermark: z.boolean(),
  returnLastFrame: z.boolean(),
  seed: seedString,
  batchCount: z
    .number()
    .int()
    .min(1, 'At least 1 task per batch.')
    .max(4, 'At most 4 tasks per batch.'),
})

export type VideoFormValues = z.infer<typeof videoFormSchema>

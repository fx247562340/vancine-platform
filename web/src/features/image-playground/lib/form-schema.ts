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

import type { ImageModelProfile } from '../types'
import { customSizeError, isPresetSize } from './size'

export const PROMPT_EXTEND_MODES = ['direct', 'agent'] as const
export type PromptExtendMode = (typeof PROMPT_EXTEND_MODES)[number]

export const imageFormValuesSchema = z.object({
  prompt: z.string(),
  size: z.string(),
  sizeMode: z.enum(['preset', 'custom', 'auto']),
  customWidth: z.number().nullable(),
  customHeight: z.number().nullable(),
  n: z.number(),
  negativePrompt: z.string(),
  seed: z.number().nullable(),
  watermark: z.boolean(),
  promptExtend: z.boolean(),
  promptExtendMode: z.enum(PROMPT_EXTEND_MODES),
  thinkingMode: z.boolean(),
})

export type ImageFormValues = z.infer<typeof imageFormValuesSchema>

export function buildImageFormSchema(profile: ImageModelProfile | null) {
  return imageFormValuesSchema.superRefine((values, ctx) => {
    if (values.prompt.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Prompt is required',
        path: ['prompt'],
      })
    }
    if (!profile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a model',
        path: ['size'],
      })
      return
    }
    if (values.sizeMode === 'auto') {
      if (!profile.supportsAutoSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Auto size is not supported by this model',
          path: ['size'],
        })
      }
    } else if (values.sizeMode === 'custom') {
      if (!profile.supportsCustomSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Size is not supported',
          path: ['size'],
        })
      } else {
        const error = customSizeError(
          values.customWidth,
          values.customHeight,
          profile,
          false
        )
        if (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error,
            path: ['customWidth'],
          })
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error,
            path: ['customHeight'],
          })
        }
      }
    } else if (!isPresetSize(values.size, profile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Size is not supported',
        path: ['size'],
      })
    }
    if (values.n < profile.nRange.min || values.n > profile.nRange.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Number of images is out of range',
        path: ['n'],
      })
    }
    if (
      profile.supportsNegativePrompt &&
      profile.maxNegativePromptChars > 0 &&
      values.negativePrompt.length > profile.maxNegativePromptChars
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Negative prompt is too long',
        path: ['negativePrompt'],
      })
    }
    if (profile.supportsSeed && values.seed !== null && profile.seedRange) {
      if (
        values.seed < profile.seedRange.min ||
        values.seed > profile.seedRange.max
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seed is out of range',
          path: ['seed'],
        })
      }
    }
    if (
      profile.thinkingRequiresExtend &&
      values.thinkingMode &&
      !values.promptExtend
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enable thinking requires prompt extend',
        path: ['thinkingMode'],
      })
    }
  })
}

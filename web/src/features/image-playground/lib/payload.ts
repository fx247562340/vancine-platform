import type {
  ImageGenerationParams,
  ImageModelProfile,
  ReferenceImage,
} from '../types'
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
import { resolvedImageSize } from './size'

export type ImageGenerationPayload = {
  model: string
  group: string
  prompt: string
  n: number
  size?: string
  response_format: 'url'
  image?: string | string[]
  negative_prompt?: string
  seed?: number
  watermark?: boolean
  prompt_extend?: boolean
  prompt_extend_mode?: string
  thinking_mode?: boolean
}

export function buildImageGenerationPayload(input: {
  model: string
  group: string
  prompt: string
  params: ImageGenerationParams
  profile: ImageModelProfile
  references: ReferenceImage[]
}): ImageGenerationPayload {
  const payload: ImageGenerationPayload = {
    model: input.model,
    group: input.group,
    prompt: input.prompt,
    n: input.params.n,
    response_format: 'url',
  }

  if (input.params.sizeMode !== 'auto') {
    payload.size = resolvedImageSize(input.params)
  }

  if (input.profile.maxReferenceImages > 0 && input.references.length > 0) {
    const urls = input.references
      .map((image) => image.dataUrl.trim())
      .filter((url) => url !== '')
    if (urls.length > 0) {
      payload.image = urls.length === 1 ? urls[0] : urls
    }
  }

  if (input.profile.supportsNegativePrompt && input.params.negativePrompt) {
    payload.negative_prompt = input.params.negativePrompt
  }
  if (input.profile.supportsSeed && input.params.seed !== null) {
    payload.seed = input.params.seed
  }
  if (input.profile.supportsWatermark) {
    payload.watermark = input.params.watermark
  }
  if (input.profile.supportsPromptExtend) {
    payload.prompt_extend = input.params.promptExtend
  }
  if (input.profile.supportsPromptExtendMode) {
    payload.prompt_extend_mode = input.params.promptExtendMode
  }
  if (input.profile.supportsThinkingMode) {
    payload.thinking_mode = input.params.thinkingMode
  }

  return payload
}

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
import type { ImageGenerationParams, ImageModelProfile } from '../types'
import { isCustomSizeValid, isPresetSize } from './size'

export function paramsFromProfile(
  profile: ImageModelProfile
): ImageGenerationParams {
  return {
    size: profile.defaultSize,
    sizeMode:
      profile.supportsAutoSize && profile.defaultSize === 'Auto'
        ? 'auto'
        : 'preset',
    customWidth: null,
    customHeight: null,
    n: profile.nRange.default,
    negativePrompt: '',
    seed: null,
    watermark: profile.defaultWatermark ?? false,
    promptExtend: profile.defaultPromptExtend ?? false,
    promptExtendMode: profile.defaultPromptExtendMode ?? 'direct',
    thinkingMode: profile.defaultThinkingMode ?? false,
  }
}

export function resetParamsForProfile(
  current: ImageGenerationParams,
  profile: ImageModelProfile
): ImageGenerationParams {
  const next = paramsFromProfile(profile)
  if (current.sizeMode === 'auto' && profile.supportsAutoSize) {
    next.sizeMode = 'auto'
    next.size = profile.defaultSize
  } else if (current.sizeMode === 'custom' && profile.supportsCustomSize) {
    if (
      isCustomSizeValid(
        current.customWidth,
        current.customHeight,
        profile,
        false
      )
    ) {
      next.sizeMode = 'custom'
      next.customWidth = current.customWidth
      next.customHeight = current.customHeight
    }
  } else if (isPresetSize(current.size, profile)) {
    next.size = current.size
    next.sizeMode = 'preset'
  }
  if (current.n >= profile.nRange.min && current.n <= profile.nRange.max) {
    next.n = current.n
  }
  if (profile.supportsNegativePrompt) {
    next.negativePrompt = current.negativePrompt
  }
  if (profile.supportsSeed) {
    next.seed = current.seed
  }
  if (profile.supportsWatermark) {
    next.watermark = current.watermark
  }
  if (profile.supportsPromptExtend) {
    next.promptExtend = current.promptExtend
  }
  if (profile.supportsPromptExtendMode) {
    next.promptExtendMode = current.promptExtendMode
  } else {
    next.promptExtendMode = 'direct'
  }
  if (profile.supportsThinkingMode) {
    next.thinkingMode = current.thinkingMode
  }
  return next
}

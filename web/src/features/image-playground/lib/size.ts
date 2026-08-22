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
import type {
  AspectRatio,
  ImageGenerationParams,
  ImageModelProfile,
} from '../types'

const MAX_SAFE_DIMENSION = 100_000

export function parseWidthHeight(
  size: string
): { width: number; height: number } | null {
  if (!/^\d+x\d+$/.test(size)) return null
  const separator = size.indexOf('x')
  const width = Number(size.slice(0, separator))
  const height = Number(size.slice(separator + 1))
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

export function multiplyPixels(width: number, height: number): number | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_SAFE_DIMENSION ||
    height > MAX_SAFE_DIMENSION
  ) {
    return null
  }
  const pixels = width * height
  if (!Number.isSafeInteger(pixels)) return null
  return pixels
}

export function isPresetSize(
  size: string,
  profile: ImageModelProfile
): boolean {
  return profile.sizes.includes(size)
}

export function customSizeError(
  width: number | null,
  height: number | null,
  profile: ImageModelProfile,
  hasRefs: boolean
): string | null {
  if (width === null || height === null) {
    return 'Enter a valid custom size'
  }
  const pixels = multiplyPixels(width, height)
  if (pixels === null) {
    return 'Enter a valid custom size'
  }
  if (profile.minPixels && pixels < profile.minPixels) {
    return 'Custom size is below the minimum pixel count'
  }
  let maxPixels = profile.maxPixels
  if (hasRefs && profile.maxPixelsWithRefs && profile.maxPixelsWithRefs > 0) {
    maxPixels = profile.maxPixelsWithRefs
  }
  if (maxPixels && pixels > maxPixels) {
    return 'Custom size exceeds the maximum pixel count'
  }
  if (
    profile.minAspectRatio &&
    !aspectAtLeast(width, height, profile.minAspectRatio)
  ) {
    return 'Custom size aspect ratio is out of range'
  }
  if (
    profile.maxAspectRatio &&
    !aspectAtMost(width, height, profile.maxAspectRatio)
  ) {
    return 'Custom size aspect ratio is out of range'
  }
  return null
}

export function isCustomSizeValid(
  width: number | null,
  height: number | null,
  profile: ImageModelProfile,
  hasRefs: boolean
): boolean {
  return customSizeError(width, height, profile, hasRefs) === null
}

export function resolvedImageSize(params: ImageGenerationParams): string {
  if (params.sizeMode === 'custom') {
    return `${params.customWidth}x${params.customHeight}`
  }
  // Auto and any preset (including the "Auto" preset) is sent verbatim;
  // the backend Ali converter drops the size field when the value is "Auto".
  return params.size
}

function aspectAtLeast(
  width: number,
  height: number,
  min: AspectRatio
): boolean {
  return width * min.height >= height * min.width
}

function aspectAtMost(
  width: number,
  height: number,
  max: AspectRatio
): boolean {
  return width * max.height <= height * max.width
}

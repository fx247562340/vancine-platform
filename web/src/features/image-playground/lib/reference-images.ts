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
  DEFAULT_REFERENCE_MIME_TYPES,
  MAX_SINGLE_REFERENCE_BYTES,
  MAX_TOTAL_REFERENCE_BYTES,
} from '../constants'
import type { ImageModelProfile, ReferenceImage } from '../types'

const PREVIEWABLE_REFERENCE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
])

function normalizeReferenceMime(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/jpg') return 'image/jpeg'
  return normalized
}

export function allowedReferenceMimeTypes(
  profile: ImageModelProfile
): string[] {
  if (
    profile.allowedReferenceMimeTypes &&
    profile.allowedReferenceMimeTypes.length > 0
  ) {
    return profile.allowedReferenceMimeTypes
  }
  return [...DEFAULT_REFERENCE_MIME_TYPES]
}

export function isAcceptedReferenceMimeType(
  mimeType: string,
  profile: ImageModelProfile
): boolean {
  const normalized = normalizeReferenceMime(mimeType)
  return allowedReferenceMimeTypes(profile).some(
    (allowed) => normalizeReferenceMime(allowed) === normalized
  )
}

export function referenceFileAccept(profile: ImageModelProfile): string {
  const mimes = allowedReferenceMimeTypes(profile)
  const extras: string[] = []
  if (mimes.includes('image/tiff')) extras.push('.tif', '.tiff')
  if (mimes.includes('image/bmp')) extras.push('.bmp')
  return [...mimes, ...extras].join(',')
}

export function referenceMimeErrorMessage(profile: ImageModelProfile): string {
  const mimes = allowedReferenceMimeTypes(profile)
  if (
    mimes.includes('image/tiff') ||
    mimes.includes('image/bmp') ||
    mimes.includes('image/gif')
  ) {
    return 'Reference images must be JPEG, PNG, BMP, TIFF, WebP, or GIF'
  }
  return 'Reference images must be PNG, JPEG, or WebP'
}

export function canPreviewReferenceMime(mimeType: string): boolean {
  return PREVIEWABLE_REFERENCE_MIMES.has(normalizeReferenceMime(mimeType))
}

export function validateReferenceFile(
  file: File,
  profile: ImageModelProfile,
  currentCount: number,
  currentTotalBytes = 0
): string | null {
  if (profile.maxReferenceImages <= 0) {
    return 'This model does not support reference images'
  }
  if (currentCount >= profile.maxReferenceImages) {
    return 'Too many reference images'
  }
  if (!isAcceptedReferenceMimeType(file.type, profile)) {
    return referenceMimeErrorMessage(profile)
  }
  if (file.size > MAX_SINGLE_REFERENCE_BYTES) {
    return 'Reference image exceeds the 10 MB limit'
  }
  if (currentTotalBytes + file.size > MAX_TOTAL_REFERENCE_BYTES) {
    return 'Total reference images exceed the 30 MB limit'
  }
  return null
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read image'))
    })
    reader.addEventListener('error', () =>
      reject(new Error('Failed to read image'))
    )
    reader.readAsDataURL(file)
  })
}

export function createReferenceImage(
  file: File,
  dataUrl: string
): ReferenceImage {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    mimeType: file.type,
    dataUrl,
    size: file.size,
  }
}

import type { GeneratedImage, ParsedImage } from '../types'
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
import { decodeRenderableBase64, imageSrc, isUsableHttpUrl } from './results'

export type DownloadImageResult =
  | { ok: true }
  | { ok: false; openedWindow: boolean }

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/png') return 'png'
  return 'img'
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadDecodedBase64(
  image: ParsedImage | GeneratedImage,
  index: number
): DownloadImageResult | null {
  const b64 = image.b64Json
  if (b64 == null || b64.length === 0) return null
  // Full atob happens only when the user clicks download.
  const decoded = decodeRenderableBase64(b64)
  if (decoded === null) return null
  try {
    const blob = new Blob([decoded.bytes as BlobPart], { type: decoded.mime })
    const objectUrl = URL.createObjectURL(blob)
    triggerDownload(
      objectUrl,
      `vancine-image-${index + 1}.${extensionForMime(decoded.mime)}`
    )
    URL.revokeObjectURL(objectUrl)
    return { ok: true }
  } catch {
    return null
  }
}

async function downloadRemoteImage(
  image: ParsedImage | GeneratedImage,
  index: number
): Promise<DownloadImageResult> {
  const src = imageSrc(image as GeneratedImage)
  if (src === '' || !isUsableHttpUrl(src)) {
    return { ok: false, openedWindow: false }
  }

  try {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error('download failed')
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const mime = blob.type || 'image/png'
    triggerDownload(
      objectUrl,
      `vancine-image-${index + 1}.${extensionForMime(mime)}`
    )
    URL.revokeObjectURL(objectUrl)
    return { ok: true }
  } catch {
    const opener =
      typeof globalThis.open === 'function' ? globalThis.open : undefined
    const opened = opener?.(src, '_blank', 'noopener') ?? null
    return { ok: false, openedWindow: opened !== null }
  }
}

export async function downloadGeneratedImage(
  image: ParsedImage | GeneratedImage,
  index: number
): Promise<DownloadImageResult> {
  try {
    const base64Result = downloadDecodedBase64(image, index)
    if (base64Result !== null) {
      return base64Result
    }
    return await downloadRemoteImage(image, index)
  } catch {
    return { ok: false, openedWindow: false }
  }
}

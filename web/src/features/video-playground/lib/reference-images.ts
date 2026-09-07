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
import {
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_MIME_TYPES,
  type VideoModelCapability,
} from './model-capabilities'
import type { VideoImageResource } from './resource-validation'

/**
 * The single intake gate for reference images.
 *
 * File picking, dragging and clipboard paste all funnel through here, so the
 * model cap, the MIME allowlist and the per-image byte budget are enforced
 * identically no matter how the bytes arrived. The gate is all-or-nothing: one
 * rejected file rejects the whole drop, because a partial add would leave the
 * user guessing which image the tray actually kept.
 *
 * Only real local image bytes are accepted. There is deliberately no URL path
 * here — an http(s) address, a `data:` string typed by hand, a `blob:` string
 * or a `file:` path is not a File and cannot enter this function at all.
 */
export type ReferenceImageRejection = {
  /** i18n key rendered inline inside the reference-image area. */
  reasonKey: string
  interpolation?: Record<string, string | number>
}

export type ReferenceImageIntake =
  | { ok: true; images: ReadonlyArray<VideoImageResource> }
  | { ok: false; rejection: ReferenceImageRejection }

const REJECTION_KEYS = {
  modelAcceptsNoImages: 'videoPlayground.reference.modelDoesNotAcceptImages',
  tooMany: 'videoPlayground.reference.tooManyImages',
  notAnImage: 'videoPlayground.reference.notAnImage',
  unsupportedFormat: 'videoPlayground.reference.unsupportedFormat',
  tooLarge: 'videoPlayground.reference.imageTooLarge',
  unreadable: 'videoPlayground.reference.readFailed',
} as const

export async function intakeReferenceImageFiles(
  capability: VideoModelCapability,
  currentCount: number,
  files: ReadonlyArray<File>
): Promise<ReferenceImageIntake> {
  if (files.length === 0) {
    return { ok: true, images: [] }
  }
  if (capability.maxReferenceImages === 0) {
    return {
      ok: false,
      rejection: { reasonKey: REJECTION_KEYS.modelAcceptsNoImages },
    }
  }
  const remaining = capability.maxReferenceImages - currentCount
  if (remaining <= 0 || files.length > remaining) {
    return {
      ok: false,
      rejection: {
        reasonKey: REJECTION_KEYS.tooMany,
        interpolation: { max: capability.maxReferenceImages },
      },
    }
  }

  const images: VideoImageResource[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return { ok: false, rejection: { reasonKey: REJECTION_KEYS.notAnImage } }
    }
    if (!isAcceptedImageMimeType(file.type)) {
      return {
        ok: false,
        rejection: { reasonKey: REJECTION_KEYS.unsupportedFormat },
      }
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      return { ok: false, rejection: { reasonKey: REJECTION_KEYS.tooLarge } }
    }
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      return { ok: false, rejection: { reasonKey: REJECTION_KEYS.unreadable } }
    }
    images.push({
      id: nextImageId(),
      kind: 'image',
      source: { kind: 'base64', dataUrl },
      name: file.name.trim() || file.type,
      mimeType: file.type,
      byteSize: file.size,
      // The local bytes stay reachable so a thumbnail object URL can be
      // re-created after the tray has revoked one, for example when a failed
      // task's settings are restored. It is never serialized or persisted.
      blob: file,
    })
  }
  return { ok: true, images }
}

/**
 * The Files a drop or clipboard payload carries.
 *
 * `DataTransfer.files` is the normal source; `items` is the fallback for the
 * browsers that expose a pasted image only as a file item.
 */
export function filesFromDataTransfer(
  dataTransfer: DataTransfer | null
): File[] {
  if (!dataTransfer) {
    return []
  }
  const files = [...dataTransfer.files]
  if (files.length > 0) {
    return files
  }
  const fromItems: File[] = []
  for (const item of dataTransfer.items ?? []) {
    if (item.kind !== 'file') {
      continue
    }
    const file = item.getAsFile()
    if (file) {
      fromItems.push(file)
    }
  }
  return fromItems
}

/**
 * Whether a clipboard payload carries image bytes at all.
 *
 * A text-only clipboard reports false, which is what keeps an ordinary text
 * paste inside the prompt textarea working untouched: the global paste listener
 * only calls `preventDefault` when this returns true.
 */
export function dataTransferHasImage(
  dataTransfer: DataTransfer | null
): boolean {
  return filesFromDataTransfer(dataTransfer).some((file) =>
    file.type.startsWith('image/')
  )
}

function isAcceptedImageMimeType(mimeType: string): boolean {
  return (REFERENCE_IMAGE_MIME_TYPES as ReadonlyArray<string>).includes(
    mimeType
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = reader.result
      if (typeof result !== 'string' || result === '') {
        reject(new Error('FileReader returned no data URL'))
        return
      }
      resolve(result)
    })
    reader.addEventListener('error', () =>
      reject(
        reader.error instanceof Error
          ? reader.error
          : new Error('FileReader failed')
      )
    )
    reader.readAsDataURL(file)
  })
}

function nextImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

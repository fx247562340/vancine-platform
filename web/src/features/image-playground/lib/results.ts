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

import type { GeneratedImage, ImageBase64Mime, ParsedImage } from '../types'

const aspectRatioSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

const capabilityProfileSchema = z.object({
  sizes: z.array(z.string()).min(1),
  defaultSize: z.string().min(1),
  supportsAutoSize: z.boolean().optional().default(false),
  supportsCustomSize: z.boolean().optional().default(false),
  nRange: z.object({
    min: z.number(),
    max: z.number(),
    default: z.number(),
  }),
  maxReferenceImages: z.number().int().nonnegative(),
  supportsNegativePrompt: z.boolean(),
  maxNegativePromptChars: z.number().int().nonnegative(),
  supportsSeed: z.boolean(),
  seedRange: z
    .object({
      min: z.number(),
      max: z.number(),
      default: z.number(),
    })
    .nullish(),
  supportsWatermark: z.boolean(),
  defaultWatermark: z.boolean().nullish(),
  supportsPromptExtend: z.boolean(),
  defaultPromptExtend: z.boolean().nullish(),
  supportsPromptExtendMode: z.boolean().optional().default(false),
  defaultPromptExtendMode: z
    .union([z.literal('direct'), z.literal('agent')])
    .nullish(),
  supportsThinkingMode: z.boolean(),
  defaultThinkingMode: z.boolean().nullish(),
  thinkingRequiresExtend: z.boolean().optional().default(false),
  agentRequiresNoRefs: z.boolean().optional().default(false),
  allowedReferenceMimeTypes: z.array(z.string()).optional(),
  minPixels: z.number().int().optional(),
  maxPixels: z.number().int().optional(),
  maxPixelsWithRefs: z.number().int().optional(),
  minAspectRatio: aspectRatioSchema.nullish(),
  maxAspectRatio: aspectRatioSchema.nullish(),
})

export const imageCapabilityResponseSchema = z.object({
  modality: z.literal('image'),
  group: z.string(),
  groups: z.array(z.string()),
  models: z.array(
    z.object({
      model: z.string().min(1),
      provider: z.string(),
      profile: capabilityProfileSchema,
    })
  ),
})

const generatedImageItemSchema = z.object({
  url: z.string().optional(),
  b64_json: z.string().optional(),
  revised_prompt: z.string().optional(),
})

export const imageGenerationResponseSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
  data: z.array(generatedImageItemSchema).optional(),
})

export function isUsableHttpUrl(raw: string): boolean {
  const value = raw.trim()
  if (value === '') return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.host !== ''
    )
  } catch {
    return false
  }
}

const IMAGE_PREFIX_LIMIT = 16
const HEADER_BYTE_LIMIT = 12

function isAsciiWhitespace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12
}

function isBase64Alphabet(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47
  )
}

function decodePrefixHeader(prefix: string): Uint8Array | null {
  if (prefix.length === 0) return null
  try {
    const binary = atob(prefix)
    const limit =
      binary.length < HEADER_BYTE_LIMIT ? binary.length : HEADER_BYTE_LIMIT
    const bytes = new Uint8Array(limit)
    for (let i = 0; i < limit; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

function mimeFromHeader(bytes: Uint8Array): ImageBase64Mime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export function inspectBase64Image(
  raw: string
): { mime: ImageBase64Mime } | null {
  if (raw.length === 0) return null
  let alphabetCount = 0
  let paddingCount = 0
  let seenPadding = false
  let prefix = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (isAsciiWhitespace(code)) continue
    if (code === 61) {
      seenPadding = true
      paddingCount++
      if (paddingCount > 2) return null
      continue
    }
    if (seenPadding || !isBase64Alphabet(code)) return null
    alphabetCount++
    if (prefix.length < IMAGE_PREFIX_LIMIT) {
      prefix += raw[i]
    }
  }
  if (alphabetCount === 0) return null
  if (paddingCount === 0) {
    if (alphabetCount % 4 === 1) return null
  } else if ((alphabetCount + paddingCount) % 4 !== 0) {
    return null
  }
  const header = decodePrefixHeader(prefix)
  if (header === null) return null
  const mime = mimeFromHeader(header)
  if (mime === null) return null
  return { mime }
}

function compactBase64ForDecode(raw: string): string {
  let compact = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (isAsciiWhitespace(code)) continue
    compact += raw[i]
  }
  return compact
}

export function decodeRenderableBase64(
  b64: string
): { bytes: Uint8Array; mime: ImageBase64Mime } | null {
  const inspected = inspectBase64Image(b64)
  if (inspected === null) return null
  try {
    const binary = atob(compactBase64ForDecode(b64))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    if (bytes.length === 0) return null
    return { bytes, mime: inspected.mime }
  } catch {
    return null
  }
}

export function imageSrc(image: GeneratedImage): string {
  const url = image.url?.trim() ?? ''
  if (isUsableHttpUrl(url)) return url
  const b64 = image.b64Json
  if (!b64) return ''
  const inspected = inspectBase64Image(b64)
  if (inspected === null) return ''
  return `data:${inspected.mime};base64,${b64}`
}

export function parsedImageSrc(image: ParsedImage): string {
  if (image.url) {
    const trimmed = image.url.trim()
    if (isUsableHttpUrl(trimmed)) return trimmed
  }
  if (image.renderable && image.b64Json && image.mime) {
    return `data:${image.mime};base64,${image.b64Json}`
  }
  return ''
}

export function isParsedImageRenderable(image: ParsedImage): boolean {
  const url = image.url?.trim() ?? ''
  if (url !== '') {
    return isUsableHttpUrl(url)
  }
  return Boolean(image.renderable && image.b64Json && image.mime)
}

export function parseGeneratedImages(body: unknown): GeneratedImage[] {
  const parsed = imageGenerationResponseSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error('No images were generated')
  }
  if (parsed.data.error?.message) {
    throw new Error(parsed.data.error.message)
  }
  const usable = (parsed.data.data ?? []).flatMap((item, index) => {
    const url = item.url?.trim() ?? ''
    const usableUrl = isUsableHttpUrl(url) ? url : undefined
    const inspected =
      item.b64_json !== undefined && item.b64_json !== ''
        ? inspectBase64Image(item.b64_json)
        : null
    if (!usableUrl && inspected === null) {
      return []
    }
    return [
      {
        resultId: `result-${index}`,
        url: usableUrl,
        b64Json: inspected ? item.b64_json : undefined,
        mime: inspected?.mime,
        renderable: true,
        revisedPrompt: item.revised_prompt,
      },
    ]
  })
  if (usable.length === 0) {
    throw new Error('No images were generated')
  }
  return usable
}

/**
 * parseImagesOnce maps already-inspected GeneratedImage records into
 * ParsedImage without a full atob. Header inspection runs only when mime
 * was not already set at the API boundary.
 */
export function parseImagesOnce(images: GeneratedImage[]): ParsedImage[] {
  const result: ParsedImage[] = []
  for (let i = 0; i < images.length; i++) {
    const image = images[i]
    const resultId = image.resultId ?? `result-${i}`
    const url = image.url?.trim() ?? ''
    const usableUrl = isUsableHttpUrl(url) ? url : undefined
    let mime = image.mime
    let renderable = image.renderable
    const b64Json = image.b64Json
    if (!usableUrl && b64Json && mime == null) {
      const inspected = inspectBase64Image(b64Json)
      if (!inspected) continue
      mime = inspected.mime
      renderable = true
    } else if (usableUrl) {
      renderable = true
    }
    if (!usableUrl && !b64Json) continue
    result.push({
      resultId,
      url: usableUrl,
      b64Json: usableUrl ? undefined : b64Json,
      mime: mime ?? 'image/png',
      revisedPrompt: image.revisedPrompt,
      renderable,
    })
  }
  return result
}

export function hasRenderableParsedImage(images: ParsedImage[]): boolean {
  for (const image of images) {
    if (isParsedImageRenderable(image)) return true
  }
  return false
}

export function visibleParsedImages(images: ParsedImage[]): ParsedImage[] {
  const result: ParsedImage[] = []
  for (const image of images) {
    if (isParsedImageRenderable(image)) result.push(image)
  }
  return result
}

export function hasTemporaryParsedImage(images: ParsedImage[]): boolean {
  for (const image of images) {
    if (image.b64Json != null && image.b64Json !== '' && !image.url) {
      return true
    }
  }
  return false
}

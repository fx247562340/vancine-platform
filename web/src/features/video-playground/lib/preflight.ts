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
import { isKnownBound, type VideoCapability } from './capabilities'
import { findModeEntry } from './contract'
import type { CreationMode } from './mode'
import type {
  VideoAudioResource,
  VideoImageResource,
  VideoVideoResource,
} from './resource-validation'

/**
 * Re-export the canonical resource types so callers can import
 * everything they need from a single module.
 */
export type { VideoImageResource, VideoAudioResource, VideoVideoResource }

/**
 * Phase D preflight.
 *
 * Two layers:
 *  1. Per-resource shape check: protocol, format, dimensions, single-item
 *     size, single-item duration, total duration per kind.
 *  2. Whole-body check: the 64MB request budget is computed from the
 *     FINAL JSON.stringify(body) UTF-8 byte length. URLs / asset ids
 *     are pointers, so they are NOT inlined. Base64 data URLs ARE
 *     inlined in the body, so their bytes already count via the
 *     JSON.stringify step — we do not add a separate ×1.34 on top.
 *
 * Unknown width / height / duration / fps on a remote resource is
 * preserved as `unknown`; the UI surfaces this honestly and lets
 * the upstream provider perform the final check. We never silently
 * coerce a missing measurement to 0 or pass a fabricated "valid"
 * value to the user.
 */

export type PreflightResult = ValidationOk | ValidationFail

export type ValidationOk = { ok: true; illegal: false }
export type ValidationFail = {
  ok: false
  illegal: true
  illegalReason: string
  detail?: string
}

const SAFE_REMOTE_PROTOCOLS: ReadonlyArray<string> = ['https:']
/**
 * Conservative frontend check, NOT an official regex.
 * BytePlus only documents the `asset://<ASSET_ID>` format and that
 * IDs come from the LAS asset-library allowlist. This pattern rejects
 * empty, path-like, and obviously unsafe ids before submit.
 */
const CONSERVATIVE_ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function isCanonicalAssetUrl(url: string): boolean {
  if (!url.startsWith('asset://')) return false
  const assetId = url.slice('asset://'.length)
  if (
    assetId.includes('/') ||
    assetId.includes('\\') ||
    assetId.includes('..')
  ) {
    return false
  }
  return CONSERVATIVE_ASSET_ID_RE.test(assetId)
}

function isPrivateIPv4(parts: number[]): boolean {
  const a = parts[0] ?? 0
  const b = parts[1] ?? 0
  if (a === 10) return true
  if (a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  if (a >= 224) return true
  return false
}

function ipv4FromMappedIPv6(hostname: string): number[] | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(hostname)
  if (dotted?.[1]) {
    return dotted[1].split('.').map(Number)
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname)
  if (!hex?.[1] || !hex[2]) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255]
}

function isPrivateOrLoopback(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (lower === 'localhost') return true
  if (lower === 'ip6-localhost' || lower === 'ip6-loopback') return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    return isPrivateIPv4(lower.split('.').map(Number))
  }
  if (!lower.includes(':')) return false
  if (lower === '::1' || lower === '::') return true
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true
  }
  // fec0::/10 site-local (fec0–feff).
  if (
    lower.startsWith('fec') ||
    lower.startsWith('fed') ||
    lower.startsWith('fee') ||
    lower.startsWith('fef')
  ) {
    return true
  }
  // ff00::/8 multicast.
  if (lower.startsWith('ff')) {
    return true
  }
  const mapped = ipv4FromMappedIPv6(lower)
  if (mapped) return isPrivateIPv4(mapped)
  return false
}

export function mediaMimeFromHttpsUrl(
  url: string,
  kind: 'image' | 'video' | 'audio'
): string | null {
  let pathname = ''
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return null
  }
  if (kind === 'image') {
    if (pathname.endsWith('.png')) return 'image/png'
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'image/jpeg'
    }
    if (pathname.endsWith('.webp')) return 'image/webp'
    if (pathname.endsWith('.bmp')) return 'image/bmp'
    if (pathname.endsWith('.tif') || pathname.endsWith('.tiff')) {
      return 'image/tiff'
    }
    if (pathname.endsWith('.gif')) return 'image/gif'
    if (pathname.endsWith('.heic')) return 'image/heic'
    if (pathname.endsWith('.heif')) return 'image/heif'
    return null
  }
  if (kind === 'video') {
    if (pathname.endsWith('.mp4')) return 'video/mp4'
    if (pathname.endsWith('.mov')) return 'video/quicktime'
    return null
  }
  if (pathname.endsWith('.wav')) return 'audio/wav'
  if (pathname.endsWith('.mp3')) return 'audio/mpeg'
  return null
}

/**
 * Validate a remote URL (https or asset://) for safety.
 *
 * Base64 data URLs are NOT URLs — they are an inlined payload —
 * so they take a separate path (`isValidBase64DataUrl`). A `data:`
 * URL fed through `new URL()` parses as an opaque URL and is NOT
 * something we want to enforce the same URL policy on.
 */
export function safeRemoteUrl(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('asset://')) return isCanonicalAssetUrl(trimmed)
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (!SAFE_REMOTE_PROTOCOLS.includes(parsed.protocol)) return false
  if (parsed.username || parsed.password) return false
  if (isPrivateOrLoopback(parsed.hostname)) return false
  return true
}

/**
 * Validate a base64 data URL for an image or audio inline payload.
 * `kind === 'image'` accepts image/* MIMEs only; `kind === 'audio'`
 * accepts audio/* MIMEs only. `kind === 'video'` is rejected
 * (videos must be referenced by URL or asset id — inlining a video
 * via base64 is not part of the Seedance 2.x protocol).
 */
const DATA_URL_HEADER_RE = /^data:([a-zA-Z0-9/+.:-]+);base64,([A-Za-z0-9+/=]+)$/
/** Standard Base64 alphabet only: A-Z a-z 0-9 + /. No URL-safe -/_. */
const BASE64_CHARS_RE = /^[A-Za-z0-9+/]+$/

export type ParsedBase64DataUrl = {
  /** MIME type from the data URL header (lowercased). */
  mime: string
  /** Decoded byte length of the payload. */
  decodedBytes: number
}

/**
 * Canonical strict base64 data URL parser.
 *
 * Returns both the MIME header and the decoded byte count, computed
 * from the payload itself — never from a caller-supplied `byteSize`.
 * Rejects empty payloads, internal / excess padding, characters after
 * padding, length % 4 === 1, whitespace, and URL-safe (-/_) variants.
 */
export function parseBase64DataUrl(
  dataUrl: string
): ParsedBase64DataUrl | null {
  const match = DATA_URL_HEADER_RE.exec(dataUrl)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const payload = match[2]
  const paddingMatch = /(=+)$/.exec(payload)
  const padding = paddingMatch?.[1].length ?? 0
  if (padding > 2) return null
  const body = paddingMatch ? payload.slice(0, -padding) : payload
  if (body.length === 0) return null
  if (!BASE64_CHARS_RE.test(body)) return null
  if (payload.length % 4 === 1) return null
  if (padding > 0 && payload.length % 4 !== 0) return null
  const decodedBytes = Math.floor((payload.length * 3) / 4) - padding
  return { mime, decodedBytes }
}

export function base64DecodedByteLength(dataUrl: string): number | null {
  return parseBase64DataUrl(dataUrl)?.decodedBytes ?? null
}

export function isValidBase64DataUrl(
  dataUrl: string,
  kind: 'image' | 'audio' | 'video'
): boolean {
  if (kind === 'video') return false
  const parsed = parseBase64DataUrl(dataUrl)
  if (!parsed) return false
  if (kind === 'image' && !parsed.mime.startsWith('image/')) return false
  if (kind === 'audio' && !parsed.mime.startsWith('audio/')) return false
  return true
}

function supportedFormatsFor(
  capability: VideoCapability,
  kind: 'image' | 'audio' | 'video'
): string[] {
  if (kind === 'image') return capability.referenceImage.supportedFormats
  if (kind === 'audio') return capability.referenceAudio.supportedFormats
  return capability.referenceVideo.supportedFormats
}

function pass(): PreflightResult {
  return { ok: true, illegal: false }
}
function fail(illegalReason: string, detail?: string): PreflightResult {
  return detail === undefined
    ? { ok: false, illegal: true, illegalReason }
    : { ok: false, illegal: true, illegalReason, detail }
}

function checkOne(
  resource:
    | (VideoImageResource & { kind: 'image' })
    | (VideoAudioResource & { kind: 'audio' })
    | (VideoVideoResource & { kind: 'video' }),
  capability: VideoCapability
): PreflightResult {
  // 1. URL safety — by source kind, not by a one-size-fits-all
  // `safeMediaUrl` that mishandles data: payloads.
  if (resource.source.kind === 'url') {
    if (!safeRemoteUrl(resource.source.url)) {
      return fail(
        'videoPlayground.preflight.unsafeUrl',
        `${resource.kind}#${resource.id}`
      )
    }
    // Independently derive the MIME from the URL pathname; never trust
    // a caller-supplied mimeType. Signed query strings are preserved.
    const derivedMime = mediaMimeFromHttpsUrl(
      resource.source.url,
      resource.kind
    )
    if (
      !derivedMime ||
      !supportedFormatsFor(capability, resource.kind).includes(derivedMime)
    ) {
      return fail(
        'videoPlayground.preflight.unsupportedFormat',
        `${resource.kind}#${resource.id}`
      )
    }
  } else if (resource.source.kind === 'base64') {
    if (!isValidBase64DataUrl(resource.source.dataUrl, resource.kind)) {
      return fail(
        'videoPlayground.preflight.unsafeUrl',
        `${resource.kind}#${resource.id}`
      )
    }
    const parsed = parseBase64DataUrl(resource.source.dataUrl)
    if (
      !parsed ||
      !supportedFormatsFor(capability, resource.kind).includes(parsed.mime)
    ) {
      return fail(
        'videoPlayground.preflight.unsupportedFormat',
        `${resource.kind}#${resource.id}`
      )
    }
    const decodedBytes = parsed.decodedBytes
    if (
      resource.kind === 'image' &&
      decodedBytes > capability.referenceImage.perItemMaxBytes
    ) {
      return fail(
        'videoPlayground.preflight.imageSizeTooLarge',
        `${decodedBytes} > ${capability.referenceImage.perItemMaxBytes}`
      )
    }
    if (
      resource.kind === 'audio' &&
      decodedBytes > capability.referenceAudio.perItemMaxBytes
    ) {
      return fail(
        'videoPlayground.preflight.audioSizeTooLarge',
        `${decodedBytes} > ${capability.referenceAudio.perItemMaxBytes}`
      )
    }
  } else if (resource.source.kind === 'asset') {
    if (resource.kind !== 'video') {
      return fail(
        'videoPlayground.preflight.unsafeUrl',
        `${resource.kind}#${resource.id} asset:// only allowed for video`
      )
    }
    if (!isCanonicalAssetUrl(`asset://${resource.source.assetId}`)) {
      return fail(
        'videoPlayground.preflight.unsafeUrl',
        `${resource.kind}#${resource.id}`
      )
    }
  }

  // 2. Per-kind budgets.
  if (resource.kind === 'image') {
    if (
      resource.source.kind !== 'base64' &&
      typeof resource.byteSize === 'number' &&
      resource.byteSize > capability.referenceImage.perItemMaxBytes
    ) {
      return fail(
        'videoPlayground.preflight.imageSizeTooLarge',
        `${resource.byteSize} > ${capability.referenceImage.perItemMaxBytes}`
      )
    }
    if (
      resource.source.kind === 'base64' &&
      (resource.width === undefined || resource.height === undefined)
    ) {
      return fail(
        'videoPlayground.preflight.imageDimensionsUnknown',
        `${resource.kind}#${resource.id}`
      )
    }
    if (resource.width !== undefined && resource.height !== undefined) {
      const [wMin, wMax] = capability.referenceImage.sideRange
      if (
        resource.width < wMin ||
        resource.width > wMax ||
        resource.height < wMin ||
        resource.height > wMax
      ) {
        return fail(
          'videoPlayground.preflight.imageDimensionsOutOfRange',
          `${resource.width}x${resource.height}`
        )
      }
      const aspect = resource.width / resource.height
      const [aMin, aMax] = capability.referenceImage.aspectRange
      if (aspect < aMin || aspect > aMax) {
        return fail(
          'videoPlayground.preflight.imageAspectOutOfRange',
          `${aspect}`
        )
      }
    }
    return pass()
  }
  if (resource.kind === 'audio') {
    if (
      resource.source.kind !== 'base64' &&
      typeof resource.byteSize === 'number' &&
      resource.byteSize > capability.referenceAudio.perItemMaxBytes
    ) {
      return fail(
        'videoPlayground.preflight.audioSizeTooLarge',
        `${resource.byteSize} > ${capability.referenceAudio.perItemMaxBytes}`
      )
    }
    if (
      resource.source.kind === 'base64' &&
      resource.durationSeconds === undefined
    ) {
      return fail(
        'videoPlayground.preflight.audioDurationUnknown',
        `${resource.kind}#${resource.id}`
      )
    }
    if (resource.durationSeconds !== undefined) {
      const minSeconds = capability.referenceAudio.perItemMinSeconds
      const maxSeconds = capability.referenceAudio.perItemMaxSeconds
      if (
        isKnownBound(minSeconds) &&
        isKnownBound(maxSeconds) &&
        (resource.durationSeconds < minSeconds ||
          resource.durationSeconds > maxSeconds)
      ) {
        return fail(
          'videoPlayground.preflight.audioDurationOutOfRange',
          `${resource.durationSeconds}s`
        )
      }
    }
    return pass()
  }
  // video (base64 never reaches here — isValidBase64DataUrl rejects video)
  if (
    typeof resource.byteSize === 'number' &&
    resource.byteSize > capability.referenceVideo.perItemMaxBytes
  ) {
    return fail(
      'videoPlayground.preflight.videoSizeTooLarge',
      `${resource.byteSize} > ${capability.referenceVideo.perItemMaxBytes}`
    )
  }
  if (resource.durationSeconds !== undefined) {
    const minSeconds = capability.referenceVideo.perItemMinSeconds
    const maxSeconds = capability.referenceVideo.perItemMaxSeconds
    if (
      isKnownBound(minSeconds) &&
      isKnownBound(maxSeconds) &&
      (resource.durationSeconds < minSeconds ||
        resource.durationSeconds > maxSeconds)
    ) {
      return fail(
        'videoPlayground.preflight.videoDurationOutOfRange',
        `${resource.durationSeconds}s`
      )
    }
  }
  return pass()
}

export function preflightResources(
  capability: VideoCapability,
  mode: CreationMode,
  resources: {
    images: VideoImageResource[]
    videos: VideoVideoResource[]
    audios: VideoAudioResource[]
  }
): PreflightResult {
  const modeIllegal = findModeEntry(mode).isCompositionLegal(resources)
  if (modeIllegal) {
    return fail(modeIllegal)
  }
  if (resources.images.length > capability.referenceImage.multimodalMax) {
    return fail('videoPlayground.preflight.tooManyImages')
  }
  if (resources.videos.length > capability.referenceVideo.maxCount) {
    return fail('videoPlayground.preflight.tooManyVideos')
  }
  if (resources.audios.length > capability.referenceAudio.maxCount) {
    return fail('videoPlayground.preflight.tooManyAudios')
  }

  for (const image of resources.images) {
    const r = checkOne({ ...image, kind: 'image' }, capability)
    if (!r.ok) return r
  }
  for (const video of resources.videos) {
    const r = checkOne({ ...video, kind: 'video' }, capability)
    if (!r.ok) return r
  }
  for (const audio of resources.audios) {
    const r = checkOne({ ...audio, kind: 'audio' }, capability)
    if (!r.ok) return r
  }

  // Total durations. Unknown durations are NOT coerced to 0 — that
  // would let a remote 200s clip pass a 30s total check. When any
  // item is unknown we skip the total check (the UI surfaces the
  // unknown state; upstream performs the final verification).
  // When every item is known, we enforce the official total.
  const knownVideos = resources.videos.filter(
    (v) => v.durationSeconds !== undefined
  )
  if (
    knownVideos.length === resources.videos.length &&
    resources.videos.length > 0
  ) {
    const totalVideoSeconds = knownVideos.reduce(
      (sum, v) => sum + (v.durationSeconds ?? 0),
      0
    )
    const videoTotalMax = capability.referenceVideo.totalMaxSeconds
    if (isKnownBound(videoTotalMax) && totalVideoSeconds > videoTotalMax) {
      return fail(
        'videoPlayground.preflight.totalVideoDurationExceeded',
        `${totalVideoSeconds}s > ${videoTotalMax}s`
      )
    }
  }
  const knownAudios = resources.audios.filter(
    (a) => a.durationSeconds !== undefined
  )
  if (
    knownAudios.length === resources.audios.length &&
    resources.audios.length > 0
  ) {
    const totalAudioSeconds = knownAudios.reduce(
      (sum, a) => sum + (a.durationSeconds ?? 0),
      0
    )
    const audioTotalMax = capability.referenceAudio.totalMaxSeconds
    if (isKnownBound(audioTotalMax) && totalAudioSeconds > audioTotalMax) {
      return fail(
        'videoPlayground.preflight.totalAudioDurationExceeded',
        `${totalAudioSeconds}s > ${audioTotalMax}s`
      )
    }
  }

  return pass()
}

/**
 * 64MB body budget.
 *
 * Counts ONLY what the wire actually carries: the final JSON body,
 * in UTF-8 bytes. The body already contains the Base64 inline
 * payload (since `content[].image_url.url` for a base64 source is
 * the full data URL), so the JSON.stringify byte length includes
 * the inlined bytes. We do NOT add a separate byteSize × 1.34 —
 * that would double-count. Remote URLs and asset ids are pointers
 * that do not contribute to the wire size beyond the URL string
 * itself, which is already in the JSON.
 */
export function preflightRequestBodySize(
  body: unknown,
  capability: VideoCapability
): PreflightResult {
  const serialized = JSON.stringify(body)
  const jsonBytes = byteLengthUtf8(serialized)
  if (jsonBytes > capability.requestBodyLimitBytes) {
    return fail(
      'videoPlayground.preflight.bodyTooLarge',
      `${jsonBytes} > ${capability.requestBodyLimitBytes}`
    )
  }
  return pass()
}

function byteLengthUtf8(s: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length
  }
  // Fallback: per the spec, each char's UTF-8 length.
  let n = 0
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i)
    if (code < 0x80) n += 1
    else if (code < 0x800) n += 2
    else if (code >= 0xd800 && code < 0xdc00) {
      n += 4
      i += 1
    } else n += 3
  }
  return n
}

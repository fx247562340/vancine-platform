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
/**
 * Canonical in-memory resource types. Validation lives in preflight.ts.
 * These types are NEVER persisted, NEVER cached in React Query as
 * full blobs, and NEVER placed in the DOM as raw base64.
 */

export type VideoResourceId = string

export type VideoImageResource = {
  id: VideoResourceId
  kind: 'image'
  source: { kind: 'url'; url: string } | { kind: 'base64'; dataUrl: string }
  name: string
  mimeType: string
  /** Measured local size only. Remote URL / asset leave this unset (unknown). */
  byteSize?: number
  width?: number
  height?: number
}

export type VideoAudioResource = {
  id: VideoResourceId
  kind: 'audio'
  source: { kind: 'url'; url: string } | { kind: 'base64'; dataUrl: string }
  name: string
  mimeType: string
  /** Measured local size only. Remote URL leave this unset (unknown). */
  byteSize?: number
  durationSeconds?: number
}

export type VideoVideoResource = {
  id: VideoResourceId
  kind: 'video'
  source: { kind: 'url'; url: string } | { kind: 'asset'; assetId: string }
  name: string
  mimeType: string
  /** Measured local size only. Remote URL / asset leave this unset (unknown). */
  byteSize?: number
  durationSeconds?: number
}

export type VideoResource =
  | VideoImageResource
  | VideoAudioResource
  | VideoVideoResource

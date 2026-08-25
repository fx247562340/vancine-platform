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
export type VideoModelOption = {
  label: string
  value: string
}

export type VideoSubmitMetadata = {
  content?: ReadonlyArray<{
    type: 'text' | 'image_url' | 'video_url' | 'audio_url'
    text?: string
    image_url?: { url: string }
    video_url?: { url: string }
    audio_url?: { url: string }
    role?:
      | 'first_frame'
      | 'last_frame'
      | 'reference_image'
      | 'reference_video'
      | 'reference_audio'
  }>
  ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9' | 'adaptive'
  resolution?: '480p' | '720p' | '1080p' | '4k'
  generate_audio?: boolean
  seed?: number
  watermark?: boolean
  return_last_frame?: boolean
  /**
   * Mirrored to the top-level `duration`. The doubao adaptor and
   * any future standard-schema adaptor read it from either place.
   */
  duration?: number
}

export type VideoSubmitPayload = {
  model: string
  prompt: string
  duration?: number
  metadata?: VideoSubmitMetadata
}

export type VideoTask = {
  task_id: string
  status: string
  result_url?: string
  fail_reason?: string
  data?: unknown
}

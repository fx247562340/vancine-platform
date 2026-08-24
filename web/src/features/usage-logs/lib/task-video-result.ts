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
 * Task video result helpers
 *
 * Resolves a directly playable video address from a task log. Playback,
 * open-in-new-tab and best-effort download use that address. Vancine
 * `/v1/videos/{task_id}/content` proxy addresses are never returned.
 */
import { TASK_ACTIONS } from '../constants'
import type { TaskLog } from '../types'

const VIDEO_PROXY_PATH_RE = /^\/v1\/videos\/[^/]+\/content\/?$/i
const DATA_VIDEO_PREFIX = 'data:video/'
const DATA_VIDEO_HEADER_MAX = 512
const DATA_VIDEO_HEADER_RE =
  /^data:video\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(?:;[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]*)*(?:;base64)?$/i

/** Cheap structural check: bounded header, legal video/<subtype>, optional key=value params, optional trailing ;base64, non-empty payload. Does not decode or scan the payload. */
function isDataVideoUrl(value: string): boolean {
  if (value.length < 14) return false
  if (
    value.slice(0, DATA_VIDEO_PREFIX.length).toLowerCase() !== DATA_VIDEO_PREFIX
  ) {
    return false
  }

  const searchLen = Math.min(value.length, DATA_VIDEO_HEADER_MAX + 1)
  let comma = -1
  for (let i = 0; i < searchLen; i++) {
    if (value.charCodeAt(i) === 44) {
      comma = i
      break
    }
  }
  if (comma < 0 || comma > DATA_VIDEO_HEADER_MAX) return false
  if (comma + 1 >= value.length) return false
  return DATA_VIDEO_HEADER_RE.test(value.slice(0, comma))
}

/** Parse a direct http(s) video address. One new URL(); rejects credentials and proxy paths. */
function parseDirectHttpUrl(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username !== '' || parsed.password !== '') return null
  if (VIDEO_PROXY_PATH_RE.test(parsed.pathname)) return null
  return value
}

function asDirectHttpVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  return parseDirectHttpUrl(value)
}

function asDirectVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (isDataVideoUrl(value)) return value
  return parseDirectHttpUrl(value)
}

function parseTaskDataObject(raw: unknown): Record<string, unknown> | null {
  let data: unknown = raw
  if (typeof data === 'string' && data !== '') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return null
}

export function isTaskVideoAction(action: string): boolean {
  return (
    action === TASK_ACTIONS.GENERATE ||
    action === TASK_ACTIONS.TEXT_GENERATE ||
    action === TASK_ACTIONS.FIRST_TAIL_GENERATE ||
    action === TASK_ACTIONS.REFERENCE_GENERATE ||
    action === TASK_ACTIONS.REMIX_GENERATE
  )
}

/**
 * Returns the first directly playable video address on the log, or null.
 * Priority: `result_url`, then a legacy HTTP(S) `fail_reason`, then
 * `data.content.video_url`. Proxy addresses are skipped, not returned.
 */
export function resolveTaskVideoResultUrl(log: TaskLog): string | null {
  const fromResultUrl = asDirectVideoUrl(log.result_url)
  if (fromResultUrl) return fromResultUrl

  const fromFailReason = asDirectHttpVideoUrl(log.fail_reason)
  if (fromFailReason) return fromFailReason

  const data = parseTaskDataObject(log.data)
  if (data) {
    const content = data.content
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      const videoUrl = (content as Record<string, unknown>).video_url
      const fromData = asDirectVideoUrl(videoUrl)
      if (fromData) return fromData
    }
  }
  return null
}

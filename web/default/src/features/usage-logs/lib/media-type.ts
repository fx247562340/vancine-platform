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
 * Media type detection for task logs.
 *
 * Video and 3D tasks share the same `generate` action (and platform), so
 * the Task ID subtitle cannot rely on the action alone. The media type is
 * inferred from `data.model` first, then from the result URLs.
 */
import type { TaskLog } from '../types'

export type TaskMediaType = '3d' | 'video'

// 3D generation model identifiers (Volcano seed3d, Hi3D hitem3d, Hyper3D...)
const THREE_D_MODEL_PATTERN = /seed3d|hitem3d|hyper3d|3d-gen|3d/i

// 3D asset file extensions (zip covers bundled model archives)
const THREE_D_FILE_EXT_PATTERN = /\.(glb|obj|fbx|gltf|stl|ply|zip)(\?|$)/i

// 3D hints carried in the URL path itself
const THREE_D_PATH_PATTERN = /seed3d|hitem3d|hyper3d|3d-gen/i

/**
 * Whether a result URL points to a 3D asset (extension or path based).
 */
export function is3dFileUrl(url: string): boolean {
  return THREE_D_FILE_EXT_PATTERN.test(url) || THREE_D_PATH_PATTERN.test(url)
}

function parseTaskData(data: unknown): unknown {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

function classifyRecord(record: unknown): TaskMediaType | null {
  if (!record || typeof record !== 'object') return null
  const rec = record as Record<string, unknown>

  // Result URLs nested under `content`
  if (rec.content && typeof rec.content === 'object') {
    const content = rec.content as Record<string, unknown>
    if (typeof content.video_url === 'string') return 'video'
    if (typeof content.model_url === 'string') return '3d'
    if (typeof content.file_url === 'string') {
      return is3dFileUrl(content.file_url) ? '3d' : 'video'
    }
  }

  // Flat or array-shaped payloads
  if (typeof rec.video_url === 'string') return 'video'
  if (typeof rec.model_url === 'string') return '3d'
  if (typeof rec.file_url === 'string') {
    return is3dFileUrl(rec.file_url) ? '3d' : 'video'
  }

  return null
}

/**
 * Infer the media type of a task log entry.
 *
 * Priority:
 * 1. `data.model` — a 3D model identifier wins; any other model string
 *    means video generation (task data carrying a model is media-gen).
 * 2. Result URLs — `video_url` → video; `model_url` / 3D `file_url` → 3d.
 * 3. No evidence → null (caller falls back to the action label).
 */
export function detectTaskMediaType(log: TaskLog): TaskMediaType | null {
  const parsed = parseTaskData(log.data)
  if (parsed == null) return null

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const type = classifyRecord(item)
      if (type) return type
    }
    return null
  }

  if (typeof parsed === 'object') {
    const model = (parsed as Record<string, unknown>).model
    if (typeof model === 'string' && model.trim() !== '') {
      return THREE_D_MODEL_PATTERN.test(model) ? '3d' : 'video'
    }
    return classifyRecord(parsed)
  }

  return null
}

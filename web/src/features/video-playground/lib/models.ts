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
import { PLAYGROUND_VIDEO_MODELS } from '../constants'
import type { VideoModelOption } from '../types'

const allowedModels = new Set<string>(PLAYGROUND_VIDEO_MODELS)

export function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {
    return []
  }
  return data.flatMap((item) => {
    if (typeof item === 'string') {
      return [item]
    }
    if (item && typeof item === 'object' && 'id' in item) {
      const id = (item as { id?: unknown }).id
      return typeof id === 'string' ? [id] : []
    }
    return []
  })
}

export function filterPlaygroundVideoModels(ids: string[]): VideoModelOption[] {
  return PLAYGROUND_VIDEO_MODELS.filter(
    (name) => allowedModels.has(name) && ids.includes(name)
  ).map((name) => ({ label: name, value: name }))
}

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
import { OPENAI_VIDEO_ENDPOINT_TYPE } from '../constants'
import type { VideoModelOption } from '../types'

/**
 * Parse a GET /v1/models payload into the video models this API key may use.
 *
 * Membership is decided ONLY by the server-declared
 * `supported_endpoint_types`: an entry is a video model when that array
 * contains the exact capability `openai-video`. Model-name keywords are never
 * inspected and no client-side model list is maintained, so the key's group,
 * model restriction and billing configuration — all already applied by the
 * server — stay the single source of truth for what the page may offer.
 *
 * Server order is preserved and a repeated id collapses to its first
 * occurrence, so the selector does not reshuffle between reloads. Malformed
 * entries are skipped rather than thrown on: a partial or unexpected payload
 * degrades to fewer options, never to a broken page.
 */
export function parseVideoModels(payload: unknown): VideoModelOption[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {
    return []
  }

  const options: VideoModelOption[] = []
  const seen = new Set<string>()
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const candidate = entry as {
      id?: unknown
      supported_endpoint_types?: unknown
    }
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
      continue
    }
    if (!Array.isArray(candidate.supported_endpoint_types)) {
      continue
    }
    const endpoints: ReadonlyArray<unknown> = candidate.supported_endpoint_types
    if (!endpoints.includes(OPENAI_VIDEO_ENDPOINT_TYPE)) {
      continue
    }
    if (seen.has(candidate.id)) {
      continue
    }
    seen.add(candidate.id)
    options.push({ label: candidate.id, value: candidate.id })
  }
  return options
}

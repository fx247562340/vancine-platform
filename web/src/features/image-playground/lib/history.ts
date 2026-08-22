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

import type { GeneratedImage, ImageGenerationRun } from '../types'
import { isUsableHttpUrl } from './results'

export const IMAGE_HISTORY_MAX_RUNS = 50

const HISTORY_STORAGE_VERSION = 1
const HISTORY_KEY_PREFIX = `vancine.image-playground.history.v${HISTORY_STORAGE_VERSION}`

export function imageHistoryStorageKey(userId: number): string {
  return `${HISTORY_KEY_PREFIX}.user.${userId}`
}

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function resolveStorage(): HistoryStorage | null {
  try {
    const storage = globalThis.localStorage
    if (
      storage == null ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

const persistedImageSchema = z.object({
  resultId: z.string().optional(),
  url: z.string(),
  revisedPrompt: z.string().optional(),
})

const persistedRunSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  model: z.string(),
  group: z.string(),
  provider: z.string(),
  prompt: z.string(),
  size: z.string(),
  n: z.number().int().nonnegative(),
  referenceCount: z.number().int().nonnegative(),
  images: z.array(persistedImageSchema),
})

const historyEnvelopeSchema = z.object({
  version: z.literal(HISTORY_STORAGE_VERSION),
  runs: z.array(z.unknown()),
})

export type PersistedImage = z.infer<typeof persistedImageSchema>
export type PersistedRun = z.infer<typeof persistedRunSchema>

/**
 * Build the persistable projection of a run. Base64 payloads (b64Json) are
 * removed here, before any serialization, so they can never reach storage.
 * Images without a usable http/https URL are dropped; a run left with no
 * images is not persisted at all.
 */
export function toPersistedRun(run: ImageGenerationRun): PersistedRun | null {
  const images: PersistedImage[] = []
  for (const image of run.images) {
    const url = image.url?.trim() ?? ''
    if (!isUsableHttpUrl(url)) continue
    images.push({
      resultId: image.resultId,
      url,
      revisedPrompt: image.revisedPrompt,
    })
  }
  if (images.length === 0) return null
  return {
    id: run.id,
    createdAt: run.createdAt,
    model: run.model,
    group: run.group,
    provider: run.provider,
    prompt: run.prompt,
    size: run.size,
    n: run.n,
    referenceCount: run.referenceCount,
    images,
  }
}

/**
 * Persist runs (already capped by the caller) for a specific user.
 * Failures (quota exceeded, storage unavailable) never throw.
 */
export function persistRuns(
  userId: number,
  runs: ImageGenerationRun[],
  storage: HistoryStorage | null = resolveStorage()
): void {
  if (storage === null) return
  const persisted = runs
    .slice(0, IMAGE_HISTORY_MAX_RUNS)
    .map(toPersistedRun)
    .filter((run): run is PersistedRun => run !== null)
  try {
    const payload = JSON.stringify({
      version: HISTORY_STORAGE_VERSION,
      runs: persisted,
    })
    storage.setItem(imageHistoryStorageKey(userId), payload)
  } catch {
    // Quota exceeded or storage broken: keep the in-memory history usable.
  }
}

/**
 * Restore persisted runs for a specific user. Corrupt payloads, unknown
 * versions, and individual invalid records are ignored (fail closed);
 * this function never throws and never returns more than the newest
 * IMAGE_HISTORY_MAX_RUNS records.
 */
export function loadRuns(
  userId: number,
  storage: HistoryStorage | null = resolveStorage()
): ImageGenerationRun[] {
  if (storage === null) return []
  let raw: string | null = null
  try {
    raw = storage.getItem(imageHistoryStorageKey(userId))
  } catch {
    return []
  }
  if (raw == null || raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const envelope = historyEnvelopeSchema.safeParse(parsed)
  if (!envelope.success) return []
  const restored: ImageGenerationRun[] = []
  for (const candidate of envelope.data.runs) {
    const run = persistedRunSchema.safeParse(candidate)
    if (!run.success) continue
    const images: GeneratedImage[] = []
    for (const image of run.data.images) {
      const url = image.url.trim()
      if (!isUsableHttpUrl(url)) continue
      images.push({
        resultId: image.resultId,
        url,
        revisedPrompt: image.revisedPrompt,
      })
    }
    if (images.length === 0) continue
    restored.push({ ...run.data, images })
  }
  restored.sort((a, b) => {
    const aTime = Date.parse(a.createdAt)
    const bTime = Date.parse(b.createdAt)
    if (Number.isNaN(aTime)) return 1
    if (Number.isNaN(bTime)) return -1
    return bTime - aTime
  })
  return restored.slice(0, IMAGE_HISTORY_MAX_RUNS)
}

/**
 * Remove the persisted history of a specific user. Only touches this
 * browser's localStorage key; never throws.
 */
export function clearRuns(
  userId: number,
  storage: HistoryStorage | null = resolveStorage()
): void {
  if (storage === null) return
  try {
    storage.removeItem(imageHistoryStorageKey(userId))
  } catch {
    // Storage unavailable: nothing to clean up.
  }
}

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
import type { DocsSlug, ModelSearchIndexEntry, SearchResult } from '../types'
import { ALL_MODEL_SLUGS, getModelEntry } from './model-registry'

/**
 * Build the model-detail search index for ONE docs locale.
 *
 * The title is the exact model id plus the LOCALIZED modality label
 * (never a hardcoded "image"/"video"); the body is the localized
 * summary plus language-neutral technical tokens (the model id, its
 * slug and the mode ids) so a user can find a page by either its
 * translated name or its wire identifiers.
 *
 * `t` is the same `useTranslation('docs', { useSuspense: false }).t`
 * the search box already holds, so the index always matches the
 * locale whose bundle is currently loaded.
 */
export function buildModelSearchIndex(
  t: (key: string, interp?: Record<string, unknown>) => string
): ModelSearchIndexEntry[] {
  const entries: ModelSearchIndexEntry[] = []
  for (const slug of ALL_MODEL_SLUGS) {
    const entry = getModelEntry(slug)
    if (!entry || entry.retired) continue
    const kindLabel = t(`modelDetail.kind.${entry.modality}`)
    const title = `${entry.modelId} — ${kindLabel}`
    const body = [
      entry.modelId,
      slug,
      t(entry.summaryKey),
      entry.modes.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
    entries.push({
      kind: 'model' as const,
      slug: entry.slug,
      title,
      titleLower: title.toLowerCase(),
      body,
      bodyLower: body.toLowerCase(),
    })
  }
  return entries
}

/** Navigate-target for one model index entry. */
export function modelEntryToResult(entry: ModelSearchIndexEntry): SearchResult {
  return {
    model: entry.slug,
    title: entry.title,
    snippet: '',
    score: 0,
  }
}

export type { DocsSlug }

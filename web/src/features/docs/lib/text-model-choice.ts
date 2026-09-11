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
import type { LiveModelCatalog } from '@/features/live-model-catalog/types'

import { DOCS_FALLBACK_TEXT_MODEL } from './example-generation'

/**
 * Shared text-model selection for the Docs pages that show one
 * copyable chat example (chat, quickstart, auth, agents, agent-detail).
 *
 * Single source: the live catalog's first text model. When the
 * catalog is unavailable, every page falls back to the SAME verified
 * model id so a docs example never pins a retired model and never
 * maintains a per-page "recommended list".
 */

export interface TextModelChoice {
  /** The example model id (catalog pick or verified fallback). */
  modelId: string
  /** True when the id came from the live catalog. */
  fromCatalog: boolean
}

export function pickDocsTextModel(catalog: LiveModelCatalog): TextModelChoice {
  const first = catalog.textModels[0]?.model_name
  if (catalog.status === 'ready' && first) {
    return { modelId: first, fromCatalog: true }
  }
  return { modelId: DOCS_FALLBACK_TEXT_MODEL, fromCatalog: false }
}

/** Up to four recommended text models for the Quick Start badges. */
export function pickRecommendedTextModels(
  catalog: LiveModelCatalog,
  max = 4
): ReadonlyArray<string> {
  if (catalog.status === 'ready' && catalog.textModels.length > 0) {
    return catalog.textModels.slice(0, max).map((model) => model.model_name)
  }
  return [DOCS_FALLBACK_TEXT_MODEL]
}

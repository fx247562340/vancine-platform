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
 * Public contract of the live model catalog. The catalog is a Vancine-owned
 * read-only projection of the live `/api/pricing` payload: it never invents
 * model ids, never overrides upstream ordering, and never exposes a
 * "latest" label that would imply a database created_time — the upstream
 * contract provides no such field.
 */

export type LiveModelCatalogStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface LiveModelSummary {
  /** Model identifier exactly as returned by `/api/pricing` (untrimmed). */
  model_name: string
  /** Vendor display name when present, empty string otherwise. */
  vendor_name: string
  /** Free-form description from the upstream payload, never synthesized. */
  description: string
  /** Normalized tag set (lowercased, trimmed) for downstream filtering. */
  tags: string[]
}

export interface LiveModelCatalog {
  status: LiveModelCatalogStatus
  textModels: LiveModelSummary[]
  imageModels: LiveModelSummary[]
  videoModels: LiveModelSummary[]
  /**
   * The example image model is the LAST element of the deduped,
   * endpoint-filtered image array — the spec's "倒序取第一个" rule. The
   * picker copies the input array before reversing it so the upstream
   * payload is never mutated. The label is intentionally "Example model",
   * never "latest" or "newest", because `/api/pricing` exposes no
   * created_time field.
   */
  exampleImageModel: LiveModelSummary | null
  /** Same rule, applied to the video array. */
  exampleVideoModel: LiveModelSummary | null
  /** Total count of catalog-eligible models (text + image + video). */
  totalCount: number
}

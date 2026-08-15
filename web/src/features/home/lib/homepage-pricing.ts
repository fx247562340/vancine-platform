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
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HomepagePricingModel {
  model_name: string
  description: string
  tags: string
  vendor_id?: number
  supported_endpoint_types: string[]
}

export interface HomepagePricingVendor {
  id?: number
  name?: string
}

export type HomepagePricingStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface HomepagePricingState {
  ok: boolean
  status: HomepagePricingStatus
  count: number | null
  models: HomepagePricingModel[]
  featured: HomepagePricingModel[]
  vendors: string[]
  rawVendors: HomepagePricingVendor[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAME_COLLATOR: Intl.CollatorOptions = { sensitivity: 'base' }

export const LOADING_STATE: HomepagePricingState = {
  ok: false,
  status: 'loading',
  count: null,
  models: [],
  featured: [],
  vendors: [],
  rawVendors: [],
}

export const ERROR_STATE: HomepagePricingState = {
  ok: false,
  status: 'error',
  count: null,
  models: [],
  featured: [],
  vendors: [],
  rawVendors: [],
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function sortByModelName(
  a: HomepagePricingModel,
  b: HomepagePricingModel
): number {
  return a.model_name.localeCompare(b.model_name, undefined, NAME_COLLATOR)
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Split tags on comma, trim, lowercase; returns list of normalised tokens.
 */
export function tagList(tags: string | undefined | null): string[] {
  if (!isNonEmptyString(tags)) return []
  return tags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Select the top 6 models for the Live model marketplace: case-insensitive
 * ascending by model_name, then slice to 6. No hardcoded allowlist.
 */
export function selectMarketplace(
  models: HomepagePricingModel[]
): HomepagePricingModel[] {
  if (!Array.isArray(models)) return []
  return [...models].sort(sortByModelName).slice(0, 6)
}

/**
 * Select up to 4 models whose tags contain the exact token "featured".
 * Sorted case-insensitive by model_name. No hardcoded allowlist.
 */
export function selectFeatured(
  models: HomepagePricingModel[]
): HomepagePricingModel[] {
  if (!Array.isArray(models)) return []
  const featured: HomepagePricingModel[] = []
  for (const item of models) {
    if (!item || !isNonEmptyString(item.model_name)) continue
    const tags = tagList(item.tags)
    if (tags.includes('featured')) {
      featured.push(item)
    }
  }
  featured.sort(sortByModelName)
  return featured.slice(0, 4)
}

/**
 * Compute endpoint chip display: first 2 chips + overflow count.
 */
export function endpointChips(types: unknown): {
  chips: string[]
  overflow: number
} {
  if (!Array.isArray(types) || types.length === 0) {
    return { chips: [], overflow: 0 }
  }
  const list = types.filter(
    (t): t is string => typeof t === 'string' && t.trim() !== ''
  )
  if (list.length <= 2) {
    return { chips: [...list], overflow: 0 }
  }
  return { chips: list.slice(0, 2), overflow: list.length - 2 }
}

/**
 * Resolve vendor display name from vendor_id + vendors list.
 */
export function resolveVendorName(
  vendorId: number | undefined | null,
  vendors: HomepagePricingVendor[] | undefined | null
): string | null {
  if (vendorId == null || !Array.isArray(vendors)) return null
  const found = vendors.find((v) => v && v.id === vendorId)
  if (!found || !isNonEmptyString(found.name)) return null
  return String(found.name).trim()
}

/**
 * Skeleton count for Available now grid based on viewport width.
 * 390→1, 768→2, 1280→4
 */
export function skeletonCountForWidth(width: number): number {
  if (typeof width !== 'number' || width < 768) return 1
  if (width < 1280) return 2
  return 4
}

/**
 * Featured grid column count and max-width for centered layout.
 * 1 card → 1 col / 380px, 2 → 2 / 780px, 3 → 3 / 980px, 4 → 4 / 1200px
 */
export function featuredGridColumns(count: number): {
  columns: number
  maxWidth: string
} {
  if (typeof count !== 'number' || count <= 1) {
    return { columns: 1, maxWidth: '380px' }
  }
  if (count === 2) return { columns: 2, maxWidth: '780px' }
  if (count === 3) return { columns: 3, maxWidth: '980px' }
  return { columns: 4, maxWidth: '1200px' }
}

/**
 * Normalize public GET /api/pricing payload for homepage surfaces.
 * Input is `unknown`; validated layer by layer.
 */
export function normalizePricingResponse(
  payload: unknown
): HomepagePricingState {
  if (!payload || typeof payload !== 'object') return ERROR_STATE
  const p = payload as Record<string, unknown>
  if (p.success !== true) return ERROR_STATE
  if (!Array.isArray(p.data)) return ERROR_STATE

  const models: HomepagePricingModel[] = []
  for (const item of p.data) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (!isNonEmptyString(obj.model_name)) continue
    models.push({
      model_name: String(obj.model_name).trim(),
      description: typeof obj.description === 'string' ? obj.description : '',
      tags: typeof obj.tags === 'string' ? obj.tags : '',
      vendor_id: typeof obj.vendor_id === 'number' ? obj.vendor_id : undefined,
      supported_endpoint_types: Array.isArray(obj.supported_endpoint_types)
        ? (obj.supported_endpoint_types as string[])
        : [],
    })
  }

  const rawArray = Array.isArray(p.vendors) ? p.vendors : []

  // rawVendors: only entries with valid numeric id + non-empty name.
  // Used by card components to resolve vendor_id → display name.
  const rawVendors: HomepagePricingVendor[] = rawArray.filter(
    (v): v is HomepagePricingVendor =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as HomepagePricingVendor).id === 'number' &&
      isNonEmptyString((v as HomepagePricingVendor).name)
  )

  // vendors: all non-empty names from the original array, regardless of id.
  // Used by Connected providers display (§5.5 of acquisition design).
  const vendorNames: string[] = []
  for (const v of rawArray) {
    if (
      v &&
      typeof v === 'object' &&
      isNonEmptyString((v as HomepagePricingVendor).name)
    ) {
      vendorNames.push(String((v as HomepagePricingVendor).name).trim())
    }
  }
  vendorNames.sort((a, b) => a.localeCompare(b, undefined, NAME_COLLATOR))

  const featured = selectFeatured(models)
  const count = models.length

  return {
    ok: true,
    status: count === 0 ? 'empty' : 'ready',
    count,
    models,
    featured,
    vendors: vendorNames,
    rawVendors,
  }
}

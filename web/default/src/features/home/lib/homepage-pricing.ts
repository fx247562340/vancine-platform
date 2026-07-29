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
export interface PricingModel {
  model_name: string
  description: string
  tags: string
  vendor_id?: number
  supported_endpoint_types: string[]
}

export interface PricingVendor {
  id?: number
  name?: string
}

export interface NormalizedPricing {
  ok: boolean
  status: 'ready' | 'empty' | 'error'
  count: number | null
  models: PricingModel[]
  featured: PricingModel[]
  marketplace: PricingModel[]
  vendors: string[]
  rawVendors: PricingVendor[]
}

export const FEATURED_FALLBACK_LABEL = 'Explore all available models →'

export const HERO_EVERGREEN_STRINGS: readonly string[] = Object.freeze([
  'OpenAI-compatible access to China’s frontier AI',
  'China’s frontier AI models. One API.',
  'Build with leading Chinese models through one OpenAI-compatible endpoint. Use the SDKs and agent tools you already know.',
  'Start building free',
  'Explore live models',
  'OpenAI-compatible',
  'One API',
  'AI Models',
])

export const HERO_BANNED_MODEL_SUBSTR: readonly string[] = Object.freeze([
  'kimi',
  'glm',
  'minimax',
  'qwen',
  'deepseek',
  'seedance',
  'seedream',
  'doubao',
  'claude',
  'gpt-4',
  'gpt-5',
])

const NAME_COLLATOR: Intl.CollatorOptions = { sensitivity: 'base' }

function isNonEmptyName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function sortByModelName(a: PricingModel, b: PricingModel): number {
  return a.model_name.localeCompare(b.model_name, undefined, NAME_COLLATOR)
}

/**
 * Split tags on comma, trim, lowercase; exact token "featured".
 */
export function tagList(tags: string | undefined | null): string[] {
  if (typeof tags !== 'string' || tags.trim() === '') return []
  return tags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

export function selectFeatured(models: PricingModel[]): PricingModel[] {
  if (!Array.isArray(models)) return []
  const featured: PricingModel[] = []
  for (const item of models) {
    if (!item || !isNonEmptyName(item.model_name)) continue
    const tags = tagList(item.tags)
    if (tags.includes('featured')) {
      featured.push(item)
    }
  }
  featured.sort(sortByModelName)
  return featured.slice(0, 4)
}

export function selectMarketplace(models: PricingModel[]): PricingModel[] {
  if (!Array.isArray(models)) return []
  const sorted = models
    .filter((m) => m && isNonEmptyName(m.model_name))
    .slice()
    .sort(sortByModelName)
  return sorted.slice(0, 6)
}

export function selectVendors(vendors: unknown): string[] {
  if (!Array.isArray(vendors)) return []
  const names: string[] = []
  for (const v of vendors) {
    if (v && isNonEmptyName(v.name)) {
      names.push(String(v.name).trim())
    }
  }
  names.sort((a, b) => a.localeCompare(b, undefined, NAME_COLLATOR))
  return names
}

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
    return { chips: list.slice(), overflow: 0 }
  }
  return { chips: list.slice(0, 2), overflow: list.length - 2 }
}

export function guestPrimaryPath(
  theme: 'classic' | 'default'
): '/register' | '/sign-up' {
  return theme === 'default' ? '/sign-up' : '/register'
}

export function authPrimaryPath(
  theme: 'classic' | 'default'
): '/console' | '/dashboard' {
  return theme === 'default' ? '/dashboard' : '/console'
}

export function hasHardcodedFeaturedAllowlist(): boolean {
  // Contract: this module never ships a default featured model id list.
  return false
}

export function resolveVendorName(
  vendorId: number | undefined | null,
  vendors: PricingVendor[] | undefined | null
): string | null {
  if (vendorId == null || !Array.isArray(vendors)) return null
  const found = vendors.find((v) => v && v.id === vendorId)
  if (!found || !isNonEmptyName(found.name)) return null
  return String(found.name).trim()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizePricingResponse(payload: any): NormalizedPricing {
  const error: NormalizedPricing = {
    ok: false,
    status: 'error',
    count: null,
    models: [],
    featured: [],
    marketplace: [],
    vendors: [],
    rawVendors: [],
  }

  if (!payload || typeof payload !== 'object') return error
  if (payload.success !== true) return error
  if (!Array.isArray(payload.data)) return error

  const models: PricingModel[] = []
  for (const item of payload.data) {
    if (!item || typeof item !== 'object') continue
    if (!isNonEmptyName(item.model_name)) continue
    models.push({
      model_name: String(item.model_name).trim(),
      description: typeof item.description === 'string' ? item.description : '',
      tags: typeof item.tags === 'string' ? item.tags : '',
      vendor_id:
        typeof item.vendor_id === 'number' ? item.vendor_id : undefined,
      supported_endpoint_types: Array.isArray(item.supported_endpoint_types)
        ? item.supported_endpoint_types
        : [],
    })
  }

  const rawVendors: PricingVendor[] = Array.isArray(payload.vendors)
    ? payload.vendors
    : []
  const featured = selectFeatured(models)
  const marketplace = selectMarketplace(models)
  const vendors = selectVendors(rawVendors)
  const count = models.length

  return {
    ok: true,
    status: count === 0 ? 'empty' : 'ready',
    count,
    models,
    featured,
    marketplace,
    vendors,
    rawVendors,
  }
}

export function skeletonCountForWidth(width: number): number {
  if (typeof width !== 'number' || width < 768) return 1
  if (width < 1280) return 2
  return 4
}

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
import { describe, it, expect } from 'vitest'

import {
  tagList,
  selectFeatured,
  selectMarketplace,
  endpointChips,
  resolveVendorName,
  skeletonCountForWidth,
  featuredGridColumns,
  normalizePricingResponse,
  LOADING_STATE,
  ERROR_STATE,
  type HomepagePricingModel,
  type HomepagePricingVendor,
} from '../homepage-pricing'

// ---------------------------------------------------------------------------
// normalizePricingResponse
// ---------------------------------------------------------------------------

describe('normalizePricingResponse', () => {
  const makeModel = (
    overrides: Partial<HomepagePricingModel> = {}
  ): HomepagePricingModel => ({
    model_name: 'gpt-4o',
    description: 'Fast model',
    tags: 'text',
    vendor_id: 1,
    supported_endpoint_types: ['chat'],
    ...overrides,
  })

  it('returns ready state with correct count for a valid payload', () => {
    const payload = {
      success: true,
      data: [makeModel(), makeModel({ model_name: 'claude-3' })],
    }
    const state = normalizePricingResponse(payload)
    expect(state.ok).toBe(true)
    expect(state.status).toBe('ready')
    expect(state.count).toBe(2)
    expect(state.models).toHaveLength(2)
  })

  it('returns ERROR_STATE when success is false', () => {
    expect(normalizePricingResponse({ success: false, data: [] })).toEqual(
      ERROR_STATE
    )
  })

  it('returns ERROR_STATE when data is an object instead of array', () => {
    expect(
      normalizePricingResponse({ success: true, data: { foo: 'bar' } })
    ).toEqual(ERROR_STATE)
  })

  it('returns ERROR_STATE for null', () => {
    expect(normalizePricingResponse(null)).toEqual(ERROR_STATE)
  })

  it('returns ERROR_STATE for undefined', () => {
    expect(normalizePricingResponse(undefined)).toEqual(ERROR_STATE)
  })

  it('returns ERROR_STATE for a string (malformed)', () => {
    expect(normalizePricingResponse('not-json')).toEqual(ERROR_STATE)
  })

  it('returns empty state when data array is empty', () => {
    const state = normalizePricingResponse({ success: true, data: [] })
    expect(state.ok).toBe(true)
    expect(state.status).toBe('empty')
    expect(state.count).toBe(0)
    expect(state.models).toEqual([])
  })

  it('filters out entries with empty model_name', () => {
    const payload = {
      success: true,
      data: [
        makeModel({ model_name: 'valid' }),
        makeModel({ model_name: '' }),
        makeModel({ model_name: '   ' }),
      ],
    }
    const state = normalizePricingResponse(payload)
    expect(state.count).toBe(1)
    expect(state.models[0].model_name).toBe('valid')
  })

  it('filters out non-object entries in the data array', () => {
    const payload = {
      success: true,
      data: [null, 'string', 42, makeModel({ model_name: 'real' })],
    }
    const state = normalizePricingResponse(payload)
    expect(state.count).toBe(1)
    expect(state.models[0].model_name).toBe('real')
  })

  it('count uses valid models array length only', () => {
    const payload = {
      success: true,
      data: [
        makeModel({ model_name: 'a' }),
        null,
        makeModel({ model_name: '' }),
        makeModel({ model_name: 'b' }),
      ],
    }
    const state = normalizePricingResponse(payload)
    expect(state.count).toBe(2)
  })

  it('extracts vendor names from rawVendors', () => {
    const payload = {
      success: true,
      data: [makeModel()],
      vendors: [
        { id: 1, name: 'OpenAI' },
        { id: 2, name: 'Anthropic' },
      ],
    }
    const state = normalizePricingResponse(payload)
    expect(state.vendors).toEqual(['Anthropic', 'OpenAI'])
    expect(state.rawVendors).toHaveLength(2)
  })

  it('returns empty vendors when vendors key is absent', () => {
    const payload = { success: true, data: [makeModel()] }
    const state = normalizePricingResponse(payload)
    expect(state.vendors).toEqual([])
    expect(state.rawVendors).toEqual([])
  })

  it('dual projection: rawVendors requires numeric id + non-empty name', () => {
    const payload = {
      success: true,
      data: [makeModel()],
      vendors: [
        { id: 1, name: 'Valid' },
        { name: 'NameOnly' },
        { id: 'bad', name: 'StringId' },
        { id: 3, name: '' },
        { id: 4, name: '   ' },
        { id: 5 },
        null,
      ],
    }
    const state = normalizePricingResponse(payload)
    // rawVendors: only entries with numeric id + non-empty name
    expect(state.rawVendors).toEqual([{ id: 1, name: 'Valid' }])
  })

  it('dual projection: vendors extracts all non-empty names regardless of id', () => {
    const payload = {
      success: true,
      data: [makeModel()],
      vendors: [
        { id: 1, name: 'Valid' },
        { name: 'NameOnly' },
        { id: 'bad', name: 'StringId' },
        { id: 3, name: '' },
        { id: 4, name: '   ' },
        { id: 5 },
        null,
      ],
    }
    const state = normalizePricingResponse(payload)
    // vendors: all non-empty names, trimmed, sorted case-insensitive
    expect(state.vendors).toEqual(['NameOnly', 'StringId', 'Valid'])
  })

  it('vendors with empty or missing name are excluded from both projections', () => {
    const payload = {
      success: true,
      data: [makeModel()],
      vendors: [
        { id: 1, name: 'Valid' },
        { id: 2 },
        { id: 3, name: '' },
        { id: 4, name: '   ' },
      ],
    }
    const state = normalizePricingResponse(payload)
    expect(state.vendors).toEqual(['Valid'])
    expect(state.rawVendors).toEqual([{ id: 1, name: 'Valid' }])
  })

  it('defaults description to empty string when not a string', () => {
    const payload = {
      success: true,
      data: [{ model_name: 'x', description: 123, tags: null }],
    }
    const state = normalizePricingResponse(payload)
    expect(state.models[0].description).toBe('')
  })

  it('defaults supported_endpoint_types to empty array when not an array', () => {
    const payload = {
      success: true,
      data: [{ model_name: 'x', supported_endpoint_types: 'bad' }],
    }
    const state = normalizePricingResponse(payload)
    expect(state.models[0].supported_endpoint_types).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// selectFeatured
// ---------------------------------------------------------------------------

describe('selectFeatured', () => {
  const model = (name: string, tags: string): HomepagePricingModel => ({
    model_name: name,
    description: '',
    tags,
    supported_endpoint_types: [],
  })

  it('selects models with the exact "featured" token (case-insensitive)', () => {
    const models = [
      model('Alpha', 'Featured,text'),
      model('Beta', 'text'),
      model('Gamma', 'featured'),
    ]
    const result = selectFeatured(models)
    expect(result.map((m) => m.model_name)).toEqual(['Alpha', 'Gamma'])
  })

  it('trims and lowercases tags before matching', () => {
    const models = [model('X', '  FEATURED , other ')]
    const result = selectFeatured(models)
    expect(result).toHaveLength(1)
    expect(result[0].model_name).toBe('X')
  })

  it('does NOT match partial tag "not-featured"', () => {
    const models = [model('A', 'not-featured'), model('B', 'featured')]
    const result = selectFeatured(models)
    expect(result).toHaveLength(1)
    expect(result[0].model_name).toBe('B')
  })

  it('does NOT match "highlight" or other tags', () => {
    const models = [model('A', 'highlight'), model('B', 'top,popular')]
    expect(selectFeatured(models)).toHaveLength(0)
  })

  it('sorts results case-insensitive by model_name', () => {
    const models = [
      model('zebra', 'featured'),
      model('Alpha', 'featured'),
      model('beta', 'featured'),
    ]
    const result = selectFeatured(models)
    expect(result.map((m) => m.model_name)).toEqual(['Alpha', 'beta', 'zebra'])
  })

  it('returns at most 4 results', () => {
    const models = Array.from({ length: 6 }, (_, i) =>
      model(`${String.fromCharCode(90 - i)}-${i}`, 'featured')
    )
    const result = selectFeatured(models)
    expect(result).toHaveLength(4)
  })

  it('returns empty array when input is not an array', () => {
    expect(selectFeatured(null as unknown as HomepagePricingModel[])).toEqual(
      []
    )
  })

  it('skips items with empty model_name', () => {
    const models = [model('', 'featured'), model('valid', 'featured')]
    const result = selectFeatured(models)
    expect(result).toHaveLength(1)
    expect(result[0].model_name).toBe('valid')
  })

  it('has no hardcoded allowlist — any model with "featured" tag is selected', () => {
    const models = [model('zzz-custom-model-xyz', 'featured')]
    const result = selectFeatured(models)
    expect(result).toHaveLength(1)
    expect(result[0].model_name).toBe('zzz-custom-model-xyz')
  })
})

// ---------------------------------------------------------------------------
// selectMarketplace
// ---------------------------------------------------------------------------

describe('selectMarketplace', () => {
  const model = (name: string): HomepagePricingModel => ({
    model_name: name,
    description: '',
    tags: '',
    supported_endpoint_types: [],
  })

  it('sorts case-insensitive by model_name and takes first 6', () => {
    const models = [
      model('zebra'),
      model('Alpha'),
      model('beta'),
      model('gamma'),
      model('delta'),
      model('epsilon'),
      model('eta'),
    ]
    const result = selectMarketplace(models)
    expect(result).toHaveLength(6)
    expect(result.map((m) => m.model_name)).toEqual([
      'Alpha',
      'beta',
      'delta',
      'epsilon',
      'eta',
      'gamma',
    ])
  })

  it('returns all models when fewer than 6', () => {
    const models = [model('b'), model('a')]
    const result = selectMarketplace(models)
    expect(result.map((m) => m.model_name)).toEqual(['a', 'b'])
  })

  it('returns empty array when input is empty', () => {
    expect(selectMarketplace([])).toEqual([])
  })

  it('returns empty array when input is not an array', () => {
    expect(
      selectMarketplace(null as unknown as HomepagePricingModel[])
    ).toEqual([])
  })

  it('does not mutate the input array', () => {
    const models = [model('b'), model('a'), model('c')]
    const original = [...models]
    selectMarketplace(models)
    expect(models).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// endpointChips
// ---------------------------------------------------------------------------

describe('endpointChips', () => {
  it('returns empty chips and overflow 0 for empty array', () => {
    expect(endpointChips([])).toEqual({ chips: [], overflow: 0 })
  })

  it('returns empty chips for non-array input', () => {
    expect(endpointChips(undefined)).toEqual({ chips: [], overflow: 0 })
    expect(endpointChips(null)).toEqual({ chips: [], overflow: 0 })
    expect(endpointChips('bad')).toEqual({ chips: [], overflow: 0 })
  })

  it('returns 1 chip and overflow 0 for 1 type', () => {
    expect(endpointChips(['chat'])).toEqual({ chips: ['chat'], overflow: 0 })
  })

  it('returns 2 chips and overflow 0 for 2 types', () => {
    expect(endpointChips(['chat', 'embedding'])).toEqual({
      chips: ['chat', 'embedding'],
      overflow: 0,
    })
  })

  it('returns first 2 chips and overflow 3 for 5 types', () => {
    const types = ['chat', 'embedding', 'image', 'audio', 'video']
    expect(endpointChips(types)).toEqual({
      chips: ['chat', 'embedding'],
      overflow: 3,
    })
  })

  it('filters out non-string and empty-string entries', () => {
    const types = ['chat', '', 42, null, 'image']
    expect(endpointChips(types)).toEqual({
      chips: ['chat', 'image'],
      overflow: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// resolveVendorName
// ---------------------------------------------------------------------------

describe('resolveVendorName', () => {
  const vendors: HomepagePricingVendor[] = [
    { id: 1, name: 'OpenAI' },
    { id: 2, name: ' Anthropic ' },
    { id: 3, name: '' },
  ]

  it('returns matching vendor name', () => {
    expect(resolveVendorName(1, vendors)).toBe('OpenAI')
  })

  it('trims whitespace from vendor name', () => {
    expect(resolveVendorName(2, vendors)).toBe('Anthropic')
  })

  it('returns null when vendor id has no match', () => {
    expect(resolveVendorName(99, vendors)).toBeNull()
  })

  it('returns null when vendor name is empty string', () => {
    expect(resolveVendorName(3, vendors)).toBeNull()
  })

  it('returns null when vendorId is null', () => {
    expect(resolveVendorName(null, vendors)).toBeNull()
  })

  it('returns null when vendorId is undefined', () => {
    expect(resolveVendorName(undefined, vendors)).toBeNull()
  })

  it('returns null when vendors array is null', () => {
    expect(resolveVendorName(1, null)).toBeNull()
  })

  it('returns null when vendors array is undefined', () => {
    expect(resolveVendorName(1, undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// skeletonCountForWidth
// ---------------------------------------------------------------------------

describe('skeletonCountForWidth', () => {
  it('returns 1 for 390px', () => {
    expect(skeletonCountForWidth(390)).toBe(1)
  })

  it('returns 2 for 768px', () => {
    expect(skeletonCountForWidth(768)).toBe(2)
  })

  it('returns 4 for 1280px', () => {
    expect(skeletonCountForWidth(1280)).toBe(4)
  })

  it('returns 1 for narrow widths below 768', () => {
    expect(skeletonCountForWidth(320)).toBe(1)
    expect(skeletonCountForWidth(0)).toBe(1)
  })

  it('returns 2 for widths between 768 and 1279', () => {
    expect(skeletonCountForWidth(1024)).toBe(2)
  })

  it('returns 4 for very large widths', () => {
    expect(skeletonCountForWidth(2560)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// featuredGridColumns
// ---------------------------------------------------------------------------

describe('featuredGridColumns', () => {
  it('returns 1 column and 380px for 1 card', () => {
    expect(featuredGridColumns(1)).toEqual({ columns: 1, maxWidth: '380px' })
  })

  it('returns 2 columns and 780px for 2 cards', () => {
    expect(featuredGridColumns(2)).toEqual({ columns: 2, maxWidth: '780px' })
  })

  it('returns 3 columns and 980px for 3 cards', () => {
    expect(featuredGridColumns(3)).toEqual({ columns: 3, maxWidth: '980px' })
  })

  it('returns 4 columns and 1200px for 4 cards', () => {
    expect(featuredGridColumns(4)).toEqual({ columns: 4, maxWidth: '1200px' })
  })

  it('returns 1 column for count <= 0 (fallback)', () => {
    expect(featuredGridColumns(0)).toEqual({ columns: 1, maxWidth: '380px' })
    expect(featuredGridColumns(-1)).toEqual({ columns: 1, maxWidth: '380px' })
  })

  it('returns 4 columns for count > 4 (capped)', () => {
    expect(featuredGridColumns(10)).toEqual({ columns: 4, maxWidth: '1200px' })
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('LOADING_STATE has status "loading" and ok=false', () => {
    expect(LOADING_STATE.ok).toBe(false)
    expect(LOADING_STATE.status).toBe('loading')
    expect(LOADING_STATE.count).toBeNull()
  })

  it('ERROR_STATE has status "error" and ok=false', () => {
    expect(ERROR_STATE.ok).toBe(false)
    expect(ERROR_STATE.status).toBe('error')
    expect(ERROR_STATE.count).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// tagList
// ---------------------------------------------------------------------------

describe('tagList', () => {
  it('splits on comma, trims, and lowercases', () => {
    expect(tagList(' Featured , TEXT , Image ')).toEqual([
      'featured',
      'text',
      'image',
    ])
  })

  it('returns empty array for undefined', () => {
    expect(tagList(undefined)).toEqual([])
  })

  it('returns empty array for null', () => {
    expect(tagList(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(tagList('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(tagList('   ')).toEqual([])
  })

  it('handles single tag', () => {
    expect(tagList('featured')).toEqual(['featured'])
  })

  it('filters out empty tokens from consecutive commas', () => {
    expect(tagList('a,,b')).toEqual(['a', 'b'])
  })
})

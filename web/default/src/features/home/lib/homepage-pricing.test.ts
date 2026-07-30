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
// Run with: node --test src/features/home/lib/homepage-pricing.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  normalizePricingResponse,
  selectFeatured,
  selectMarketplace,
  selectVendors,
  endpointChips,
  featuredGridColumns,
  guestPrimaryPath,
  authPrimaryPath,
  resolveVendorName,
  skeletonCountForWidth,
  HERO_EVERGREEN_STRINGS,
  HERO_BANNED_MODEL_SUBSTR,
  FEATURED_FALLBACK_LABEL,
  hasHardcodedFeaturedAllowlist,
  type PricingModel,
} from './homepage-pricing.ts'

const mk = (
  model_name: string,
  extra: Partial<PricingModel> = {}
): PricingModel => ({
  model_name,
  description: '',
  tags: '',
  supported_endpoint_types: [],
  ...extra,
})

describe('normalizePricingResponse (default parity)', () => {
  test('success array ready with derived lists', () => {
    const r = normalizePricingResponse({
      success: true,
      data: [mk('zeta', { tags: 'Featured' }), mk('alpha')],
      vendors: [{ id: 1, name: 'Vendor A' }],
    })
    assert.equal(r.ok, true)
    assert.equal(r.status, 'ready')
    assert.equal(r.count, 2)
    assert.equal(r.featured.length, 1)
    assert.equal(r.marketplace.length, 2)
    assert.deepEqual(r.vendors, ['Vendor A'])
  })

  test('empty array', () => {
    const r = normalizePricingResponse({ success: true, data: [] })
    assert.equal(r.status, 'empty')
    assert.equal(r.count, 0)
  })

  test('success false → error', () => {
    assert.equal(
      normalizePricingResponse({ success: false, data: [] }).status,
      'error'
    )
  })

  test('object-shaped data → error', () => {
    assert.equal(
      normalizePricingResponse({ success: true, data: { a: 1 } }).status,
      'error'
    )
  })

  test('filters empty model_name and non-objects', () => {
    const r = normalizePricingResponse({
      success: true,
      data: [{ model_name: '  ' }, { model_name: 'keep' }, null, 5],
    })
    assert.equal(r.count, 1)
    assert.equal(r.models[0].model_name, 'keep')
  })

  test('null payload → error', () => {
    assert.equal(normalizePricingResponse(null).status, 'error')
  })
})

describe('selectFeatured (default parity)', () => {
  const items = [
    mk('zeta', { tags: 'Featured' }),
    mk('alpha', { tags: 'featured,new' }),
    mk('beta', { tags: 'not-featured' }),
    mk('gamma', { tags: ' other , FEATURED ' }),
    mk('delta', { tags: 'highlight' }),
    mk('epsilon', { tags: 'featured' }),
    mk('eta', { tags: 'featured' }),
    mk('', { tags: 'featured' }),
  ]

  test('exact token featured case-insensitive; excludes not-featured; caps to 4', () => {
    const names = selectFeatured(items).map((m) => m.model_name)
    assert.ok(!names.includes('beta'))
    assert.ok(!names.includes('delta'))
    assert.ok(names.includes('alpha'))
    assert.ok(names.includes('gamma'))
    assert.ok(!names.includes('zeta'))
    assert.equal(names.length, 4)
  })

  test('sorts case-insensitive', () => {
    const names = selectFeatured(items).map((m) => m.model_name)
    assert.deepEqual(
      names,
      [...names].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      )
    )
  })
})

describe('selectMarketplace (default parity)', () => {
  test('sorts and caps at 6', () => {
    const m = selectMarketplace(
      ['m9', 'm1', 'm3', 'm2', 'm5', 'm4', 'm8', 'm7'].map((n) => mk(n))
    )
    assert.deepEqual(
      m.map((x) => x.model_name),
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm7']
    )
  })
})

describe('selectVendors (default parity)', () => {
  test('sorts names; malformed → empty', () => {
    assert.deepEqual(
      selectVendors([
        { id: 1, name: 'zeta' },
        { id: 2, name: 'Alpha' },
        { id: 3 },
        { name: '  ' },
      ]),
      ['Alpha', 'zeta']
    )
    assert.deepEqual(selectVendors(null), [])
    assert.deepEqual(selectVendors({}), [])
  })
})

describe('endpointChips (default parity)', () => {
  test('0/1/2/5', () => {
    assert.deepEqual(endpointChips(null), { chips: [], overflow: 0 })
    assert.deepEqual(endpointChips(['a']), { chips: ['a'], overflow: 0 })
    assert.deepEqual(endpointChips(['a', 'b']), {
      chips: ['a', 'b'],
      overflow: 0,
    })
    assert.deepEqual(endpointChips(['a', 'b', 'c', 'd', 'e']), {
      chips: ['a', 'b'],
      overflow: 3,
    })
  })
})

describe('CTA paths + contracts (default parity)', () => {
  test('default guest/auth', () => {
    assert.equal(guestPrimaryPath('default'), '/sign-up')
    assert.equal(authPrimaryPath('default'), '/dashboard')
    assert.equal(guestPrimaryPath('classic'), '/register')
    assert.equal(authPrimaryPath('classic'), '/console')
  })

  test('evergreen hero strings contain no banned model substrings', () => {
    const joined = HERO_EVERGREEN_STRINGS.join('\n').toLowerCase()
    for (const ban of HERO_BANNED_MODEL_SUBSTR) {
      assert.equal(joined.includes(ban.toLowerCase()), false, ban)
    }
  })

  test('no hardcoded featured allowlist', () => {
    assert.equal(hasHardcodedFeaturedAllowlist(), false)
  })

  test('fallback label', () => {
    assert.match(FEATURED_FALLBACK_LABEL, /Explore all available models/i)
  })

  test('resolveVendorName', () => {
    const vendors = [
      { id: 1, name: 'A' },
      { id: 2, name: '' },
    ]
    assert.equal(resolveVendorName(1, vendors), 'A')
    assert.equal(resolveVendorName(2, vendors), null)
    assert.equal(resolveVendorName(9, vendors), null)
    assert.equal(resolveVendorName(null, vendors), null)
  })

  test('skeleton counts 1/2/4', () => {
    assert.equal(skeletonCountForWidth(390), 1)
    assert.equal(skeletonCountForWidth(768), 2)
    assert.equal(skeletonCountForWidth(1280), 4)
  })
})

describe('featuredGridColumns (default parity)', () => {
  test('count 1/2/3/4 return matching columns + max-width', () => {
    assert.deepEqual(featuredGridColumns(1), { columns: 1, maxWidth: '380px' })
    assert.deepEqual(featuredGridColumns(2), { columns: 2, maxWidth: '780px' })
    assert.deepEqual(featuredGridColumns(3), { columns: 3, maxWidth: '980px' })
    assert.deepEqual(featuredGridColumns(4), { columns: 4, maxWidth: '1200px' })
  })
  test('count 1, 2, 3 never return 4 columns (fixes empty 4th column)', () => {
    for (const n of [1, 2, 3]) {
      assert.notEqual(
        featuredGridColumns(n).columns,
        4,
        `count ${n} must not return 4 columns`
      )
    }
  })
  test('defensive: count 0 falls back to single column', () => {
    assert.deepEqual(featuredGridColumns(0), { columns: 1, maxWidth: '380px' })
  })
})

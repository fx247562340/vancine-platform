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
// Run with: node --test src/features/home/components/sections/available-now.test.ts
//
// Source-contract test for the Available now state contract + responsive
// skeleton count (1 / 2 / 4 for 390 / 768 / 1280).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'available-now.tsx'), 'utf8')

describe('Default AvailableNow — count & fallback contract', () => {
  test('real model count guarded by status === "ready" (not only featured)', () => {
    assert.match(src, /\{\{count\}\} models available/)
    assert.match(
      src,
      /status === 'ready'[\s\S]{0,300}\{\{count\}\} models available/,
      'count caption must be guarded by status === "ready"'
    )
  })

  test('supporting line shown when featured models exist', () => {
    assert.match(src, /Featured models live on the public catalog/)
  })
})

describe('Default AvailableNow — responsive skeleton (no fixed 4 on mobile)', () => {
  test('uses skeletonCountForWidth, not a fixed length of 4', () => {
    assert.match(src, /skeletonCountForWidth/)
    assert.match(src, /length:\s*skeletonCount/)
    assert.equal(
      /Array\.from\(\{\s*length:\s*4\s*\}\)/.test(src),
      false,
      'must not render a hardcoded 4 skeletons'
    )
  })
})

describe('Default AvailableNow — count-driven centered grid contract', () => {
  test('uses featuredGridColumns(count) helper', () => {
    assert.match(src, /featuredGridColumns/)
  })

  test('count-driven grid does not pin to xl:grid-cols-4', () => {
    const featuredGrid = src.match(/function FeaturedGrid[\s\S]*?\n}\n/)
    assert.ok(featuredGrid, 'FeaturedGrid function must exist')
    assert.equal(
      /xl:grid-cols-4/.test(featuredGrid![0]!),
      false,
      'featured grid must not pin to xl:grid-cols-4'
    )
  })
})

describe('Default AvailableNow — tablet responsive contract (design §3.3)', () => {
  const featuredGridBlock = () => {
    const m = src.match(/function FeaturedGrid[\s\S]*?\n}\n/)
    return m ? m[0]! : ''
  }

  test('tablet + 1 featured card collapses to a single centered column', () => {
    const block = featuredGridBlock()
    assert.ok(block)
    assert.match(
      block,
      /featured\.length\s*<=\s*1\s*\?\s*'md:grid-cols-1'/,
      'tablet + 1 card must use md:grid-cols-1'
    )
  })

  test('tablet + 2/3/4 featured cards collapse to at most 2 centered columns', () => {
    const block = featuredGridBlock()
    assert.ok(block)
    assert.match(
      block,
      /featured\.length\s*<=\s*1\s*\?\s*'md:grid-cols-1'\s*:\s*'md:grid-cols-2'/,
      'tablet + 2/3/4 cards must use md:grid-cols-2'
    )
  })

  test('desktop 1/2/3/4 contract preserved (count-driven 1/2/3/4 columns)', () => {
    const block = featuredGridBlock()
    assert.ok(block)
    assert.match(block, /grid-cols-1/)
    assert.match(block, /grid-cols-2/)
    assert.match(block, /grid-cols-3/)
    assert.match(block, /grid-cols-4/)
  })

  test('mobile always single column', () => {
    const block = featuredGridBlock()
    assert.ok(block)
    // The responsive-grid is assembled from `'grid-cols-1'` for mobile and
    // an md: variant for tablet. We assert on the source pieces directly.
    assert.match(
      block,
      /responsiveGridCols\s*=\s*isMobile\s*\?\s*'grid-cols-1'/,
      'mobile base must be grid-cols-1',
    )
    assert.match(block, /tabletGridCols\s*=[\s\S]*?'md:grid-cols-1'/)
    assert.match(block, /'md:grid-cols-1'\s*:\s*'md:grid-cols-2'/)
  })
})

describe('Default AvailableNow — focus-visible + SpotlightCard', () => {
  test('available-now link has :focus-visible ring + offset', () => {
    assert.match(src, /focus-visible:ring/)
    assert.match(src, /focus-visible:ring-offset/)
  })

  test('renders card through SpotlightCard primitive', () => {
    assert.match(
      src,
      /import\s*\{[^}]*SpotlightCard[^}]*\}\s*from\s*['"]@\/features\/home\/components\/spotlight-card['"]/
    )
    assert.match(src, /<SpotlightCard[\s\S]*?>/)
  })
})

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
// Run with: node --test src/features/home/index.test.ts
//
// Composition contract for the Default acquisition homepage. Locks the
// approved IA and keeps the retired legacy modules (Stats / Features /
// HowItWorks — hardcoded 50+/100+ counts and model-name marketing) from
// silently re-entering the built-in home.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const indexSrc = readFileSync(join(__dirname, 'index.tsx'), 'utf8')

describe('Default home composition — approved IA only', () => {
  test('legacy Stats/Features/HowItWorks are not composed', () => {
    for (const legacy of ['<Stats', '<Features', '<HowItWorks']) {
      assert.equal(
        indexSrc.includes(legacy),
        false,
        `legacy module ${legacy} must not be rendered on the acquisition home`
      )
    }
  })

  test('composes the approved section order', () => {
    const order = [
      '<Hero',
      '<AvailableNow',
      '<Stack',
      '<Evidence',
      '<Why',
      '<Marketplace',
      '<CTA',
      '<Footer',
    ]
    let cursor = -1
    for (const tag of order) {
      const idx = indexSrc.indexOf(tag)
      assert.ok(idx >= 0, `missing ${tag}`)
      assert.ok(idx > cursor, `${tag} must come after the previous section`)
      cursor = idx
    }
  })

  test('Hero receives the shared pricing state (real model count)', () => {
    assert.match(
      indexSrc,
      /<Hero[^>]*pricing=\{pricing\}/,
      'Hero must get pricing'
    )
    assert.match(indexSrc, /<AvailableNow[^>]*pricing=\{pricing\}/)
    assert.match(indexSrc, /<Marketplace[^>]*pricing=\{pricing\}/)
  })

  test('single shared pricing fetch per home instance', () => {
    assert.match(indexSrc, /useHomepagePricing\(\)/)
    // Only one call site for the hook.
    const calls = indexSrc.match(/useHomepagePricing\(\)/g) ?? []
    assert.equal(calls.length, 1, 'pricing hook must be called exactly once')
  })
})

describe('Default home — no hardcoded fake quantities', () => {
  // Strip block comments so explanatory prose (which may reference the banned
  // patterns to forbid them) does not produce false positives.
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '')

  test('no 20+/50+/100+/10x/11+ claims in composed home sections', () => {
    const files = [
      'index.tsx',
      'components/sections/hero.tsx',
      'components/sections/cta.tsx',
      'components/sections/available-now.tsx',
      'components/sections/marketplace.tsx',
    ]
    const banned = [/20\+/, /50\+/, /100\+/, /10x/i, /11\+/]
    for (const f of files) {
      const src = stripComments(readFileSync(join(__dirname, f), 'utf8'))
      for (const re of banned) {
        assert.equal(re.test(src), false, `${f} must not contain ${re}`)
      }
    }
  })
})

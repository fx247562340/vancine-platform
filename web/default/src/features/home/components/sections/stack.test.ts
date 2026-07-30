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
// Run with: node --test src/features/home/components/sections/stack.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'stack.tsx'), 'utf8')

describe('Default Stack — six cards + qualification matrix', () => {
  test('STACK_ITEMS contains exactly six entries', () => {
    const m = src.match(/const STACK_ITEMS = \[([\s\S]*?)\]/)
    assert.ok(m, 'STACK_ITEMS array must be present')
    const items = m![1]!.split(/\},\s*\{/).length
    assert.equal(items, 6, 'must render exactly six stack cards')
  })

  test('Pi Coding Agent is the sixth card title', () => {
    const titles = [...src.matchAll(/title:\s*'([^']+)'/g)].map((mm) => mm[1])
    assert.deepEqual(titles, [
      'OpenCode',
      'Cline',
      'Roo Code',
      'Claude Code',
      'OpenAI SDK',
      'Pi Coding Agent',
    ])
  })

  test('OpenCode carries Live-verified qualification; everyone else Configuration-ready', () => {
    const block = src.match(/const STACK_ITEMS = \[([\s\S]*?)\]/)![1]!
    const entries = [
      ...block.matchAll(
        /title:\s*'([^']+)',[\s\S]*?qualification:\s*'([^']+)'/g
      ),
    ].map((mm) => [mm[1], mm[2]] as const)
    const matrix = Object.fromEntries(entries)
    assert.equal(matrix['OpenCode'], 'Live-verified')
    assert.equal(matrix['Cline'], 'Configuration-ready')
    assert.equal(matrix['Roo Code'], 'Configuration-ready')
    assert.equal(matrix['Claude Code'], 'Configuration-ready')
    assert.equal(matrix['OpenAI SDK'], 'Configuration-ready')
    assert.equal(matrix['Pi Coding Agent'], 'Configuration-ready')
  })

  test('Pi is never marked Live-verified anywhere in stack.tsx', () => {
    const piBlocks = src.match(/Pi Coding Agent[\s\S]{0,200}/g) ?? []
    assert.ok(piBlocks.length > 0)
    for (const b of piBlocks) {
      assert.equal(
        /qualification:\s*'Live-verified'/.test(b),
        false,
        'Pi must never be marked Live-verified'
      )
    }
  })

  test('Pi body contains the configuration-ready boundary sentence', () => {
    assert.match(
      src,
      /Not claimed as a completed Vancine live coding-agent verification on the homepage\./
    )
  })
})

describe('Default Stack — grid + analytics contract', () => {
  test('grid stays grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', () => {
    assert.match(src, /grid-cols-1\s+gap-5\s+sm:grid-cols-2\s+lg:grid-cols-3/)
  })

  test('no external navigation, no trackEvent calls in stack cards', () => {
    assert.equal(/trackEvent\(/.test(src), false)
    assert.equal(/to=/.test(src), false, 'stack cards must not navigate')
  })
})

describe('Default Stack — SpotlightCard visual interaction enabled', () => {
  test('stack renders SpotlightCard with interactive defaults (no interactive={false})', () => {
    assert.equal(
      /interactive\s*=\s*\{\s*false\s*\}/.test(src),
      false,
      'stack must not pass interactive={false} to SpotlightCard',
    )
    assert.match(src, /<SpotlightCard[\s\S]*?>/)
  })

  test('stack stays a static semantic container (no tabindex / role=link / <a / href)', () => {
    assert.equal(/tabIndex\s*=/.test(src), false)
    assert.equal(/role\s*=\s*['"]link['"]/.test(src), false)
    assert.equal(/<a\b/.test(src), false)
    assert.equal(/href\s*=/.test(src), false)
  })
})
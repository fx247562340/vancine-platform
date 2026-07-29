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

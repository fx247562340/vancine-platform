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
// Run with: node --test src/features/home/wiring.test.ts
//
// Source-contract tests locking Default acquisition wiring: CTA routes
// (guest /sign-up, auth /dashboard), analytics locations, header analytics.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')

describe('Default Hero — CTA routes + analytics', () => {
  const src = read('components/sections/hero.tsx')

  test('guest → /sign-up, explore → /pricing', () => {
    assert.match(src, /to=['"]\/sign-up['"]/)
    assert.match(src, /to=['"]\/pricing['"]/)
  })

  test('fires get_started_clicked + explore_models_clicked { location: "hero" }', () => {
    assert.match(src, /get_started_clicked[\s\S]{0,60}location:\s*'hero'/)
    assert.match(src, /explore_models_clicked[\s\S]{0,60}location:\s*'hero'/)
  })

  test('consumes shared pricing state for the real model count', () => {
    assert.match(src, /pricing\?:\s*HomepagePricingState/)
    assert.match(src, /props\.pricing\?\.count/)
  })
})

describe('Default Final CTA — route + analytics', () => {
  const src = read('components/sections/cta.tsx')

  test('guest → /sign-up, authenticated → /dashboard', () => {
    assert.match(src, /isAuthenticated\s*\?\s*'\/dashboard'\s*:\s*'\/sign-up'/)
  })

  test('fires get_started_clicked { location: "final_cta" }', () => {
    assert.match(src, /get_started_clicked[\s\S]{0,60}location:\s*'final_cta'/)
  })

  test('offers $1 credit with eligibility qualifier, no "no credit card"', () => {
    assert.match(src, /Get \$1 in free API credit/)
    assert.match(src, /promotional API credit/)
    assert.equal(src.includes('No credit card required'), false)
  })
})

describe('Default header — signup analytics (analytics-only wiring)', () => {
  const src = read('../../components/layout/components/public-header.tsx')

  test('guest Sign up → /sign-up with get_started_clicked { location: "header" }', () => {
    assert.match(src, /to=['"]\/sign-up['"]/)
    assert.match(src, /get_started_clicked[\s\S]{0,80}location:\s*'header'/)
  })
})

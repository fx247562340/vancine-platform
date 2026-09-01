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
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  DEVELOPER_GUIDES,
  DEVELOPER_GUIDES_SECTION_LABEL_KEY,
} from '@/lib/developer-guides'
import { DEVELOPER_SOLUTIONS } from '@/lib/developer-solutions'

const WEB_SRC = join(import.meta.dirname, '..', '..')

describe('developer guides registry', () => {
  test('contains exactly the fast coding models guide', () => {
    assert.equal(DEVELOPER_GUIDES.length, 1)
    assert.deepEqual(
      DEVELOPER_GUIDES.map((guide) => guide.id),
      ['fast-coding-models']
    )
  })

  test('defines the stable guide contract', () => {
    const guide = DEVELOPER_GUIDES[0]
    assert.equal(guide.route, '/guides/fast-coding-models')
    assert.equal(guide.titleKey, 'Fast AI Models')
    assert.equal(
      guide.descriptionKey,
      'Explore the current fast-inference catalog for coding, multimodal, and high-throughput workloads.'
    )
    assert.equal(guide.resource, 'fast_coding_models_guide')
    assert.equal(DEVELOPER_GUIDES_SECTION_LABEL_KEY, 'Guides')
  })

  test('every route is a fixed absolute in-site path', () => {
    for (const guide of DEVELOPER_GUIDES) {
      assert.match(guide.route, /^\/[a-z0-9/-]+$/)
      assert.ok(!guide.route.includes('//'))
      assert.ok(!guide.route.startsWith('/http'))
    }
  })

  test('analytics resource values are unique and stable', () => {
    const resources = DEVELOPER_GUIDES.map((guide) => guide.resource)
    assert.equal(new Set(resources).size, resources.length)
    for (const resource of resources) {
      assert.match(resource, /^[a-z0-9_]+$/)
    }
  })

  test('every entry carries non-empty i18n keys', () => {
    for (const guide of DEVELOPER_GUIDES) {
      assert.ok(guide.titleKey.length > 0)
      assert.ok(guide.descriptionKey.length > 0)
    }
  })

  test('guide routes never join the API solutions registry', () => {
    const solutionRoutes = new Set(
      DEVELOPER_SOLUTIONS.map((solution) => solution.route as string)
    )
    for (const guide of DEVELOPER_GUIDES) {
      assert.ok(
        !solutionRoutes.has(guide.route),
        `${guide.route} must not be an API solution`
      )
    }
  })

  test('keeps the four API solutions untouched and in order', () => {
    assert.deepEqual(
      DEVELOPER_SOLUTIONS.map((solution) => solution.id),
      ['kimi-k3-api', 'glm-api', 'seedance-api', 'ai-media-api']
    )
  })

  test('homepage Developer solutions and Docs sidebar never consume the guides registry', () => {
    // The homepage section and the Docs sidebar must keep consuming only
    // the developer solutions registry; referencing developer-guides
    // would silently pollute both surfaces.
    const consumers = [
      join(
        WEB_SRC,
        'features/home/components/sections/developer-solutions.tsx'
      ),
      join(WEB_SRC, 'features/docs/components/sidebar.tsx'),
    ]
    for (const file of consumers) {
      const source = readFileSync(file, 'utf8')
      assert.ok(
        !source.includes('developer-guides'),
        `${file} must not import the developer guides registry`
      )
      assert.ok(
        source.includes('developer-solutions'),
        `${file} must keep consuming the developer solutions registry`
      )
    }
  })
})

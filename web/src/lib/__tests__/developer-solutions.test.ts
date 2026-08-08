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
import { describe, test } from 'node:test'

import {
  DEVELOPER_SOLUTIONS,
  DEVELOPER_SOLUTIONS_MENU_LABEL_KEY,
  DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY,
} from '@/lib/developer-solutions'

describe('developer solutions registry', () => {
  test('contains exactly the two live resources', () => {
    assert.equal(DEVELOPER_SOLUTIONS.length, 2)
    assert.deepEqual(
      DEVELOPER_SOLUTIONS.map((solution) => solution.id),
      ['kimi-k3-api', 'ai-media-api']
    )
  })

  test('ids are unique', () => {
    const ids = DEVELOPER_SOLUTIONS.map((solution) => solution.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('routes are unique', () => {
    const routes = DEVELOPER_SOLUTIONS.map((solution) => solution.route)
    assert.equal(new Set(routes).size, routes.length)
  })

  test('every route is a fixed absolute in-site path', () => {
    for (const solution of DEVELOPER_SOLUTIONS) {
      assert.match(solution.route, /^\/[a-z0-9-]+$/)
      assert.ok(!solution.route.includes('//'))
      assert.ok(!solution.route.startsWith('/http'))
    }
    const byId = new Map(DEVELOPER_SOLUTIONS.map((s) => [s.id, s]))
    assert.equal(byId.get('kimi-k3-api')?.route, '/kimi-k3-api')
    assert.equal(byId.get('ai-media-api')?.route, '/ai-media-api')
  })

  test('contains no Seedance or placeholder routes', () => {
    for (const solution of DEVELOPER_SOLUTIONS) {
      assert.ok(!solution.route.toLowerCase().includes('seedance'))
      assert.ok(!solution.id.includes('seedance'))
      assert.ok(!solution.route.includes('todo'))
      assert.ok(!solution.route.includes('placeholder'))
    }
  })

  test('analytics resource values are unique and stable', () => {
    const resources = DEVELOPER_SOLUTIONS.map((solution) => solution.resource)
    assert.equal(new Set(resources).size, resources.length)
    for (const resource of resources) {
      assert.match(resource, /^[a-z0-9_]+$/)
    }
  })

  test('every entry carries non-empty i18n keys', () => {
    for (const solution of DEVELOPER_SOLUTIONS) {
      assert.ok(solution.titleKey.length > 0)
      assert.ok(solution.descriptionKey.length > 0)
    }
    assert.equal(DEVELOPER_SOLUTIONS_MENU_LABEL_KEY, 'API Solutions')
    assert.equal(DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY, 'Developer solutions')
  })
})

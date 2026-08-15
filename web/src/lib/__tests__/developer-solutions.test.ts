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
  test('contains exactly the three live resources', () => {
    assert.equal(DEVELOPER_SOLUTIONS.length, 3)
    assert.deepEqual(
      DEVELOPER_SOLUTIONS.map((solution) => solution.id),
      ['kimi-k3-api', 'seedance-api', 'ai-media-api']
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
    assert.equal(byId.get('seedance-api')?.route, '/seedance-api')
    assert.equal(byId.get('ai-media-api')?.route, '/ai-media-api')
    assert.equal(byId.get('seedance-api')?.resource, 'seedance_api')
    assert.equal(byId.get('seedance-api')?.titleKey, 'Seedance 2.5 API')
    assert.equal(
      byId.get('seedance-api')?.descriptionKey,
      'Async Doubao-Seedance-2.5 video generation through one API.'
    )
  })

  test('keeps a stable order: Kimi K3 -> Seedance -> AI Media', () => {
    const ids = DEVELOPER_SOLUTIONS.map((solution) => solution.id)
    assert.ok(
      ids.indexOf('kimi-k3-api') < ids.indexOf('seedance-api'),
      'Kimi K3 API must precede Seedance'
    )
    assert.ok(
      ids.indexOf('seedance-api') < ids.indexOf('ai-media-api'),
      'Seedance must precede AI Media API'
    )
  })

  test('contains no placeholder routes', () => {
    for (const solution of DEVELOPER_SOLUTIONS) {
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

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

import { describe, it } from 'vitest'

import type { AgentSearchIndexEntry } from '../../types.ts'

/**
 * Search contract for the nested agent setup guides: the three guides are
 * independently indexable and each result carries the nested route path,
 * never the hub path or a slug.
 */

const AGENT_BUNDLE = {
  nav: { agents: 'Agent Integration' },
  agentGuides: {
    common: {
      troubleshootingTitle: 'Common errors',
      errors: {
        baseUrl: {
          symptom: '404, CORS or connection errors; requests hit another host.',
          fix: 'Set the Base URL exactly to {{baseUrl}} with no extra path segments.',
        },
        apiKey: {
          symptom: '401 / invalid API key.',
          fix: 'Copy the full Vancine API key without spaces.',
        },
      },
    },
    opencode: {
      pageTitle: 'OpenCode setup guide',
      valueProp: 'Connect OpenCode to Vancine',
    },
    cline: {
      pageTitle: 'Cline setup guide',
      valueProp: 'Connect Cline to Vancine',
    },
    rooCode: {
      pageTitle: 'Roo Code setup guide',
      valueProp: 'Connect Roo Code to Vancine',
    },
  },
}

describe('Docs search agent guide entries', () => {
  it('indexes the three guides with their nested route paths', async () => {
    const { buildSearchIndex } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)
    const agentEntries = index.filter(
      (entry): entry is AgentSearchIndexEntry => 'agentPath' in entry
    )
    assert.deepEqual(agentEntries.map((entry) => entry.agentPath).sort(), [
      '/docs/agents/cline',
      '/docs/agents/opencode',
      '/docs/agents/roo-code',
    ])
    for (const entry of agentEntries) {
      assert.ok(entry.title.trim().length > 0)
      // Discriminated union: agent entries never carry a slug.
      assert.equal('slug' in entry, false)
    }
  })

  it('finds each tool by name and returns the nested path', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)

    const opencode = searchDocs(index, 'OpenCode')
    assert.ok(opencode.length >= 1)
    const first = opencode[0]
    assert.ok('agentPath' in first)
    assert.equal(first.agentPath, '/docs/agents/opencode')

    const cline = searchDocs(index, 'Cline')
    assert.ok(cline.length >= 1)
    assert.equal(
      cline.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/cline'
      ),
      true
    )

    const roo = searchDocs(index, 'Roo Code')
    assert.ok(roo.length >= 1)
    const rooFirst = roo[0]
    assert.ok('agentPath' in rooFirst)
    assert.equal(rooFirst.agentPath, '/docs/agents/roo-code')
  })

  it('shared troubleshooting copy is searchable on every guide, not just the hub', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)

    for (const query of ['CORS', 'invalid API key']) {
      const results = searchDocs(index, query)
      const agentHits = results.filter((r) => 'agentPath' in r)
      assert.deepEqual(
        agentHits.map((r) => ('agentPath' in r ? r.agentPath : '')).sort(),
        [
          '/docs/agents/cline',
          '/docs/agents/opencode',
          '/docs/agents/roo-code',
        ],
        `query "${query}" must reach all three guide pages via merged common copy`
      )
      // The shared snippet context comes with each hit.
      for (const hit of agentHits) {
        assert.ok(
          'snippet' in hit && hit.snippet.length > 0,
          `query "${query}" must carry a snippet from the merged common copy`
        )
      }
    }
  })

  it('does not index agent guides when the bundle has no agentGuides section', async () => {
    const { buildSearchIndex } = await import('../search.ts')
    const index = buildSearchIndex({ nav: { agents: 'Agent Integration' } })
    assert.deepEqual(
      index.filter((entry) => 'agentPath' in entry),
      []
    )
  })

  it('falls back to the display name when pageTitle is missing', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const index = buildSearchIndex({
      agentGuides: { opencode: { valueProp: 'Connect OpenCode to Vancine' } },
    })
    const results = searchDocs(index, 'OpenCode')
    assert.ok(results.length >= 1)
    const first = results[0]
    assert.ok('agentPath' in first)
    assert.equal(first.title, 'OpenCode')
    assert.equal(first.agentPath, '/docs/agents/opencode')
  })
})

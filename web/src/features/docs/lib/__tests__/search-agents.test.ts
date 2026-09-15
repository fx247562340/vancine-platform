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

import enBundle from '../../i18n/locales/en.json'
import zhCNBundle from '../../i18n/locales/zhCN.json'
import type { AgentSearchIndexEntry } from '../../types.ts'

/**
 * Search contract for the nested agent setup guides: each guide is
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
    pi: {
      pageTitle: 'Pi setup guide',
      valueProp:
        'Use your own Vancine API Key in the Pi coding agent through the pi-provider-vancine extension.',
    },
    openclaw: {
      pageTitle: 'OpenClaw setup guide',
      valueProp:
        'Use your own Vancine API Key in OpenClaw through the @vancine/openclaw-provider community plugin, installed from npm or ClawHub.',
    },
    hermes: {
      pageTitle: 'Hermes Agent setup guide',
      valueProp:
        'Use your own Vancine API Key in Hermes Agent through the vancine-hermes-provider plugin, installed from its public GitHub source.',
      step1:
        'Install the provider plugin from its published public source (fx247562340/vancine-hermes-provider):',
    },
  },
}

const EXPECTED_AGENT_PATHS = [
  '/docs/agents/cline',
  '/docs/agents/hermes',
  '/docs/agents/openclaw',
  '/docs/agents/opencode',
  '/docs/agents/pi',
  '/docs/agents/roo-code',
]

describe('Docs search agent guide entries', () => {
  it('indexes the six guides with their nested route paths', async () => {
    const { buildSearchIndex } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)
    const agentEntries = index.filter(
      (entry): entry is AgentSearchIndexEntry => 'agentPath' in entry
    )
    assert.deepEqual(
      agentEntries.map((entry) => entry.agentPath).sort(),
      EXPECTED_AGENT_PATHS
    )
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

    const pi = searchDocs(index, 'Pi')
    assert.ok(pi.length >= 1)
    assert.equal(
      pi.some((r) => 'agentPath' in r && r.agentPath === '/docs/agents/pi'),
      true
    )

    const hermes = searchDocs(index, 'Hermes')
    assert.ok(hermes.length >= 1)
    assert.equal(
      hermes.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/hermes'
      ),
      true
    )
  })

  it('finds the provider guides by package name and install source', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)

    // Package names reach the exact provider guide, not just the hub.
    const piPackage = searchDocs(index, 'pi-provider-vancine')
    assert.ok(
      piPackage.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/pi'
      ),
      'pi-provider-vancine must find the Pi guide'
    )

    const ocPackage = searchDocs(index, '@vancine/openclaw-provider')
    assert.ok(
      ocPackage.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/openclaw'
      ),
      '@vancine/openclaw-provider must find the OpenClaw guide'
    )

    const clawhub = searchDocs(index, 'ClawHub')
    assert.ok(
      clawhub.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/openclaw'
      ),
      'ClawHub must find the OpenClaw guide'
    )

    // The Hermes plugin name and its install command's repository slug
    // reach the Hermes guide, not just the hub.
    for (const query of [
      'vancine-hermes-provider',
      'fx247562340/vancine-hermes-provider',
    ]) {
      const hermesPackage = searchDocs(index, query)
      assert.ok(
        hermesPackage.some(
          (r) => 'agentPath' in r && r.agentPath === '/docs/agents/hermes'
        ),
        `${query} must find the Hermes guide`
      )
    }
  })

  it('shared troubleshooting copy is searchable on every guide, not just the hub', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const index = buildSearchIndex(AGENT_BUNDLE)

    for (const query of ['CORS', 'invalid API key']) {
      const results = searchDocs(index, query)
      const agentHits = results.filter((r) => 'agentPath' in r)
      assert.deepEqual(
        agentHits.map((r) => ('agentPath' in r ? r.agentPath : '')).sort(),
        EXPECTED_AGENT_PATHS,
        `query "${query}" must reach all six guide pages via merged common copy`
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

/**
 * The relationship-disclaimer copy (`notOfficial`) was deleted from every
 * Docs locale: the product shows no distancing copy at all. This suite keeps
 * the discipline in place — the key must not exist in the shipped bundles, and
 * a relationship query must therefore surface nothing. Uses the real shipped
 * Docs bundles.
 */
describe('Docs bundles carry no unrendered relationship copy', () => {
  function collectKeys(obj: unknown, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) return [prefix]
    const keys: string[] = []
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        keys.push(...collectKeys(v, fullKey))
      } else {
        keys.push(fullKey)
      }
    }
    return keys
  }

  for (const [locale, bundle] of [
    ['en', enBundle],
    ['zhCN', zhCNBundle],
  ] as const) {
    it(`${locale}: no notOfficial key exists and relationship queries return no result`, async () => {
      assert.deepEqual(
        collectKeys(bundle).filter((key) => key.endsWith('.notOfficial')),
        [],
        `${locale} must not ship a notOfficial relationship-disclaimer key`
      )

      const { buildSearchIndex, searchDocs } = await import('../search.ts')
      const index = buildSearchIndex(bundle)
      const queries =
        locale === 'en'
          ? ['official cooperation', 'endorsement']
          : ['官方合作', '背书']
      for (const query of queries) {
        assert.deepEqual(
          searchDocs(index, query),
          [],
          `"${query}" must not surface any Docs result in ${locale}`
        )
      }
    })
  }

  it('keeps the real product vocabulary searchable in both locales', async () => {
    const { buildSearchIndex, searchDocs } = await import('../search.ts')
    const enIndex = buildSearchIndex(enBundle)
    const zhIndex = buildSearchIndex(zhCNBundle)

    // Provider packages and the Pi catalog entry still reach their guide.
    const piResults = searchDocs(enIndex, 'pi-provider-vancine')
    assert.ok(
      piResults.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/pi'
      ),
      'pi-provider-vancine must find the Pi guide'
    )
    const piCatalog = searchDocs(enIndex, 'Pi package catalog')
    assert.ok(
      piCatalog.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/pi'
      ),
      'Pi package catalog must find the Pi guide'
    )
    const ocResults = searchDocs(enIndex, '@vancine/openclaw-provider')
    assert.ok(
      ocResults.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/openclaw'
      ),
      '@vancine/openclaw-provider must find the OpenClaw guide'
    )
    const opencodeResults = searchDocs(enIndex, 'OpenCode')
    assert.ok(
      opencodeResults.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/opencode'
      ),
      'OpenCode must find the OpenCode guide'
    )
    const hermesResults = searchDocs(enIndex, 'vancine-hermes-provider')
    assert.ok(
      hermesResults.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/hermes'
      ),
      'vancine-hermes-provider must find the Hermes guide'
    )
    // Shared troubleshooting copy stays reachable on every guide.
    const apiKeyHits = searchDocs(enIndex, 'invalid API key')
    assert.deepEqual(
      apiKeyHits
        .filter((r) => 'agentPath' in r)
        .map((r) => ('agentPath' in r ? r.agentPath : ''))
        .sort(),
      EXPECTED_AGENT_PATHS,
      'invalid API key must still reach all six guides'
    )

    // Chinese bundle: same package names, plus the localized install copy.
    const piZh = searchDocs(zhIndex, 'pi-provider-vancine')
    assert.ok(
      piZh.some((r) => 'agentPath' in r && r.agentPath === '/docs/agents/pi'),
      'pi-provider-vancine must find the Pi guide in zhCN'
    )
    const ocZh = searchDocs(zhIndex, '@vancine/openclaw-provider')
    assert.ok(
      ocZh.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/openclaw'
      ),
      '@vancine/openclaw-provider must find the OpenClaw guide in zhCN'
    )
    const hermesZh = searchDocs(zhIndex, 'vancine-hermes-provider')
    assert.ok(
      hermesZh.some(
        (r) => 'agentPath' in r && r.agentPath === '/docs/agents/hermes'
      ),
      'vancine-hermes-provider must find the Hermes guide in zhCN'
    )

    // Every guide stays findable through its own localized page title, which
    // is what a reader actually types into the search box.
    for (const [locale, bundle, index] of [
      ['en', enBundle, enIndex],
      ['zhCN', zhCNBundle, zhIndex],
    ] as const) {
      const guides = (bundle as { agentGuides: Record<string, unknown> })
        .agentGuides
      for (const path of EXPECTED_AGENT_PATHS) {
        const key = path.replace('/docs/agents/', '')
        const toolKey = key === 'roo-code' ? 'rooCode' : key
        const title = (guides[toolKey] as { pageTitle: string }).pageTitle
        assert.ok(
          searchDocs(index, title).some(
            (r) => 'agentPath' in r && r.agentPath === path
          ),
          `${locale}: "${title}" must find ${path}`
        )
      }
    }
  })
})

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
import { DOCS_AGENT_TOOLS } from '../lib/agents.ts'
import { ALL_DOCS_SLUGS, SLUG_TO_TITLE_KEY } from '../nav.ts'
import type {
  AgentSearchIndexEntry,
  SearchIndexEntry,
  SearchResult,
  SlugSearchIndexEntry,
} from '../types.ts'

export const MAX_SEARCH_RESULTS = 8
const SNIPPET_RADIUS = 40

type DocsBundle = Record<string, unknown>

function flattenValues(obj: unknown, out: string[] = []): string[] {
  if (obj == null) return out
  if (typeof obj === 'string') {
    out.push(obj)
    return out
  }
  if (Array.isArray(obj)) {
    for (const item of obj) flattenValues(item, out)
    return out
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      flattenValues(v, out)
    }
  }
  return out
}

export function buildSearchIndex(bundle: DocsBundle): SearchIndexEntry[] {
  const nav = (bundle.nav ?? {}) as Record<string, string>
  const slugEntries: SlugSearchIndexEntry[] = ALL_DOCS_SLUGS.map((slug) => {
    const titleKey = SLUG_TO_TITLE_KEY[slug] ?? slug
    const title = nav[titleKey] ?? slug
    const pageObj = (bundle[slug] ?? {}) as Record<string, unknown>
    const bodyParts = flattenValues(pageObj)
    const body = bodyParts.join(' ')
    return {
      slug,
      title,
      titleLower: String(title).toLowerCase(),
      body,
      bodyLower: body.toLowerCase(),
    }
  })

  // Nested agent setup guides (/docs/agents/<tool>) are indexed only when
  // the bundle actually carries their agentGuides section, so synthetic
  // test bundles and partial loads never produce phantom results. Each
  // guide merges the shared agentGuides.common copy (prerequisites, Base
  // URL, troubleshooting, CTAs) with its tool-specific copy, so shared
  // troubleshooting terms such as "CORS" or "invalid API key" find the
  // concrete guide page, not just the hub.
  const agentGuides = (bundle.agentGuides ?? {}) as Record<string, unknown>
  const commonObj =
    typeof agentGuides.common === 'object' && agentGuides.common !== null
      ? (agentGuides.common as Record<string, unknown>)
      : {}
  const agentEntries: AgentSearchIndexEntry[] = []
  for (const tool of DOCS_AGENT_TOOLS) {
    const pageObj = agentGuides[tool.key]
    if (typeof pageObj !== 'object' || pageObj === null) continue
    const record = pageObj as Record<string, unknown>
    const title =
      typeof record.pageTitle === 'string' && record.pageTitle.trim() !== ''
        ? record.pageTitle
        : tool.displayName
    // The language-neutral display name is prepended so the tool stays
    // findable even when the localized title is translated.
    const body = [
      tool.displayName,
      ...flattenValues(record),
      ...flattenValues(commonObj),
    ].join(' ')
    agentEntries.push({
      agentPath: tool.path,
      title,
      titleLower: title.toLowerCase(),
      body,
      bodyLower: body.toLowerCase(),
    })
  }

  return [...slugEntries, ...agentEntries]
}

function makeSnippet(text: string, query: string, queryLower: string): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(queryLower)
  if (idx === -1) return ''
  const start = Math.max(0, idx - SNIPPET_RADIUS)
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS)
  let snippet = text.slice(start, end).replaceAll(/\s+/g, ' ').trim()
  if (start > 0) snippet = `…${snippet}`
  if (end < text.length) snippet = `${snippet}…`
  return snippet
}

export function searchDocs(
  index: SearchIndexEntry[],
  query: string
): SearchResult[] {
  const q = query.trim()
  if (!q) return []
  const qLower = q.toLowerCase()
  const results: SearchResult[] = []

  for (const item of index) {
    const titleHit = item.titleLower.includes(qLower)
    const bodyIdx = item.bodyLower.indexOf(qLower)
    if (!titleHit && bodyIdx === -1) continue
    const score = titleHit ? 0 : 1
    const snippet = titleHit ? '' : makeSnippet(item.body, q, qLower)
    if ('agentPath' in item) {
      results.push({
        agentPath: item.agentPath,
        title: item.title,
        snippet,
        score,
      })
    } else {
      results.push({ slug: item.slug, title: item.title, snippet, score })
    }
  }

  results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
  return results.slice(0, MAX_SEARCH_RESULTS)
}

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
export type DocsSlug =
  | 'quickstart'
  | 'migrate'
  | 'models'
  | 'chat'
  | 'image'
  | 'video'
  | 'td'
  | 'audio'
  | 'sdks'
  | 'agents'
  | 'auth'
  | 'capabilities'
  | 'errors'
  | 'faq'

interface DocsNavItem {
  slug: DocsSlug
  titleKey: string
}

export interface DocsNavGroup {
  groupKey: string
  items: DocsNavItem[]
}

export interface TocHeading {
  id: string
  title: string
  level: 2 | 3
}

/** Canonical lowercase route paths of the nested agent setup guides. */
export type DocsAgentGuidePath =
  | '/docs/agents/opencode'
  | '/docs/agents/cline'
  | '/docs/agents/roo-code'

/**
 * Searchable Docs targets form a discriminated union so the type system
 * guarantees each entry is exactly one kind of target:
 * - top-level Docs pages carry `slug` and never `agentPath`;
 * - nested agent setup guides carry `agentPath` and never `slug`.
 */
export interface SlugSearchResult {
  slug: DocsSlug
  title: string
  snippet: string
  score: number
}

export interface AgentSearchResult {
  agentPath: DocsAgentGuidePath
  title: string
  snippet: string
  score: number
}

export type SearchResult = SlugSearchResult | AgentSearchResult

export interface SlugSearchIndexEntry {
  slug: DocsSlug
  title: string
  titleLower: string
  body: string
  bodyLower: string
}

export interface AgentSearchIndexEntry {
  agentPath: DocsAgentGuidePath
  title: string
  titleLower: string
  body: string
  bodyLower: string
}

export type SearchIndexEntry = SlugSearchIndexEntry | AgentSearchIndexEntry

interface DocsPageProps {
  baseUrl: string
}

export type DocsPageComponent = React.ComponentType<DocsPageProps>

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
import { createFileRoute } from '@tanstack/react-router'

import { DocsLayout } from '@/features/docs'
import { getDocsAgentNotFoundPageMetadata } from '@/features/docs/lib/agents-metadata'
import { usePageMetadata } from '@/hooks/use-page-metadata'

export const Route = createFileRoute('/docs/agents/$')({
  component: DocsAgentUnknownPathPage,
})

/** Module-level constant: mirrors the server-rendered /docs block. */
const AGENT_NOT_FOUND_METADATA = getDocsAgentNotFoundPageMetadata()

/**
 * Catch-all for unknown /docs/agents/<segment> paths (case variants,
 * abbreviations, version aliases, typos). Renders the existing localized
 * Docs not-found view instead of silently falling back to the Agent
 * Integration hub or Quick Start.
 *
 * The metadata owner below deliberately takes over the head: the guide
 * pages own tool-specific metadata while mounted, and an SPA navigation
 * from a guide to an unknown subpath must never leave a stale OpenCode /
 * Cline / Roo Code title, description or canonical behind. The takeover
 * block is the neutral /docs metadata, matching what the server renders
 * for the /docs route.
 */
function DocsAgentUnknownPathPage() {
  usePageMetadata(AGENT_NOT_FOUND_METADATA, { publicMarketingPage: true })
  return <DocsLayout slugParam='__not_found__' />
}

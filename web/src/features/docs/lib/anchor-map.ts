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
import type { DocsSlug } from '../types.ts'

/**
 * Maps landing-page hash anchors to their corresponding Docs slug.
 * e.g. /docs#image → /docs/image
 */
const ANCHOR_TO_SLUG: Record<string, DocsSlug> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  chat: 'chat',
  td: 'td',
  models: 'models',
  quickstart: 'quickstart',
  migrate: 'migrate',
  sdks: 'sdks',
  agents: 'agents',
  auth: 'auth',
  capabilities: 'capabilities',
  errors: 'errors',
  faq: 'faq',
}

export function resolveDocsAnchor(hash: string): DocsSlug | null {
  const cleaned = hash.replace(/^#/, '').toLowerCase()
  return ANCHOR_TO_SLUG[cleaned] ?? null
}

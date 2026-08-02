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
import type { DocsNavGroup, DocsSlug } from './types.ts'

export const DOCS_NAV_GROUPS: DocsNavGroup[] = [
  {
    groupKey: 'gettingStarted',
    items: [
      { slug: 'quickstart', titleKey: 'quickstart' },
      { slug: 'migrate', titleKey: 'migrate' },
      { slug: 'models', titleKey: 'models' },
    ],
  },
  {
    groupKey: 'apiCapabilities',
    items: [
      { slug: 'chat', titleKey: 'chat' },
      { slug: 'image', titleKey: 'image' },
      { slug: 'video', titleKey: 'video' },
      { slug: 'td', titleKey: 'td' },
      { slug: 'audio', titleKey: 'audio' },
    ],
  },
  {
    groupKey: 'integrationGuide',
    items: [
      { slug: 'sdks', titleKey: 'sdks' },
      { slug: 'agents', titleKey: 'agents' },
    ],
  },
  {
    groupKey: 'reference',
    items: [
      { slug: 'auth', titleKey: 'auth' },
      { slug: 'capabilities', titleKey: 'capabilities' },
      { slug: 'errors', titleKey: 'errors' },
      { slug: 'faq', titleKey: 'faq' },
    ],
  },
]

export const ALL_DOCS_SLUGS: DocsSlug[] = DOCS_NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => i.slug)
)

export const SLUG_TO_TITLE_KEY: Record<DocsSlug, string> = Object.fromEntries(
  DOCS_NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.slug, i.titleKey]))
) as Record<DocsSlug, string>

export const DOCS_DEFAULT_SLUG: DocsSlug = 'quickstart'

export function getPrevSlug(slug: DocsSlug): DocsSlug | null {
  const idx = ALL_DOCS_SLUGS.indexOf(slug)
  return idx > 0 ? ALL_DOCS_SLUGS[idx - 1] : null
}

export function getNextSlug(slug: DocsSlug): DocsSlug | null {
  const idx = ALL_DOCS_SLUGS.indexOf(slug)
  return idx >= 0 && idx < ALL_DOCS_SLUGS.length - 1
    ? ALL_DOCS_SLUGS[idx + 1]
    : null
}

export function isDocsSlug(value: string): value is DocsSlug {
  return (ALL_DOCS_SLUGS as string[]).includes(value)
}

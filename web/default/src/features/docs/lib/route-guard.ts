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
import { isDocsSlug } from '../nav.ts'
import type { DocsSlug } from '../types'

/** Sentinel thrown for an unknown Docs slug; the route maps it to notFound(). */
export class DocsNotFoundError extends Error {
  constructor(slug: string) {
    super(`Unknown docs slug: ${slug}`)
    this.name = 'DocsNotFoundError'
  }
}

/**
 * Resolve a raw route param to a valid Docs slug, or throw DocsNotFoundError.
 * Used by the `/docs/$slug` route beforeLoad to drive TanStack notFound().
 */
export function resolveDocsRouteSlug(slug: string): DocsSlug {
  if (isDocsSlug(slug)) return slug
  throw new DocsNotFoundError(slug)
}

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
import { createFileRoute, notFound } from '@tanstack/react-router'

import { DocsLayout } from '@/features/docs'
import {
  DocsNotFoundError,
  resolveDocsRouteSlug,
} from '@/features/docs/lib/route-guard'

export const Route = createFileRoute('/docs/$slug')({
  beforeLoad: ({ params }) => {
    // Unknown slugs render the router's notFound view instead of a
    // "Coming Soon" page that would incorrectly highlight Quickstart.
    try {
      resolveDocsRouteSlug(params.slug)
    } catch (error) {
      if (error instanceof DocsNotFoundError) {
        throw notFound()
      }
      throw error
    }
  },
  component: DocsPage,
  notFoundComponent: DocsNotFoundPage,
})

function DocsPage() {
  const { slug } = Route.useParams()
  return <DocsLayout slugParam={slug} />
}

function DocsNotFoundPage() {
  return <DocsLayout slugParam='__not_found__' />
}

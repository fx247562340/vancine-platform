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
import { getModelEntry } from '@/features/docs/lib/model-registry'

/**
 * /docs/models/<slug> — the dedicated model detail page.
 *
 * The slug is resolved against the model registry in beforeLoad; an
 * unknown slug throws notFound() so the URL never renders an empty
 * detail shell. Server-side HTML for the same path is noindex (see
 * router/web-router.go isUnknownDocsModelPath).
 */
export const Route = createFileRoute('/docs/models/$model')({
  beforeLoad: ({ params }) => {
    if (!getModelEntry(params.model)) {
      throw notFound()
    }
  },
  component: DocsModelDetailRoute,
  notFoundComponent: DocsModelNotFoundPage,
})

function DocsModelDetailRoute() {
  const { model } = Route.useParams()
  return <DocsLayout slugParam='models' modelSlug={model} />
}

function DocsModelNotFoundPage() {
  return <DocsLayout slugParam='__not_found__' />
}

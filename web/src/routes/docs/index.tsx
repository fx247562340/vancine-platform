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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { resolveDocsAnchor } from '@/features/docs/lib/anchor-map'
import { DOCS_DEFAULT_SLUG } from '@/features/docs/nav'

export const Route = createFileRoute('/docs/')({
  beforeLoad: ({ location }) => {
    // Handle anchor navigation: /docs#image → /docs/image
    const hash = location.hash
    if (hash) {
      const targetSlug = resolveDocsAnchor(hash)
      if (targetSlug) {
        throw redirect({ to: '/docs/$slug', params: { slug: targetSlug } })
      }
    }
    throw redirect({
      to: '/docs/$slug',
      params: { slug: DOCS_DEFAULT_SLUG },
    })
  },
})

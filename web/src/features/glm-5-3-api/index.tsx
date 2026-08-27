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

For commercial licensing, please contact support@quantumnous.com.
*/
import { useLocation } from '@tanstack/react-router'
import { useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { usePageMetadata } from '@/hooks/use-page-metadata'
import { useAuthStore } from '@/stores/auth-store'

import { Comparison } from './components/comparison'
import { Faq } from './components/faq'
import { FinalCta } from './components/final-cta'
import { Hero } from './components/hero'
import { ModelChoice } from './components/model-choice'
import { Quickstart } from './components/quickstart'
import { getGlm53ApiPageMetadata } from './lib/glm-5-3-api'

/**
 * SEO-4 Phase 1 acquisition page for /glm-5-3-api. ONE canonical page
 * covers BOTH glm-5.3 and glm-5.3-flash; there is deliberately no
 * /glm-5-3-flash-api sibling route.
 *
 * The page composes the shared PublicLayout and Footer, manages its own
 * SEO metadata through the shared page-metadata hook, and delegates
 * every section to a dedicated component. The English metadata is the
 * contract enforced by router/web_seo_test.go.
 */
export function Glm53ApiPage(): ReactElement {
  const { i18n } = useTranslation()
  // Subscribe only to the field this page reads: the auth user. The CTA
  // parity (guest -> /sign-up, authenticated -> /playground) is covered
  // by the page tests, including an after-mount auth flip.
  const user = useAuthStore((state) => state.auth.user)
  const location = useLocation()
  const isAuthenticated = !!user
  const search = location.searchStr ?? ''

  const metadata = useMemo(
    () => getGlm53ApiPageMetadata(i18n.language),
    [i18n.language]
  )
  // Public marketing route: the metadata is owned by this page. The
  // `publicMarketingPage: true` flag prevents the system branding
  // bootstrap in main.tsx from overwriting the route-level title.
  usePageMetadata(metadata, { publicMarketingPage: true })

  return (
    <PublicLayout showMainContainer={false}>
      <main className='flex flex-1 flex-col'>
        <Hero isAuthenticated={isAuthenticated} search={search} />
        <ModelChoice />
        <Comparison />
        <Quickstart isAuthenticated={isAuthenticated} search={search} />
        <Faq />
        <FinalCta isAuthenticated={isAuthenticated} search={search} />
      </main>
      <Footer />
    </PublicLayout>
  )
}

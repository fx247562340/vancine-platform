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
import { useLocation } from '@tanstack/react-router'
import { useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { useLiveModelCatalog } from '@/features/live-model-catalog/hooks/use-live-model-catalog'
import { usePageMetadata } from '@/hooks/use-page-metadata'
import { useAuthStore } from '@/stores/auth-store'

import { ApiExamples } from './components/api-examples'
import { CapabilityStrip } from './components/capability-strip'
import { AiMediaFaq } from './components/faq'
import { AiMediaFinalCta } from './components/final-cta'
import { AiMediaHero } from './components/hero'
import { IntegrationBenefits } from './components/integration-benefits'
import { LiveSources } from './components/live-sources'
import { MediaCategories } from './components/media-categories'
import { UseCases } from './components/use-cases'
import { getAiMediaPageMetadata } from './lib/landing'

/**
 * Public developer landing page for the AI Media API. Composes the shared
 * PublicLayout and Footer, manages its own SEO metadata through the shared
 * page-metadata hook, and delegates every section to a dedicated component.
 *
 * The page is the single owner of the live model catalog query. The
 * resulting catalog state and refetch handle are forwarded to every
 * consumer that may need to retry (MediaCategories / ApiExamples) so
 * they never trigger an independent `/api/pricing` request.
 */
export function AiMediaApiPage(): ReactElement {
  const { i18n } = useTranslation()
  const { auth } = useAuthStore()
  const location = useLocation()
  const isAuthenticated = !!auth.user
  const search = location.searchStr ?? ''

  const metadata = useMemo(
    () => getAiMediaPageMetadata(i18n.language),
    [i18n.language]
  )
  // Public marketing route: the metadata is owned by this page. The
  // `publicMarketingPage: true` flag prevents the system branding
  // bootstrap in main.tsx from overwriting the route-level title.
  usePageMetadata(metadata, { publicMarketingPage: true })

  // The single live media catalog query for the entire page. Both
  // MediaCategories and ApiExamples consume the same shape, so the same
  // TanStack Query cache entry backs both renderers.
  const { catalog, refetch } = useLiveModelCatalog()

  return (
    <PublicLayout showMainContainer={false}>
      <main className='flex flex-1 flex-col'>
        <AiMediaHero isAuthenticated={isAuthenticated} search={search} />
        <CapabilityStrip />
        <IntegrationBenefits />
        <MediaCategories catalog={catalog} />
        <ApiExamples catalog={catalog} onRetry={refetch} />
        <UseCases />
        <LiveSources />
        <AiMediaFaq />
        <AiMediaFinalCta isAuthenticated={isAuthenticated} search={search} />
      </main>
      <Footer />
    </PublicLayout>
  )
}

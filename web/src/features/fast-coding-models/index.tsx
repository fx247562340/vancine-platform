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
import { usePageMetadata } from '@/hooks/use-page-metadata'
import { useAuthStore } from '@/stores/auth-store'

import { Comparison } from './components/comparison'
import { EndpointOverview } from './components/endpoint-overview'
import { EvidenceBoundary } from './components/evidence-boundary'
import { Faq } from './components/faq'
import { FinalCta } from './components/final-cta'
import { Hero } from './components/hero'
import { ModelCards } from './components/model-cards'
import { Quickstart } from './components/quickstart'
import { getFastCodingModelsPageMetadata } from './lib/fast-coding-models'

/**
 * Acquisition guide for /guides/fast-coding-models. One canonical
 * selection guide lists every model whose live /api/pricing entry
 * carries the exact "fast" tag — no fixed count, no per-id
 * allowlist, and no substitution when the fast tag is missing.
 * English metadata is the contract enforced by
 * router/web_seo_test.go.
 */
export function FastCodingModelsPage(): ReactElement {
  const { i18n } = useTranslation()
  // Subscribe only to the field this page reads: the auth user. The
  // CTA parity (guest -> /sign-up, authenticated -> /playground) is
  // covered by the page tests.
  const user = useAuthStore((state) => state.auth.user)
  const location = useLocation()
  const isAuthenticated = !!user
  const search = location.searchStr ?? ''

  const metadata = useMemo(
    () => getFastCodingModelsPageMetadata(i18n.language),
    [i18n.language]
  )
  // Public marketing route: the metadata is owned by this page. The
  // `publicMarketingPage: true` flag prevents the system branding
  // bootstrap in main.tsx from overwriting the route-level title.
  usePageMetadata(metadata, { publicMarketingPage: true })

  return (
    <PublicLayout showMainContainer={false}>
      <main className='flex w-full flex-1 flex-col overflow-x-hidden'>
        <Hero isAuthenticated={isAuthenticated} search={search} />
        <EndpointOverview />
        <ModelCards />
        <Comparison />
        <Quickstart isAuthenticated={isAuthenticated} search={search} />
        <EvidenceBoundary />
        <Faq />
        <FinalCta isAuthenticated={isAuthenticated} search={search} />
      </main>
      <Footer />
    </PublicLayout>
  )
}

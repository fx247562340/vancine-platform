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

import { AgentCompatibility } from './components/agent-compatibility'
import { Availability } from './components/availability'
import { Evidence } from './components/evidence'
import { Faq } from './components/faq'
import { FinalCta } from './components/final-cta'
import { Hero } from './components/hero'
import { Quickstart } from './components/quickstart'
import { getKimiK3PageMetadata } from './lib/landing'

/**
 * Public developer landing page for the Kimi K3 model. Composes the shared
 * PublicLayout and Footer, manages its own SEO metadata through the shared
 * page-metadata hook, and delegates every section to a dedicated component.
 */
export function KimiK3ApiPage(): ReactElement {
  const { i18n } = useTranslation()
  const { auth } = useAuthStore()
  const location = useLocation()
  const isAuthenticated = !!auth.user
  const search = location.searchStr ?? ''

  const metadata = useMemo(
    () => getKimiK3PageMetadata(i18n.language),
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
        <Quickstart isAuthenticated={isAuthenticated} search={search} />
        <AgentCompatibility />
        <Evidence />
        <Availability />
        <Faq />
        <FinalCta isAuthenticated={isAuthenticated} search={search} />
      </main>
      <Footer />
    </PublicLayout>
  )
}

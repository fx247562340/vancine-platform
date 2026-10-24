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
import { useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { useLandingPricing } from '@/features/landing-pricing'
import { usePageMetadata } from '@/hooks/use-page-metadata'
import { useAuthStore } from '@/stores/auth-store'

import { AgentCompatibility } from './components/agent-compatibility'
import { Availability } from './components/availability'
import { Evidence } from './components/evidence'
import { Faq } from './components/faq'
import { FinalCta } from './components/final-cta'
import { Hero } from './components/hero'
import { Quickstart } from './components/quickstart'
import {
  getKimiK3PageMetadata,
  KIMI_K31_DEFAULT_MODEL_ID,
  type KimiK31ModelId,
} from './lib/landing'

/**
 * Public developer landing page for Kimi K3.1 Pro and Highspeed. The route
 * stays /kimi-k3-api. One pricing query feeds both model selections.
 */
export function KimiK3ApiPage(): ReactElement {
  const { i18n } = useTranslation()
  const { auth } = useAuthStore()
  const location = useLocation()
  const isAuthenticated = !!auth.user
  const search = location.searchStr ?? ''
  const [modelId, setModelId] = useState<KimiK31ModelId>(
    KIMI_K31_DEFAULT_MODEL_ID
  )

  const metadata = useMemo(
    () => getKimiK3PageMetadata(i18n.language),
    [i18n.language]
  )
  usePageMetadata(metadata, { publicMarketingPage: true })
  const landingPricing = useLandingPricing()
  const vancinePrice = landingPricing.resolve(modelId, {
    allowSimpleLinearExpression: true,
  })

  return (
    <PublicLayout showMainContainer={false}>
      <main className='flex flex-1 flex-col'>
        <Hero
          isAuthenticated={isAuthenticated}
          search={search}
          modelId={modelId}
          onModelChange={setModelId}
          vancinePrice={vancinePrice}
        />
        <Availability
          modelId={modelId}
          onModelChange={setModelId}
          vancinePrice={vancinePrice}
        />
        <Evidence />
        <Quickstart
          isAuthenticated={isAuthenticated}
          search={search}
          modelId={modelId}
        />
        <AgentCompatibility modelId={modelId} />
        <Faq />
        <FinalCta isAuthenticated={isAuthenticated} search={search} />
      </main>
      <Footer />
    </PublicLayout>
  )
}

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
// Acquisition-page wiring contract: every acquisition landing page's closing
// CTA mounts the shared first-top-up-bonus callout, driven by the same
// /api/status configuration. Active promotion → the compact callout renders
// near the CTA; disabled promotion → the pages render exactly as before.

/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AiMediaFinalCta } from '@/features/ai-media-api/components/final-cta'
import { FinalCta as GlmApiFinalCta } from '@/features/glm-5-3-api/components/final-cta'
import { FinalCta as KimiK3FinalCta } from '@/features/kimi-k3-api/components/final-cta'
import { FinalCta as OpenRouterFinalCta } from '@/features/openrouter-alternative/components/final-cta'
import { FinalCta as SeedanceFinalCta } from '@/features/seedance-api/components/final-cta'
import enLocale from '@/i18n/locales/en.json'

const statusMock = vi.hoisted(() => ({ current: {} as unknown }))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: statusMock.current,
    loading: false,
    error: null,
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: enLocale },
})

const cases = [
  {
    name: 'Kimi K3 API',
    path: '/kimi-k3-api',
    node: <KimiK3FinalCta isAuthenticated={false} search='' />,
  },
  {
    name: 'Seedance API',
    path: '/seedance-api',
    node: <SeedanceFinalCta isAuthenticated={false} search='' />,
  },
  {
    name: 'AI Media API',
    path: '/ai-media-api',
    node: <AiMediaFinalCta isAuthenticated={false} search='' />,
  },
  {
    name: 'OpenRouter Alternative',
    path: '/openrouter-alternative',
    node: <OpenRouterFinalCta isAuthenticated={false} search='' />,
  },
  {
    name: 'GLM API',
    path: '/glm-api',
    node: <GlmApiFinalCta isAuthenticated={false} search='' />,
  },
]

function renderWithRouter(node: React.ReactNode, path: string) {
  const rootRoute = createRootRoute({ component: () => node })
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: () => <div data-testid='sign-up-page' />,
  })
  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <div data-testid='landing-page'>{node}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([landingRoute, signUpRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  statusMock.current = {}
})

describe('acquisition final CTAs wire the first top-up bonus callout', () => {
  it.each(cases)(
    '$name shows the compact callout when the promotion is active',
    async ({ path, node }) => {
      statusMock.current = {
        first_topup_bonus_quota: 500000,
        first_topup_bonus_active: true,
        quota_per_unit: 500000,
      }
      renderWithRouter(node, path)
      await waitFor(() => {
        expect(
          screen.getAllByText('First top-up bonus').length
        ).toBeGreaterThan(0)
      })
      expect(
        screen.getAllByText('500,000 Bonus Credits · $1 API balance').length
      ).toBeGreaterThan(0)
      expect(
        screen.getAllByText(
          'After your first successful top-up · one bonus per account'
        ).length
      ).toBeGreaterThan(0)
    }
  )

  it.each(cases)(
    '$name renders no bonus callout when the promotion is inactive even with a positive quota',
    async ({ path, node }) => {
      statusMock.current = {
        first_topup_bonus_quota: 500000,
        first_topup_bonus_active: false,
        quota_per_unit: 500000,
      }
      const { container } = renderWithRouter(node, path)
      await waitFor(() => {
        expect(container.querySelector('section')).not.toBeNull()
      })
      expect(screen.queryByText('First top-up bonus')).not.toBeInTheDocument()
      expect(
        screen.queryByText('500,000 Bonus Credits · $1 API balance')
      ).not.toBeInTheDocument()
    }
  )
})

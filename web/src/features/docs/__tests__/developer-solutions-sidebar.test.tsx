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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import {
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import { DocsSidebar } from '../components/sidebar'

// The search box is a collaborator with its own context/network needs; the
// sidebar block under test does not touch it.
vi.mock('../components/search-box', () => ({
  DocsSearchBox: () => <div data-testid='docs-search-box' />,
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

let i18nReady = false

async function initTestI18n(): Promise<void> {
  if (!i18nReady) {
    await i18n.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18n.changeLanguage('en')
}

const testRootRoute = createRootRoute({ component: () => <Outlet /> })

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

const testRouteTree = testRootRoute.addChildren([
  createRoute({
    getParentRoute: () => testRootRoute,
    path: '/docs',
    component: () => <DocsSidebar activeSlug={null} />,
  }),
  stubRoute('/docs/$slug', 'docs-page'),
  stubRoute('/kimi-k3-api', 'kimi-page'),
  stubRoute('/seedance-api', 'seedance-page'),
  stubRoute('/ai-media-api', 'ai-media-page'),
])

function renderSidebar(): RenderResult {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: ['/docs'] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  await initTestI18n()
  trackEventMock.mockClear()
})

describe('Docs sidebar Developer solutions block', () => {
  it('renders both registry entries as same-origin links on desktop', async () => {
    renderSidebar()

    // The block heading comes from the global namespace.
    expect(await screen.findByText('Developer solutions')).toBeInTheDocument()

    const kimiLink = await screen.findByRole('link', { name: 'Kimi K3 API' })
    expect(kimiLink).toHaveAttribute('href', '/kimi-k3-api')
    expect(kimiLink).not.toHaveAttribute('target')

    const seedanceLink = await screen.findByRole('link', {
      name: 'Seedance 2.5 API',
    })
    expect(seedanceLink).toHaveAttribute('href', '/seedance-api')
    expect(seedanceLink).not.toHaveAttribute('target')

    const aiMediaLink = await screen.findByRole('link', {
      name: 'AI Media API',
    })
    expect(aiMediaLink).toHaveAttribute('href', '/ai-media-api')
    expect(aiMediaLink).not.toHaveAttribute('target')
  })

  it('navigates and records the docs analytics event on activation', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const kimiLink = await screen.findByRole('link', { name: 'Kimi K3 API' })
    await user.click(kimiLink)

    expect(await screen.findByTestId('kimi-page')).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'kimi_k3_api',
      location: 'docs',
    })
  })

  it('shows the block in the mobile dropdown and closes it after activation', async () => {
    const user = userEvent.setup()
    renderSidebar()

    // The Docs namespace bundle is not loaded in this suite, so the toggle
    // label falls back to its key — locate the toggle structurally.
    const toggle = (await screen.findByText('common.navigation')).closest(
      'button'
    )
    expect(toggle).not.toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle as HTMLButtonElement)
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
    })

    const dropdown = document.querySelector('#docs-mobile-nav')
    expect(dropdown).not.toBeNull()

    // The mobile dropdown mirrors the same registry links; activate the
    // AI Media entry inside it.
    const aiMediaLinks = await screen.findAllByRole('link', {
      name: 'AI Media API',
    })
    const mobileLink = aiMediaLinks.find(
      (link) => link.closest('#docs-mobile-nav') !== null
    )
    expect(mobileLink).toBeDefined()
    await user.click(mobileLink as HTMLAnchorElement)

    expect(await screen.findByTestId('ai-media-page')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelector('#docs-mobile-nav')).toBeNull()
    })
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'ai_media_api',
      location: 'docs',
    })
  })

  it('does not touch Docs nav groups or introduce fake Docs pages', async () => {
    renderSidebar()

    // Every registry link navigates OUT of /docs to a real landing route.
    const kimiLink = await screen.findByRole('link', { name: 'Kimi K3 API' })
    expect(String(kimiLink.getAttribute('href'))).not.toMatch(/^\/docs\//)
    const seedanceLink = await screen.findByRole('link', {
      name: 'Seedance 2.5 API',
    })
    expect(String(seedanceLink.getAttribute('href'))).not.toMatch(/^\/docs\//)
    const aiMediaLink = await screen.findByRole('link', {
      name: 'AI Media API',
    })
    expect(String(aiMediaLink.getAttribute('href'))).not.toMatch(/^\/docs\//)
  })
})

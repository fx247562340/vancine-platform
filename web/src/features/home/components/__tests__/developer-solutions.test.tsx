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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import { DeveloperSolutions } from '../sections/developer-solutions'

// The DeveloperSolutions component is no longer mounted on the default
// built-in homepage (v1.2.0 collapse), but the component itself is still
// shipped: the public header's "API Solutions" menu and the docs sidebar
// consume the same registry. These tests pin the contract the component
// itself honours, independent of where it is mounted.

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Footer dependencies: avoid the real /api/status network request.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Vancine',
    logo: '',
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

let originalIntersectionObserverDescriptor: PropertyDescriptor | undefined

beforeEach(async () => {
  originalIntersectionObserverDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver'
  )
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  })
  await initTestI18n()
  localStorage.clear()
  trackEventMock.mockClear()
})

afterEach(() => {
  if (originalIntersectionObserverDescriptor === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(
      globalThis,
      'IntersectionObserver',
      originalIntersectionObserverDescriptor
    )
  }
  localStorage.clear()
  vi.restoreAllMocks()
})

let i18nReady = false

async function initTestI18n(): Promise<void> {
  if (!i18nReady) {
    await i18n.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18n.changeLanguage('en')
}

function stubRoute(root: AnyRoute, path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => root,
    path,
    component: () => <div data-testid={testId} />,
  })
}

function renderDeveloperSolutions(): RenderResult {
  const devRoot = createRootRoute()
  const router = createRouter({
    routeTree: devRoot.addChildren([
      createRoute({
        getParentRoute: () => devRoot,
        path: '/',
        component: () => <DeveloperSolutions />,
      }),
      stubRoute(devRoot, '/kimi-k3-api', 'kimi-page'),
      stubRoute(devRoot, '/seedance-api', 'seedance-page'),
      stubRoute(devRoot, '/ai-media-api', 'ai-media-page'),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('DeveloperSolutions component contract', () => {
  it('renders all three registry entries with their target routes', async () => {
    renderDeveloperSolutions()
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Landing pages for coding agents and AI media workflows.',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Kimi K3 API')).toBeInTheDocument()
    expect(screen.getByText('Seedance 2.5 API')).toBeInTheDocument()
    expect(screen.getByText('AI Media API')).toBeInTheDocument()

    const learnMoreLinks = screen.getAllByRole('link', { name: /Learn more/ })
    const hrefs = learnMoreLinks.map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('/kimi-k3-api')
    expect(hrefs).toContain('/seedance-api')
    expect(hrefs).toContain('/ai-media-api')
    // All routes are same-origin, so no target=_blank.
    for (const link of learnMoreLinks) {
      expect(link).not.toHaveAttribute('target')
    }
  })

  it('records developer_resource_clicked with the clicked resource and homepage location', async () => {
    const user = userEvent.setup()
    renderDeveloperSolutions()
    await screen.findByRole('heading', {
      level: 2,
      name: 'Landing pages for coding agents and AI media workflows.',
    })

    const learnMoreLinks = screen.getAllByRole('link', { name: /Learn more/ })
    await user.click(learnMoreLinks[0])

    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'kimi_k3_api',
      location: 'homepage',
    })
  })
})

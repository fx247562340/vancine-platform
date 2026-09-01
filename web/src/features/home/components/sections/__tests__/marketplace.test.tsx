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
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import {
  ERROR_STATE,
  LOADING_STATE,
  type HomepagePricingModel,
  type HomepagePricingState,
} from '../../../lib/homepage-pricing'
import { Marketplace } from '../marketplace'

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as unknown as ReturnType<typeof vi.fn>

class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

// TanStack Router only renders the matched route component, so the index
// route renders Marketplace. Each test builds a fresh router so pricing state
// never leaks between cases.
function buildRouter(pricing: HomepagePricingState) {
  const root = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <Marketplace pricing={pricing} />,
  })
  return createRouter({
    routeTree: root.addChildren([
      indexRoute,
      createRoute({
        getParentRoute: () => root,
        path: '/pricing',
        component: () => null,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/sign-up',
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

const wrap = (pricing: HomepagePricingState) => {
  const router = buildRouter(pricing)
  return render(<RouterProvider router={router} />)
}

function makeModel(
  name: string,
  endpoints: string[] = []
): HomepagePricingModel {
  return {
    model_name: name,
    description: '',
    tags: '',
    supported_endpoint_types: endpoints,
  }
}

describe('Marketplace section', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverStub,
    })
    trackEventMock.mockClear()
  })

  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: { en: { translation: enLocale.translation } },
        lng: 'en',
        fallbackLng: 'en',
        nsSeparator: false,
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
      })
    }
    await i18n.changeLanguage('en')
  })

  it('renders a loading grid with six skeleton rows', async () => {
    wrap(LOADING_STATE)
    await waitFor(() =>
      expect(screen.getByText('Live model marketplace')).toBeInTheDocument()
    )
    expect(
      document.querySelectorAll('.animate-pulse').length
    ).toBeGreaterThanOrEqual(6)
    expect(screen.queryByText('Explore live models')).not.toBeInTheDocument()
  })

  it('renders a fallback link only when empty', async () => {
    wrap({
      ...ERROR_STATE,
      models: [],
    } as HomepagePricingState)
    const fallback = await screen.findByRole('link', {
      name: /Explore all available models/,
    })
    expect(fallback).toHaveAttribute('href', '/pricing')
    expect(screen.getByText('Live model marketplace')).toBeInTheDocument()
  })

  it('renders the ready grid when previously-errored state recovers with models', async () => {
    // A ready catalog with a featured model renders the grid (regardless of
    // prior error history) and never shows the empty-state fallback link.
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('x')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    await screen.findByText('x')
    expect(
      screen.queryByRole('link', { name: /Explore all available models/ })
    ).not.toBeInTheDocument()
  })

  it('shows up to six models sorted by name with a primary CTA', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 8,
      featured: [],
      fast: [],
      models: [
        makeModel('zebra'),
        makeModel('Apple'),
        makeModel('mango'),
        makeModel('banana'),
        makeModel('Cherry'),
        makeModel('date'),
        makeModel('elder'),
        makeModel('fig'),
      ],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    await waitFor(() => expect(screen.getByText('Apple')).toBeInTheDocument())
    const names = screen
      .getAllByText(/^(Apple|banana|Cherry|date|elder|fig|mango|zebra)$/)
      .map((el) => el.textContent)
    expect(names).toEqual(['Apple', 'banana', 'Cherry', 'date', 'elder', 'fig'])
    expect(screen.queryByText('mango')).not.toBeInTheDocument()
    expect(screen.queryByText('zebra')).not.toBeInTheDocument()
    expect(screen.getByText('Explore live models')).toBeInTheDocument()
  })

  it('shows at most two endpoint chips and a +N overflow', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modA', ['chat', 'embedding', 'image'])],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    await waitFor(() => expect(screen.getByText('modA')).toBeInTheDocument())
    expect(screen.getByText('chat')).toBeInTheDocument()
    expect(screen.getByText('embedding')).toBeInTheDocument()
    expect(screen.queryByText('image')).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('omits endpoint chips when the model has none', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modB', [])],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    await waitFor(() => expect(screen.getByText('modB')).toBeInTheDocument())
    expect(screen.queryByText('+')).not.toBeInTheDocument()
  })

  it('omits Connected providers when vendors is empty', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modC')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    await waitFor(() => expect(screen.getByText('modC')).toBeInTheDocument())
    expect(screen.queryByText('Connected providers')).not.toBeInTheDocument()
  })

  it('renders Connected providers when present', async () => {
    // Vendors arrive already sorted from normalizePricingResponse upstream;
    // the component renders them in the order provided.
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modD')],
      vendors: ['apple', 'Mango', 'Zebra'],
      rawVendors: [],
    }
    wrap(state)
    await waitFor(() => expect(screen.getByText('modD')).toBeInTheDocument())
    expect(screen.getByText('Connected providers')).toBeInTheDocument()
    const names = screen
      .getAllByText(/^(Zebra|apple|Mango)$/)
      .map((el) => el.textContent)
    expect(names).toEqual(['apple', 'Mango', 'Zebra'])
  })

  it('omits Connected providers when vendors is missing', async () => {
    const state = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modE')],
      rawVendors: [],
    } as unknown as HomepagePricingState
    wrap(state)
    await waitFor(() => expect(screen.getByText('modE')).toBeInTheDocument())
    expect(screen.queryByText('Connected providers')).not.toBeInTheDocument()
  })

  it('marks the row click target linking to /pricing', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modF')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    const link = await screen.findByRole('link', { name: 'modF' })
    expect(link).toHaveAttribute('href', '/pricing')
  })

  it('fires explore_models_clicked when a marketplace row is clicked', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modG')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    const rowLink = await screen.findByRole('link', { name: 'modG' })
    await user.click(rowLink)
    expect(trackEvent).toHaveBeenCalledWith('explore_models_clicked', {
      location: 'marketplace',
    })
  })

  it('renders the primary CTA as a TanStack Link to plain /pricing', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modH')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    const cta = await screen.findByRole('button', {
      name: 'Explore live models',
    })
    expect(cta).toHaveAttribute('href', '/pricing')
  })

  it('fires explore_models_clicked with location marketplace on primary CTA click', async () => {
    const state: HomepagePricingState = {
      ok: true,
      status: 'ready',
      count: 1,
      featured: [],
      fast: [],
      models: [makeModel('modI')],
      vendors: [],
      rawVendors: [],
    }
    wrap(state)
    const cta = await screen.findByRole('button', {
      name: 'Explore live models',
    })
    await user.click(cta)
    expect(trackEvent).toHaveBeenCalledWith('explore_models_clicked', {
      location: 'marketplace',
    })
  })
})

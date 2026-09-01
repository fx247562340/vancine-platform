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
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import type {
  HomepagePricingModel,
  HomepagePricingState,
  HomepagePricingVendor,
} from '../../../lib/homepage-pricing'
import { AvailableNow } from '../available-now'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))

vi.mock('@/components/animate-in-view', () => ({
  AnimateInView: (props: Record<string, unknown>) => (
    <div data-testid='animate-in-view'>{props.children as React.ReactNode}</div>
  ),
}))

// ---------------------------------------------------------------------------
// IntersectionObserver stub
// ---------------------------------------------------------------------------

class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds: number[] = []
  private callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(el: Element): void {
    // Fire callback synchronously with isIntersecting=true so AnimateInView
    // removes opacity-0 and renders content immediately.
    this.callback(
      [
        {
          isIntersecting: true,
          target: el,
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: 1,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: 0,
        },
      ] as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

let originalIO: PropertyDescriptor | undefined

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  originalIO = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver'
  )
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  })
  await initTestI18n()
  ;(trackEvent as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  if (originalIO === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(globalThis, 'IntersectionObserver', originalIO)
  }
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

function stubRoute(root: AnyRoute, path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => root,
    path,
    component: () => <div data-testid={testId} />,
  })
}

async function renderAvailableNow(pricing: HomepagePricingState) {
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <AvailableNow pricing={pricing} />,
    }),
    stubRoute(root, '/pricing', 'pricing-page'),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let result: ReturnType<typeof render> | undefined
  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    // Wait for router to finish loading
    await router.load()
  })
  if (!result) {
    throw new Error('renderAvailableNow: render did not produce a result')
  }
  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

function makeModel(
  overrides: Partial<HomepagePricingModel> & { model_name: string }
): HomepagePricingModel {
  return {
    description: 'A powerful model',
    tags: 'featured',
    vendor_id: undefined,
    supported_endpoint_types: [],
    ...overrides,
  }
}

function makeVendors(): HomepagePricingVendor[] {
  return [
    { id: 1, name: 'Volcengine' },
    { id: 2, name: 'Alibaba Cloud' },
  ]
}

function makePricing(
  overrides: Partial<HomepagePricingState>
): HomepagePricingState {
  return {
    ok: true,
    status: 'ready',
    count: 0,
    models: [],
    featured: [],
    fast: [],
    vendors: [],
    rawVendors: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AvailableNow — loading state', () => {
  it('renders skeleton cards and loading status label', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    const pricing = makePricing({ status: 'loading' })
    await renderAvailableNow(pricing)

    const statusRegion = screen.getByRole('status', {
      name: /loading featured models/i,
    })
    const skeletons = within(statusRegion).getAllByRole('generic', {
      hidden: true,
    })
    expect(skeletons.length).toBeGreaterThanOrEqual(4)
  })

  it('does not render model cards or fallback while loading', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    const pricing = makePricing({ status: 'loading' })
    await renderAvailableNow(pricing)

    expect(
      screen.queryByRole('link', { name: /explore all available models/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument()
  })
})

describe('AvailableNow — featured > 0 (ready)', () => {
  it('renders featured model card with name, description, vendor, and endpoint chips', async () => {
    const vendors = makeVendors()
    const pricing = makePricing({
      status: 'ready',
      count: 3,
      featured: [
        makeModel({
          model_name: 'GPT-4o',
          description: 'Multimodal reasoning',
          vendor_id: 1,
          supported_endpoint_types: ['chat', 'completions'],
        }),
      ],
      rawVendors: vendors,
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('GPT-4o')).toBeInTheDocument()
    expect(screen.getByText('Multimodal reasoning')).toBeInTheDocument()
    expect(screen.getByText('Volcengine')).toBeInTheDocument()
    expect(screen.getByText('chat')).toBeInTheDocument()
    expect(screen.getByText('completions')).toBeInTheDocument()
  })

  it('card links to /pricing with no query params', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'Model-A' })],
    })
    await renderAvailableNow(pricing)

    const link = screen.getByRole('link', { name: /model-a/i })
    expect(link).toHaveAttribute('href', '/pricing')
    expect(link.getAttribute('href')).not.toContain('?')
  })

  it('card click fires featured_model_clicked with model field', async () => {
    const user = userEvent.setup()
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'DeepSeek-V3' })],
    })
    await renderAvailableNow(pricing)

    const link = screen.getByRole('link', { name: /deepseek-v3/i })
    await user.click(link)
    expect(trackEventMock).toHaveBeenCalledWith('featured_model_clicked', {
      location: 'available_now',
      model: 'DeepSeek-V3',
    })
  })

  it('shows multiple featured cards', async () => {
    const vendors = makeVendors()
    const pricing = makePricing({
      status: 'ready',
      count: 4,
      featured: [
        makeModel({ model_name: 'Alpha', vendor_id: 1 }),
        makeModel({ model_name: 'Beta', vendor_id: 2 }),
        makeModel({ model_name: 'Gamma' }),
      ],
      rawVendors: vendors,
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('shows models available count', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 12,
      featured: [makeModel({ model_name: 'X' })],
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('12 models available')).toBeInTheDocument()
  })
})

describe('AvailableNow — vendor display', () => {
  it('shows vendor name when resolveVendorName succeeds', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'M1', vendor_id: 2 })],
      rawVendors: [{ id: 2, name: 'Alibaba Cloud' }],
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('Alibaba Cloud')).toBeInTheDocument()
  })

  it('omits vendor when vendor_id has no matching vendor', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'M2', vendor_id: 999 })],
      rawVendors: [{ id: 1, name: 'Volcengine' }],
    })
    await renderAvailableNow(pricing)

    expect(screen.queryByText('Volcengine')).not.toBeInTheDocument()
  })

  it('omits vendor when vendor_id is undefined', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'M3' })],
      rawVendors: [{ id: 1, name: 'Volcengine' }],
    })
    await renderAvailableNow(pricing)

    expect(screen.queryByText('Volcengine')).not.toBeInTheDocument()
  })
})

describe('AvailableNow — empty description omitted', () => {
  it('omits description paragraph when description is empty string', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'NoDesc', description: '' })],
    })
    const { container } = await renderAvailableNow(pricing)

    expect(screen.getByText('NoDesc')).toBeInTheDocument()
    const descP = container.querySelector('p.line-clamp-2')
    expect(descP).toBeNull()
  })

  it('omits description paragraph when description is whitespace', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'WsDesc', description: '   ' })],
    })
    const { container } = await renderAvailableNow(pricing)

    const descP = container.querySelector('p.line-clamp-2')
    expect(descP).toBeNull()
  })
})

describe('AvailableNow — endpoint chips', () => {
  it('renders at most 2 chips plus an overflow indicator', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [
        makeModel({
          model_name: 'ChipModel',
          supported_endpoint_types: ['chat', 'completions', 'embeddings'],
        }),
      ],
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('chat')).toBeInTheDocument()
    expect(screen.getByText('completions')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('embeddings')).not.toBeInTheDocument()
  })

  it('does not show overflow indicator when 2 or fewer chips', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [
        makeModel({
          model_name: 'TwoChip',
          supported_endpoint_types: ['chat', 'completions'],
        }),
      ],
    })
    await renderAvailableNow(pricing)

    expect(screen.getByText('chat')).toBeInTheDocument()
    expect(screen.getByText('completions')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})

describe('AvailableNow — no price numbers', () => {
  it('featured cards do not render pricing information', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 1,
      featured: [makeModel({ model_name: 'Priceless' })],
    })
    const { container } = await renderAvailableNow(pricing)

    expect(screen.getByText('Priceless')).toBeInTheDocument()
    expect(container.textContent).not.toContain('$')
    expect(container.textContent).not.toContain('/1M')
    expect(container.textContent).not.toContain('/1K')
  })
})

describe('AvailableNow — fallback for empty/error/no-featured', () => {
  it('renders fallback link when featured is empty and count >= 1', async () => {
    const pricing = makePricing({
      status: 'ready',
      count: 5,
      featured: [],
    })
    await renderAvailableNow(pricing)

    const fallback = screen.getByRole('link', {
      name: /explore all available models/i,
    })
    expect(fallback).toHaveAttribute('href', '/pricing')
    expect(screen.getByText('5 models available')).toBeInTheDocument()
  })

  it('fallback click fires explore_models_clicked', async () => {
    const user = userEvent.setup()
    const pricing = makePricing({
      status: 'ready',
      count: 3,
      featured: [],
    })
    await renderAvailableNow(pricing)

    const fallback = screen.getByRole('link', {
      name: /explore all available models/i,
    })
    await user.click(fallback)
    expect(trackEventMock).toHaveBeenCalledWith('explore_models_clicked', {
      location: 'available_now_fallback',
    })
  })

  it('renders fallback link for error status but no model count', async () => {
    const pricing = makePricing({ status: 'error', count: null, featured: [] })
    await renderAvailableNow(pricing)

    expect(
      screen.getByRole('link', { name: /explore all available models/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/models available/)).not.toBeInTheDocument()
  })

  it('renders fallback link for empty status but no model count', async () => {
    const pricing = makePricing({
      status: 'empty',
      count: null,
      featured: [],
    })
    await renderAvailableNow(pricing)

    expect(
      screen.getByRole('link', { name: /explore all available models/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/models available/)).not.toBeInTheDocument()
  })

  it('does not render ghost model cards in error/empty state', async () => {
    const pricing = makePricing({
      status: 'error',
      count: null,
      featured: [],
      models: [makeModel({ model_name: 'GhostModel' })],
    })
    await renderAvailableNow(pricing)

    expect(screen.queryByText('GhostModel')).not.toBeInTheDocument()
  })
})

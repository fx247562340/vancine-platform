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
  Outlet,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FAST_CODING_MODELS_CANONICAL } from '@/features/fast-coding-models/lib/fast-coding-models'
import type { PricingData, PricingModel } from '@/features/pricing/types'
import { resetMetadataRegistry } from '@/hooks/use-page-metadata'
import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'
import { Route as FastCodingModelsRouteImport } from '@/routes/guides/fast-coding-models'
import { useAuthStore } from '@/stores/auth-store'

const testI18n = i18n.createInstance()

let i18nReady: Promise<unknown> | null = null

async function ensureI18n(): Promise<unknown> {
  if (!i18nReady) {
    i18nReady = testI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: enLocale.translation },
      },
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
  return i18nReady
}

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Pricing data boundary: the page reads /api/pricing through the real
// usePricingData hook; only the network function itself is controlled.
const getPricingMock = vi.fn()
vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) => getPricingMock(...args),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      server_address: 'https://vancine.com',
      price: 1,
      usd_exchange_rate: 1,
    },
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

// Icon loading is an external asset boundary; the contracts under test
// are content and structure, not the icon renderer.
vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => <span data-testid='model-icon' />,
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

const testRootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <div data-testid='root-route-fallback' />,
})
const TestFastCodingModelsRoute = FastCodingModelsRouteImport.update({
  id: '/guides/fast-coding-models/',
  path: '/guides/fast-coding-models/',
  getParentRoute: () => testRootRoute,
} as never)

function stubRoute(path: string, testId: string): AnyRoute {
  return createRoute({
    getParentRoute: () => testRootRoute,
    path,
    component: () => <div data-testid={testId} />,
  })
}

const testRouteTree = testRootRoute.addChildren([
  TestFastCodingModelsRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/playground', 'playground-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/pricing/$modelId', 'pricing-model-page'),
  stubRoute('/docs/agents', 'docs-agents-page'),
  stubRoute('/docs/agents/opencode', 'docs-opencode-page'),
  stubRoute('/coding-agent-benchmark', 'benchmark-page'),
])

function renderPage(initialPath = '/guides/fast-coding-models/'): RenderResult {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

function fixtureModel(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'fixture',
    description: 'A fixture model.',
    quota_type: 0,
    model_ratio: 0.03,
    completion_ratio: 4,
    cache_ratio: 0.1,
    enable_groups: ['default'],
    context_length: 200_000,
    max_output_tokens: 8_192,
    input_modalities: ['text'],
    capabilities: ['tools', 'reasoning'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

/** Build a /api/pricing payload. Only models with `tags` containing the
 *  exact "fast" token render on the page. */
function fixturePricing(opts: {
  fast: ReadonlyArray<{ model_name: string; tags?: string }>
  nonFast?: ReadonlyArray<{ model_name: string; tags?: string }>
}): PricingData {
  const fast = opts.fast.map((m, i) =>
    fixtureModel({ id: i + 1, tags: 'fast', ...m })
  )
  const nonFast = (opts.nonFast ?? []).map((m, i) =>
    fixtureModel({ id: 100 + i, tags: 'text', ...m })
  )
  return {
    success: true,
    data: [...fast, ...nonFast],
    vendors: [],
    group_ratio: { default: 1 },
    usable_group: { default: { desc: 'default', ratio: 1 } },
    supported_endpoint: {},
    auto_groups: [],
  }
}

const DEFAULT_FAST_MODELS: ReadonlyArray<{
  model_name: string
  tags?: string
}> = [
  { model_name: 'flash-alpha' },
  { model_name: 'flash-beta', tags: 'fast,preview' },
  { model_name: 'flash-gamma' },
  { model_name: 'flash-delta' },
]

const realInitialAuthData = {
  user: useAuthStore.getState().auth.user,
  accessToken: useAuthStore.getState().auth.accessToken,
  accessExpiresAt: useAuthStore.getState().auth.accessExpiresAt,
  session: useAuthStore.getState().auth.session,
  pending2FAFlowToken: useAuthStore.getState().auth.pending2FAFlowToken,
  bootstrapState: useAuthStore.getState().auth.bootstrapState,
}

function restoreAuthStore(): void {
  useAuthStore.setState({
    auth: { ...useAuthStore.getState().auth, ...realInitialAuthData },
  })
}

function hrefParams(href: string): URLSearchParams {
  return new URL(href, 'https://vancine.com').searchParams
}

beforeEach(async () => {
  await ensureI18n()
  resetMetadataRegistry()
  restoreAuthStore()
  getPricingMock.mockReset()
  trackEventMock.mockClear()
  getPricingMock.mockResolvedValue(
    fixturePricing({ fast: DEFAULT_FAST_MODELS })
  )
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetMetadataRegistry()
  restoreAuthStore()
})

describe('page structure', () => {
  it('renders one H1 naming the guide and every fast-tagged model', async () => {
    renderPage()
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Fast Chinese AI models for coding and high-throughput workloads'
    )

    for (const model of DEFAULT_FAST_MODELS) {
      await waitFor(() => {
        expect(document.body.textContent ?? '').toContain(model.model_name)
      })
    }
  })

  it('renders every required section heading', async () => {
    renderPage()
    for (const section of [
      'One endpoint, dynamic fast models',
      'Pick the model that fits your agent',
      'Comparison',
      'Quickstart',
      'Measured results are separate',
      'Frequently asked questions',
      'Start with one endpoint',
    ]) {
      expect(
        await screen.findByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })

  it('keeps the endpoint facts: Base URL, env placeholder, dynamic model ids', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    // Wait for pricing data to resolve so the endpoint-id list is populated.
    await waitFor(() =>
      expect(
        screen.queryByTestId('fast-coding-models-endpoint-id-list')
      ).toBeInTheDocument()
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('https://vancine.com/v1')
    expect(text).toContain('$VANCINE_API_KEY')
    for (const model of DEFAULT_FAST_MODELS) {
      expect(text).toContain(model.model_name)
    }
  })
})

describe('live pricing states', () => {
  it('shows a stable skeleton while the pricing API is pending', async () => {
    getPricingMock.mockReturnValue(new Promise(() => {}))
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(
      screen.getByTestId('fast-coding-models-cards-loading')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('fast-coding-models-comparison-loading')
    ).toBeInTheDocument()
  })

  it('degrades to a banner on API failure while the article and CTAs stay intact', async () => {
    getPricingMock.mockRejectedValue(new Error('boom'))
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(
      await screen.findByTestId('fast-coding-models-cards-error')
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('fast-coding-models-comparison-error')
    ).toBeInTheDocument()

    // The article, quickstart, evidence boundary and both CTAs survive.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Quickstart' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Measured results are separate',
      })
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /Start with Vancine/ }).length
    ).toBeGreaterThan(0)
  })

  it('renders one card per fast-tagged model with live prices and a /pricing/{modelId} link', async () => {
    renderPage()
    // Wait for at least one card to appear (signals pricing data resolved).
    await screen.findByTestId(
      `fast-coding-model-card-${DEFAULT_FAST_MODELS[0].model_name}`
    )
    for (const model of DEFAULT_FAST_MODELS) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${model.model_name}`
      )
      expect(within(card).getByText(model.model_name)).toBeInTheDocument()
      const details = within(card).getByRole('link', {
        name: /Model details/,
      })
      expect(details).toHaveAttribute(
        'href',
        `/pricing/${model.model_name}`
      )
    }
  })

  it('marks the preview-tagged model as Preview and no other model', async () => {
    renderPage()
    const previewModel = DEFAULT_FAST_MODELS.find(
      (m) => (m.tags ?? '').includes('preview')
    )
    if (!previewModel) throw new Error('fixture missing preview-tagged model')
    const previewCard = await screen.findByTestId(
      `fast-coding-model-card-${previewModel.model_name}`
    )
    expect(within(previewCard).getByText('Preview')).toBeInTheDocument()
    for (const model of DEFAULT_FAST_MODELS) {
      if (model.model_name === previewModel.model_name) continue
      const card = await screen.findByTestId(
        `fast-coding-model-card-${model.model_name}`
      )
      expect(within(card).queryByText('Preview')).toBeNull()
    }
  })

  it('renders an explicit empty state when the fast catalog is empty', async () => {
    getPricingMock.mockResolvedValue(
      fixturePricing({ fast: [], nonFast: [{ model_name: 'plain' }] })
    )
    renderPage()

    expect(
      await screen.findByTestId('fast-coding-models-cards-empty')
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('fast-coding-models-comparison-empty')
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('fast-coding-models-curl-empty')
    ).toBeInTheDocument()
  })
})

describe('comparison responsive contract', () => {
  it('renders a semantic desktop table and mobile cards from the same data', async () => {
    renderPage()
    const tableWrapper = await screen.findByTestId(
      'fast-coding-models-comparison-table'
    )
    const cardsWrapper = await screen.findByTestId(
      'fast-coding-models-comparison-cards'
    )
    // The table is desktop-only and the cards are mobile-only. The
    // table wrapper now owns its own local horizontal scroll (overflow-x-auto)
    // so additional fast-tagged models can never push the page itself
    // into horizontal overflow; the mobile cards do not need a scroll
    // container.
    expect(tableWrapper.className).toContain('hidden')
    expect(tableWrapper.className).toContain('md:block')
    expect(tableWrapper.className).toContain('overflow-x-auto')
    expect(tableWrapper.getAttribute('role')).toBe('region')
    expect(tableWrapper.getAttribute('aria-label')).toBeTruthy()
    expect(cardsWrapper.className).toContain('md:hidden')

    const table = within(tableWrapper).getByRole('table')
    const headerCells = [...table.querySelectorAll('thead th')].map(
      (th) => th.textContent ?? ''
    )
    expect(headerCells[0]).toContain('Model')
    for (const model of DEFAULT_FAST_MODELS) {
      expect(headerCells.join(' ')).toContain(model.model_name)
    }
  })

  it('renders the generic guidance verbatim on every card', async () => {
    renderPage()
    await screen.findByTestId(
      `fast-coding-model-card-${DEFAULT_FAST_MODELS[0].model_name}`
    )
    for (const model of DEFAULT_FAST_MODELS) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${model.model_name}`
      )
      expect(card.textContent).toContain(
        'Compare live prices, context limits, and capabilities to choose the model that fits your workload.'
      )
    }
  })
})

describe('layout contract beyond four fast models', () => {
  // Generic fixture: any model with the exact "fast" tag must render;
  // no hardcoded per-id assertion is made.
  const manyFastModels = Array.from({ length: 6 }, (_, i) => ({
    model_name: `m-flash-${i}`,
    tags: 'fast',
  }))

  it('renders every fast-tagged model in the cards grid without a fixed cap', async () => {
    getPricingMock.mockResolvedValue(fixturePricing({ fast: manyFastModels }))
    renderPage()
    await screen.findByTestId('fast-coding-models-cards-grid')
    for (const m of manyFastModels) {
      expect(
        await screen.findByTestId(`fast-coding-model-card-${m.model_name}`)
      ).toBeInTheDocument()
    }
  })

  it('desktop comparison table grows to fit any number of fast models with a local scroll container', async () => {
    getPricingMock.mockResolvedValue(fixturePricing({ fast: manyFastModels }))
    renderPage()
    const tableWrapper = await screen.findByTestId(
      'fast-coding-models-comparison-table'
    )
    const cardsWrapper = await screen.findByTestId(
      'fast-coding-models-comparison-cards'
    )
    // The desktop table wrapper must always own a local horizontal scroll
    // container regardless of the number of columns, and the mobile
    // cards wrapper never does. This protects the page from horizontal
    // overflow when the fast catalog grows beyond four.
    expect(tableWrapper.className).toContain('overflow-x-auto')
    expect(cardsWrapper.className).not.toContain('overflow-x')
    // The local scroll container is exposed as a labelled region so
    // keyboard and assistive tech users can name and scroll it.
    expect(tableWrapper.getAttribute('role')).toBe('region')
    expect(
      (tableWrapper.getAttribute('aria-label') ?? '').length
    ).toBeGreaterThan(0)
  })
})

describe('CTA destinations and UTM contract', () => {
  it('guest Start with Vancine targets /sign-up with exactly the fixed owned-media UTMs', async () => {
    renderPage()
    const links = await screen.findAllByRole('button', {
      name: /Start with Vancine/,
    })
    const params = hrefParams(links[0].getAttribute('href') ?? '')
    expect(links[0].getAttribute('href')).toMatch(/^\/sign-up/)
    expect(params.get('utm_source')).toBe('vancine')
    expect(params.get('utm_medium')).toBe('owned')
    expect(params.get('utm_campaign')).toBe('fast_coding_models_guide')
    expect(params.get('utm_content')).toBe('hero')
    expect([...params.keys()].sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
    ])
  })

  it('authenticated Start with Vancine targets /playground with the same UTMs', async () => {
    const prev = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: {
        ...prev,
        user: { id: 1, username: 'u', role: 100 },
        accessToken: 'tok',
      },
    })
    renderPage()
    const links = await screen.findAllByRole('button', {
      name: /Start with Vancine/,
    })
    expect(links[0].getAttribute('href')).toMatch(/^\/playground/)
    const params = hrefParams(links[0].getAttribute('href') ?? '')
    expect(params.get('utm_content')).toBe('hero')
    expect([...params.keys()].sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
    ])
  })

  it('never propagates inbound email, token, api_key, redirect, or unknown parameters into CTAs', async () => {
    renderPage(
      '/guides/fast-coding-models/?email=a@b.com&token=t&api_key=k' +
        '&redirect=https://evil.example.com&utm_source=evil&unknown=1'
    )
    const links = await screen.findAllByRole('button', {
      name: /Start with Vancine/,
    })
    for (const link of links) {
      const href = link.getAttribute('href') ?? ''
      const params = hrefParams(href)
      expect([...params.keys()].sort()).toEqual([
        'utm_campaign',
        'utm_content',
        'utm_medium',
        'utm_source',
      ])
      expect(href).not.toContain('evil')
      expect(href).not.toContain('email')
      expect(href).not.toContain('token')
      expect(href).not.toContain('api_key')
      expect(href).not.toContain('redirect')
    }
  })

  it('uses utm_content=final for the final CTA and utm_content=pricing for the pricing link', async () => {
    renderPage()
    const finalSection = await screen.findByRole('heading', {
      level: 2,
      name: 'Start with one endpoint',
    })
    const section = finalSection.closest('section') as HTMLElement
    const finalCta = within(section).getByRole('button', {
      name: /Start with Vancine/,
    })
    expect(
      hrefParams(finalCta.getAttribute('href') ?? '').get('utm_content')
    ).toBe('final')
    const pricingCta = within(section).getByRole('button', {
      name: /View live pricing/,
    })
    expect(
      hrefParams(pricingCta.getAttribute('href') ?? '').get('utm_content')
    ).toBe('pricing')
  })

  it('primary hero CTA scrolls to the comparison section', async () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<
      typeof vi.fn
    >
    renderPage()
    const compare = await screen.findByRole('button', {
      name: /Compare the fast models/,
    })
    compare.click()
    expect(scrollSpy).toHaveBeenCalled()
    expect(trackEventMock).toHaveBeenCalledWith('developer_resource_clicked', {
      resource: 'fast_coding_models_guide',
      location: 'hero_compare',
    })
  })
})

describe('quickstart', () => {
  it('shows the curl example with the env placeholder and the first fast model as default', async () => {
    renderPage()
    const codeBlock = await screen.findByTestId('fast-coding-models-code-block')
    expect(codeBlock.textContent).toContain(
      'https://vancine.com/v1/chat/completions'
    )
    expect(codeBlock.textContent).toContain('Bearer $VANCINE_API_KEY')
    // First fast model in fixture is flash-alpha; curl defaults to it.
    expect(codeBlock.textContent).toContain('"model": "flash-alpha"')
    // The block grows with its content: no fixed height styles or classes.
    expect(codeBlock.style.height).toBe('')
    expect(codeBlock.className).not.toMatch(/\bh-\d/)
  })

  it('lists the remaining fast models as alternates and links to /docs/agents', async () => {
    renderPage()
    // Wait for pricing data to land (signals via the endpoint id list).
    await screen.findByTestId('fast-coding-models-endpoint-id-list')
    const section = (
      await screen.findByRole('heading', { level: 2, name: 'Quickstart' })
    ).closest('section') as HTMLElement
    const altList = within(section).getByTestId(
      'fast-coding-models-alternate-list'
    )
    for (const model of DEFAULT_FAST_MODELS.slice(1)) {
      expect(altList.textContent).toContain(model.model_name)
    }
    // The default model is NOT listed in the alternates.
    expect(altList.textContent).not.toContain(DEFAULT_FAST_MODELS[0].model_name)
    const docsLink = within(section).getByRole('button', {
      name: /Set up OpenCode, Cline, or Roo Code/,
    })
    const href = docsLink.getAttribute('href') ?? ''
    expect(href).toMatch(/^\/docs\/agents/)
    expect(hrefParams(href).get('utm_content')).toBe('docs')
  })

  it('adds a compact OpenCode catalog trust signal without changing the setup CTA', async () => {
    renderPage()
    const section = (
      await screen.findByRole('heading', { level: 2, name: 'Quickstart' })
    ).closest('section') as HTMLElement
    const catalogLink = within(section).getByRole('link', {
      name: 'Connect Vancine in OpenCode with /connect — no manual provider JSON required.',
    })
    expect(catalogLink).toHaveAttribute('href', '/docs/agents/opencode')
    const docsLink = within(section).getByRole('button', {
      name: /Set up OpenCode, Cline, or Roo Code/,
    })
    const href = docsLink.getAttribute('href') ?? ''
    expect(href).toMatch(/^\/docs\/agents/)
    expect(hrefParams(href).get('utm_content')).toBe('docs')
  })
})

describe('evidence boundary', () => {
  it('disclaims benchmark membership and links to the benchmark page', async () => {
    renderPage()
    const boundary = await screen.findByTestId(
      'fast-coding-models-evidence-boundary'
    )
    const text = boundary.textContent ?? ''
    expect(text).toContain(
      'does not claim benchmark membership or measured performance'
    )
    expect(text).toContain('See the benchmark page for recorded results')
    expect(
      within(boundary).getByRole('button', { name: /View the benchmark/ })
    ).toHaveAttribute('href', '/coding-agent-benchmark')
  })
})

describe('FAQ disclosures', () => {
  it('answers the four mandatory questions and discloses the non-partner status', async () => {
    renderPage()
    const faqSection = (
      await screen.findByRole('heading', {
        level: 2,
        name: 'Frequently asked questions',
      })
    ).closest('section') as HTMLElement
    for (const question of [
      'How do I switch models?',
      'Where does the live price come from?',
      'Are these models officially partnered with Vancine?',
      'Where can I configure OpenCode, Cline, or Roo Code?',
    ]) {
      expect(
        within(faqSection).getByRole('button', { name: question })
      ).toBeInTheDocument()
    }
    expect(
      screen.getByTestId('fast-coding-models-disclosure')
    ).toBeInTheDocument()
  })
})

describe('page metadata ownership', () => {
  it('pins the canonical to the fixed guide URL', () => {
    expect(FAST_CODING_MODELS_CANONICAL).toBe(
      'https://vancine.com/guides/fast-coding-models'
    )
  })
})

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

import {
  FAST_CODING_MODEL_IDS,
  FAST_CODING_MODELS_CANONICAL,
} from '@/features/fast-coding-models/lib/fast-coding-models'
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

function fixturePricing(modelNames: readonly string[]): PricingData {
  return {
    success: true,
    data: modelNames.map((name, index) =>
      fixtureModel({ id: index + 1, model_name: name })
    ),
    vendors: [],
    group_ratio: { default: 1 },
    usable_group: { default: { desc: 'default', ratio: 1 } },
    supported_endpoint: {},
    auto_groups: [],
  }
}

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
  getPricingMock.mockResolvedValue(fixturePricing(FAST_CODING_MODEL_IDS))
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetMetadataRegistry()
  restoreAuthStore()
})

describe('page structure', () => {
  it('renders one H1 naming the guide and all four exact model ids', async () => {
    renderPage()
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Four fast Chinese AI models for coding agents'
    )

    for (const modelId of FAST_CODING_MODEL_IDS) {
      await waitFor(() => {
        expect(document.body.textContent ?? '').toContain(modelId)
      })
    }
  })

  it('renders every required section heading', async () => {
    renderPage()
    for (const section of [
      'One endpoint, four models',
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

  it('keeps the endpoint facts: Base URL, env placeholder, four model ids', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const text = document.body.textContent ?? ''
    expect(text).toContain('https://vancine.com/v1')
    expect(text).toContain('$VANCINE_API_KEY')
    for (const modelId of FAST_CODING_MODEL_IDS) {
      expect(text).toContain(modelId)
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

  it('renders four cards with live prices and links to /pricing/{modelId}', async () => {
    renderPage()
    for (const modelId of FAST_CODING_MODEL_IDS) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${modelId}`
      )
      expect(within(card).getByText(modelId)).toBeInTheDocument()
      const details = within(card).getByRole('link', {
        name: /Model details/,
      })
      expect(details).toHaveAttribute('href', `/pricing/${modelId}`)
    }
  })

  it('marks only hy4-preview as Preview', async () => {
    renderPage()
    const hy4Card = await screen.findByTestId(
      'fast-coding-model-card-hy4-preview'
    )
    expect(within(hy4Card).getByText('Preview')).toBeInTheDocument()
    for (const modelId of FAST_CODING_MODEL_IDS.slice(1)) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${modelId}`
      )
      expect(within(card).queryByText('Preview')).toBeNull()
    }
  })

  it('shows an explicit degradation state for a missing model without substituting another', async () => {
    getPricingMock.mockResolvedValue(
      fixturePricing(
        FAST_CODING_MODEL_IDS.filter((id) => id !== 'qwen3.8-flash')
      )
    )
    renderPage()

    const missingCard = await screen.findByTestId(
      'fast-coding-model-card-qwen3.8-flash'
    )
    expect(
      within(missingCard).getByText('Not listed in live pricing right now.')
    ).toBeInTheDocument()
    expect(
      within(missingCard).getByRole('link', { name: /View live pricing/ })
    ).toHaveAttribute('href', '/pricing')

    // The other three models keep their live cards.
    for (const modelId of FAST_CODING_MODEL_IDS.slice(0, 3)) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${modelId}`
      )
      expect(
        within(card).queryByText('Not listed in live pricing right now.')
      ).toBeNull()
    }
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
    // The table is desktop-only and the cards are mobile-only; neither
    // wrapper uses a horizontal overflow container.
    expect(tableWrapper.className).toContain('hidden')
    expect(tableWrapper.className).toContain('md:block')
    expect(cardsWrapper.className).toContain('md:hidden')
    expect(tableWrapper.className).not.toContain('overflow-x')
    expect(cardsWrapper.className).not.toContain('overflow-x')

    const table = within(tableWrapper).getByRole('table')
    const headerCells = [...table.querySelectorAll('thead th')].map(
      (th) => th.textContent ?? ''
    )
    expect(headerCells[0]).toContain('Model')
    for (const modelId of FAST_CODING_MODEL_IDS) {
      expect(headerCells.join(' ')).toContain(modelId)
    }
  })

  it('separates platform facts from editorial guidance in the table', async () => {
    renderPage()
    const guidanceRow = await screen.findByTestId(
      'fast-coding-models-guidance-row'
    )
    expect(guidanceRow.textContent).toContain('Consider when…')
    expect(guidanceRow.textContent).toContain('Editorial guidance')
    for (const modelId of FAST_CODING_MODEL_IDS) {
      const card = await screen.findByTestId(
        `fast-coding-model-card-${modelId}`
      )
      expect(card.textContent).toContain('Consider when')
    }
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
      name: /Compare the four models/,
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
  it('shows the curl example with the env placeholder and glm-5.3-flash default', async () => {
    renderPage()
    const codeBlock = await screen.findByTestId('fast-coding-models-code-block')
    expect(codeBlock.textContent).toContain(
      'https://vancine.com/v1/chat/completions'
    )
    expect(codeBlock.textContent).toContain('Bearer $VANCINE_API_KEY')
    expect(codeBlock.textContent).toContain('"model": "glm-5.3-flash"')
    // The block grows with its content: no fixed height styles or classes.
    expect(codeBlock.style.height).toBe('')
    expect(codeBlock.className).not.toMatch(/\bh-\d/)
  })

  it('lists exactly the other three model ids and links to /docs/agents', async () => {
    renderPage()
    const section = (
      await screen.findByRole('heading', { level: 2, name: 'Quickstart' })
    ).closest('section') as HTMLElement
    for (const modelId of [
      'hy4-preview',
      'deepseek-v4-flash-vision-exp',
      'qwen3.8-flash',
    ]) {
      expect(section.textContent).toContain(modelId)
    }
    const docsLink = within(section).getByRole('button', {
      name: /Set up OpenCode, Cline, or Roo Code/,
    })
    const href = docsLink.getAttribute('href') ?? ''
    expect(href).toMatch(/^\/docs\/agents/)
    expect(hrefParams(href).get('utm_content')).toBe('docs')
  })
})

describe('evidence boundary', () => {
  it('keeps the benchmark evidence separate and never extrapolates to untested models', async () => {
    renderPage()
    const boundary = await screen.findByTestId(
      'fast-coding-models-evidence-boundary'
    )
    const text = boundary.textContent ?? ''
    expect(text).toContain(
      'The benchmark includes glm-5.3-flash and qwen3.8-flash.'
    )
    expect(text).toContain('The benchmark does not include hy4-preview.')
    expect(text).toContain(
      'The benchmark does not include deepseek-v4-flash-vision-exp'
    )
    expect(text).toContain(
      'Do not extend those results to models that were not tested.'
    )
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

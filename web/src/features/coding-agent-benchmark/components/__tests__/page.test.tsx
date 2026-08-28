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
  type RenderResult,
} from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BENCHMARK_JSON_PATH,
  CODING_AGENT_BENCHMARK_MODELS,
  formatAgentRunTime,
  formatBilledUsd,
} from '@/features/coding-agent-benchmark/lib/coding-agent-benchmark'
import { resetMetadataRegistry } from '@/hooks/use-page-metadata'
import enLocale from '@/i18n/locales/en.json'
import { Route as BenchmarkRouteImport } from '@/routes/coding-agent-benchmark/index'

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

const testRootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <div data-testid='root-route-fallback' />,
})
const TestBenchmarkRoute = BenchmarkRouteImport.update({
  id: '/coding-agent-benchmark/',
  path: '/coding-agent-benchmark/',
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
  TestBenchmarkRoute,
  stubRoute('/sign-up', 'sign-up-page'),
  stubRoute('/pricing', 'pricing-page'),
  stubRoute('/docs', 'docs-page'),
])

function renderPage(initialPath = '/coding-agent-benchmark/'): RenderResult {
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

beforeEach(async () => {
  await ensureI18n()
  resetMetadataRegistry()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetMetadataRegistry()
})

describe('coding-agent-benchmark page structure', () => {
  it('renders exactly one H1 with the approved English headline', async () => {
    renderPage()
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      '8 Chinese AI models, one Pi coding-agent task'
    )
  })

  it('renders the required sections', async () => {
    renderPage()
    for (const section of [
      'Results',
      'What the task tested',
      'Methodology',
      'How to reproduce with Pi',
      'Limitations',
    ]) {
      expect(
        await screen.findByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })

  it('renders the four audited fact cards', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const text = document.body.textContent ?? ''
    expect(text).toContain('8/8')
    expect(text).toContain('45')
    expect(text).toContain('94,502')
    expect(text).toContain('$0.037618')
    expect(text).toContain('Models passed')
    expect(text).toContain('Model requests')
    expect(text).toContain('Tokens')
    expect(text).toContain('Vancine billed')
  })
})

describe('results table and mobile cards', () => {
  it('keeps the eight models in audited order with 8/8 Pass', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    const table = (await screen.findByRole('table')) as HTMLTableElement
    const headers = [...table.querySelectorAll('thead th')].map((th) =>
      th.textContent?.trim()
    )
    expect(headers).toEqual([
      'Model',
      'Result',
      'Agent run time',
      'Model requests',
      'Tokens',
      'Vancine billed',
    ])

    const rows = [...table.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(8)
    for (const [index, model] of CODING_AGENT_BENCHMARK_MODELS.entries()) {
      const cells = [...rows[index].querySelectorAll('th, td')]
      expect(cells[0].textContent?.trim()).toBe(model.model)
      expect(cells[1].textContent?.trim()).toBe('Pass')
      expect(cells[2].textContent?.trim()).toBe(
        formatAgentRunTime(model.agentRunTimeMs)
      )
      expect(cells[3].textContent?.trim()).toBe(String(model.modelRequests))
      expect(cells[4].textContent).toContain(
        model.tokens.toLocaleString('en-US')
      )
      expect(cells[5].textContent?.trim()).toBe(
        formatBilledUsd(model.productionBilledUsd)
      )
    }
  })

  it('shows qwen3.8-flash billed as $0.000848', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent ?? '').toContain('$0.000848')
  })

  it('labels every mobile-card field so no bare number is unlabeled', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const cards = screen.getAllByTestId('benchmark-result-card')
    expect(cards).toHaveLength(8)
    for (const card of cards) {
      const text = card.textContent ?? ''
      expect(text).toContain('Result')
      expect(text).toContain('Agent run time')
      expect(text).toContain('Model requests')
      expect(text).toContain('Tokens')
      expect(text).toContain('Vancine billed')
      expect(text).toContain('Pass')
    }
  })

  it('desktop table and mobile cards stay in sync', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const table = (await screen.findByRole('table')) as HTMLTableElement
    const cards = screen.getAllByTestId('benchmark-result-card')
    const tableModels = [...table.querySelectorAll('tbody tr')].map((row) =>
      row.querySelector('th, td')?.textContent?.trim()
    )
    const cardModels = cards.map((card) =>
      card
        .querySelector('[data-testid="benchmark-result-model"]')
        ?.textContent?.trim()
    )
    expect(cardModels).toEqual(tableModels)
    expect(tableModels).toEqual(
      CODING_AGENT_BENCHMARK_MODELS.map((row) => row.model)
    )
  })
})

describe('CTAs, reproduce example, and JSON download', () => {
  it('uses the approved campaign UTMs and drops inbound secrets', async () => {
    renderPage(
      '/coding-agent-benchmark/?email=a@b.com&token=t&api_key=sk-secret&redirect=/evil'
    )
    await screen.findByRole('heading', { level: 1 })

    const primary = screen.getAllByRole('button', {
      name: 'Run your next coding task',
    })
    expect(primary.length).toBeGreaterThanOrEqual(1)
    for (const link of primary) {
      expect(link).toHaveAttribute(
        'href',
        '/sign-up?utm_source=vancine&utm_medium=owned&utm_campaign=pi_8_model_benchmark&utm_content=benchmark_page_primary_cta'
      )
      expect(link.getAttribute('href')).not.toContain('email')
      expect(link.getAttribute('href')).not.toContain('sk-secret')
    }

    expect(
      screen.getAllByRole('button', { name: 'Compare model pricing' })[0]
    ).toHaveAttribute(
      'href',
      '/pricing?utm_source=vancine&utm_medium=owned&utm_campaign=pi_8_model_benchmark&utm_content=benchmark_page_pricing_cta'
    )
    expect(
      screen.getByRole('button', { name: 'Read the API docs' })
    ).toHaveAttribute(
      'href',
      '/docs?utm_source=vancine&utm_medium=owned&utm_campaign=pi_8_model_benchmark&utm_content=benchmark_page_docs_cta'
    )
  })

  it('shows a parseable Pi models.json example and the CLI selector', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const blocks = [...document.querySelectorAll('pre code')].map(
      (node) => node.textContent ?? ''
    )
    const modelsJson = blocks.find((text) => text.includes('"providers"'))
    expect(modelsJson).toBeDefined()
    const parsed = JSON.parse(modelsJson as string) as {
      providers: {
        vancine: {
          baseUrl: string
          api: string
          apiKey: string
          authHeader: boolean
          compat: { supportsDeveloperRole: boolean }
          models: Array<{ id: string }>
        }
      }
    }
    expect(parsed.providers.vancine.baseUrl).toBe('https://vancine.com/v1')
    expect(parsed.providers.vancine.api).toBe('openai-completions')
    expect(parsed.providers.vancine.apiKey).toBe('$VANCINE_API_KEY')
    expect(parsed.providers.vancine.authHeader).toBe(true)
    expect(parsed.providers.vancine.compat.supportsDeveloperRole).toBe(false)
    expect(parsed.providers.vancine.models).toEqual([
      { id: 'deepseek-v4-flash' },
    ])
    expect(
      blocks.some((text) =>
        text.includes('pi --provider vancine --model deepseek-v4-flash')
      )
    ).toBe(true)
    expect(document.body.textContent ?? '').not.toMatch(/sk-[A-Za-z0-9]{16,}/)
  })

  it('offers a downloadable results JSON with the audited filename', async () => {
    renderPage()
    const download = await screen.findByRole('link', {
      name: 'Download results JSON',
    })
    expect(download).toHaveAttribute('href', BENCHMARK_JSON_PATH)
    expect(download).toHaveAttribute(
      'download',
      'pi-coding-agent-2026-08-28.json'
    )
  })
})

describe('restrained claims and limitations', () => {
  it('states the single-run limitation and does not call agent time API latency', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const text = (document.body.textContent ?? '').toLowerCase()
    expect(text).toContain('single run')
    expect(text).toContain('wall-clock')
    expect(text).toContain('not pure model api latency')
    expect(text).not.toContain('api latency benchmark')
    expect(text).toContain(
      'the task made no network-tool attempts from its workspace'
    )
    expect(text).toContain('pi model requests still used vancine')
    expect(text).toContain('no unexpected files were created')
    expect(text).not.toContain('no network access.')
    expect(text).not.toContain('each model finished with a clean workspace')
  })

  it('never renders forbidden ranking or free claims', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const text = (document.body.textContent ?? '').toLowerCase()
    for (const forbidden of [
      'best model',
      'fastest model',
      'comprehensive ranking',
      'proves intelligence',
      'production latency benchmark',
      'all chinese models',
      'guaranteed future cost',
      'qwen3.8-flash is free',
    ]) {
      expect(text, `must not contain "${forbidden}"`).not.toContain(forbidden)
    }
    expect(text).not.toMatch(/\bfree\b/)
  })
})

describe('results structure', () => {
  it('keeps a semantic table for desktop and labeled cards for small screens', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    const table = await screen.findByRole('table')
    expect(table).toHaveAccessibleName('Results')
    expect(table.querySelectorAll('thead th')).toHaveLength(6)
    const mobile = screen.getByTestId('benchmark-mobile-results')
    const cards = screen.getAllByTestId('benchmark-result-card')
    expect(mobile).toContainElement(cards[0])
    expect(cards).toHaveLength(8)
  })
})

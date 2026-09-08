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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TocProvider } from '../components/toc-context'
import enDocs from '../i18n/locales/en.json'
import ModelsPage from '../pages/models'

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

let pricingFixture: unknown = null
let pricingError: Error | null = null
let pending = false
let callCount = 0

vi.mock('@/features/pricing/api', () => ({
  getPricing: async () => {
    callCount += 1
    if (pending) return new Promise(() => {}) as never
    if (pricingError) throw pricingError
    if (!pricingFixture) throw new Error('no fixture installed')
    return pricingFixture as never
  },
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

let i18nReady = false

async function initTestI18n(): Promise<void> {
  if (i18nReady) return
  await i18n.use(initReactI18next).init({
    resources: {},
    lng: 'en',
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  i18nReady = true
  i18n.addResourceBundle(
    'en',
    'docs',
    enDocs as unknown as Record<string, unknown>,
    true,
    true
  )
}

function withProviders(
  node: React.ReactNode,
  options: {
    outerRetry?: boolean | ((failureCount: number, error: Error) => boolean)
  } = {}
): React.ReactNode {
  const retry = options.outerRetry ?? false
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry,
        retryDelay: 0,
      },
    },
  })
  return <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
}

function withOuterRetry(node: React.ReactNode): {
  render: () => void
  outerRetryPolicy: ReturnType<typeof vi.fn>
} {
  const outerRetryPolicy = vi.fn((_failureCount: number, _error: Error) => true)
  const wrapped = withProviders(node, { outerRetry: outerRetryPolicy })
  return {
    render: () => {
      render(wrapped)
    },
    outerRetryPolicy,
  }
}

function makeModel(
  model_name: string,
  supported_endpoint_types: string[],
  tags = ''
): Record<string, unknown> {
  return {
    id: 0,
    model_name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    supported_endpoint_types,
    tags,
  }
}

const BASE_URL = 'https://vancine.com/v1'

function setFixture(next: unknown): void {
  pending = false
  pricingError = null
  pricingFixture = next
}

function setError(message = 'pricing down'): void {
  pending = false
  pricingError = new Error(message)
  pricingFixture = null
}

function setPending(): void {
  pricingError = null
  pricingFixture = null
  pending = true
}

beforeEach(async () => {
  await initTestI18n()
  callCount = 0
  pending = false
  pricingError = null
  pricingFixture = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Docs ModelsPage — text + image + video sections render live', () => {
  it('renders the text / image / video lists from the mocked /api/pricing payload', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('text-a', ['openai']),
        makeModel('text-b', ['anthropic']),
        makeModel('live-image-2027', ['image-generation']),
        makeModel('live-video-2027', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    const textList = await screen.findByTestId('docs-models-text-list')
    await waitFor(() => {
      expect(textList.textContent).toContain('text-a')
      expect(textList.textContent).toContain('text-b')
    })
    expect(
      await screen.findByTestId('docs-models-image-list')
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('docs-models-video-list')
    ).toBeInTheDocument()
  })

  it('shows only what the live /api/pricing payload returns (no static fallback)', async () => {
    // The Docs ModelsPage is a pure projection of the live /api/pricing
    // payload. If the API returns a dynamic name (e.g. `live-image-2027`)
    // the page MUST surface it. If the API does NOT return a name
    // (e.g. the retired `qwen-image-2.0`), the page MUST NOT invent it
    // out of a static fallback list.
    setFixture({
      success: true,
      data: [
        makeModel('live-image-from-api', ['image-generation']),
        makeModel('live-video-from-api', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    const imageList = await screen.findByTestId('docs-models-image-list')
    const videoList = await screen.findByTestId('docs-models-video-list')
    // The dynamic API names appear in the rendered lists.
    expect(imageList.textContent).toContain('live-image-from-api')
    expect(videoList.textContent).toContain('live-video-from-api')
    // No text-eligible records: the text list is NOT rendered (the page
    // shows the dedicated empty state instead).
    expect(screen.queryByTestId('docs-models-text-list')).toBeNull()
    // The retired names were never in this payload, so they must not
    // appear out of a static fallback.
    expect(screen.queryByText('qwen-image-2.0')).not.toBeInTheDocument()
    expect(screen.queryByText('Doubao-Seedance-2.5')).not.toBeInTheDocument()
  })

  it('renders model counts derived from the live payload, not from a static array', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('text-1', ['openai']),
        makeModel('text-2', ['openai-response']),
        makeModel('text-3', ['anthropic']),
        makeModel('img-1', ['image-generation']),
        makeModel('vid-1', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: 'Text models (3)' })
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { level: 3, name: 'Image models (1)' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Video models (1)' })
    ).toBeInTheDocument()
  })

  it('does not render audio / 3D / TTS sections', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('text-a', ['openai']),
        makeModel('img-a', ['image-generation']),
        makeModel('vid-a', ['openai-video']),
        makeModel('audio-a', ['openai'], 'audio'),
        makeModel('tts-a', ['openai'], 'tts'),
        makeModel('three-d', ['openai'], '3d'),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    await screen.findByTestId('docs-models-image-list')
    expect(screen.queryByText(/audio/i)).toBeNull()
    expect(screen.queryByText(/3d/i)).toBeNull()
    expect(screen.queryByText(/tts/i)).toBeNull()
  })

  it('keeps the live /api/pricing entry point regardless of catalog state', async () => {
    setFixture({
      success: true,
      data: [makeModel('only-text', ['openai'])],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    await screen.findByTestId('docs-models-text-list')
    expect(
      (await screen.findAllByText(/\/api\/pricing/))[0]
    ).toBeInTheDocument()
  })
})

describe('Docs ModelsPage — independent empty states per category', () => {
  it('shows text empty, image list, video list when only image and video exist', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('img-only', ['image-generation']),
        makeModel('vid-only', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    expect(
      await screen.findByTestId('docs-models-text-empty')
    ).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-image-list')).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-video-list')).toBeInTheDocument()
  })

  it('shows image empty, text list, video list when only text and video exist', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('text-only', ['openai']),
        makeModel('vid-only', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    expect(
      await screen.findByTestId('docs-models-text-list')
    ).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-image-empty')).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-video-list')).toBeInTheDocument()
  })

  it('shows video empty, text list, image list when only text and image exist', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('text-only', ['openai']),
        makeModel('img-only', ['image-generation']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    expect(
      await screen.findByTestId('docs-models-text-list')
    ).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-image-list')).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-video-empty')).toBeInTheDocument()
  })

  it('shows all three empty states when the catalog is empty', async () => {
    setFixture({
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    expect(
      await screen.findByTestId('docs-models-text-empty')
    ).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-image-empty')).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-video-empty')).toBeInTheDocument()
  })
})

describe('Docs ModelsPage — loading and error', () => {
  it('renders a loading state while the catalog is pending', async () => {
    setPending()
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    expect(
      await screen.findByTestId('docs-models-text-loading')
    ).toBeInTheDocument()
    // Loading skeletons never flash legacy model names.
    expect(screen.queryByText('qwen-image-2.0')).toBeNull()
    expect(screen.queryByText('Doubao-Seedance-2.5')).toBeNull()
  })

  it('renders an error state and a retry affordance when the request fails', async () => {
    setError('pricing down')
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    const errorNode = await screen.findByTestId('docs-models-text-error')
    expect(errorNode).toBeInTheDocument()
    expect(
      within(errorNode).getByText('Live model catalog is unavailable')
    ).toBeInTheDocument()
    expect(
      within(errorNode).getByTestId('docs-models-retry')
    ).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-image-error')).toBeInTheDocument()
    expect(screen.getByTestId('docs-models-video-error')).toBeInTheDocument()
  })

  it('clicking Retry triggers exactly one refetch (never stacked with invalidateQueries)', async () => {
    setError('pricing down')
    const user = userEvent.setup()
    render(
      withProviders(
        <I18nextProvider i18n={i18n}>
          <TocProvider>
            <ModelsPage baseUrl={BASE_URL} />
          </TocProvider>
        </I18nextProvider>
      )
    )
    const errorNode = await screen.findByTestId('docs-models-text-error')
    const retry = within(errorNode).getByTestId('docs-models-retry')
    // The first failed request already happened.
    const before = callCount
    await user.click(retry)
    // The retry must produce exactly one new request, never zero (no-op)
    // and never two (stacked refetch + invalidate).
    expect(callCount - before).toBe(1)
  })
})

describe('Docs ModelsPage — useLiveModelCatalog pins retry:false', () => {
  it('an initial failure makes exactly one getPricing call and the outer retry spy is never consulted', async () => {
    // The outer QueryClient registers a spied retry policy. The
    // production default would normally fire here; the Hook itself
    // must pin retry:false so neither the spy nor a cascade ever
    // runs. The retry policy is a vi.fn so the test reads the call
    // count synchronously — no timers or event-loop delays.
    setError('pricing down')
    const harness = withOuterRetry(
      <I18nextProvider i18n={i18n}>
        <TocProvider>
          <ModelsPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )
    harness.render()
    await screen.findByTestId('docs-models-text-error')
    expect(callCount).toBe(1)
    expect(harness.outerRetryPolicy).not.toHaveBeenCalled()
  })

  it('clicking Retry triggers exactly one new getPricing call without invoking the outer retry spy', async () => {
    setError('pricing down')
    const user = userEvent.setup()
    const harness = withOuterRetry(
      <I18nextProvider i18n={i18n}>
        <TocProvider>
          <ModelsPage baseUrl={BASE_URL} />
        </TocProvider>
      </I18nextProvider>
    )
    harness.render()
    const errorNode = await screen.findByTestId('docs-models-text-error')
    const retry = within(errorNode).getByTestId('docs-models-retry')
    const before = callCount
    await user.click(retry)
    // Wait for the refetch to settle using only the observable
    // getPricing call count. The hook pins retry:false, so the new
    // refetch itself is the only one — no auto-retry cascade ever
    // touches the outer policy.
    await waitFor(() => {
      expect(callCount - before).toBe(1)
    })
    expect(harness.outerRetryPolicy).not.toHaveBeenCalled()
  })
})

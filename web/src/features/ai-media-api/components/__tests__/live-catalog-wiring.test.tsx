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
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingData } from '@/features/pricing/types'

import {
  ensureAiMediaApiI18n,
  renderAiMediaApiPage,
  renderAiMediaApiPageWithOuterRetry,
} from './test-helpers'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/layout', async () => {
  const actual = await vi.importActual<typeof import('@/components/layout')>(
    '@/components/layout'
  )
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

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

let pricingFixture: PricingData = {
  success: true,
  data: [],
  vendors: [],
  group_ratio: {},
  usable_group: {},
  supported_endpoint: {},
  auto_groups: [],
}
let pending = false
let pricingError: Error | null = null
const getPricingMock = vi.fn(async () => {
  if (pending) {
    return new Promise(() => {}) as unknown as PricingData
  }
  if (pricingError) throw pricingError
  return pricingFixture
})

vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) =>
    (getPricingMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

function setFixture(next: PricingData): void {
  pending = false
  pricingError = null
  pricingFixture = next
  getPricingMock.mockImplementation(async () => next)
}

function setPending(): void {
  pricingError = null
  pending = true
  getPricingMock.mockImplementation(
    () => new Promise(() => {}) as unknown as ReturnType<typeof getPricingMock>
  )
}

function setError(message = 'pricing down'): void {
  pending = false
  pricingError = new Error(message)
  getPricingMock.mockImplementation(async () => {
    throw pricingError
  })
}

function makeModel(
  model_name: string,
  supported_endpoint_types: string[],
  tags = ''
): PricingData['data'][number] {
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

beforeEach(async () => {
  await ensureAiMediaApiI18n()
  pending = false
  pricingError = null
  pricingFixture = {
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }
  getPricingMock.mockClear()
  getPricingMock.mockImplementation(async () => pricingFixture)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Single-source-of-truth wiring
// ---------------------------------------------------------------------------

describe('live catalog wiring — single /api/pricing owner', () => {
  it('triggers exactly one /api/pricing request for the entire page', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('live-image-2027', ['image-generation']),
        makeModel('live-video-2027', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    await screen.findByRole('heading', { level: 1 })
    // Both MediaCategories and ApiExamples consume the same shared cache
    // entry, so a single mount issues a single getPricing call.
    expect(getPricingMock).toHaveBeenCalledTimes(1)
  })

  it('the page never re-renders duplicate /api/pricing requests across navigation', async () => {
    setFixture({
      success: true,
      data: [makeModel('m', ['openai'])],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    const first = renderAiMediaApiPage('/ai-media-api/')
    await screen.findByRole('heading', { level: 1 })
    first.unmount()
    // Each fresh mount issues exactly one call.
    const second = renderAiMediaApiPage('/ai-media-api/?utm_source=foo')
    await screen.findByRole('heading', { level: 1 })
    expect(getPricingMock).toHaveBeenCalledTimes(2)
    second.unmount()
  })
})

// ---------------------------------------------------------------------------
// Classification & dynamic model names
// ---------------------------------------------------------------------------

describe('live catalog wiring — image and video classification', () => {
  it('classifies image and video models by exact supported_endpoint_types', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('live-image-2027', ['image-generation']),
        makeModel('live-video-2027', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()

    const imageList = await screen.findByTestId('ai-media-category-image-list')
    const videoList = await screen.findByTestId('ai-media-category-video-list')
    await waitFor(() => {
      expect(imageList.textContent).toContain('live-image-2027')
    })
    expect(videoList.textContent).toContain('live-video-2027')
    // The page follows the live payload exactly; it never falls back to a
    // hardcoded model name.
    expect(document.body.textContent).not.toContain('qwen-image-2.0')
    expect(document.body.textContent).not.toContain('Doubao-Seedance-2.5')
  })

  it('uses the live image model name in the image curl example', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('live-image-2027', ['image-generation']),
        makeModel('live-video-2027', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    const user = userEvent.setup()
    renderAiMediaApiPage()
    const imageExample = await screen.findByTestId('api-examples-image')
    expect(imageExample.textContent).toContain('live-image-2027')
    expect(imageExample.textContent).not.toContain('qwen-image-2.0')
    // The async poll follow-up is wired by the contract.
    void user
  })

  it('uses the live video model name in the video curl example', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('live-image-2027', ['image-generation']),
        makeModel('live-video-2027', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    const user = userEvent.setup()
    renderAiMediaApiPage()
    await user.click(await screen.findByRole('tab', { name: 'Video' }))
    const videoExample = await screen.findByTestId('api-examples-video')
    expect(videoExample.textContent).toContain('live-video-2027')
    expect(videoExample.textContent).not.toContain('Doubao-Seedance-2.5')
    expect(videoExample.textContent).toContain('GET')
    expect(videoExample.textContent).toContain('$TASK_ID')
  })
})

// ---------------------------------------------------------------------------
// Tabs default value
// ---------------------------------------------------------------------------

describe('live catalog wiring — Tabs default value', () => {
  it('defaults to image when both image and video are available', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('img', ['image-generation']),
        makeModel('vid', ['openai-video']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent)).toEqual(['Image', 'Video'])
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('falls back to video as the default when only video is available', async () => {
    setFixture({
      success: true,
      data: [makeModel('vid', ['openai-video'])],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent)).toEqual(['Video'])
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('shows only the image tab when only image is available', async () => {
    setFixture({
      success: true,
      data: [makeModel('img', ['image-generation'])],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent)).toEqual(['Image'])
    })
  })
})

// ---------------------------------------------------------------------------
// Empty / error / loading
// ---------------------------------------------------------------------------

describe('live catalog wiring — empty state', () => {
  it('renders the empty state in MediaCategories and ApiExamples when no models exist', async () => {
    setFixture({
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    expect(
      await screen.findByTestId('ai-media-category-image-empty')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('ai-media-category-video-empty')
    ).toBeInTheDocument()
    expect(await screen.findByTestId('api-examples-empty')).toBeInTheDocument()
  })
})

describe('live catalog wiring — error state and retry', () => {
  it('shows the error state with Docs and Pricing entry points', async () => {
    setError('pricing down')
    renderAiMediaApiPage()
    expect(
      await screen.findByTestId('ai-media-category-image-error')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('ai-media-category-video-error')
    ).toBeInTheDocument()
    const apiError = await screen.findByTestId('api-examples-error')
    expect(apiError).toBeInTheDocument()
    // Error and empty states both keep the Docs and Pricing links visible
    // so users always have a fallback path. The Button component
    // exposes an <a> as a `button` role, so we look it up that way.
    expect(
      within(apiError).getByRole('button', { name: /open docs/i })
    ).toBeInTheDocument()
    expect(
      within(apiError).getByRole('button', {
        name: /view live pricing and availability/i,
      })
    ).toBeInTheDocument()
  })

  it('exposes a real Retry button in the api-examples error state', async () => {
    setError('pricing down')
    const user = userEvent.setup()
    renderAiMediaApiPage()
    const apiError = await screen.findByTestId('api-examples-error')
    const retry = within(apiError).getByRole('button', { name: /retry/i })
    expect(retry).toBeInTheDocument()
    const callsBefore = getPricingMock.mock.calls.length
    await user.click(retry)
    // One click must produce exactly one refetch: it never stacks with
    // invalidateQueries so the network and the analytics layer both see
    // a single, observable refetch event.
    expect(getPricingMock.mock.calls.length - callsBefore).toBe(1)
  })
})

describe('live catalog wiring — loading', () => {
  it('renders a stable loading state without flashing legacy model names', async () => {
    setPending()
    renderAiMediaApiPage()
    await waitFor(() => {
      expect(screen.getByTestId('api-examples-loading')).toBeInTheDocument()
    })
    expect(document.body.textContent).not.toContain('qwen-image-2.0')
    expect(document.body.textContent).not.toContain('Doubao-Seedance-2.5')
  })
})

// ---------------------------------------------------------------------------
// Display policy
// ---------------------------------------------------------------------------

describe('live catalog wiring — display policy', () => {
  it('shows the count, example badge, and at most three model names per category', async () => {
    setFixture({
      success: true,
      data: [
        makeModel('img-a', ['image-generation']),
        makeModel('img-b', ['image-generation']),
        makeModel('img-c', ['image-generation']),
        makeModel('img-d', ['image-generation']),
      ],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      supported_endpoint: {},
      auto_groups: [],
    })
    renderAiMediaApiPage()
    const imageList = await screen.findByTestId('ai-media-category-image-list')
    await waitFor(() => {
      // 4 models: count = 4, the displayed slice is the first three of
      // the reversed list (img-d / img-c / img-b). img-a is suppressed.
      expect(imageList.textContent).toContain('img-d')
    })
    expect(imageList.textContent).toContain(
      'Currently available image models: 4'
    )
    expect(imageList.textContent).not.toContain('img-a')
    expect(
      screen.getByTestId('ai-media-category-image-example-badge')
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// useLiveModelCatalog retry:false overrides outer QueryClient retry policy
// ---------------------------------------------------------------------------

describe('live catalog wiring — retry:false pins the consumer', () => {
  it('an initial failure makes exactly one getPricing call and the outer retry spy is never consulted', async () => {
    // The outer QueryClient registers a spied retry policy. The
    // production default would normally fire here; the Hook itself
    // must pin retry:false so neither the spy nor a cascade ever
    // runs. The retry policy is a vi.fn so the test reads the call
    // count synchronously — no timers or event-loop delays.
    setError('pricing down')
    const { outerRetryPolicy } = renderAiMediaApiPageWithOuterRetry()
    await screen.findByTestId('api-examples-error')
    expect(getPricingMock).toHaveBeenCalledTimes(1)
    expect(outerRetryPolicy).not.toHaveBeenCalled()
  })

  it('clicking Retry triggers exactly one new getPricing call without invoking the outer retry spy', async () => {
    setError('pricing down')
    const user = userEvent.setup()
    const { outerRetryPolicy } = renderAiMediaApiPageWithOuterRetry()
    const apiError = await screen.findByTestId('api-examples-error')
    const retry = within(apiError).getByRole('button', { name: /retry/i })
    const callsBefore = getPricingMock.mock.calls.length
    await user.click(retry)
    // Wait for the refetch to settle using only the observable
    // getPricing call count. The hook pins retry:false, so the new
    // refetch itself is the only one — no auto-retry cascade ever
    // touches the outer policy.
    await waitFor(() => {
      expect(getPricingMock.mock.calls.length - callsBefore).toBe(1)
    })
    expect(outerRetryPolicy).not.toHaveBeenCalled()
  })
})

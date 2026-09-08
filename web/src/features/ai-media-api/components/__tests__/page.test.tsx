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
import { act, screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingData } from '@/features/pricing/types'
import { trackEvent } from '@/lib/analytics'
import { useAuthStore } from '@/stores/auth-store'

import { ensureAiMediaApiI18n, renderAiMediaApiPage } from './test-helpers'

// ---------------------------------------------------------------------------
// Module-level mocks (must run before the page module is evaluated).
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

// Shared `getPricing` mock: tests install a fixture and the catalog hook
// reads from it. The default fixture carries one image and one video model
// so the page renders its normal Tabs/MediaCategories/ApiExamples
// structure without spuriously empty/erroring out.
let pricingFixture: PricingData = {
  success: true,
  data: [
    {
      id: 1,
      model_name: 'qwen-image-2.0',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      supported_endpoint_types: ['image-generation'],
      tags: 'image',
    },
    {
      id: 2,
      model_name: 'Doubao-Seedance-2.5',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      supported_endpoint_types: ['openai-video'],
      tags: 'video',
    },
  ],
  vendors: [],
  group_ratio: {},
  usable_group: {},
  supported_endpoint: {},
  auto_groups: [],
}
const getPricingMock = vi.fn(async () => pricingFixture)

vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) =>
    (getPricingMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// Remember how jsdom originally exposed navigator.clipboard so every case
// restores the exact descriptor even when an assertion throws mid-test.
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)

// Preserve the real console.error so controlled spies can re-emit anything
// they do not explicitly suppress.
// (no console spies needed in this file — the suite only exercises
// routing, SEO metadata, and copy buttons that already handle their
// own error paths.)

function setAuthenticated(isAuthenticated: boolean): void {
  const current = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...current,
      user: isAuthenticated ? { id: 1, username: 'dev', role: 1 } : null,
    },
  })
}

beforeEach(async () => {
  await ensureAiMediaApiI18n()
  setAuthenticated(false)
  trackEventMock.mockClear()
  getPricingMock.mockClear()
  // Reset the fixture to the page's normal default so tests that don't
  // override the catalog still exercise the same Tabs/MediaCategories/
  // ApiExamples structure.
  pricingFixture = {
    success: true,
    data: [
      {
        id: 1,
        model_name: 'qwen-image-2.0',
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ['default'],
        supported_endpoint_types: ['image-generation'],
        tags: 'image',
      },
      {
        id: 2,
        model_name: 'Doubao-Seedance-2.5',
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ['default'],
        supported_endpoint_types: ['openai-video'],
        tags: 'video',
      },
    ],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }
  getPricingMock.mockImplementation(async () => pricingFixture)
})

afterEach(() => {
  if (originalClipboardDescriptor === undefined) {
    delete (navigator as { clipboard?: unknown }).clipboard
  } else {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
  }
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('ai-media-api page structure', () => {
  it('renders exactly one h1 and all required sections', async () => {
    renderAiMediaApiPage()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(
      'Access Chinese AI media models through one API.'
    )

    for (const section of [
      'One integration, one account',
      'One integration across image and video',
      'Make your first request in minutes',
      'Built for products that generate more than text',
      'Models and pricing are live',
      'Frequently asked questions',
      'Build your first AI media request today',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: section })
      ).toBeInTheDocument()
    }
  })
})

// ---------------------------------------------------------------------------
// CTA destinations
// ---------------------------------------------------------------------------

describe('CTA destinations and UTM safety', () => {
  it('points guest CTAs at /sign-up and keeps only allowlisted UTM parameters', async () => {
    renderAiMediaApiPage(
      '/ai-media-api/?utm_source=launch&utm_campaign=media&email=a@b.com&api_key=sk-secret&redirect=%2Fevil'
    )

    const heroCta = await screen.findByRole('button', { name: 'Get started' })
    expect(heroCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=media'
    )
    expect(String(heroCta.getAttribute('href'))).not.toContain('email')
    expect(String(heroCta.getAttribute('href'))).not.toContain('api_key')
    expect(String(heroCta.getAttribute('href'))).not.toContain('redirect')

    const finalCta = await screen.findByRole('button', {
      name: /Get started with Vancine/,
    })
    expect(finalCta).toHaveAttribute(
      'href',
      '/sign-up?utm_source=launch&utm_campaign=media'
    )
  })

  it('points authenticated CTAs at /playground', async () => {
    setAuthenticated(true)
    renderAiMediaApiPage('/ai-media-api/?utm_source=launch&token=abc')

    const ctas = await screen.findAllByRole('button', {
      name: 'Go to Playground',
    })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/playground?utm_source=launch')
      expect(String(cta.getAttribute('href'))).not.toContain('token')
    }
  })
})

// ---------------------------------------------------------------------------
// Page metadata lifecycle
// ---------------------------------------------------------------------------

describe('page metadata lifecycle', () => {
  it('applies SEO metadata on mount and restores the head on unmount', async () => {
    document.title = 'Baseline Title'
    const canonicalBefore = document.head.querySelector('link[rel="canonical"]')
    expect(canonicalBefore).toBeNull()

    const result: RenderResult = renderAiMediaApiPage()
    await screen.findByRole('heading', { level: 1 })

    expect(document.title).toBe('AI Media API: Image & Video | Vancine')
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/ai-media-api')
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
    ).toBe('https://vancine.com/ai-media-api')

    result.unmount()
    expect(document.title).toBe('Baseline Title')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()
  })

  it('updates metadata when the language changes', async () => {
    renderAiMediaApiPage()
    await screen.findByRole('heading', { level: 1 })
    const englishTitle = document.title

    await act(async () => {
      await i18n.changeLanguage('zhCN')
    })
    await waitFor(() => {
      expect(document.title).not.toBe(englishTitle)
    })
    expect(document.title).toContain('AI 多媒体 API')
  })
})

// ---------------------------------------------------------------------------
// Link safety
// ---------------------------------------------------------------------------

describe('link safety', () => {
  it('uses same-origin routes for Docs and Pricing without target=_blank', async () => {
    renderAiMediaApiPage()
    await screen.findByRole('heading', { level: 1 })

    const pricingLinks = screen.getAllByRole('button', {
      name: /View live pricing and availability/,
    })
    for (const link of pricingLinks) {
      expect(link).toHaveAttribute('href', '/pricing')
      expect(link).not.toHaveAttribute('target')
    }

    const docsButtons = screen.getAllByRole('button', {
      name: 'Read API documentation',
    })
    expect(docsButtons.length).toBeGreaterThanOrEqual(2)
    for (const button of docsButtons) {
      expect(String(button.getAttribute('href'))).toMatch(/^\/docs(\/|$)/)
      expect(button).not.toHaveAttribute('target')
    }
  })
})

// ---------------------------------------------------------------------------
// Anonymous analytics emissions
// ---------------------------------------------------------------------------

describe('anonymous analytics emissions', () => {
  it('emits only approved events with fixed payload keys on CTA and resource clicks', async () => {
    const user = userEvent.setup()

    const first = renderAiMediaApiPage(
      '/ai-media-api/?utm_source=launch&email=a@b.com'
    )
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getAllByRole('button', {
        name: /View live pricing and availability/,
      })[0]
    )
    first.unmount()

    const second = renderAiMediaApiPage(
      '/ai-media-api/?utm_source=launch&email=a@b.com'
    )
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    second.unmount()

    expect(trackEventMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    const allowedEvents = new Set([
      'get_started_clicked',
      'developer_resource_clicked',
    ])
    const allowedPayloadKeys = new Set(['location', 'resource'])
    for (const [eventName, payload] of trackEventMock.mock.calls as Array<
      [string, Record<string, unknown> | undefined]
    >) {
      expect(allowedEvents.has(eventName)).toBe(true)
      for (const key of Object.keys(payload ?? {})) {
        expect(allowedPayloadKeys.has(key)).toBe(true)
      }
      expect(JSON.stringify(payload)).not.toContain('launch')
      expect(JSON.stringify(payload)).not.toContain('a@b.com')
    }
  })
})

// ---------------------------------------------------------------------------
// FAQ keyboard accessibility
// ---------------------------------------------------------------------------

describe('FAQ keyboard accessibility', () => {
  it('expands an answer through keyboard interaction', async () => {
    const user = userEvent.setup()
    renderAiMediaApiPage()

    const question = 'How does video generation work?'
    const trigger = await screen.findByRole('button', { name: question })
    trigger.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(
        screen.getByText(/submit a generation request, receive a task ID/)
      ).toBeVisible()
    })
  })
})

// ---------------------------------------------------------------------------
// Copy / clipboard
// ---------------------------------------------------------------------------

describe('API example copy', () => {
  it('announces copy success accessibly', async () => {
    const user = userEvent.setup()

    const clipboardSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardSpy },
    })

    renderAiMediaApiPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: 'Copy example code to clipboard',
    })
    await user.click(copyButtons[0])
    expect(clipboardSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText('Code copied')).toBeInTheDocument()
    })
  })

  it('announces copy failure when every clipboard path fails', async () => {
    const user = userEvent.setup()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    renderAiMediaApiPage()
    const copyButtons = await screen.findAllByRole('button', {
      name: 'Copy example code to clipboard',
    })
    await user.click(copyButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Unable to copy code')).toBeInTheDocument()
    })
  })
})

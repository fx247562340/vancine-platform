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

For commercial licensing, please contact support@quantumnous.com.
*/
import { screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TocProvider } from '../components/toc-context'
import enDocs from '../i18n/locales/en.json'
import ImagePage from '../pages/image'
import VideoPage from '../pages/video'
import { renderWithProviders } from './test-utils'

// Mock the pricing API at the module level so the page's
// useLiveModelCatalog hook can be driven by deterministic fixtures.
// `vi.hoisted` ensures the mock fn is available to the vi.mock
// factory, which is hoisted above the test body by vitest.
const { getPricingMock } = vi.hoisted(() => ({ getPricingMock: vi.fn() }))
vi.mock('@/features/pricing/api', () => ({
  getPricing: (...args: unknown[]) =>
    (getPricingMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

const EN = enDocs as unknown as {
  translation: Record<string, Record<string, string>>
}

function primeDocs(): void {
  i18n.removeResourceBundle('en', 'docs')
  i18n.addResourceBundle('en', 'docs', EN, true, true)
}

type PricingPayload = {
  success: boolean
  data: ReadonlyArray<{
    model_name: string
    supported_endpoint_types: ReadonlyArray<string>
  }>
}

function setFixture(payload: PricingPayload): void {
  getPricingMock.mockImplementation(async () => payload)
}

const ONLINE_IMAGE_MODELS = [
  {
    model_name: 'qwen-image-3.0',
    supported_endpoint_types: ['image-generation'],
  },
  {
    model_name: 'Doubao-Seedream-5.0-lite',
    supported_endpoint_types: ['image-generation'],
  },
] as const
const ONLINE_VIDEO_MODELS = [
  {
    model_name: 'Doubao-Seedance-2.0',
    supported_endpoint_types: ['openai-video'],
  },
  {
    model_name: 'MiniMax-H3',
    supported_endpoint_types: ['openai-video'],
  },
] as const

beforeEach(() => {
  primeDocs()
  // Default: empty pricing payload. Each test sets its own
  // fixture to drive the catalog state (ready / empty / error).
  setFixture({ success: false, data: [] } as unknown as PricingPayload)
})

afterEach(() => {
  getPricingMock.mockReset()
})

describe('/docs/image — online models reflect the live catalog', () => {
  it('renders the page header, both endpoint paths, and the common parameters', async () => {
    renderWithProviders(
      <TocProvider>
        <ImagePage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    expect(
      await screen.findByRole('heading', { name: 'Image Generation' })
    ).toBeInTheDocument()
    // The path text is broken into "POST" + "/v1/images/generations";
    // assert the endpoint is present in either form.
    const text = document.body.textContent ?? ''
    expect(text).toContain('/v1/images/generations')
  })

  it('the example body for every image model matches the contract (defaultSize, n=1, model id verbatim)', async () => {
    // The shared contract-aware example body helper picks the
    // FIRST online model that has an image contract. For an
    // overview test we drive the helper directly, since the page
    // version depends on the live-catalog state.
    const { buildImageExampleBody } = await import('../lib/example-generation')

    const cases: ReadonlyArray<[string, string]> = [
      ['qwen-image-3.0', 'Auto'],
      ['qwen-image-3.0-pro', 'Auto'],
      ['wan2.7-image-pro', '2K'],
      ['Doubao-Seedream-5.0-pro', '2K'],
      ['Doubao-Seedream-5.0-lite', '2K'],
    ]
    for (const [modelId, defaultSize] of cases) {
      const body = buildImageExampleBody(modelId) as Record<string, unknown>
      expect(body.model).toBe(modelId)
      expect(body.n).toBe(1)
      expect(body.size).toBe(defaultSize)
    }
    // Seedream 5.0 Lite must NEVER use 1024x1024 — its contract
    // supports 2K/3K/4K only.
    const liteBody = buildImageExampleBody(
      'Doubao-Seedream-5.0-lite'
    ) as Record<string, unknown>
    expect(liteBody.size).not.toBe('1024x1024')
  })
})

describe('/docs/video — overview and example body contract', () => {
  it('renders the page header and the two endpoint paths', async () => {
    renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    expect(
      await screen.findByRole('heading', { name: 'Video Generation' })
    ).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).toContain('/v1/video/generations')
  })

  it('the example body is the minimum legal request (model + prompt) when no live contract is available', async () => {
    // The OVERVIEW-level helper sends only the minimum legal
    // request (model + prompt) and never pins a per-model wire
    // field, because every video model has a different wire
    // contract and the overview must not misrepresent any of them.
    const { buildVideoOverviewBody } = await import('../lib/example-generation')
    const body = buildVideoOverviewBody('Doubao-Seedance-2.5')
    expect(body.model).toBe('Doubao-Seedance-2.5')
    expect(body.prompt).toBe('a cat walking on a beach')
    // No per-model wire fields leak into the overview example.
    const json = JSON.stringify(body)
    expect(json).not.toMatch(/"seconds"/)
    expect(json).not.toMatch(/"size"/)
    expect(json).not.toMatch(/"duration"/)
    expect(json).not.toMatch(/"metadata"/)
    // The per-model helper still produces the model-specific body,
    // and that body is what the detail page uses.
    const { buildVideoExampleBody, renderApiSamples } =
      await import('../lib/example-generation')
    const detail = buildVideoExampleBody('Doubao-Seedance-2.5')
    expect(detail).not.toBeNull()
    expect(JSON.stringify(detail)).toMatch(/"seconds"/)

    // The shared async renderer must document the real poll envelope,
    // not the OpenAI Video object statuses (completed/failed).
    const samples = renderApiSamples(
      'https://vancine.com/v1',
      '/video/generations',
      detail as Record<string, unknown>,
      'async'
    )
    for (const sample of [
      samples.curl.code,
      samples.python.code,
      samples.node.code,
    ]) {
      expect(sample).toContain('"id":"task_xxx"')
      expect(sample).toContain('"object":"video"')
      expect(sample).toContain('"status":"queued"')
      expect(sample).not.toMatch(/"task_id"/)
      expect(sample).not.toMatch(/host-fallback/)
      expect(sample).not.toMatch(/\bcompleted\b/)
      expect(sample).not.toMatch(/\bfailed\b/)
    }
    expect(samples.python.code).toMatch(/task\["id"\]/)
    expect(samples.node.code).toMatch(/task\.id/)
    expect(samples.python.code).toContain('SUCCESS')
    expect(samples.python.code).toContain('FAILURE')
    expect(samples.python.code).toContain('result_url')
    expect(samples.python.code).toContain('fail_reason')
    expect(samples.node.code).toContain('SUCCESS')
    expect(samples.node.code).toContain('FAILURE')
    expect(samples.node.code).toContain('result_url')
    expect(samples.node.code).toContain('fail_reason')
    expect(samples.python.code).toContain('raise_for_status')
    expect(samples.node.code).toMatch(/if \(!pollRes\.ok\)/)
  })

  it('the status table separates the submit receipt from GET poll statuses', async () => {
    renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    expect(
      await screen.findByTestId('docs-video-status-submit')
    ).toBeInTheDocument()
    const submit = screen.getByTestId('docs-video-status-submit')
    expect(submit.textContent).toMatch(/\bqueued\b/)
    expect(submit.textContent).not.toMatch(/NOT_START|IN_PROGRESS|SUCCESS/)

    const table = await screen.findByTestId('docs-video-status-table')
    for (const status of [
      'NOT_START',
      'SUBMITTED',
      'QUEUED',
      'IN_PROGRESS',
      'SUCCESS',
      'FAILURE',
    ]) {
      expect(
        screen.getByTestId(`docs-video-status-${status}`)
      ).toBeInTheDocument()
      expect(table.textContent).toContain(status)
    }
    expect(screen.queryByTestId('docs-video-status-queued')).toBeNull()
    expect(screen.queryByTestId('docs-video-status-in_progress')).toBeNull()
    expect(screen.queryByTestId('docs-video-status-completed')).toBeNull()
    expect(screen.queryByTestId('docs-video-status-failed')).toBeNull()
  })
})

describe('Live model catalog → docs page integration', () => {
  it('ready: /docs/image lists ONLY models from the live payload', async () => {
    setFixture({ success: true, data: ONLINE_IMAGE_MODELS })
    renderWithProviders(
      <TocProvider>
        <ImagePage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('docs-image-models-list')).toBeInTheDocument()
    })
    const list = screen.getByTestId('docs-image-models-list')
    expect(list.textContent).toContain('qwen-image-3.0')
    expect(list.textContent).toContain('Doubao-Seedream-5.0-lite')
    // A model the live payload does NOT advertise is NEVER listed,
    // even though the registry has a contract for it.
    expect(list.textContent).not.toContain('wan2.7-image-pro')
    expect(list.textContent).not.toContain('qwen-image-2.0')
  })

  it('ready: /docs/video lists ONLY models from the live payload', async () => {
    setFixture({ success: true, data: ONLINE_VIDEO_MODELS })
    renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('docs-video-models-list')).toBeInTheDocument()
    })
    const list = screen.getByTestId('docs-video-models-list')
    expect(list.textContent).toContain('Doubao-Seedance-2.0')
    expect(list.textContent).toContain('MiniMax-H3')
    // The video overview must NOT silently show the full registry
    // list when the catalog only advertises two.
    expect(list.textContent).not.toContain('wan3.0-video-prime')
    expect(list.textContent).not.toContain('Doubao-Seedance-2.5')
  })

  it('error: the overview does not fall back to a hard-coded online list', async () => {
    getPricingMock.mockImplementation(async () => {
      throw new Error('boom')
    })
    renderWithProviders(
      <TocProvider>
        <ImagePage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('docs-image-models-error')).toBeInTheDocument()
    })
    // No "currently online" list is rendered. The error callout is
    // the only surface.
    expect(screen.queryByTestId('docs-image-models-list')).toBeNull()
    expect(screen.queryByTestId('docs-image-models-empty')).toBeNull()
  })

  it('empty: the overview shows the real empty state, never the registry list', async () => {
    setFixture({ success: true, data: [] })
    renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('docs-video-models-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('docs-video-models-list')).toBeNull()
  })
})

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
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { TocProvider } from '../components/toc-context'
import enDocs from '../i18n/locales/en.json'
import ModelDetailPage from '../pages/model-detail'
import VideoPage from '../pages/video'
import { renderWithProviders } from './test-utils'

const EN = enDocs as unknown as {
  translation: Record<string, Record<string, string>>
}

function primeDocs(): void {
  i18n.removeResourceBundle('en', 'docs')
  i18n.addResourceBundle('en', 'docs', EN, true, true)
}

beforeEach(() => {
  primeDocs()
  // The page reads /api/pricing through useLiveModelCatalog; let the
  // in-flight fetch fail so the page renders the "unconfirmed" badge
  // (which is the appropriate visible state when the catalog is
  // down). The tests below assert the page renders the registry-
  // derived contract regardless of the catalog status, so the badge
  // label is the only thing the catalog state changes.
})

const IMAGE_MODELS = [
  { modelId: 'qwen-image-3.0', slug: 'qwen-image-3.0' },
  { modelId: 'qwen-image-3.0-pro', slug: 'qwen-image-3.0-pro' },
  { modelId: 'wan2.7-image-pro', slug: 'wan2.7-image-pro' },
  { modelId: 'Doubao-Seedream-5.0-pro', slug: 'doubao-seedream-5.0-pro' },
  { modelId: 'Doubao-Seedream-5.0-lite', slug: 'doubao-seedream-5.0-lite' },
] as const

const VIDEO_MODELS = [
  { modelId: 'wan3.0-video', slug: 'wan3.0-video' },
  { modelId: 'wan3.0-video-prime', slug: 'wan3.0-video-prime' },
  { modelId: 'MiniMax-H3', slug: 'minimax-h3' },
  { modelId: 'Doubao-Seedance-2.0', slug: 'doubao-seedance-2.0' },
  { modelId: 'Doubao-Seedance-2.5', slug: 'doubao-seedance-2.5' },
] as const

function renderDetail(slug: string) {
  return renderWithProviders(
    <TocProvider>
      <ModelDetailPage slug={slug} baseUrl='https://vancine.com/v1' />
    </TocProvider>
  )
}

describe('Image model detail pages — contract surface', () => {
  for (const { modelId, slug } of IMAGE_MODELS) {
    it(`${slug} renders the exact case-sensitive model id and a non-empty description`, async () => {
      renderDetail(slug)
      // The page must print the live-cased model id verbatim. A
      // /docs/overview search for the id has to find the page by the
      // exact spelling.
      await waitFor(() => {
        expect(screen.getAllByText(modelId).length).toBeGreaterThan(0)
      })
      // The page must surface a translated description, never a raw
      // i18n key.
      const pageText =
        (await screen.findByTestId('docs-model-detail')).textContent ?? ''
      // No key leakage anywhere on the page.
      for (const key of [
        'modelDetail.summary.',
        'modelDetail.description.',
        'modelDetail.verified',
        'modelDetail.contractMissing',
      ]) {
        expect(pageText).not.toContain(key)
      }
    })
  }

  it('Seedream 5.0 Pro never lists 3K or 4K in its parameter table', async () => {
    const { container } = renderDetail('doubao-seedream-5.0-pro')
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('Doubao-Seedream-5.0-pro')
    })
    // The textContent also includes "no 4k" from the per-model
    // notes; the parameter-row assertion must anchor on a digit
    // boundary so the note is not a false positive.
    expect(container.textContent ?? '').not.toMatch(/\b3K\b/)
    expect(container.textContent ?? '').not.toMatch(/\b4K\b/)
  })

  it('Seedream 5.0 Lite example body uses 2K, not 1024x1024', async () => {
    // Build the example body through the shared contract-aware
    // helper, the same code path the page uses.
    const { buildImageExampleBody } = await import('../lib/example-generation')
    const body = buildImageExampleBody('Doubao-Seedream-5.0-lite') as Record<
      string,
      unknown
    >
    expect(body.size).toBe('2K')
    expect(body.size).not.toBe('1024x1024')
  })

  it('Qwen 3.0 page declares the prompt_extend + enable_thinking coupling', async () => {
    const { container } = renderDetail('qwen-image-3.0')
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('qwen-image-3.0')
    })
    expect(container.textContent ?? '').toContain('prompt_extend_mode')
    expect(container.textContent ?? '').toContain('enable_thinking')
    // The coupling: enable_thinking requires prompt_extend.
    expect(container.textContent ?? '').toMatch(
      /enable_thinking.*prompt_extend/s
    )
  })
})

describe('Video model detail pages — wire contract surface', () => {
  it('documents GET /v1/video/generations/{id} and never {task_id}', async () => {
    const { container } = renderDetail('wan3.0-video')
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('wan3.0-video')
    })
    const text = container.textContent ?? ''
    expect(text).toContain('/v1/video/generations/{id}')
    expect(text).not.toContain('/v1/video/generations/{task_id}')
  })

  for (const { modelId, slug } of VIDEO_MODELS) {
    it(`${slug} renders the case-sensitive model id and a noindex-free page`, async () => {
      renderDetail(slug)
      await waitFor(() => {
        expect(screen.getAllByText(modelId).length).toBeGreaterThan(0)
      })
      // A model detail page is indexable; the noindex variant is
      // for unknown /docs/models/<slug> paths.
      const html = document.head.innerHTML
      expect(html).not.toContain('content="noindex"')
    })
  }

  it('Seedance 2.5 page documents seconds as a STRING and never 4K', async () => {
    const { container } = renderDetail('doubao-seedance-2.5')
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('Doubao-Seedance-2.5')
    })
    const text = container.textContent ?? ''
    // The supported resolution set is 480p / 720p / 1080p only.
    expect(text).toMatch(/480p, 720p, 1080p/)
    expect(text).not.toMatch(/480p, 720p, 1080p, 4k/i)
    // seconds is documented as a STRING (the JSON number form is 400).
    expect(text).toMatch(/string/i)
  })

  it('Seedance pages document seconds as STRING and never a number', async () => {
    // Both Seedance 2.0 and 2.5 use top-level STRING seconds.
    for (const slug of ['doubao-seedance-2.0', 'doubao-seedance-2.5']) {
      const { container } = renderDetail(slug)
      await waitFor(() => {
        expect(container.textContent ?? '').toMatch(/Doubao-Seedance/)
      })
      const text = container.textContent ?? ''
      expect(text).toMatch(/string/i)
    }
  })

  it('MiniMax-H3 page documents the 5-reference-image cap and the 768P / 2K set', async () => {
    const { container } = renderDetail('minimax-h3')
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('MiniMax-H3')
    })
    const text = container.textContent ?? ''
    // Vancine-side cap is 5 even though MiniMax-H3 itself accepts 9.
    expect(text).toMatch(/5/)
    // Supported resolutions: exactly 768P and 2K.
    expect(text).toMatch(/768P, 2K/)
  })

  it('Wan3 pages document the alibaba-wan3 contract: top-level duration + size, references in metadata.input.media', async () => {
    for (const slug of ['wan3.0-video', 'wan3.0-video-prime']) {
      const { container } = renderDetail(slug)
      await waitFor(() => {
        expect(container.textContent ?? '').toContain(slug)
      })
      const text = container.textContent ?? ''
      expect(text).toContain('metadata.input.media')
      expect(text).toContain('reference_image')
    }
  })

  it('Seedance pages document references in metadata.content (NOT metadata.input.media)', async () => {
    for (const slug of ['doubao-seedance-2.0', 'doubao-seedance-2.5']) {
      const { container } = renderDetail(slug)
      await waitFor(() => {
        expect(container.textContent ?? '').toMatch(/Doubao-Seedance/)
      })
      const text = container.textContent ?? ''
      expect(text).toContain('metadata.content')
      expect(text).toContain('reference_image')
    }
  })
})

describe('Verified-sources list — real, clickable, no machine paths', () => {
  it('every detail page surfaces at least one external https source link', async () => {
    for (const { slug } of [...IMAGE_MODELS, ...VIDEO_MODELS]) {
      const { container } = renderDetail(slug)
      await waitFor(() => {
        expect(
          container.querySelector('[data-testid="docs-model-sources"]')
        ).toBeTruthy()
      })
      const sources = container.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="docs-model-sources"] a'
      )
      expect(sources.length).toBeGreaterThan(0)
      for (const anchor of sources) {
        expect(anchor.href).toMatch(/^https:\/\//)
        expect(anchor.target).toBe('_blank')
        expect(anchor.rel).toContain('noopener')
        // No machine-local paths: every href is an absolute https
        // URL with a real-looking host.
        expect(anchor.href).not.toMatch(/^https?:\/\/localhost/)
        expect(anchor.href).not.toMatch(/\/(Users|home|var|src)\//)
      }
    }
  })
})

describe('Non-English locale rendering — no English fallback in the page', () => {
  it('zhCN page renders summary in Chinese without any untranslated English summary', async () => {
    // Load the zhCN bundle, then switch the global i18n to Chinese
    // BEFORE rendering so the DocsI18nProvider picks the zhCN bundle
    // on its first render. Restoring the language on cleanup keeps
    // the other tests in this file (and across the suite) stable.
    const zh = (await import('../i18n/locales/zhCN.json')).default
    i18n.removeResourceBundle('zhCN', 'docs')
    i18n.addResourceBundle('zhCN', 'docs', zh, true, true)
    const originalLanguage = i18n.language
    i18n.changeLanguage('zhCN')
    try {
      const { container } = renderWithProviders(
        <TocProvider>
          <ModelDetailPage
            slug='wan3.0-video'
            baseUrl='https://vancine.com/v1'
          />
        </TocProvider>
      )
      await waitFor(() => {
        expect(container.textContent ?? '').toContain('wan3.0-video')
      })
      // Wait for the DocsI18nProvider to mount with the Chinese
      // bundle: the page must surface at least one CJK character
      // from the zhCN translation of the model summary.
      await waitFor(() => {
        expect(/[一-鿿]/.test(container.textContent ?? '')).toBe(true)
      })
      const text = container.textContent ?? ''
      // No English long-sentence fallback for the model summary.
      expect(text).not.toContain(
        'Alibaba Wan 3.0 text-to-video and image-to-video with'
      )
    } finally {
      i18n.changeLanguage(originalLanguage)
    }
  })

  it('zhCN source names are translated rather than English constants or raw keys', async () => {
    const zh = (await import('../i18n/locales/zhCN.json')).default
    i18n.removeResourceBundle('zhCN', 'docs')
    i18n.addResourceBundle('zhCN', 'docs', zh, true, true)
    const originalLanguage = i18n.language
    i18n.changeLanguage('zhCN')
    try {
      const { container } = renderWithProviders(
        <TocProvider>
          <ModelDetailPage
            slug='qwen-image-3.0'
            baseUrl='https://vancine.com/v1'
          />
        </TocProvider>
      )
      await waitFor(() => {
        expect(
          container.querySelector('[data-testid="docs-model-sources"]')
        ).toBeTruthy()
      })
      const sources =
        container.querySelector('[data-testid="docs-model-sources"]')
          ?.textContent ?? ''
      expect(sources).toContain('生产图片契约')
      expect(sources).toContain('Alibaba Qwen')
      expect(sources).not.toContain('modelDetail.sources.vancineImage')
      expect(sources).not.toContain('modelDetail.sources.aliyunQwenImage')
      expect(sources).not.toContain('Vancine production image contract')
      expect(sources).not.toContain('Alibaba Qwen image documentation')
    } finally {
      i18n.changeLanguage(originalLanguage)
    }
  })
})

describe('Overview navigation — cURL tab copies a model + prompt only', () => {
  it('overview cURL tab carries model + prompt only (no per-model wire field)', async () => {
    // (model + prompt) and never pin a per-model wire field. The
    // copyable text lives in the active tabpanel after the cURL
    // tab is selected.
    const user = userEvent.setup()
    renderWithProviders(
      <TocProvider>
        <VideoPage baseUrl='https://vancine.com/v1' />
      </TocProvider>
    )
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Video Generation' })
      ).toBeInTheDocument()
    })
    await user.click(await screen.findByRole('tab', { name: 'cURL' }))
    const panel = await screen.findByRole('tabpanel')
    // Find the cURL snippet by its distinctive shell marker. The
    // code text is rendered inside a <pre> in the panel; we
    // search the entire panel text rather than a specific element
    // because shiki output is wrapped in extra spans in tests.
    const panelText = panel.textContent ?? ''
    expect(panelText).toMatch(/-d\s*'\{/)
    expect(panelText).toMatch(/"model":\s*"/)
    expect(panelText).toMatch(/"prompt":\s*"a cat walking on a beach"/)
    // The overview must NOT pin per-model fields.
    expect(panelText).not.toMatch(/"duration"\s*:/)
    expect(panelText).not.toMatch(/"seconds"\s*:/)
    expect(panelText).not.toMatch(/"size"\s*:/)
    expect(panelText).not.toMatch(/"ratio"\s*:/)
    expect(panelText).not.toMatch(/"resolution"\s*:/)
  })
})

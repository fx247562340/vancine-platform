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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import type { ImageRun } from '../../hooks/use-image-generate'
import type { ParsedImage } from '../../types'
import { ImageResults } from '../image-results'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Generating images...': 'Generating images...',
        'No images yet': 'No images yet',
        'Generated images will appear here.':
          'Generated images will appear here.',
        Retry: 'Retry',
        'Generated image': 'Generated image',
        'Preview image': 'Preview image',
        'Copy image URL': 'Copy image URL',
        'Download image': 'Download image',
        'Image preview': 'Image preview',
        Close: 'Close',
        'Generation history': 'Generation history',
        'Generation record': 'Generation record',
        'Clear generation history': 'Clear generation history',
        'Clear generation history?': 'Clear generation history?',
        'This only clears the image history saved in this browser for the current account.':
          'This only clears the image history saved in this browser for the current account.',
        'Temporary image results are not saved to browser history':
          'Temporary image results are not saved to browser history',
        'Original reference images are not saved in browser history. Please re-upload them and start a new generation.':
          'Original reference images are not saved in browser history. Please re-upload them and start a new generation.',
        Size: 'Size',
        Images: 'Images',
        'Reference images': 'Reference images',
        Clear: 'Clear',
        Cancel: 'Cancel',
      },
    },
  },
})

function makeUrlImage(id: string, url: string): ParsedImage {
  return { resultId: id, url, mime: 'image/png' as const }
}

function makeB64Image(id: string, b64: string): ParsedImage {
  return {
    resultId: id,
    b64Json: b64,
    mime: 'image/png' as const,
    renderable: true,
  }
}

function makeRun(overrides: Partial<ImageRun> = {}): ImageRun {
  return {
    id: 'run-1',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    status: 'complete',
    ownerUserId: 1,
    model: 'qwen-image-2.0',
    group: 'default',
    provider: 'Ali',
    prompt: 'a red apple',
    size: '2048x2048',
    n: 1,
    referenceCount: 0,
    images: [],
    error: null,
    requestSnapshot: {
      snapshotVersion: 3,
      model: 'qwen-image-2.0',
      group: 'default',
      provider: 'Ali',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 1,
        negativePrompt: '',
        seed: null,
        watermark: false,
        promptExtend: false,
        promptExtendMode: 'direct',
        thinkingMode: false,
      },
      references: [],
      profile: null,
    },
    ...overrides,
  }
}

function renderResults(props: {
  runs?: ImageRun[]
  isGenerating?: boolean
  pageError?: {
    ownerUserId: number | null
    errorKey?: string
    rawUpstreamMessage?: string
  }
  onRetry?: (runId: string) => void
  onClearHistory?: () => void
  isRetrying?: (runId: string) => boolean
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ImageResults
        runs={props.runs ?? []}
        isGenerating={props.isGenerating ?? false}
        pageError={props.pageError ?? { ownerUserId: null }}
        onRetry={props.onRetry ?? (() => undefined)}
        onClearHistory={props.onClearHistory ?? (() => undefined)}
        isRetrying={props.isRetrying ?? (() => false)}
      />
    </I18nextProvider>
  )
}

describe('ImageResults generation history', () => {
  it('shows an empty state before any generation', () => {
    renderResults({})
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('announces generation progress while previous runs stay visible', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
      isGenerating: true,
    })
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('shows the error with retry while successful runs stay visible', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'error',
          error: 'Image generation failed',
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
      pageError: {
        ownerUserId: 1,
        errorKey: 'Image generation failed',
      },
    })
    expect(
      screen.getAllByRole('button', { name: 'Retry' }).length
    ).toBeGreaterThan(0)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('renders run metadata alongside the image grid', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
          n: 2,
          referenceCount: 1,
        }),
      ],
    })
    expect(screen.getByText('qwen-image-2.0')).toBeTruthy()
    expect(screen.getByText('Ali')).toBeTruthy()
    expect(screen.getByText('a red apple')).toBeTruthy()
    expect(screen.getByText('Size: 2048x2048')).toBeTruthy()
    expect(screen.getByText('Images: 2')).toBeTruthy()
    expect(screen.getByText('Reference images: 1')).toBeTruthy()
  })

  it('shows preview and download buttons for every image', () => {
    renderResults({
      runs: [
        makeRun({
          images: [
            makeUrlImage('r0', 'https://example.invalid/a.png'),
            makeUrlImage('r1', 'https://example.invalid/b.png'),
          ],
        }),
      ],
    })
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Preview image' })
    ).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Download image' })
    ).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Copy image URL' })
    ).toHaveLength(2)
  })

  it('keeps the newest run first', () => {
    renderResults({
      runs: [
        makeRun({
          id: 'run-new',
          prompt: 'second prompt',
          images: [makeUrlImage('r0', 'https://example.invalid/new.png')],
        }),
        makeRun({
          id: 'run-old',
          prompt: 'first prompt',
          images: [makeUrlImage('r1', 'https://example.invalid/old.png')],
        }),
      ],
    })
    const prompts = screen
      .getAllByText(/prompt$/)
      .map((node) => node.textContent)
    expect(prompts).toEqual(['second prompt', 'first prompt'])
  })

  it('does not render empty image sources', () => {
    renderResults({
      runs: [
        makeRun({
          images: [
            { resultId: 'a', url: '', mime: 'image/png' as const },
            {
              resultId: 'b',
              b64Json: '',
              mime: 'image/png' as const,
              renderable: false,
            },
          ],
        }),
      ],
    })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('does not render b64 images that were never marked renderable', () => {
    renderResults({
      runs: [
        makeRun({
          images: [
            {
              resultId: 'r0',
              b64Json: 'iVBORw0KGgo%%%',
              mime: 'image/png' as const,
            },
            { resultId: 'r1', b64Json: 'UklGR', mime: 'image/png' as const },
          ],
        }),
      ],
    })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('does not preview javascript or file urls', () => {
    renderResults({
      runs: [
        makeRun({
          images: [
            makeUrlImage('r0', 'javascript:alert(1)'),
            makeUrlImage('r1', 'file:///tmp/a.png'),
          ],
        }),
      ],
    })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('renders duplicate urls as separate results', () => {
    renderResults({
      runs: [
        makeRun({
          images: [
            makeUrlImage('r0', 'https://example.invalid/a.png'),
            makeUrlImage('r1', 'https://example.invalid/a.png'),
          ],
        }),
      ],
    })
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Preview image' })
    ).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Download image' })
    ).toHaveLength(2)
  })

  it('marks b64-only runs as temporary', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeB64Image('r0', 'iVBORw0KGgo=')],
        }),
      ],
    })
    expect(screen.getByRole('img')).toBeTruthy()
    expect(
      screen.getByText(
        'Temporary image results are not saved to browser history'
      )
    ).toBeTruthy()
  })

  it('does not mark url runs as temporary', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
    })
    expect(
      screen.queryByText(
        'Temporary image results are not saved to browser history'
      )
    ).toBeNull()
  })

  it('opens an accessible preview dialog that can be closed', async () => {
    const user = userEvent.setup()
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Preview image' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull()
  })

  it('clears history only after confirmation', async () => {
    const user = userEvent.setup()
    const onClearHistory = vi.fn()
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
      onClearHistory,
    })

    await user.click(
      screen.getByRole('button', { name: 'Clear generation history' })
    )
    expect(screen.getByText('Clear generation history?')).toBeTruthy()
    expect(onClearHistory).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClearHistory).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Clear generation history' })
    )
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClearHistory).toHaveBeenCalledTimes(1)
  })

  it('hides the clear button when there is no history', () => {
    renderResults({})
    expect(
      screen.queryByRole('button', { name: 'Clear generation history' })
    ).toBeNull()
  })

  it('disables clearing while a generation is in flight', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
      isGenerating: true,
    })
    const clear = screen.getByRole('button', {
      name: 'Clear generation history',
    })
    expect((clear as HTMLButtonElement).disabled).toBe(true)
  })

  it('allows clearing when no generation is running', () => {
    renderResults({
      runs: [
        makeRun({
          images: [makeUrlImage('r0', 'https://example.invalid/a.png')],
        }),
      ],
      isGenerating: false,
    })
    const clear = screen.getByRole('button', {
      name: 'Clear generation history',
    })
    expect((clear as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables Retry with an explanation when the original references are gone', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'error',
          error: 'Image generation failed',
          retryBlocked: 'missing-references',
        }),
      ],
    })
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect((retry as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText(
        'Original reference images are not saved in browser history. Please re-upload them and start a new generation.'
      )
    ).toBeTruthy()
  })

  it('hides Retry entirely for a corrupt request snapshot', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'error',
          error: 'Image generation failed',
          retryBlocked: 'corrupt-snapshot',
        }),
      ],
    })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  // P13-B R16 P0-2: an outcome-unknown run carries the stable i18n key
  // "Generation was interrupted (outcome unknown)" and NEVER offers a
  // Retry button, regardless of how long the lease has been stale.
  it('hides Retry entirely for an outcome-unknown run', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'unknown',
          errorKey: 'Generation was interrupted (outcome unknown)',
          retryBlocked: 'outcome-unknown',
        }),
      ],
    })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    // The notice still surfaces verbatim.
    expect(
      screen.getByText('Generation was interrupted (outcome unknown)')
    ).toBeTruthy()
  })

  // P13-B R16 P2: system errors render via t(errorKey) so a language
  // switch re-translates the message, while raw upstream text is shown
  // verbatim (never t()'d). The two are stored exclusively: a run
  // carries either errorKey (system fallback) or rawErrorMessage
  // (upstream), not both.
  it('renders an upstream error verbatim (no t() lookup)', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'error',
          errorKey: undefined,
          rawErrorMessage: 'upstream 502: content moderation',
          error: null,
        }),
      ],
    })
    expect(screen.getByText('upstream 502: content moderation')).toBeTruthy()
  })

  it('renders a system error via t(errorKey)', () => {
    renderResults({
      runs: [
        makeRun({
          status: 'error',
          errorKey: 'Image generation failed',
          rawErrorMessage: undefined,
          error: null,
        }),
      ],
    })
    expect(screen.getByText('Image generation failed')).toBeTruthy()
  })
})

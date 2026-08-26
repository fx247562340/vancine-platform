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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { routerLinkMock } from '@/test/router-link-mock'

import {
  generateImages,
  getImageCapabilities,
  getImagePlaygroundGroups,
} from '../api'
import { ImagePlayground } from '../index'
import { ImagePlaygroundError } from '../lib/errors'
import { imageHistoryStorageKey } from '../lib/history'
import type { ImageModelProfile } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', () => ({
  getImageCapabilities: vi.fn(),
  getImagePlaygroundGroups: vi.fn(),
  generateImages: vi.fn(),
}))

const qwenProfile: ImageModelProfile = {
  sizes: ['2048x2048', '2688x1536'],
  defaultSize: '2048x2048',
  supportsCustomSize: true,
  nRange: { min: 1, max: 6, default: 1 },
  maxReferenceImages: 3,
  supportsNegativePrompt: true,
  maxNegativePromptChars: 500,
  supportsSeed: true,
  seedRange: { min: 0, max: 2147483647, default: 0 },
  supportsWatermark: true,
  defaultWatermark: false,
  supportsPromptExtend: true,
  defaultPromptExtend: true,
  supportsThinkingMode: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  minPixels: 512 * 512,
  maxPixels: 2048 * 2048,
}

const USER_ID = 42

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Image generation': 'Image generation',
        'Select an image model to start generating.':
          'Select an image model to start generating.',
        'Provider: {{name}}': 'Provider: {{name}}',
        Prompt: 'Prompt',
        'Describe the image you want to generate':
          'Describe the image you want to generate',
        Size: 'Size',
        'Custom size': 'Custom size',
        Width: 'Width',
        Height: 'Height',
        'Number of images': 'Number of images',
        Images: 'Images',
        'Reference images': 'Reference images',
        Generate: 'Generate',
        'Advanced settings': 'Advanced settings',
        Seed: 'Seed',
        Watermark: 'Watermark',
        'Prompt extend': 'Prompt extend',
        'Negative prompt': 'Negative prompt',
        'Prompt is required': 'Prompt is required',
        'No images yet': 'No images yet',
        'Generated images will appear here.':
          'Generated images will appear here.',
        Retry: 'Retry',
        'Image generation failed': 'Image generation failed',
        'Failed to load image models': 'Failed to load image models',
        'Failed to load playground groups': 'Failed to load playground groups',
        'No image models available': 'No image models available',
        'Generating images...': 'Generating images...',
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
        Clear: 'Clear',
        Cancel: 'Cancel',
        Model: 'Model',
        Other: 'Other',
      },
    },
  },
})

function seedRun(
  id: string,
  model: string,
  url: string,
  prompt = `prompt for ${model}`
) {
  return {
    id,
    createdAt: new Date('2026-06-01T10:00:00.000Z').toISOString(),
    model,
    group: 'default',
    provider: 'Ali',
    prompt,
    size: '2048x2048',
    n: 1,
    referenceCount: 0,
    images: [{ url }],
  }
}

function renderPlayground() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ImagePlayground />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

async function generateWithPrompt(
  user: ReturnType<typeof userEvent.setup>,
  prompt: string
) {
  const textarea = await screen.findByPlaceholderText(
    'Describe the image you want to generate'
  )
  await user.clear(textarea)
  await user.type(textarea, prompt)
  await user.click(screen.getByRole('button', { name: 'Generate' }))
}

describe('ImagePlayground generation history page behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    const auth = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: { ...auth, user: { id: USER_ID, username: 'tester', role: 1 } },
    })
    vi.mocked(getImagePlaygroundGroups).mockResolvedValue([
      { label: 'default', value: 'default', ratio: 1 },
    ])
    vi.mocked(getImageCapabilities).mockResolvedValue({
      modality: 'image',
      group: 'default',
      groups: ['default'],
      models: [
        { model: 'qwen-image-2.0', provider: 'Ali', profile: qwenProfile },
        { model: 'wan-2.5', provider: 'Ali', profile: qwenProfile },
        { model: 'seedream-4.0', provider: 'VolcEngine', profile: qwenProfile },
      ],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('gives the image page its own vertical scroll container', async () => {
    renderPlayground()
    await screen.findByRole('button', { name: 'Generate' })

    const scroller = screen.getByTestId('image-playground-scroll')
    expect(scroller.className).toContain('overflow-y-auto')
    expect(scroller.className).toContain('overflow-x-hidden')
    expect(scroller.className).toContain('min-h-0')
    expect(scroller.className).toContain('flex-1')
    expect(
      scroller.contains(screen.getByRole('button', { name: 'Generate' }))
    ).toBe(true)
  })

  it('keeps the generation history inside the scroll container', async () => {
    localStorage.setItem(
      imageHistoryStorageKey(USER_ID),
      JSON.stringify({
        version: 1,
        runs: [
          seedRun('run-1', 'qwen-image-2.0', 'https://example.invalid/a.png'),
        ],
      })
    )
    renderPlayground()

    const scroller = screen.getByTestId('image-playground-scroll')
    await waitFor(() => {
      expect(screen.getByText('prompt for qwen-image-2.0')).toBeTruthy()
    })
    expect(
      scroller.contains(screen.getByText('prompt for qwen-image-2.0'))
    ).toBe(true)
    expect(
      scroller.contains(screen.getByRole('button', { name: 'Download image' }))
    ).toBe(true)
  })

  it('restores url-only history for the current user after refresh', async () => {
    localStorage.setItem(
      imageHistoryStorageKey(USER_ID),
      JSON.stringify({
        version: 1,
        runs: [
          seedRun('run-1', 'qwen-image-2.0', 'https://example.invalid/a.png'),
          seedRun('run-2', 'wan-2.5', 'https://example.invalid/b.png'),
        ],
      })
    )
    renderPlayground()

    expect(await screen.findByText('qwen-image-2.0')).toBeTruthy()
    expect(screen.getByText('wan-2.5')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Download image' })
    ).toHaveLength(2)
  })

  it('does not restore history that belongs to another user', async () => {
    localStorage.setItem(
      imageHistoryStorageKey(999),
      JSON.stringify({
        version: 1,
        runs: [
          seedRun('run-1', 'qwen-image-2.0', 'https://example.invalid/a.png'),
        ],
      })
    )
    renderPlayground()

    await screen.findByRole('button', { name: 'Generate' })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('does not crash on corrupt localStorage', async () => {
    localStorage.setItem(imageHistoryStorageKey(USER_ID), '{corrupt json')
    renderPlayground()

    await screen.findByRole('button', { name: 'Generate' })
    expect(screen.getByText('No images yet')).toBeTruthy()
  })

  it('appends runs across generations and persists urls without b64 payloads', async () => {
    const user = userEvent.setup()
    vi.mocked(generateImages)
      .mockResolvedValueOnce([{ url: 'https://example.invalid/a.png' }])
      .mockResolvedValueOnce([{ url: 'https://example.invalid/b.png' }])
    renderPlayground()

    await generateWithPrompt(user, 'a red apple')
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeTruthy()
    })

    await generateWithPrompt(user, 'a blue car')
    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(2)
    })

    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).toBeTruthy()
    expect(raw).toContain('https://example.invalid/a.png')
    expect(raw).toContain('https://example.invalid/b.png')
  })

  it('keeps the first run visible when the second generation fails, and retry replays the saved snapshot', async () => {
    const user = userEvent.setup()
    vi.mocked(generateImages)
      .mockResolvedValueOnce([{ url: 'https://example.invalid/a.png' }])
      .mockRejectedValueOnce(
        new ImagePlaygroundError({
          kind: 'upstream',
          rawMessage: 'upstream refused',
        })
      )
      .mockResolvedValueOnce([{ url: 'https://example.invalid/b.png' }])
    renderPlayground()

    await generateWithPrompt(user, 'a red apple')
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeTruthy()
    })

    await generateWithPrompt(user, 'a blue car')
    await waitFor(() => {
      expect(screen.queryAllByText('upstream refused').length).toBeGreaterThan(
        0
      )
    })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    // The per-run Retry button is on the failed run card, not at the
    // top level — it must replay the saved snapshot, not the current form.
    const retryButtons = screen.getAllByRole('button', { name: 'Retry' })
    expect(retryButtons.length).toBeGreaterThan(0)

    // Mutate the form to prove retry ignores it.
    const textarea = await screen.findByPlaceholderText(
      'Describe the image you want to generate'
    )
    await user.clear(textarea)
    await user.type(textarea, 'changed-in-form')

    await user.click(retryButtons[0])
    await waitFor(() => {
      expect(vi.mocked(generateImages)).toHaveBeenCalledTimes(3)
    })
    const lastCall = vi.mocked(generateImages).mock.calls[2][0] as {
      model: string
      prompt: string
      n: number
      watermark?: boolean
      response_format?: string
    }
    expect(lastCall.model).toBe('qwen-image-2.0')
    expect(lastCall.prompt).toBe('a blue car')
    // The retried request replays the snapshot's params, not the mutated form.
    expect(lastCall.n).toBe(1)
    // qwenProfile supports watermark, so the capability flags captured in the
    // snapshot must re-emit it (proves retry does not drop supported params).
    expect(lastCall.watermark).toBe(false)
    expect(lastCall.response_format).toBe('url')
  })

  it('keeps history when switching models', async () => {
    const user = userEvent.setup()
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    renderPlayground()

    await generateWithPrompt(user, 'a red apple')
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeTruthy()
    })

    const comboboxes = screen.getAllByRole('combobox')
    const modelTrigger = comboboxes.find((node) =>
      node.textContent?.includes('qwen-image-2.0')
    )
    if (!modelTrigger) throw new Error('model trigger not found')
    await user.click(modelTrigger)

    const wanOption = await screen.findByText('wan-2.5')
    await user.click(wanOption)

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('combobox')
          .some((node) => node.textContent?.includes('wan-2.5'))
      ).toBe(true)
    })
    expect(screen.getByRole('img')).toBeTruthy()
  })
})

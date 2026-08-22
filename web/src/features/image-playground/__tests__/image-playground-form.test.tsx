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

import {
  generateImages,
  getImageCapabilities,
  getImagePlaygroundGroups,
} from '../api'
import { ImagePlayground } from '../index'
import { ImagePlaygroundError } from '../lib/errors'
import type { ImageModelProfile } from '../types'

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
        Generate: 'Generate',
        'Advanced settings': 'Advanced settings',
        Seed: 'Seed',
        Watermark: 'Watermark',
        'Prompt extend': 'Prompt extend',
        'Negative prompt': 'Negative prompt',
        'Prompt is required': 'Prompt is required',
        'Enter a valid custom size': 'Enter a valid custom size',
        'Custom size is below the minimum pixel count':
          'Custom size is below the minimum pixel count',
        'No images yet': 'No images yet',
        'Generated images will appear here.':
          'Generated images will appear here.',
        Retry: 'Retry',
        'Image generation failed': 'Image generation failed',
        'Failed to load image models': 'Failed to load image models',
        'Failed to load playground groups': 'Failed to load playground groups',
        'No image models available': 'No image models available',
      },
    },
  },
})

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

describe('ImagePlayground form', () => {
  beforeEach(() => {
    const auth = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: { ...auth, user: { id: 1, username: 'tester', role: 1 } },
    })
    vi.mocked(getImagePlaygroundGroups).mockResolvedValue([
      { label: 'default', value: 'default', ratio: 1 },
    ])
    vi.mocked(getImageCapabilities).mockResolvedValue({
      modality: 'image',
      group: 'default',
      groups: ['default'],
      models: [
        {
          model: 'qwen-image-2.0',
          provider: 'Ali',
          profile: qwenProfile,
        },
      ],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('shows prompt, seed, and custom size errors on the fields', async () => {
    const user = userEvent.setup()
    renderPlayground()

    const generate = await screen.findByRole('button', { name: 'Generate' })
    await user.click(generate)

    expect(await screen.findByText('Prompt is required')).toBeTruthy()
    const prompt = screen.getByPlaceholderText(
      'Describe the image you want to generate'
    )
    expect(prompt.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(prompt)

    await user.type(prompt, 'a red apple')
    await user.selectOptions(screen.getByLabelText('Size'), 'Custom size')
    const width = await screen.findByLabelText('Width')
    const height = screen.getByLabelText('Height')
    await user.clear(width)
    await user.type(width, '10')
    await user.clear(height)
    await user.type(height, '10')
    await user.click(generate)

    expect(
      await screen.findAllByText('Custom size is below the minimum pixel count')
    ).not.toHaveLength(0)

    await user.click(screen.getByText('Advanced settings'))
    const seed = screen.getByLabelText('Seed')
    await user.type(seed, '12')
    await user.clear(seed)
    expect((seed as HTMLInputElement).value).toBe('')
  })

  it('shows the OpenAI error.message from generateImages', async () => {
    vi.mocked(generateImages).mockRejectedValue(
      new ImagePlaygroundError({
        kind: 'upstream',
        rawMessage: 'upstream refused the request',
      })
    )
    const user = userEvent.setup()
    renderPlayground()

    const prompt = await screen.findByPlaceholderText(
      'Describe the image you want to generate'
    )
    await user.type(prompt, 'a red apple')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(
        screen.getAllByText('upstream refused the request').length
      ).toBeGreaterThan(0)
    })
  })
})

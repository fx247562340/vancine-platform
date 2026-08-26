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
import type { ImageModelProfile } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', () => ({
  getImageCapabilities: vi.fn(),
  getImagePlaygroundGroups: vi.fn(),
  generateImages: vi.fn(),
}))

const qwen30Profile: ImageModelProfile = {
  sizes: ['Auto', '1024x1024', '2048x2048'],
  defaultSize: 'Auto',
  supportsAutoSize: true,
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
  supportsPromptExtendMode: true,
  defaultPromptExtendMode: 'direct',
  supportsThinkingMode: true,
  defaultThinkingMode: true,
  thinkingRequiresExtend: true,
  agentRequiresNoRefs: true,
  minPixels: 512 * 512,
  maxPixels: 2048 * 2048,
  minAspectRatio: { width: 1, height: 8 },
  maxAspectRatio: { width: 8, height: 1 },
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
        Auto: 'Auto',
        'Custom size': 'Custom size',
        Width: 'Width',
        Height: 'Height',
        'Number of images': 'Number of images',
        Generate: 'Generate',
        'Advanced settings': 'Advanced settings',
        Seed: 'Seed',
        Watermark: 'Watermark',
        'Prompt extend': 'Prompt extend',
        'Prompt extend mode': 'Prompt extend mode',
        Direct: 'Direct',
        Agent: 'Agent',
        'Enable thinking': 'Enable thinking',
        'Enable thinking requires prompt extend':
          'Enable thinking requires prompt extend',
        'Negative prompt': 'Negative prompt',
        'No images yet': 'No images yet',
        'Generated images will appear here.':
          'Generated images will appear here.',
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

describe('ImagePlayground Qwen Image 3.0 form', () => {
  beforeEach(() => {
    localStorage.clear()
    const auth = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: { ...auth, user: { id: 55, username: 'qwen3', role: 1 } },
    })
    vi.mocked(getImagePlaygroundGroups).mockResolvedValue([
      { label: 'default', value: 'default', ratio: 1 },
    ])
    vi.mocked(getImageCapabilities).mockResolvedValue({
      modality: 'image',
      group: 'default',
      groups: ['default'],
      models: [
        { model: 'qwen-image-3.0', provider: 'Ali', profile: qwen30Profile },
      ],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('defaults the size selector to Auto for Qwen 3.0', async () => {
    renderPlayground()
    const sizeSelect = await screen.findByLabelText('Size')
    // Auto maps to the sentinel AUTO_SIZE_VALUE option once the model
    // profile is applied.
    await waitFor(() => {
      expect((sizeSelect as HTMLSelectElement).value).toBe('__auto__')
    })
    expect(screen.getByRole('option', { name: 'Auto' })).toBeTruthy()
  })

  it('omits size from the payload when Auto is selected', async () => {
    const user = userEvent.setup()
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    renderPlayground()

    const prompt = await screen.findByPlaceholderText(
      'Describe the image you want to generate'
    )
    await user.type(prompt, 'a red apple')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(vi.mocked(generateImages)).toHaveBeenCalledTimes(1)
    })
    const payload = vi.mocked(generateImages).mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.model).toBe('qwen-image-3.0')
    expect('size' in payload).toBe(false)
    // prompt_extend_mode is forwarded for Qwen 3.0.
    expect(payload.prompt_extend_mode).toBe('direct')
  })

  it('sends WIDTHxHEIGHT when Custom size is chosen', async () => {
    const user = userEvent.setup()
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    renderPlayground()

    const prompt = await screen.findByPlaceholderText(
      'Describe the image you want to generate'
    )
    await user.type(prompt, 'a red apple')
    await user.selectOptions(screen.getByLabelText('Size'), '__custom__')

    const width = await screen.findByLabelText('Width')
    const height = screen.getByLabelText('Height')
    await user.type(width, '1024')
    await user.type(height, '1024')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(vi.mocked(generateImages)).toHaveBeenCalledTimes(1)
    })
    const payload = vi.mocked(generateImages).mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.size).toBe('1024x1024')
  })

  it('shows prompt extend mode and enable thinking controls for Qwen 3.0', async () => {
    const user = userEvent.setup()
    renderPlayground()

    await screen.findByRole('button', { name: 'Generate' })
    const advanced = await screen.findByText('Advanced settings')
    await user.click(advanced)

    expect(screen.getByLabelText('Prompt extend mode')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Direct' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Agent' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Enable thinking' })).toBeTruthy()
  })

  it('disables enable thinking when prompt extend is off', async () => {
    // A profile where prompt extend defaults OFF exercises the same
    // thinkingRequiresExtend dependency without needing to click the Base
    // UI switch (which requires PointerEvent, unavailable in jsdom).
    const user = userEvent.setup()
    const extendOffProfile: ImageModelProfile = {
      ...qwen30Profile,
      defaultPromptExtend: false,
      defaultThinkingMode: true,
    }
    vi.mocked(getImageCapabilities).mockResolvedValue({
      modality: 'image',
      group: 'default',
      groups: ['default'],
      models: [
        {
          model: 'qwen-image-3.0',
          provider: 'Ali',
          profile: extendOffProfile,
        },
      ],
    })

    renderPlayground()
    await screen.findByRole('button', { name: 'Generate' })
    // Prompt extend is off, so the thinking switch must be disabled even
    // though its default is true. Base UI switches expose the disabled
    // state via aria-disabled rather than the native disabled attribute.
    // The advanced fields live inside a Popover/Sheet, so the user has
    // to open the Advanced settings trigger before the switch mounts.
    const advanced = await screen.findByRole('button', {
      name: 'Advanced settings',
    })
    await user.click(advanced)
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Enable thinking' })
      ).toHaveAttribute('aria-disabled', 'true')
    })
  })
})

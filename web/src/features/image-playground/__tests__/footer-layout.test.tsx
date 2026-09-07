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
/**
 * Composer footer layout contracts for Image:
 * - Size and Number of images keep accessible names and share one
 *   responsive label strategy (previously Size was permanently
 *   sr-only while Number of images was visible on lg, which made the
 *   two FormItems different heights and broke the footer baseline).
 * - The quick controls row bottom-aligns (items-end) and wraps
 *   (flex-wrap), so differently sized controls align on their input
 *   bottom edge instead of their overall vertical center.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { routerLinkMock } from '@/test/router-link-mock'

import { getImageCapabilities, getImagePlaygroundGroups } from '../api'
import { ImagePlayground } from '../index'
import type { ImageModelProfile } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', () => ({
  getImageCapabilities: vi.fn(),
  getImagePlaygroundGroups: vi.fn(),
  generateImages: vi.fn(),
}))

const footerProfile: ImageModelProfile = {
  sizes: ['1024x1024', '1536x1024'],
  defaultSize: '1024x1024',
  supportsAutoSize: false,
  supportsCustomSize: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 0,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  defaultWatermark: false,
  supportsPromptExtend: false,
  defaultPromptExtend: false,
  supportsPromptExtendMode: false,
  defaultPromptExtendMode: 'direct',
  supportsThinkingMode: false,
  defaultThinkingMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  minPixels: 512 * 512,
  maxPixels: 2048 * 2048,
}

const translations: Record<string, string> = {
  'Image generation': 'Image generation',
  'Select an image model to start generating.':
    'Select an image model to start generating.',
  'Provider: {{name}}': 'Provider: {{name}}',
  Image: 'Image',
  Video: 'Video',
  'Usage logs': 'Usage logs',
  'Media type': 'Media type',
  'Composer toolbar': 'Composer toolbar',
  Generate: 'Generate',
  Prompt: 'Prompt',
  'Describe the image you want to generate':
    'Describe the image you want to generate',
  Size: 'Size',
  'Number of images': 'Number of images',
}

async function createI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: translations } },
  })
  return instance
}

function renderPage(i18n: I18n) {
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

function labelForSelect(select: HTMLElement): HTMLLabelElement {
  const label = (select as HTMLSelectElement).labels?.[0]
  if (!label) {
    throw new Error(`No label associated with select: ${select.id}`)
  }
  return label
}

describe('ImagePlayground composer footer layout', () => {
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
        { model: 'qwen-image-3.0', provider: 'Ali', profile: footerProfile },
      ],
    })
  })

  it('keeps accessible names for Size and Number of images and shows both labels with one consistent responsive strategy', async () => {
    renderPage(await createI18n())

    const sizeSelect = await screen.findByLabelText('Size')
    const countSelect = screen.getByLabelText('Number of images')
    expect(sizeSelect).toBeInstanceOf(HTMLSelectElement)
    expect(countSelect).toBeInstanceOf(HTMLSelectElement)

    const sizeLabel = labelForSelect(sizeSelect)
    const countLabel = labelForSelect(countSelect)
    expect(sizeLabel.textContent).toBe('Size')
    expect(countLabel.textContent).toBe('Number of images')
    // One shared strategy: visually hidden by default (compact
    // mobile), revealed on the lg breakpoint. Size must no longer be
    // permanently sr-only.
    for (const label of [sizeLabel, countLabel]) {
      expect(label.classList.contains('sr-only')).toBe(false)
      expect(label.classList.contains('hidden')).toBe(true)
      expect(label.classList.contains('lg:inline')).toBe(true)
    }
  })

  it('bottom-aligns and wraps the footer quick controls container that holds the Size field', async () => {
    renderPage(await createI18n())

    const sizeSelect = await screen.findByLabelText('Size')
    const sizeFormItem = sizeSelect.closest('[data-slot="form-item"]')
    if (!sizeFormItem?.parentElement) {
      throw new Error('Size FormItem has no layout container')
    }

    const container = sizeFormItem.parentElement
    // Bottom-alignment is what keeps mixed-height controls on one
    // baseline; wrapping is what keeps mobile rows overflow-free.
    expect(container.classList.contains('items-end')).toBe(true)
    expect(container.classList.contains('flex-wrap')).toBe(true)
  })
})

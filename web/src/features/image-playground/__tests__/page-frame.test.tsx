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
 * Image Playground page frame: heading, Image/Video route navigation
 * with aria-current, Usage logs link, key status visibility, and
 * composer toolbar role.
 */
import { render, screen, within } from '@testing-library/react'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routerLinkMock } from '@/test/router-link-mock'
import { useAuthStore } from '@/stores/auth-store'

import { getImageCapabilities, getImagePlaygroundGroups } from '../api'
import { ImagePlayground } from '../index'
import type { ImageModelProfile } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', () => ({
  getImageCapabilities: vi.fn(),
  getImagePlaygroundGroups: vi.fn(),
}))

const simpleProfile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsAutoSize: false,
  supportsCustomSize: false,
  nRange: { min: 1, max: 2, default: 1 },
  maxReferenceImages: 0,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsPromptExtendMode: false,
  supportsThinkingMode: false,
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

describe('ImagePlayground page frame', () => {
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
          model: 'simple-image-1',
          provider: 'Simple',
          profile: simpleProfile,
        },
      ],
    })
  })

  it('shows the page title as the only h1 and marks Image as current in the nav', async () => {
    const i18n = await createI18n()
    renderPage(i18n)
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Image generation')

    const nav = await screen.findByRole('navigation', { name: 'Media type' })
    const imageLink = screen.getByRole('link', { name: 'Image' })
    const videoLink = screen.getByRole('link', { name: 'Video' })
    expect(nav.contains(imageLink)).toBe(true)
    expect(nav.contains(videoLink)).toBe(true)
    expect(imageLink.getAttribute('href')).toBe('/playground/image')
    expect(videoLink.getAttribute('href')).toBe('/playground/video')
    expect(imageLink.getAttribute('aria-current')).toBe('page')
    expect(videoLink.getAttribute('aria-current')).toBeNull()
  })

  it('keeps the Usage logs entry reachable from the page header', async () => {
    const i18n = await createI18n()
    renderPage(i18n)
    const link = await screen.findByRole('link', { name: 'Usage logs' })
    expect(link.getAttribute('href')).toContain('/usage-logs')
  })

  it('places the model and group selector inside the composer toolbar', async () => {
    const i18n = await createI18n()
    renderPage(i18n)
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Composer toolbar',
    })
    // The ModelGroupSelector trigger is the combobox rendered inside
    // the toolbar — the user-visible contract that the model selector
    // lives in the composer toolbar.
    expect(within(toolbar).getAllByRole('combobox').length).toBeGreaterThanOrEqual(
      1
    )
  })
})

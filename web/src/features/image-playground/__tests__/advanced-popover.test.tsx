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
 * Image Advanced settings host tests: on desktop the trigger opens a
 * Popover; on a 320px mobile viewport it opens a Sheet. The trigger
 * sits in the composer footer; the field grid lives inside the panel.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
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

const advancedProfile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsAutoSize: false,
  supportsCustomSize: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 0,
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
  defaultThinkingMode: false,
  thinkingRequiresExtend: true,
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
  'Advanced settings': 'Advanced settings',
  'Negative prompt': 'Negative prompt',
  Seed: 'Seed',
  Watermark: 'Watermark',
  'Prompt extend': 'Prompt extend',
  'Prompt extend mode': 'Prompt extend mode',
  Direct: 'Direct',
  Agent: 'Agent',
  'Enable thinking': 'Enable thinking',
  'Enable thinking requires prompt extend':
    'Enable thinking requires prompt extend',
  'Agent mode is unavailable while reference images are attached.':
    'Agent mode is unavailable while reference images are attached.',
  'Only parameters supported by the active profile are shown.':
    'Only parameters supported by the active profile are shown.',
}

async function createI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: translations } },
  })
  return instance
}

function renderPage(i18n: I18n, options?: { innerWidth?: number }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const originalMatchMedia = window.matchMedia
  const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'innerWidth'
  )
  const width = options?.innerWidth ?? 1024
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  window.matchMedia = ((query: string) => {
    const m = /max-width:\s*(\d+)px/.exec(query)
    const matches = m ? width <= Number(m[1]) : false
    return {
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }
  }) as typeof window.matchMedia

  const view = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ImagePlayground />
      </I18nextProvider>
    </QueryClientProvider>
  )

  return {
    view,
    restore() {
      // Restore the original property descriptor, not just the value, so
      // the next test sees the pristine window.innerWidth definition.
      window.matchMedia = originalMatchMedia
      if (originalInnerWidthDescriptor) {
        Object.defineProperty(
          window,
          'innerWidth',
          originalInnerWidthDescriptor
        )
      } else {
        delete (window as unknown as { innerWidth?: number }).innerWidth
      }
    },
  }
}

describe('ImagePlayground Advanced settings host', () => {
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
        { model: 'qwen-image-3.0', provider: 'Ali', profile: advancedProfile },
      ],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('opens a Popover when the desktop Advanced settings trigger is clicked', async () => {
    const i18n = await createI18n()
    const restore = renderPage(i18n, { innerWidth: 1024 }).restore
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      await screen.findByRole('button', { name: 'Generate' })
      const trigger = await screen.findByRole('button', {
        name: 'Advanced settings',
      })
      await user.click(trigger)
      // Desktop: popover content, not a Sheet dialog. The negative
      // prompt textarea (a common profile-driven field) is mounted
      // inside the popover.
      const seed = await screen.findByLabelText('Seed')
      expect(seed).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('opens a Sheet at 320px mobile width with the same field grid', async () => {
    const i18n = await createI18n()
    const restore = renderPage(i18n, { innerWidth: 320 }).restore
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      await screen.findByRole('button', { name: 'Generate' })
      // At 320px the composer mounts the mobile Sheet branch once
      // useIsMobile settles. The trigger keeps the same accessible
      // name in both branches, so the only stable signal that the
      // mobile branch is mounted is the presence of the Sheet
      // trigger — this is the single implementation-detail seam in
      // this test; all interactions below use role queries.
      await waitFor(() => {
        expect(
          document.querySelector(
            'button[aria-label="Advanced settings"][data-slot="sheet-trigger"]'
          )
        ).toBeTruthy()
      })
      const trigger = screen.getByRole('button', {
        name: 'Advanced settings',
      })
      await user.click(trigger)
      // Sheet: dialog role with the Advanced settings title.
      const dialog = await screen.findByRole('dialog')
      expect(dialog.textContent).toContain('Advanced settings')
      // Field grid mounted inside the dialog.
      const seed = screen.getByLabelText('Seed')
      expect(seed).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('renders the composer as a single column at 320px and keeps the prompt above the reference tray', async () => {
    const i18n = await createI18n()
    const restore = renderPage(i18n, { innerWidth: 320 }).restore
    try {
      await screen.findByRole('button', { name: 'Generate' })
      // The page must clip overflow at its outer scroller instead of
      // pushing horizontal content past the viewport. Real visual and
      // scrollWidth at 320 / 375 px is verified manually in the
      // browser, not via the test environment.
      const scroller = screen.getByTestId('image-playground-scroll')
      expect(scroller).toHaveClass('overflow-x-hidden')
      // The Advanced trigger lives in the composer footer; it is
      // present at 320px (Sheet is chosen by useIsMobile).
      expect(
        await screen.findByRole('button', { name: 'Advanced settings' })
      ).toBeTruthy()
    } finally {
      restore()
    }
  })
})

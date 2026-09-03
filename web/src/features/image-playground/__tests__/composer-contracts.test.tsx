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
 * Canvas Composer contracts for Image:
 * - Reference tray + prompt live in the composer body with stable
 *   accessible names and the tray's add affordance opens a Popover
 *   (desktop) or Sheet (mobile).
 * - After a model switch, only the parameters supported by the
 *   active profile are shown in the Advanced panel.
 * - When a server error maps to an advanced field, the panel opens
 *   automatically so the user can see the inline error.
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
import { ImagePlaygroundError } from '../lib/errors'
import type { ImageModelProfile } from '../types'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', () => ({
  getImageCapabilities: vi.fn(),
  getImagePlaygroundGroups: vi.fn(),
  generateImages: vi.fn(),
}))

const fullProfile: ImageModelProfile = {
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

// A minimal profile: no advanced capabilities at all, so the
// Advanced trigger must disappear from the composer footer.
const minimalProfile: ImageModelProfile = {
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
  'Add reference image': 'Add reference image',
  'Reference images': 'Reference images',
  'Advanced settings unavailable for this profile.':
    'Advanced settings unavailable for this profile.',
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

/**
 * The ModelGroupSelector trigger is a combobox whose accessible name
 * is not exposed by Base UI (the W3C computation yields no name for
 * the popover trigger element). Select it by visible text instead of
 * a data-slot / DOM-level selector: the model name is rendered as
 * visible text inside the trigger.
 */
function findModelCombobox(modelName: string): HTMLElement {
  const trigger = screen
    .getAllByRole('combobox')
    .find((el) => el.textContent?.includes(modelName))
  if (!trigger) {
    throw new Error(`Model combobox for ${modelName} not found`)
  }
  return trigger
}

describe('ImagePlayground Canvas Composer — model-driven fields and reference tray', () => {
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
        { model: 'qwen-image-3.0', provider: 'Ali', profile: fullProfile },
        {
          model: 'simple-image-1',
          provider: 'Simple',
          profile: minimalProfile,
        },
      ],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('only shows profile-supported fields in the Advanced panel', async () => {
    const i18n = await createI18n()
    const restore = renderPage(i18n).restore
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      await screen.findByRole('button', { name: 'Advanced settings' })
      // Open with the full profile active.
      await user.click(
        screen.getByRole('button', { name: 'Advanced settings' })
      )
      await screen.findByLabelText('Negative prompt')
      expect(screen.getByLabelText('Seed')).toBeTruthy()
      expect(screen.getByRole('switch', { name: 'Watermark' })).toBeTruthy()
      expect(
        screen.getByRole('switch', { name: 'Enable thinking' })
      ).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('hides the Advanced trigger for a profile with no advanced fields, and re-shows it after switching back', async () => {
    const i18n = await createI18n()
    const restore = renderPage(i18n).restore
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      // The full profile is the default: Advanced is present.
      await screen.findByRole('button', { name: 'Advanced settings' })
      // The ModelGroupSelector trigger is the combobox whose visible
      // text contains the active model name (Base UI's popover
      // trigger yields no accessible name for a role query, so select
      // by visible text instead of a DOM-slot selector).
      const modelTrigger = findModelCombobox('qwen-image-3.0')
      await user.click(modelTrigger)
      await user.click(
        await screen.findByRole('option', { name: 'simple-image-1' })
      )
      // Advanced trigger disappears; no empty panel.
      expect(
        screen.queryByRole('button', { name: 'Advanced settings' })
      ).toBeNull()
      // Switch back to the full profile: Advanced reappears.
      const reopened = findModelCombobox('simple-image-1')
      await user.click(reopened)
      await user.click(
        await screen.findByRole('option', { name: 'qwen-image-3.0' })
      )
      expect(
        await screen.findByRole('button', { name: 'Advanced settings' })
      ).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('auto-opens the Advanced panel when a server error maps to an advanced field', async () => {
    const i18n = await createI18n()
    // The error message format matches mapImageServerErrorToField
    // expectations for the negativePrompt field.
    vi.mocked(generateImages).mockRejectedValue(
      new ImagePlaygroundError({
        kind: 'upstream',
        rawMessage: 'negative_prompt is not allowed by safety policy',
      })
    )
    const restore = renderPage(i18n).restore
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      await screen.findByRole('button', { name: 'Advanced settings' })
      // The panel is closed initially.
      expect(screen.queryByLabelText('Negative prompt')).toBeNull()
      await user.type(
        screen.getByPlaceholderText('Describe the image you want to generate'),
        'a serene mountain'
      )
      await user.click(screen.getByRole('button', { name: 'Generate' }))
      // After the server error, the panel opens so the inline field
      // error is visible.
      await waitFor(() => {
        expect(screen.getByLabelText('Negative prompt')).toBeTruthy()
      })
    } finally {
      restore()
    }
  })
})

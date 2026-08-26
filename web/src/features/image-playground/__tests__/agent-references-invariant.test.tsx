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
 * Always-mounted business invariant: agent mode is incompatible with
 * reference images. The page-level effect must revert promptExtendMode
 * from agent to direct as soon as a reference image is attached, even
 * while the Advanced panel is closed. The page-level effect keeps the
 * invariant in force regardless of whether the Advanced popover is
 * currently mounted.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const profile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsAutoSize: false,
  supportsCustomSize: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 2,
  supportsNegativePrompt: true,
  maxNegativePromptChars: 500,
  supportsSeed: true,
  seedRange: { min: 0, max: 1, default: 0 },
  supportsWatermark: true,
  defaultWatermark: false,
  supportsPromptExtend: true,
  defaultPromptExtend: true,
  supportsPromptExtendMode: true,
  defaultPromptExtendMode: 'direct',
  supportsThinkingMode: true,
  defaultThinkingMode: false,
  thinkingRequiresExtend: true,
  agentRequiresNoRefs: true,
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
  'Prompt extend mode': 'Prompt extend mode',
  Direct: 'Direct',
  Agent: 'Agent',
  'Add reference image': 'Add reference image',
  'Reference images': 'Reference images',
  'Add image ({{remaining}} left)': 'Add image ({{remaining}} left)',
  'Choose files': 'Choose files',
  'Drop images here or choose files': 'Drop images here or choose files',
  'Attach up to {{max}} reference images.':
    'Attach up to {{max}} reference images.',
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

function renderPage(i18n: I18n) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1024,
  })
  window.matchMedia = ((query: string) => {
    const m = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: m ? 1024 <= Number(m[1]) : false,
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
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ImagePlayground />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

// A real 1x1 transparent PNG that the FileReader can decode and
// createReferenceImage can keep. It is exactly 67 bytes of base64.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('ImagePlayground — agent mode and reference images invariant', () => {
  // Snapshot the browser globals once so each test's mutation of
  // innerWidth / matchMedia is restored after the test completes.
  // Tests must never depend on another test's window state.
  const originalInnerWidth = Object.getOwnPropertyDescriptor(
    window,
    'innerWidth'
  )
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    } else {
      delete (window as unknown as { innerWidth?: number }).innerWidth
    }
    window.matchMedia = originalMatchMedia
  })

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
      models: [{ model: 'qwen-image-3.0', provider: 'Ali', profile }],
    })
    vi.mocked(generateImages).mockReset()
  })

  it('reverts promptExtendMode from agent to direct when a reference is attached, even after the panel is closed', async () => {
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage(i18n)

    // 1. Open Advanced.
    await user.click(
      await screen.findByRole('button', { name: 'Advanced settings' })
    )
    // 2. Select agent.
    const modeSelect = await screen.findByLabelText('Prompt extend mode')
    await user.selectOptions(modeSelect, 'agent')
    expect((modeSelect as HTMLSelectElement).value).toBe('agent')

    // 3. Close the Advanced panel.
    // Click outside the panel to close.
    await user.keyboard('{Escape}')

    // 4. Add a reference image via the tray's popover.
    // Open the tray popover.
    await user.click(
      await screen.findByRole('button', { name: 'Add reference image' })
    )
    // The popover body hosts the existing reference-image dropzone.
    // Use its hidden file input directly.
    const fileInput = (await waitFor(() =>
      document.querySelector<HTMLInputElement>('#image-reference-upload')
    )) as HTMLInputElement
    const pngFile = new File(
      [Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))],
      'kitten.png',
      { type: 'image/png' }
    )
    await user.upload(fileInput, pngFile)

    // 5. After upload, the page-level effect must have reverted the
    //    mode to direct even while the panel is closed. The select
    //    itself is inside the closed popover, so we re-open Advanced
    //    to assert the live form value.
    await user.click(
      await screen.findByRole('button', { name: 'Advanced settings' })
    )
    const modeSelectAfter = await screen.findByLabelText('Prompt extend mode')
    expect((modeSelectAfter as HTMLSelectElement).value).toBe('direct')
    // 6. Submit and intercept: the outbound payload must carry
    //    prompt_extend_mode='direct', never 'agent'.
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    await user.type(
      screen.getByPlaceholderText('Describe the image you want to generate'),
      'a serene mountain'
    )
    await user.click(await screen.findByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(vi.mocked(generateImages)).toHaveBeenCalled()
    })
    const payload = vi.mocked(generateImages).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(payload.prompt_extend_mode).toBe('direct')
    expect(payload.prompt_extend_mode).not.toBe('agent')
    // The reference image is in the request body.
    expect(payload.image).toBeTruthy()
  })

  it('auto-reverts thinkingMode to false when promptExtend is turned off, even after the panel is closed', async () => {
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage(i18n)

    // The default form has promptExtend=true, thinkingMode=false.
    // 1. Open Advanced.
    await user.click(
      await screen.findByRole('button', { name: 'Advanced settings' })
    )

    // 2. Toggle Enable thinking ON while promptExtend is still ON.
    let thinkingSwitch = await screen.findByRole('switch', {
      name: 'Enable thinking',
    })
    expect(thinkingSwitch.getAttribute('aria-checked')).toBe('false')
    // Base UI Switch uses aria-disabled instead of the native
    // disabled attribute, so check the aria attribute directly.
    expect(thinkingSwitch.getAttribute('aria-disabled')).not.toBe('true')
    await user.click(thinkingSwitch)
    thinkingSwitch = await screen.findByRole('switch', {
      name: 'Enable thinking',
    })
    expect(thinkingSwitch.getAttribute('aria-checked')).toBe('true')
    expect(thinkingSwitch.getAttribute('aria-disabled')).not.toBe('true')

    // 3. Turn Prompt extend OFF. The thinking switch must be
    //    auto-reverted to off AND disabled (the backend would
    //    otherwise reject the inconsistent thinkingMode=true +
    //    promptExtend=false pair).
    const promptExtendSwitch = await screen.findByRole('switch', {
      name: 'Prompt extend',
    })
    expect(promptExtendSwitch.getAttribute('aria-checked')).toBe('true')
    await user.click(promptExtendSwitch)
    thinkingSwitch = await screen.findByRole('switch', {
      name: 'Enable thinking',
    })

    // 4. The page-level effect must have forced thinkingMode back to
    //    false. Without useWatch + explicit deps, this re-render
    //    path is not subscribed and the assertion fails.
    await waitFor(() => {
      expect(thinkingSwitch.getAttribute('aria-checked')).toBe('false')
    })
    expect(thinkingSwitch.getAttribute('aria-disabled')).toBe('true')

    // 5. Close the panel; the form state must persist the revert.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('switch', { name: 'Enable thinking' })).toBeNull()

    // 6. Submit and intercept: the outbound payload must explicitly
    //    carry thinking_mode=false. The image payload builder always
    //    emits the field for profiles that support thinking_mode, so
    //    the build never silently omits it; the test pins the exact
    //    literal false, not just "not true".
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    await user.type(
      screen.getByPlaceholderText('Describe the image you want to generate'),
      'a calm horizon'
    )
    await user.click(await screen.findByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(vi.mocked(generateImages)).toHaveBeenCalled()
    })
    const payload = vi.mocked(generateImages).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(payload.thinking_mode).toBe(false)
  })
})

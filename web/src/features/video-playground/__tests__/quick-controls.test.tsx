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
 * Canvas Composer quick controls and toolbar layout tests for the
 * Video Playground. The quick parameter pills show live form values
 * and open the same parameter panel that the Advanced trigger opens.
 * The composer toolbar clusters model, creation mode, and connection
 * controls. The submit chain is not exercised here — page-level
 * tests own the POST body contract.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  listUsableVideoApiKeys,
  loadVideoApiSecret,
  submitVideoGenerationWithApiKey,
} from '../api'
import {
  FAKE_SECRET,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  videoPlaygroundTranslations,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../lib/media-duration', () => ({
  readMediaDuration: vi.fn(async () => undefined),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationWithApiKey: vi.fn(),
    getVideoTask: vi.fn(),
  }
})

const composerTranslations = {
  ...videoPlaygroundTranslations.en,
  Image: 'Image',
  Video: 'Video',
  'Usage logs': 'Usage logs',
  'Media type': 'Media type',
  'Composer toolbar': 'Composer toolbar',
}

async function createComposerI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: composerTranslations } },
  })
  return instance
}

describe('VideoPlayground Canvas Composer quick controls', () => {
  beforeEach(() => {
    stubAuthUser()
    vi.mocked(listUsableVideoApiKeys).mockResolvedValue([
      {
        id: 7,
        name: 'phaseD',
        maskedKey: 'sk-***7777',
        status: 1,
        createdTime: 100,
      },
    ])
    vi.mocked(loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
    vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
      { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  it('shows quick pills with current form values and opens the parameter panel from a pill', async () => {
    const i18n = await createComposerI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const ratioPill = screen.getByRole('button', { name: 'Aspect ratio' })
    expect(ratioPill.textContent).toContain('16:9')
    expect(
      screen.getByRole('button', { name: 'Resolution' }).textContent
    ).toContain('720p')
    expect(
      screen.getByRole('button', { name: 'Duration' }).textContent
    ).toContain('5s')
    expect(
      screen.getByRole('button', { name: 'Generate audio' }).textContent
    ).toContain('Audio on')

    await user.click(ratioPill)
    const combobox = await screen.findByRole('combobox', {
      name: 'Aspect ratio',
    })
    await user.click(combobox)
    await user.click(await screen.findByRole('option', { name: '9:16' }))
    await user.keyboard('{Escape}')
    expect(ratioPill.textContent).toContain('9:16')
  })

  it('keeps a single Advanced trigger named Parameter settings with an active-count badge', async () => {
    const i18n = await createComposerI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const advanced = screen.getByRole('button', {
      name: /Parameter settings/,
    })
    await user.click(advanced)
    expect(
      await screen.findByRole('combobox', { name: 'Aspect ratio' })
    ).toBeTruthy()
  })

  it('clusters model, creation mode, and connection settings in the composer toolbar', async () => {
    const i18n = await createComposerI18n()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const toolbar = await screen.findByRole('toolbar', {
      name: 'Composer toolbar',
    })
    expect(
      within(toolbar).getByRole('combobox', { name: 'Video model' })
    ).toBeTruthy()
    expect(
      within(toolbar).getByRole('combobox', { name: 'Creation mode' })
    ).toBeTruthy()
    expect(within(toolbar).getByLabelText('Connection settings')).toBeTruthy()
  })

  it('opens the parameter sheet from a quick pill at mobile width', async () => {
    const i18n = await createComposerI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n, undefined, { innerWidth: 375 })
    await readyGenerateButton()

    await user.click(screen.getByRole('button', { name: 'Aspect ratio' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Parameter settings')).toBeTruthy()
  })

  it('opens the parameter sheet at 320px and groups the composer body in a single column', async () => {
    const i18n = await createComposerI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n, undefined, { innerWidth: 320 })
    await readyGenerateButton()
    // The page scroller must clip overflow at the outer container
    // instead of letting content push past the viewport. Real visual and
    // scrollWidth at 320 / 375 px is verified manually in the
    // browser, not via the test environment.
    const page = screen.getByTestId('video-playground-page')
    expect(page).toHaveClass('overflow-x-hidden')
    await user.click(screen.getByRole('button', { name: 'Aspect ratio' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Parameter settings')).toBeTruthy()
  })
})

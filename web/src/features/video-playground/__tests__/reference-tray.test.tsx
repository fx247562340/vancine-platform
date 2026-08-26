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
 * Video Playground Reference Tray layout tests: the prompt and the
 * reference tray both live inside the composer body, with stable
 * accessible names. The tray's reference group label and add
 * affordance are independent of the prompt's label.
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

const trayTranslations = {
  ...videoPlaygroundTranslations.en,
  Image: 'Image',
  Video: 'Video',
  'Usage logs': 'Usage logs',
  'Media type': 'Media type',
  'Composer toolbar': 'Composer toolbar',
}

async function createTrayI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: trayTranslations } },
  })
  return instance
}

describe('VideoPlayground Reference Tray layout', () => {
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

  it('keeps the prompt and the reference assets tray both inside the composer body', async () => {
    const i18n = await createTrayI18n()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const prompt = screen.getByLabelText('Prompt')
    const tray = screen.getByRole('group', { name: 'Reference assets' })
    expect(prompt).toBeTruthy()
    expect(tray).toBeTruthy()
    expect(
      within(tray).getByRole('button', { name: 'Add reference image' })
    ).toBeTruthy()
    expect(
      within(tray).getByRole('button', { name: 'Add reference video' })
    ).toBeTruthy()
    expect(
      within(tray).getByRole('button', { name: 'Add reference audio' })
    ).toBeTruthy()
  })

  it('adds a reference URL and shows the @Image chip in the tray', async () => {
    const i18n = await createTrayI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await user.click(screen.getByRole('button', { name: 'Add reference image' }))
    const input = await screen.findByPlaceholderText(
      'https://cdn.example.com/reference.png'
    )
    await user.type(input, 'https://cdn.example.com/kitten.png')
    await user.keyboard('{Enter}')
    const tray = screen.getByRole('group', { name: 'Reference assets' })
    expect(await within(tray).findByText('@Image1')).toBeTruthy()
  })
})

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
 * Video Playground page frame: heading, Image/Video route navigation
 * with aria-current, Usage logs link, masked key status, and the
 * composer toolbar clustering model + connection controls.
 */
import { screen, within } from '@testing-library/react'
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

const frameTranslations = {
  ...videoPlaygroundTranslations.en,
  Image: 'Image',
  Video: 'Video',
  'Usage logs': 'Usage logs',
  'Media type': 'Media type',
  'Composer toolbar': 'Composer toolbar',
}

async function createFrameI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: frameTranslations } },
  })
  return instance
}

describe('VideoPlayground page frame', () => {
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

  it('shows the page title as the only h1 and marks Video as current in the nav', async () => {
    const i18n = await createFrameI18n()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Video generation')

    const nav = await screen.findByRole('navigation', { name: 'Media type' })
    const imageLink = screen.getByRole('link', { name: 'Image' })
    const videoLink = screen.getByRole('link', { name: 'Video' })
    expect(nav.contains(imageLink)).toBe(true)
    expect(nav.contains(videoLink)).toBe(true)
    expect(imageLink.getAttribute('href')).toBe('/playground/image')
    expect(videoLink.getAttribute('href')).toBe('/playground/video')
    expect(videoLink.getAttribute('aria-current')).toBe('page')
    expect(imageLink.getAttribute('aria-current')).toBeNull()
  })

  it('keeps the Usage logs entry reachable from the page header', async () => {
    const i18n = await createFrameI18n()
    renderVideoPlayground(i18n)
    const link = await screen.findByRole('link', { name: 'Usage logs' })
    expect(link.getAttribute('href')).toContain('/usage-logs')
  })

  it('shows the selected key status masked, never the full secret', async () => {
    const i18n = await createFrameI18n()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    expect(await screen.findByText(/sk-\*\*\*7777/)).toBeTruthy()
    expect(document.body.innerHTML).not.toContain(FAKE_SECRET)
  })

  it('clusters the video model and connection settings in the composer toolbar', async () => {
    const i18n = await createFrameI18n()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const toolbar = await screen.findByRole('toolbar', {
      name: 'Composer toolbar',
    })
    expect(
      within(toolbar).getByRole('combobox', { name: 'Video model' })
    ).toBeTruthy()
    expect(within(toolbar).getByLabelText('Connection settings')).toBeTruthy()
  })
})

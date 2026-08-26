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
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
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
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

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

describe('VideoPlayground keyboard, focus, mobile, and submit lock', () => {
  let i18n: I18n

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    vi.mocked(listUsableVideoApiKeys).mockResolvedValue([
      {
        id: 2,
        name: 'older',
        maskedKey: 'sk-***1111',
        status: 1,
        createdTime: 100,
      },
    ])
    vi.mocked(loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
    vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
      { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
      { label: 'Doubao-Seedance-2.0', value: 'Doubao-Seedance-2.0' },
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  it('exposes labeled controls and submits from the keyboard', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    const prompt = await screen.findByLabelText('Prompt')
    await readyGenerateButton()
    expect(screen.getByLabelText('Connection settings')).toBeTruthy()
    expect(screen.getByLabelText('Video model')).toBeTruthy()

    await user.type(prompt, 'a cat walks on the moon')
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-1',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'IN_PROGRESS',
    })
    await act(async () => {
      prompt.closest('form')?.requestSubmit()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(1)
    })
  })

  it('disables generate while a submission is in flight', async () => {
    let resolveSubmit: (value: { task_id: string }) => void = () => {}
    vi.mocked(submitVideoGenerationWithApiKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        })
    )
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(
      await screen.findByLabelText('Prompt'),
      'a cat walks on the moon'
    )
    const generate = screen.getByRole('button', { name: 'Generate' })
    await user.click(generate)
    await user.click(generate)
    await waitFor(() => {
      expect(generate).toBeDisabled()
    })
    expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveSubmit({ task_id: 'task-1' })
      await Promise.resolve()
    })
  })

  it('keeps the form usable at a 375px mobile width without horizontal overflow', async () => {
    renderVideoPlayground(i18n, undefined, { innerWidth: 375 })
    await readyGenerateButton()
    const page = screen.getByTestId('video-playground-page')
    expect(screen.getByLabelText('Connection settings')).toBeTruthy()
    expect(screen.getByLabelText('Video model')).toBeTruthy()
    expect(screen.getByLabelText('Prompt')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy()
    expect(page).toHaveClass('overflow-x-hidden')
  })
})

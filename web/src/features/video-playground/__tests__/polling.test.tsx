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
import { act, screen } from '@testing-library/react'
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
import { VideoPlaygroundError } from '../lib/errors'
import {
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  fillAndSubmitPrompt,
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

describe('VideoPlayground polling and result URL', () => {
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
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-123',
    })
    vi.mocked(getVideoTask).mockReset()
  })

  it('shows waiting while a submitted task is still pending', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'IN_PROGRESS',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(await screen.findByText('Waiting for video...')).toBeTruthy()
    expect(screen.getByText(/Task ID: task-123/)).toBeTruthy()
  })

  it('stops showing a fake waiting state after FAILURE', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'FAILURE',
      fail_reason: 'upstream generation failed',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(await screen.findByText('upstream generation failed')).toBeTruthy()
    expect(screen.queryByText('Waiting for video...')).toBeNull()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  it('keeps the task id after a status query failure and recovers on retry', async () => {
    vi.mocked(getVideoTask).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Failed to load video status',
      })
    )
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    const retry = await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 4000 }
    )
    expect(screen.queryByText('Waiting for video...')).toBeNull()
    expect(screen.getByText(/Task ID: task-123/)).toBeTruthy()
    vi.mocked(getVideoTask).mockReset()
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCESS',
      result_url: 'https://cdn.example.com/done.mp4',
    })
    await userEvent.click(retry)
    expect(await screen.findByLabelText('Generated video')).toBeTruthy()
  })

  it('rejects unsafe result URLs instead of rendering a video', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCESS',
      result_url: 'https://user:pass@cdn.example.com/v.mp4',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(await screen.findByText('No playable video result')).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expect(document.body.innerHTML).not.toContain('user:pass')
  })

  it('shows a visible media error when the video element fails to load', async () => {
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCESS',
      result_url: 'https://cdn.example.com/result.mp4',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    const video = await screen.findByLabelText('Generated video')
    await act(async () => {
      video.dispatchEvent(new Event('error'))
    })
    expect(await screen.findByText('Video failed to load')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open video' })).toBeTruthy()
  })
})

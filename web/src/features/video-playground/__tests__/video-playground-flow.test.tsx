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
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => {
    let href = to
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value)
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
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

describe('VideoPlayground user flow', () => {
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
      {
        id: 3,
        name: 'newer',
        maskedKey: 'sk-***2222',
        status: 1,
        createdTime: 200,
      },
    ])
    vi.mocked(loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
    vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
      { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  it('defaults to the earliest key and submits the full model-driven body', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-123',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'IN_PROGRESS',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    await waitFor(() => {
      expect(loadVideoApiSecret).toHaveBeenCalledWith(
        2,
        expect.any(AbortSignal)
      )
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const [, payload] = vi.mocked(submitVideoGenerationWithApiKey).mock.calls[0]
    expect(payload).toEqual({
      model: 'Doubao-Seedance-2.5',
      prompt: 'a cat walks on the moon',
      duration: 5,
      metadata: {
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generate_audio: true,
        watermark: false,
        return_last_frame: false,
      },
    })
    expect(document.body.textContent).not.toContain(FAKE_SECRET)
    expect(document.body.textContent).not.toContain(`sk-${FAKE_SECRET}`)
  })

  it('reloads models after switching API keys', async () => {
    vi.mocked(loadVideoApiSecret).mockImplementation(async (id) =>
      id === 3 ? 'second-key' : FAKE_SECRET
    )
    vi.mocked(getVideoModelsWithApiKey).mockImplementation(async (apiKey) => {
      if (String(apiKey).includes('second-key')) {
        return [{ label: 'Doubao-Seedance-2.0', value: 'Doubao-Seedance-2.0' }]
      }
      return [{ label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' }]
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.click(screen.getByLabelText('Connection settings'))
    await user.click(await screen.findByLabelText('API Key'))
    const newer = await screen.findByRole('option', { name: /newer/ })
    await user.click(newer)
    await waitFor(() => {
      expect(loadVideoApiSecret).toHaveBeenCalledWith(
        3,
        expect.any(AbortSignal)
      )
    })
  })

  it('shows a create-key empty state when no usable key exists', async () => {
    vi.mocked(listUsableVideoApiKeys).mockResolvedValue([])
    renderVideoPlayground(i18n)
    expect(await screen.findByText('No API keys available')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Create API Key' })
    ).toHaveAttribute('href', '/keys')
  })

  it('shows a successful video without autoplay and offers open and download', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      id: 'task-123',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCESS',
      result_url: 'https://cdn.example.com/result.mp4',
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    const video = await screen.findByLabelText('Generated video')
    expect(video.getAttribute('src')).toBe('https://cdn.example.com/result.mp4')
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(screen.getByRole('link', { name: 'Open video' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      'task-123.mp4'
    )
  })

  it('shows an upstream error only as an inline alert', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: 'insufficient quota',
      })
    )
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(await screen.findByText('insufficient quota')).toBeTruthy()
    expect(document.body.textContent).not.toContain(FAKE_SECRET)
  })

  it('clears the previous secret when the selected key disappears', async () => {
    vi.mocked(loadVideoApiSecret).mockImplementation(async (id) =>
      id === 3 ? 'secret-b' : 'secret-a'
    )
    vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
      { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-9',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-9',
      status: 'IN_PROGRESS',
    })
    const { client } = renderVideoPlayground(i18n)
    await readyGenerateButton()
    expect(loadVideoApiSecret).toHaveBeenCalledWith(2, expect.any(AbortSignal))

    vi.mocked(listUsableVideoApiKeys).mockResolvedValue([
      {
        id: 3,
        name: 'newer',
        maskedKey: 'sk-***2222',
        status: 1,
        createdTime: 200,
      },
    ])
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['video-playground-keys'] })
    })
    await waitFor(() => {
      expect(loadVideoApiSecret).toHaveBeenCalledWith(
        3,
        expect.any(AbortSignal)
      )
    })
    await fillAndSubmitPrompt()
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(
      String(vi.mocked(submitVideoGenerationWithApiKey).mock.calls[0][0])
    ).toContain('secret-b')
    expect(
      String(vi.mocked(submitVideoGenerationWithApiKey).mock.calls[0][0])
    ).not.toContain('secret-a')
  })
})

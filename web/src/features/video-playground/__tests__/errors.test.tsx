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
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  listUsableVideoApiKeys,
  loadVideoApiSecret,
  submitVideoGenerationWithApiKey,
} from '../api'
import { videoPlaygroundErrorText, VideoPlaygroundError } from '../lib/errors'
import {
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  fillAndSubmitPrompt,
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

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}))

describe('VideoPlaygroundError rendering', () => {
  it('translates system errors and leaves upstream text untouched', async () => {
    const i18n = await createVideoPlaygroundI18n()
    const system = new VideoPlaygroundError({
      kind: 'system',
      errorKey: 'Video generation failed',
    })
    const upstream = new VideoPlaygroundError({
      kind: 'upstream',
      rawMessage: '上游拒绝了请求',
    })
    expect(videoPlaygroundErrorText(system, (key) => i18n.t(key))).toBe(
      'Video generation failed'
    )
    await i18n.changeLanguage('zh')
    expect(videoPlaygroundErrorText(system, (key) => i18n.t(key))).toBe(
      '视频生成失败'
    )
    expect(videoPlaygroundErrorText(upstream, (key) => i18n.t(key))).toBe(
      '上游拒绝了请求'
    )
  })
})

describe('VideoPlayground language switch and single error owner', () => {
  let i18n: I18n

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    toastError.mockReset()
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
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  it('re-translates a system submit error after switching to Chinese', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Video generation failed',
      })
    )
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(await screen.findByText('Video generation failed')).toBeTruthy()
    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    expect(await screen.findByText('视频生成失败')).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(FAKE_SECRET)
  })
})

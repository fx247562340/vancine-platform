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
import { act, screen, within } from '@testing-library/react'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  listUsableVideoApiKeys,
  loadVideoApiSecret,
  submitVideoGenerationRequest,
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

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationRequest: vi.fn(),
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

/**
 * The rebuilt studio renders surfaces the shared Chinese dictionary predates:
 * the reference-image tray, the submit error slot, the preview footer and the
 * recent-task list. They are merged in here so a language switch really does
 * re-translate the whole page, and an English string left on screen can only be
 * the deliberately verbatim upstream message.
 */
const studioChinese = {
  'Generate videos from text or a reference image with the video models available to this API key.':
    '使用此 API 密钥可用的视频模型，从文本或参考图生成视频。',
  'Select an API key': '请选择 API 密钥',
  'Select a video model': '请选择视频模型',
  'Describe the video you want to generate.': '描述你想生成的视频。',
  'Reference images': '参考图',
  'Drop images here or choose files': '拖拽图片到此处或选择文件',
  'Choose files': '选择文件',
  Default: '默认',
  seconds: '秒',
  'Submitting...': '提交中…',
  Submitting: '提交中',
  Failed: '失败',
  Running: '运行中',
  Queued: '排队中',
  Cancelled: '已取消',
  Completed: '已完成',
  'Your generated video will appear here.': '生成的视频将显示在这里。',
  'Untitled prompt': '未命名提示词',
  '{{count}} task': '{{count}} 个任务',
  '{{count}} tasks': '{{count}} 个任务',
  'View in usage logs': '在使用日志中查看',
}

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
    i18n.addResourceBundle('zh', 'translation', studioChinese, true, false)
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
    vi.mocked(submitVideoGenerationRequest).mockReset()
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  it('re-translates a system submit error after switching to Chinese', async () => {
    vi.mocked(submitVideoGenerationRequest).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Video generation failed',
      })
    )
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    // One owning error, rendered in its two intentional inline surfaces: the
    // slot above the generate button and the selected task's preview.
    const english = await screen.findAllByText('Video generation failed')
    expect(english).toHaveLength(2)

    await act(async () => {
      await i18n.changeLanguage('zh')
    })

    const chinese = await screen.findAllByText('视频生成失败')
    expect(chinese).toHaveLength(2)
    // A system error key is re-translated, so no English copy survives it.
    expect(screen.queryAllByText('Video generation failed')).toHaveLength(0)
    expect(
      within(screen.getByRole('region', { name: '预览' })).getByText(
        '视频生成失败'
      )
    ).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(FAKE_SECRET)
  })

  it('keeps an upstream submit message verbatim across a switch to Chinese', async () => {
    vi.mocked(submitVideoGenerationRequest).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: 'insufficient quota for video generation',
      })
    )
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()
    expect(
      await screen.findAllByText('insufficient quota for video generation')
    ).toHaveLength(2)

    await act(async () => {
      await i18n.changeLanguage('zh')
    })

    // The server's own wording is never translated or rewritten.
    expect(
      await screen.findAllByText('insufficient quota for video generation')
    ).toHaveLength(2)
    expect(toastError).not.toHaveBeenCalled()
  })
})

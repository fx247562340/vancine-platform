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
import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, expect } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { VideoPlayground } from '../index'

export const FAKE_SECRET = 'vp-secret-do-not-leak'

export const videoPlaygroundTranslations = {
  en: {
    'Video generation': 'Video generation',
    'Select a video model to start generating.':
      'Select a video model to start generating.',
    Prompt: 'Prompt',
    'Describe the video you want to generate':
      'Describe the video you want to generate',
    Generate: 'Generate',
    'Prompt is required': 'Prompt is required',
    'This request is charged at live prices':
      'This request is charged at live prices',
    Pricing: 'Pricing',
    'View all task logs': 'View all task logs',
    'Video generation failed': 'Video generation failed',
    'Failed to load video models': 'Failed to load video models',
    'Failed to load video status': 'Failed to load video status',
    'Failed to load API keys': 'Failed to load API keys',
    'Failed to load API key': 'Failed to load API key',
    'No video models available': 'No video models available',
    'No API keys available': 'No API keys available',
    'Create an API key to generate video.':
      'Create an API key to generate video.',
    'This API key has no Seedance 2.0 or 2.5 models.':
      'This API key has no Seedance 2.0 or 2.5 models.',
    'Create API Key': 'Create API Key',
    'API Key': 'API Key',
    'Select an API key': 'Select an API key',
    'Select a video model': 'Select a video model',
    'Open video': 'Open video',
    Download: 'Download',
    'Waiting for video...': 'Waiting for video...',
    'Task failed': 'Task failed',
    'Task ID': 'Task ID',
    'Retry status': 'Retry status',
    'Generated video': 'Generated video',
    'No playable video result': 'No playable video result',
    'Video model': 'Video model',
    Enabled: 'Enabled',
    'Video failed to load': 'Video failed to load',
    'Open video in a new tab to play this result.':
      'Open video in a new tab to play this result.',
    'Download is best-effort across domains. Use Open video if the file does not save.':
      'Download is best-effort across domains. Use Open video if the file does not save.',
    'Use the task logs to inspect this generation.':
      'Use the task logs to inspect this generation.',
  },
  zh: {
    'Video generation': '视频生成',
    Generate: '生成',
    'Video generation failed': '视频生成失败',
    'Failed to load video models': '加载视频模型失败',
    'Failed to load video status': '加载视频状态失败',
    'Retry status': '重试状态',
    'Waiting for video...': '正在等待视频…',
    'Task failed': '任务失败',
    'Task ID': '任务 ID',
    'Open video': '打开视频',
    Download: '下载',
    'Video model': '视频模型',
    'API Key': 'API 密钥',
    Pricing: '定价',
    'View all task logs': '查看全部任务日志',
    Prompt: '提示词',
    'Generated video': '生成的视频',
    'No playable video result': '没有可播放的视频结果',
    'No API keys available': '暂无可用 API 密钥',
    'Create API Key': '创建 API 密钥',
  },
}

export async function createVideoPlaygroundI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: {
      en: { translation: videoPlaygroundTranslations.en },
      zh: { translation: videoPlaygroundTranslations.zh },
    },
  })
  return instance
}

export function stubAuthUser() {
  const auth = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: { ...auth, user: { id: 1, username: 'tester', role: 1 } },
  })
}

notifyManager.setScheduler((fn) => fn())

let restoreMatchMediaFromRender: (() => void) | undefined

afterEach(() => {
  restoreMatchMediaFromRender?.()
  restoreMatchMediaFromRender = undefined
  notifyManager.setScheduler((fn) => fn())
})

export function installMatchMediaMock(innerWidth: number) {
  const originalMatchMedia = window.matchMedia
  const originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: innerWidth,
  })
  window.matchMedia = ((query: string) => {
    const maxWidthMatch = /max-width:\s*(\d+)px/.exec(query)
    const matches = maxWidthMatch
      ? innerWidth <= Number(maxWidthMatch[1])
      : false
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
  return () => {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
  }
}

export function renderVideoPlayground(
  i18n: I18n,
  client?: QueryClient,
  options?: { innerWidth?: number }
) {
  restoreMatchMediaFromRender?.()
  restoreMatchMediaFromRender = installMatchMediaMock(
    options?.innerWidth ?? 1024
  )
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  return {
    client: queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <VideoPlayground />
        </I18nextProvider>
      </QueryClientProvider>
    ),
  }
}

export async function readyGenerateButton() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })
  return screen.getByRole('button', { name: 'Generate' })
}

export async function fillAndSubmitPrompt(prompt = 'a cat walks on the moon') {
  const user = userEvent.setup()
  await readyGenerateButton()
  await user.type(await screen.findByLabelText('Prompt'), prompt)
  await user.click(screen.getByRole('button', { name: 'Generate' }))
  return user
}

export const routerLinkMock = {
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
}

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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, expect, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { routerLinkMock } from '@/test/router-link-mock'

import { VideoPlayground } from '../index'
import type { VideoApiKeyOption } from '../lib/keys'

export const FAKE_SECRET = 'vp-secret-do-not-leak'

export const videoPlaygroundTranslations = {
  en: {
    'Video generation': 'Video generation',
    'Select a video model to start generating.':
      'Select a video model to start generating.',
    Prompt: 'Prompt',
    'Describe the video you want to generate':
      'Describe the video you want to generate',
    'Describe the video you want to generate.':
      'Describe the video you want to generate.',
    Generate: 'Generate',
    'Generate video': 'Generate video',
    Seconds: 'Seconds',
    Default: 'Default',
    'Reference images': 'Reference images',
    'Drop images here or choose files': 'Drop images here or choose files',
    'Choose files': 'Choose files',
    'Recent tasks': 'Recent tasks',
    '{{count}} task': '{{count}} task',
    '{{count}} tasks': '{{count}} tasks',
    Preview: 'Preview',
    'Your generated video will appear here.':
      'Your generated video will appear here.',
    'Use these settings again': 'Use these settings again',
    'Reload preview': 'Reload preview',
    'videoPlayground.reference.modelDoesNotAcceptImages':
      'This model does not accept reference images.',
    'videoPlayground.reference.tooManyImages':
      'This model accepts at most {{max}} reference images.',
    'videoPlayground.reference.notAnImage':
      'Only image files can be used as reference images.',
    'videoPlayground.reference.unsupportedFormat':
      'Use a JPEG, PNG or WebP image.',
    'videoPlayground.reference.imageTooLarge':
      'Each reference image must be 10 MB or smaller.',
    'videoPlayground.reference.readFailed': 'Could not read this image.',
    'videoPlayground.request.bodyTooLarge':
      'The request is too large. Remove some reference images.',
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
    'This API key has no video models.': 'This API key has no video models.',
    'Generate videos from text or a reference image with the video models available to this API key.':
      'Generate videos from text or a reference image with the video models available to this API key.',
    "This model uses the provider's default parameters.":
      "This model uses the provider's default parameters.",
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
    'mode.textToVideo': 'Text to video',
    'mode.firstFrame': 'First frame',
    'mode.imageToVideo': 'Image to video',
    'mode.firstAndLastFrame': 'First and last frame',
    'mode.referenceGeneration': 'Reference generation',
    'mode.videoEdit': 'Video edit',
    'mode.videoExtend': 'Video extend',
    'Creation mode': 'Creation mode',
    Parameters: 'Parameters',
    'Parameter settings': 'Parameter settings',
    'Aspect ratio': 'Aspect ratio',
    Resolution: 'Resolution',
    Duration: 'Duration',
    'Generate audio': 'Generate audio',
    Watermark: 'Watermark',
    'Return last frame': 'Return last frame',
    'Random seed (optional)': 'Random seed (optional)',
    'Fixed duration': 'Fixed duration',
    'Intelligent duration': 'Intelligent duration',
    'Number of tasks': 'Number of tasks',
    Silent: 'Silent',
    'Audio on': 'Audio on',
    'Connection settings': 'Connection settings',
    '16:9': '16:9',
    '9:16': '9:16',
    '480p': '480p',
    '720p': '720p',
    '1080p': '1080p',
    '4k': '4k',
    Add: 'Add',
    'Add image': 'Add image',
    'Add video': 'Add video',
    'Add audio': 'Add audio',
    'Add reference image': 'Add reference image',
    'Add reference video': 'Add reference video',
    'Add reference audio': 'Add reference audio',
    'Public URL': 'Public URL',
    'https://cdn.example.com/reference.png':
      'https://cdn.example.com/reference.png',
    'https://cdn.example.com/reference.mp4':
      'https://cdn.example.com/reference.mp4',
    'https://cdn.example.com/reference.wav':
      'https://cdn.example.com/reference.wav',
    '@Image{{n}}': '@Image{{n}}',
    '@Video{{n}}': '@Video{{n}}',
    '@Audio{{n}}': '@Audio{{n}}',
    'Insert {{label}} into prompt': 'Insert {{label}} into prompt',
    'Remove {{name}}': 'Remove {{name}}',
    seconds: 'seconds',
    Cancelled: 'Cancelled',
    'Cancel pending submissions': 'Cancel pending submissions',
    'Submission failed': 'Submission failed',
    'This URL is not supported.': 'This URL is not supported.',
    'Could not read this image.': 'Could not read this image.',
    'Could not read this audio.': 'Could not read this audio.',
    'Size unknown — upstream will verify.':
      'Size unknown — upstream will verify.',
    'Only for enabled LAS asset-library allowlist.':
      'Only for enabled LAS asset-library allowlist.',
    'Local file': 'Local file',
    'Leave empty for random': 'Leave empty for random',
    Connection: 'Connection',
    Generating: 'Generating',
    Pending: 'Pending',
    'Task queue': 'Task queue',
    'videoPlayground.preflight.textToVideoForbidsReferences':
      'Text to video mode does not allow reference assets.',
    'videoPlayground.preflight.firstFrameRequiresOneImage':
      'First frame mode requires exactly one image.',
    'videoPlayground.preflight.referenceGenerationRequiresResource':
      'Reference generation requires at least one reference asset.',
    'videoPlayground.preflight.firstFrameForbidsExtraResources':
      'First frame mode only accepts one image.',
    'videoPlayground.preflight.unsafeUrl':
      'This URL is not allowed. Use a public https address.',
    'videoPlayground.preflight.editRequiresVideo':
      'Video edit and extend modes require at least one reference video.',
    'videoPlayground.preflight.genericForbidsReferenceVideo':
      'This model accepts a single reference image. Remove the attached videos.',
    'videoPlayground.preflight.genericForbidsReferenceAudio':
      'This model accepts a single reference image. Remove the attached audio.',
    'videoPlayground.preflight.genericAllowsOneReferenceImage':
      'This model accepts at most one reference image.',
    'videoPlayground.preflight.genericRequiresHttpsImageUrl':
      'This model accepts a public HTTPS image URL only. Remove the inline image.',
    'videoPlayground.preflight.genericModeUnsupported':
      'This model does not support the selected creation mode.',
    'videoPlayground.error.unknownVideoModel':
      'Unknown video model. Reload the model list and try again.',
  },
  zh: {
    'Video generation': '视频生成',
    Generate: '生成',
    'Generate video': '生成视频',
    Prompt: '提示词',
    Seconds: '秒数',
    Resolution: '分辨率',
    'Video model': '视频模型',
    'API Key': 'API 密钥',
    'Reference images': '参考图',
    'Recent tasks': '最近任务',
    Preview: '预览',
    'Use these settings again': '再次使用这些设置',
    'Reload preview': '重新加载预览',
    'Prompt is required': '请输入提示词',
    'Video generation failed': '视频生成失败',
    'Failed to load video models': '加载视频模型失败',
    'Failed to load video status': '加载视频状态失败',
    'Retry status': '重试状态',
    'Waiting for video...': '正在等待视频…',
    'Task failed': '任务失败',
    'Task ID': '任务 ID',
    'Open video': '打开视频',
    Download: '下载',
    Pricing: '定价',
    'View all task logs': '查看全部任务日志',
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
  const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'innerWidth'
  )
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: innerWidth,
  })
  // Vitrast note: window.matchMedia is defined non-writable by src/test-setup.ts
  // under vitest; redefine via configurable property instead of assignment.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => {
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
    },
    writable: true,
  })
  return () => {
    // Restore the original property descriptor, not just the value, so
    // the next test sees the pristine window.innerWidth definition.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    if (originalInnerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidthDescriptor)
    } else {
      delete (window as unknown as { innerWidth?: number }).innerWidth
    }
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
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  })
  return screen.getByRole('button', { name: 'Generate video' })
}

export async function fillAndSubmitPrompt(prompt = 'a cat walks on the moon') {
  const user = userEvent.setup()
  await readyGenerateButton()
  await user.type(await screen.findByLabelText('Prompt'), prompt)
  await user.click(screen.getByRole('button', { name: 'Generate video' }))
  return user
}

export { routerLinkMock }

/** The five video models Vancine actually has in production. */
export const PRODUCTION_VIDEO_MODELS = [
  'wan3.0-video',
  'wan3.0-video-prime',
  'MiniMax-H3',
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.5',
] as const

/** Two usable keys, so a key switch can be exercised without extra fixtures. */
export const STUDIO_API_KEYS: VideoApiKeyOption[] = [
  {
    id: 7,
    name: 'studio',
    maskedKey: 'sk-***7777',
    status: 1,
    createdTime: 100,
  },
  {
    id: 9,
    name: 'newer',
    maskedKey: 'sk-***9999',
    status: 1,
    createdTime: 200,
  },
]

/**
 * Point the mocked `../api` module at a fixed key list and model list.
 *
 * Each test file still declares its own `vi.mock('../api', ...)` factory; this
 * only fills in resolved values, and it reaches the mock through a dynamic
 * import so nothing here depends on vi.mock hoisting order.
 */
export async function stubVideoApi(options: {
  models?: ReadonlyArray<string>
  keys?: ReadonlyArray<VideoApiKeyOption>
}): Promise<void> {
  const api = await import('../api')
  vi.mocked(api.listUsableVideoApiKeys).mockResolvedValue([
    ...(options.keys ?? STUDIO_API_KEYS),
  ])
  vi.mocked(api.loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
  vi.mocked(api.getVideoModelsWithApiKey).mockResolvedValue(
    (options.models ?? PRODUCTION_VIDEO_MODELS).map((id) => ({
      label: id,
      value: id,
    }))
  )
  vi.mocked(api.submitVideoGenerationRequest).mockReset()
  vi.mocked(api.submitVideoGenerationRequest).mockResolvedValue({
    task_id: 'task-stub',
    id: 'task-stub',
  })
  vi.mocked(api.submitVideoGenerationWithApiKey).mockReset()
  vi.mocked(api.getVideoTask).mockReset()
}

/** The bodies handed to `submitVideoGenerationRequest`, in submit order. */
export async function capturedSubmitBodies(): Promise<unknown[]> {
  const api = await import('../api')
  return vi
    .mocked(api.submitVideoGenerationRequest)
    .mock.calls.map((call) => call[1])
}

/**
 * A real File with deterministic bytes, so FileReader yields a real data URL.
 * The content depends on the name, which keeps two fixtures of the same size
 * and MIME type from producing the same data URL.
 */
export function makeImageFile(
  name: string,
  mimeType = 'image/png',
  byteSize = 64
): File {
  const bytes = new Uint8Array(byteSize)
  for (let index = 0; index < byteSize; index += 1) {
    bytes[index] =
      ((index + name.charCodeAt(index % name.length) + mimeType.length) % 251) +
      1
  }
  return new File([bytes], name, { type: mimeType })
}

export async function pickVideoModel(
  user: UserEvent,
  modelId: string
): Promise<void> {
  await user.click(screen.getByLabelText('Video model'))
  await user.click(await screen.findByRole('option', { name: modelId }))
}

export async function pickSeconds(
  user: UserEvent,
  label: string
): Promise<void> {
  await user.click(screen.getByLabelText('Seconds'))
  await user.click(await screen.findByRole('option', { name: label }))
}

export async function pickResolution(
  user: UserEvent,
  label: string
): Promise<void> {
  await user.click(screen.getByLabelText('Resolution'))
  await user.click(await screen.findByRole('option', { name: label }))
}

/** Input path 1: the tray's file picker. */
export async function pickReferenceImages(
  user: UserEvent,
  files: File[]
): Promise<void> {
  await user.upload(screen.getByTestId('reference-image-file-input'), files)
}

/** Input path 2: dropping files on the tray. */
export function dropReferenceImages(files: File[]): void {
  fireEvent.drop(screen.getByTestId('reference-image-dropzone'), {
    dataTransfer: { files, items: [], types: ['Files'] },
  })
}

/**
 * Input path 3: pasting from the clipboard. Dispatched on `document`, which is
 * where the tray listens, so it works whatever currently has focus.
 */
export function pasteFromClipboard(
  files: File[],
  text?: string
): { event: Event; defaultPrevented: () => boolean } {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      items: [],
      types: files.length > 0 ? ['Files'] : ['text/plain'],
      getData: () => text ?? '',
    },
  })
  document.dispatchEvent(event)
  return { event, defaultPrevented: () => event.defaultPrevented }
}

export async function switchApiKey(
  user: UserEvent,
  keyName: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'API Key' }))
  await user.click(
    await screen.findByRole('menuitemradio', { name: new RegExp(keyName) })
  )
}

export async function typePrompt(user: UserEvent, prompt: string) {
  await readyGenerateButton()
  await user.type(await screen.findByLabelText('Prompt'), prompt)
}

export async function submitStudio(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Generate video' }))
}

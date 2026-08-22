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
// P13-B R18 P2: real generateImages catch-path tests. The HTTP layer
// (@/lib/api) is mocked, NOT generateImages itself, so every assertion
// exercises the production classification code: axios responses with an
// explicit server message become kind:'upstream' (verbatim), while network
// failures, undecodable responses and parseGeneratedImages failures fail
// closed on kind:'system' (stable i18n key).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useImagePlaygroundStore } from '@/stores/image-playground-store'

const apiPostMock = vi.hoisted(() => vi.fn())
const apiGetMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { post: apiPostMock, get: apiGetMock },
}))

// eslint-disable-next-line import/first -- vi.mock must precede the import
import { generateImages, getImageCapabilities } from '../api'
// eslint-disable-next-line import/first -- vi.mock must precede the import
import {
  useImageGenerate,
  type GenerateInput,
} from '../hooks/use-image-generate'
// eslint-disable-next-line import/first -- vi.mock must precede the import
import { ImagePlaygroundError } from '../lib/errors'
// eslint-disable-next-line import/first -- vi.mock must precede the import
import type { ImageGenerationPayload } from '../lib/payload'
// eslint-disable-next-line import/first -- vi.mock must precede the import
import type { ImageModelProfile } from '../types'

const payload: ImageGenerationPayload = {
  model: 'qwen-image-2.0',
  group: 'default',
  prompt: 'a red apple',
  n: 1,
  response_format: 'url',
}

function axiosError(
  data: unknown,
  message = 'Request failed with status code 400'
) {
  return {
    isAxiosError: true,
    message,
    response: { data },
    toJSON: () => ({}),
  }
}

describe('generateImages real catch path', () => {
  beforeEach(() => {
    apiPostMock.mockReset()
  })

  it('axios response with an explicit message yields the upstream source verbatim', async () => {
    apiPostMock.mockRejectedValueOnce(
      axiosError({ error: { message: 'prompt is required' } })
    )
    const error = await generateImages(payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    const typed = error as ImagePlaygroundError
    expect(typed.source).toEqual({
      kind: 'upstream',
      rawMessage: 'prompt is required',
    })
    expect(typed.errorKey).toBeUndefined()
    expect(typed.rawUpstreamMessage).toBe('prompt is required')
  })

  it('network failure without a response fails closed on the system source', async () => {
    apiPostMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Network Error',
      toJSON: () => ({}),
    })
    const error = await generateImages(payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
  })

  it('an undecodable response body fails closed on the system source', async () => {
    apiPostMock.mockResolvedValueOnce({ data: 'not-a-json-object' })
    const error = await generateImages(payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
  })

  it('parseGeneratedImages with an empty result fails closed on the system source', async () => {
    apiPostMock.mockResolvedValueOnce({ data: { created: 1, data: [] } })
    const error = await generateImages(payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
  })

  it('a 2xx body carrying an explicit error envelope yields the upstream source', async () => {
    apiPostMock.mockResolvedValueOnce({
      data: { error: { message: 'content moderation blocked the prompt' } },
    })
    const error = await generateImages(payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'upstream',
      rawMessage: 'content moderation blocked the prompt',
    })
  })

  it('a valid response resolves the parsed images', async () => {
    apiPostMock.mockResolvedValueOnce({
      data: {
        created: 1,
        data: [{ url: 'https://example.invalid/a.png' }],
      },
    })
    const images = await generateImages(payload)
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('https://example.invalid/a.png')
  })
})

describe('getImageCapabilities real catch path', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it('envelope failure with an explicit message yields the upstream source', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: { success: false, message: 'group not found' },
    })
    const error = await getImageCapabilities('default').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'upstream',
      rawMessage: 'group not found',
    })
  })

  it('undecodable envelope fails closed on the system source', async () => {
    apiGetMock.mockResolvedValueOnce({ data: 'garbage' })
    const error = await getImageCapabilities('default').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'system',
      errorKey: 'Failed to load image models',
    })
  })

  it('network failure fails closed on the system source', async () => {
    apiGetMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Network Error',
      toJSON: () => ({}),
    })
    const error = await getImageCapabilities('default').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImagePlaygroundError)
    expect((error as ImagePlaygroundError).source).toEqual({
      kind: 'system',
      errorKey: 'Failed to load image models',
    })
  })
})

// ---------------------------------------------------------------------------
// Hook-level integration through the REAL generateImages (only the HTTP
// layer is mocked): system errors re-translate on language switch, upstream
// text stays verbatim.
// ---------------------------------------------------------------------------

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Image generation failed': 'Image generation failed',
      },
    },
    zh: {
      translation: {
        'Image generation failed': '图片生成失败',
      },
    },
  },
})

const profile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsCustomSize: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 0,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: false,
}

function makeInput(): GenerateInput {
  return {
    model: 'qwen-image-2.0',
    group: 'default',
    provider: 'Ali',
    prompt: 'a red apple',
    params: {
      size: '1024x1024',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      promptExtendMode: 'direct',
      thinkingMode: false,
    },
    profile,
    references: [],
  }
}

function renderGenerateHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(() => useImageGenerate(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    ),
  })
}

describe('useImageGenerate with the real generateImages catch path', () => {
  beforeEach(() => {
    localStorage.clear()
    apiPostMock.mockReset()
    const auth = useAuthStore.getState().auth
    useAuthStore.setState({
      auth: { ...auth, user: { id: 1, username: 'user-1', role: 1 } },
    })
    useImagePlaygroundStore.setState({
      _hydrated: false,
      _envelope: { version: 2, users: {} },
    })
  })

  it('network failure stores only the system errorKey and re-translates on language switch', async () => {
    apiPostMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Network Error',
      toJSON: () => ({}),
    })
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current.generate(makeInput()).catch(() => undefined)
    })

    const run = result.current.runs[0]
    expect(run.errorKey).toBe('Image generation failed')
    expect(run.rawErrorMessage).toBeUndefined()
    expect(run.error).toBeNull()
    expect(result.current.pageError.errorKey).toBe('Image generation failed')
    expect(result.current.pageError.rawUpstreamMessage).toBeUndefined()

    // The stored value is the stable key; the UI resolves it through t()
    // at render time, so switching the language re-labels the message.
    const systemKey = run.errorKey ?? ''
    expect(systemKey).not.toBe('')
    expect(i18n.t(systemKey)).toBe('Image generation failed')
    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    expect(i18n.t(systemKey)).toBe('图片生成失败')
    // The persisted record itself never changes.
    expect(result.current.runs[0].errorKey).toBe('Image generation failed')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('explicit upstream message stays verbatim across language switches', async () => {
    apiPostMock.mockRejectedValueOnce(
      axiosError({ error: { message: 'upstream quota exhausted' } })
    )
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current.generate(makeInput()).catch(() => undefined)
    })

    const run = result.current.runs[0]
    expect(run.rawErrorMessage).toBe('upstream quota exhausted')
    expect(run.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe(
      'upstream quota exhausted'
    )
    expect(result.current.pageError.errorKey).toBeUndefined()

    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    await waitFor(() => {
      expect(result.current.runs[0].rawErrorMessage).toBe(
        'upstream quota exhausted'
      )
    })
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })
})

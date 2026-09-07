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
 * The complete request body each production model puts on the wire.
 *
 * These are page-level tests: a real user picks a model, types a prompt,
 * attaches local images through the tray and presses generate, and the body
 * handed to `submitVideoGenerationRequest` — the last stop before
 * POST /v1/video/generations — is asserted in full. Nothing is asserted about
 * intermediate helpers, so a serializer that builds the right object but is
 * bypassed by the page still fails here.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { submitVideoGenerationRequest } from '../api'
import {
  createVideoPlaygroundI18n,
  makeImageFile,
  pickReferenceImages,
  pickResolution,
  pickSeconds,
  pickVideoModel,
  renderVideoPlayground,
  stubAuthUser,
  stubVideoApi,
  typePrompt,
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

type ContentItem = {
  type: string
  role?: string
  text?: string
  image_url?: { url: string }
}

type CapturedBody = {
  model: string
  prompt: string
  duration?: number
  seconds?: string
  size?: string
  metadata?: {
    resolution?: string
    content?: ContentItem[]
    input?: { media: Array<{ type: string; url: string }> }
  } & Record<string, unknown>
} & Record<string, unknown>

/**
 * Fields the studio must never send, at either level. They belonged to the
 * retired parameter panel; hiding a control is not enough, the value has to be
 * gone from the request.
 */
const FORBIDDEN_TOP_LEVEL = [
  'ratio',
  'generate_audio',
  'audio',
  'seed',
  'watermark',
  'return_last_frame',
  'frames',
  'mode',
  'n',
  'batch',
  'batch_count',
  'image',
  'images',
  'input_reference',
  'first_frame',
  'last_frame',
  'reference_video',
  'reference_audio',
  'resolution',
  'content',
] as const

const FORBIDDEN_METADATA = [
  'ratio',
  'generate_audio',
  'audio',
  'seed',
  'watermark',
  'return_last_frame',
  'frames',
  'camera_fixed',
  'camerafixed',
  'mode',
  'first_frame_image',
  'last_frame_image',
  'reference_video',
  'reference_audio',
  'parameters',
] as const

const FORBIDDEN_ROLES = [
  'first_frame',
  'last_frame',
  'reference_video',
  'reference_audio',
] as const

function capturedBody(callIndex = 0): CapturedBody {
  const call = vi.mocked(submitVideoGenerationRequest).mock.calls[callIndex]
  if (!call) {
    throw new Error('no submit call captured')
  }
  return call[1] as CapturedBody
}

async function waitForSubmitCount(count: number): Promise<void> {
  await waitFor(() => {
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(count)
  })
}

function expectNoRetiredFields(body: CapturedBody): void {
  for (const field of FORBIDDEN_TOP_LEVEL) {
    expect(body, `top-level ${field}`).not.toHaveProperty(field)
  }
  if (body.metadata) {
    for (const field of FORBIDDEN_METADATA) {
      expect(body.metadata, `metadata.${field}`).not.toHaveProperty(field)
    }
  }
}

function expectOnlyReferenceImages(items: ContentItem[]): void {
  for (const item of items) {
    expect(item.type).toBe('image_url')
    expect(item.role).toBe('reference_image')
    expect(FORBIDDEN_ROLES).not.toContain(item.role ?? '')
    expect(typeof item.image_url?.url).toBe('string')
  }
  // The plugin appends the prompt itself; a second text item would duplicate it.
  expect(items.filter((item) => item.type === 'text')).toHaveLength(0)
}

/** Replace data URLs with a stable marker so bodies can be compared exactly. */
function normalizeDataUrls(body: CapturedBody): CapturedBody {
  const clone = structuredClone(body) as CapturedBody
  const mark = (url: string | undefined) =>
    url && url.startsWith('data:') ? 'data:<image>' : url
  for (const item of clone.metadata?.content ?? []) {
    if (item.image_url) {
      item.image_url.url = mark(item.image_url.url) ?? ''
    }
  }
  for (const media of clone.metadata?.input?.media ?? []) {
    media.url = mark(media.url) ?? ''
  }
  return clone
}

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  i18n = await createVideoPlaygroundI18n()
})

describe('Video studio outbound request body', () => {
  it('sends Wan3 duration as a top-level int and resolution as top-level size, with no metadata at all for a text-only clip', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    expect(capturedBody()).toEqual({
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
      duration: 5,
      size: '1080P',
    })
    expectNoRetiredFields(capturedBody())
  })

  it('puts every Wan3 reference image into metadata.input.media as reference_image, in add order', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'wan3.0-video-prime')
    await typePrompt(user, 'three references, one shot')
    await pickReferenceImages(user, [
      makeImageFile('one.png'),
      makeImageFile('two.png'),
      makeImageFile('three.png'),
    ])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        3
      )
    })
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    const body = capturedBody()
    expect(normalizeDataUrls(body)).toEqual({
      model: 'wan3.0-video-prime',
      prompt: 'three references, one shot',
      duration: 5,
      size: '1080P',
      metadata: {
        input: {
          media: [
            { type: 'reference_image', url: 'data:<image>' },
            { type: 'reference_image', url: 'data:<image>' },
            { type: 'reference_image', url: 'data:<image>' },
          ],
        },
      },
    })
    // No image may be collapsed into a single first-frame field.
    expect(body.metadata?.input?.media).toHaveLength(3)
    const urls = (body.metadata?.input?.media ?? []).map((item) => item.url)
    expect(new Set(urls).size).toBe(3)
    for (const url of urls) {
      expect(url.startsWith('data:image/png;base64,')).toBe(true)
    }
    expectNoRetiredFields(body)
  })

  it('sends MiniMax-H3 duration as a top-level int and 2K through metadata.resolution, with reference images as metadata.content', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'MiniMax-H3')
    await typePrompt(user, 'a heron landing on a post')
    await pickSeconds(user, '8 seconds')
    await pickReferenceImages(user, [
      makeImageFile('heron.jpg', 'image/jpeg'),
      makeImageFile('post.webp', 'image/webp'),
    ])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        2
      )
    })
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    const body = capturedBody()
    expect(normalizeDataUrls(body)).toEqual({
      model: 'MiniMax-H3',
      prompt: 'a heron landing on a post',
      duration: 8,
      metadata: {
        resolution: '2K',
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:<image>' },
          },
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:<image>' },
          },
        ],
      },
    })
    expectOnlyReferenceImages(body.metadata?.content ?? [])
    expectNoRetiredFields(body)
    // The hailuo plugin derives ratio itself; sending one would override it.
    expect(body.metadata).not.toHaveProperty('ratio')
    expect(body).not.toHaveProperty('seconds')
    expect(body).not.toHaveProperty('size')
  })

  it('sends Seedance 2.0 seconds as a top-level string and lowercase 4k through metadata.resolution', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.0')
    await typePrompt(user, 'a market street at dusk')
    await pickSeconds(user, '12 seconds')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    const body = capturedBody()
    expect(body).toEqual({
      model: 'Doubao-Seedance-2.0',
      prompt: 'a market street at dusk',
      seconds: '12',
      metadata: { resolution: '4k' },
    })
    expect(typeof body.seconds).toBe('string')
    expectNoRetiredFields(body)
    expect(body).not.toHaveProperty('duration')
    expect(body).not.toHaveProperty('size')
  })

  it('converges Seedance 2.0 to 4k when attaching a reference image rules out the selected 1080p', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.0')
    await pickResolution(user, '1080p')
    await typePrompt(user, 'a market street at dusk')
    await pickReferenceImages(user, [makeImageFile('street.png')])

    await waitFor(() => {
      expect(screen.getByLabelText('Resolution')).toHaveTextContent('4K')
    })
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    expect(normalizeDataUrls(capturedBody())).toEqual({
      model: 'Doubao-Seedance-2.0',
      prompt: 'a market street at dusk',
      seconds: '5',
      metadata: {
        resolution: '4k',
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:<image>' },
          },
        ],
      },
    })
    expectNoRetiredFields(capturedBody())
  })

  it('never offers or sends 4k for Seedance 2.5 and keeps 1080p as its highest tier', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.5')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent('1080p')
    await typePrompt(user, 'a long single take through a station')
    await pickSeconds(user, '30 seconds')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    expect(capturedBody()).toEqual({
      model: 'Doubao-Seedance-2.5',
      prompt: 'a long single take through a station',
      seconds: '30',
      metadata: { resolution: '1080p' },
    })
    expect(JSON.stringify(capturedBody()).includes('4k')).toBe(false)
    expectNoRetiredFields(capturedBody())
  })

  it('sends only model and trimmed prompt for a video model with no capability entry', async () => {
    const user = userEvent.setup()
    await stubVideoApi({ models: ['some-future-video-model'] })
    renderVideoPlayground(i18n)
    await typePrompt(user, '   an unverified model prompt   ')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    expect(capturedBody()).toEqual({
      model: 'some-future-video-model',
      prompt: 'an unverified model prompt',
    })
    expectNoRetiredFields(capturedBody())
  })

  it('trims the prompt and keeps the exact model id spelling for every production model', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, '  padded prompt  ')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitForSubmitCount(1)
    expect(capturedBody().prompt).toBe('padded prompt')
    expect(capturedBody().model).toBe('wan3.0-video')
  })

  it('refuses to submit an empty prompt and keeps the request from being sent', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await user.type(await screen.findByLabelText('Prompt'), '   ')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(await screen.findByText('Prompt is required')).toBeTruthy()
    expect(vi.mocked(submitVideoGenerationRequest)).not.toHaveBeenCalled()
  })
})

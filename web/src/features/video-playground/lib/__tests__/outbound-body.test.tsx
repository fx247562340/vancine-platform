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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { submitVideoGenerationWithApiKey } from '../../api'
import { buildVideoGenerationRequest } from '../request-serializer'

/**
 * This test installs a global fetch stub to capture the outbound body of
 * POST /v1/video/generations. The body shape is the same shape the
 * backend (relay/channel/task/doubao/adaptor.go) will unmarshal into its
 * requestPayload struct. The test asserts that the adapter will see the
 * same content/role/parameter keys the official BytePlus operator
 * requires.
 */

const FAKE_KEY = 'vp-secret-do-not-leak'

function input() {
  return {
    model: 'Doubao-Seedance-2.5',
    prompt: 'a cat walks on the moon',
    images: [
      {
        id: 'img-1',
        kind: 'image' as const,
        source: {
          kind: 'url' as const,
          url: 'https://cdn.example.com/cat.png',
        },
        name: 'cat.png',
        mimeType: 'image/png',
        byteSize: 1_000_000,
      },
    ],
    videos: [
      {
        id: 'vid-1',
        kind: 'video' as const,
        source: {
          kind: 'url' as const,
          url: 'https://cdn.example.com/motion.mp4',
        },
        name: 'motion.mp4',
        mimeType: 'video/mp4',
        byteSize: 10_000_000,
        durationSeconds: 5,
      },
    ],
    audios: [
      {
        id: 'aud-1',
        kind: 'audio' as const,
        source: {
          kind: 'url' as const,
          url: 'https://cdn.example.com/song.wav',
        },
        name: 'song.wav',
        mimeType: 'audio/wav',
        byteSize: 5_000_000,
        durationSeconds: 5,
      },
    ],
    durationMode: 'fixed' as const,
    durationSeconds: 8,
    ratio: '16:9' as const,
    resolution: '720p' as const,
    generateAudio: true,
    seed: 42,
    watermark: false,
    returnLastFrame: false,
    mode: 'referenceGeneration' as const,
  }
}

describe('submitVideoGenerationWithApiKey (outbound body contract)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let realFetch: typeof globalThis.fetch

  beforeEach(() => {
    realFetch = globalThis.fetch
    fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ task_id: 'task-abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('sends the expected content items to /v1/video/generations', async () => {
    const built = buildVideoGenerationRequest(input())
    await submitVideoGenerationWithApiKey(FAKE_KEY, built, 'en')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/v1/video/generations')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer sk-${FAKE_KEY}`)
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Accept-Language']).toBe('en')
    const body = JSON.parse((init?.body as string) ?? '{}')
    expect(body.model).toBe('Doubao-Seedance-2.5')
    expect(body.prompt).toBe('a cat walks on the moon')
    expect(body.duration).toBe(8)
    expect(body.metadata.ratio).toBe('16:9')
    expect(body.metadata.resolution).toBe('720p')
    expect(body.metadata.generate_audio).toBe(true)
    expect(body.metadata.watermark).toBe(false)
    expect(body.metadata.return_last_frame).toBe(false)
    expect(body.metadata.seed).toBe(42)
    expect(body.metadata.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/cat.png' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/motion.mp4' },
        role: 'reference_video',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example.com/song.wav' },
        role: 'reference_audio',
      },
    ])
  })

  it('omits duration when durationMode is intelligent', async () => {
    await submitVideoGenerationWithApiKey(
      FAKE_KEY,
      buildVideoGenerationRequest({ ...input(), durationMode: 'intelligent' }),
      'en'
    )
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse((init?.body as string) ?? '{}')
    expect('duration' in body).toBe(false)
  })

  it('does not embed the API key in the JSON body', async () => {
    await submitVideoGenerationWithApiKey(
      FAKE_KEY,
      buildVideoGenerationRequest(input()),
      'en'
    )
    const [, init] = fetchSpy.mock.calls[0]
    const bodyText = String(init?.body ?? '')
    expect(bodyText).not.toContain(FAKE_KEY)
    expect(bodyText).not.toContain(`sk-${FAKE_KEY}`)
  })
})

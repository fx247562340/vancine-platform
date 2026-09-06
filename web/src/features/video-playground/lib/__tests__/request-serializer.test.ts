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
import { describe, expect, it } from 'vitest'

import { getVideoModelCapabilityOrThrow } from '../capabilities'
import {
  buildGenericVideoGenerationRequest,
  buildVideoGenerationRequest,
  VideoRequestError,
  type GenericVideoRequestInput,
  type VideoRequestInput,
} from '../request-serializer'
import type {
  VideoAudioResource,
  VideoImageResource,
  VideoVideoResource,
} from '../resource-validation'

function input(overrides: Partial<VideoRequestInput> = {}): VideoRequestInput {
  return {
    model: 'Doubao-Seedance-2.0',
    prompt: 'a cat walks on the moon',
    images: [],
    videos: [],
    audios: [],
    durationMode: 'fixed',
    durationSeconds: 5,
    ratio: '16:9',
    resolution: '720p',
    generateAudio: true,
    seed: null,
    watermark: false,
    returnLastFrame: false,
    mode: 'textToVideo',
    ...overrides,
  }
}

describe('buildVideoGenerationRequest', () => {
  it('emits a text-only request with fixed duration in BOTH top-level and metadata', () => {
    const body = buildVideoGenerationRequest(input())
    expect(body.model).toBe('Doubao-Seedance-2.0')
    expect(body.prompt).toBe('a cat walks on the moon')
    expect(body.duration).toBe(5)
    expect(body.metadata?.duration).toBe(5)
    expect(body.metadata).toEqual({
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generate_audio: true,
      watermark: false,
      return_last_frame: false,
    })
    expect(body.metadata?.content).toBeUndefined()
  })

  it('uses the Vancine public model id (not the official id)', () => {
    const body = buildVideoGenerationRequest(input())
    expect(body.model).toBe('Doubao-Seedance-2.0')
  })

  it('omits duration when durationMode is intelligent', () => {
    const body = buildVideoGenerationRequest(
      input({ durationMode: 'intelligent' })
    )
    expect(body.duration).toBeUndefined()
  })

  it('never emits frames or camera_fixed metadata keys', () => {
    const body = buildVideoGenerationRequest(input())
    const metadata = body.metadata as Record<string, unknown>
    expect('frames' in metadata).toBe(false)
    expect('camera_fixed' in metadata).toBe(false)
  })

  it('serialises a first-frame image with role first_frame', () => {
    const cap = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.0')
    const body = buildVideoGenerationRequest(
      input({
        mode: 'firstFrame',
        images: [
          {
            id: 'i1',
            kind: 'image',
            source: { kind: 'url', url: 'https://cdn.example.com/a.png' },
            name: 'a.png',
            mimeType: 'image/png',
            byteSize: 1000,
          },
        ],
      })
    )
    expect(body.metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/a.png' },
        role: 'first_frame',
      },
    ])
    // 1080p is forbidden with images — serializer must clamp resolution
    expect(body.metadata?.resolution).not.toBe('1080p')
    // cap is unused here but ensures the test is wired to capability
    expect(cap.publicModelId).toBe('Doubao-Seedance-2.0')
  })

  it('serialises first-and-last frame with two image roles', () => {
    const body = buildVideoGenerationRequest(
      input({
        mode: 'firstAndLastFrame',
        images: [
          {
            id: 'i1',
            kind: 'image',
            source: { kind: 'url', url: 'https://cdn.example.com/a.png' },
            name: 'a.png',
            mimeType: 'image/png',
            byteSize: 1000,
          },
          {
            id: 'i2',
            kind: 'image',
            source: { kind: 'url', url: 'https://cdn.example.com/b.png' },
            name: 'b.png',
            mimeType: 'image/png',
            byteSize: 1000,
          },
        ],
      })
    )
    expect(body.metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/a.png' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/b.png' },
        role: 'last_frame',
      },
    ])
  })

  it('uses reference_image role for 3+ images on Seedance 2.0', () => {
    const body = buildVideoGenerationRequest(
      input({
        mode: 'referenceGeneration',
        images: [image('i1'), image('i2'), image('i3')],
      })
    )
    const content = body.metadata?.content as Array<{ role: string }>
    expect(content.every((c) => c.role === 'reference_image')).toBe(true)
  })

  it('serialises a reference video with reference_video role', () => {
    const body = buildVideoGenerationRequest(
      input({
        mode: 'referenceGeneration',
        videos: [
          {
            id: 'v1',
            kind: 'video',
            source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
            name: 'v.mp4',
            mimeType: 'video/mp4',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
      })
    )
    expect(body.metadata?.content).toEqual([
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/v.mp4' },
        role: 'reference_video',
      },
    ])
  })

  it('serialises a reference audio with reference_audio role (Seedance 2.5)', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'referenceGeneration',
        images: [],
        videos: [],
        audios: [
          {
            id: 'a1',
            kind: 'audio',
            source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
            name: 'a.wav',
            mimeType: 'audio/wav',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
      })
    )
    expect(body.metadata?.content).toEqual([
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example.com/a.wav' },
        role: 'reference_audio',
      },
    ])
  })

  it('keeps image, video, and audio order and pairs them with the correct roles', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'referenceGeneration',
        images: [image('i1')],
        videos: [
          {
            id: 'v1',
            kind: 'video',
            source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
            name: 'v.mp4',
            mimeType: 'video/mp4',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
        audios: [
          {
            id: 'a1',
            kind: 'audio',
            source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
            name: 'a.wav',
            mimeType: 'audio/wav',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
      })
    )
    const content = body.metadata?.content as Array<{
      type: string
      role: string
    }>
    expect(content.map((c) => c.type)).toEqual([
      'image_url',
      'video_url',
      'audio_url',
    ])
    expect(content.map((c) => c.role)).toEqual([
      'reference_image',
      'reference_video',
      'reference_audio',
    ])
  })

  it('clamps duration to Seedance 2.0 max when user picks 30', () => {
    const body = buildVideoGenerationRequest(input({ durationSeconds: 30 }))
    expect(body.duration).toBe(15)
  })

  it('allows 30s duration on Seedance 2.5', () => {
    const body = buildVideoGenerationRequest(
      input({ model: 'Doubao-Seedance-2.5', durationSeconds: 30 })
    )
    expect(body.duration).toBe(30)
  })

  it('omits seed when null and includes it when a number is given', () => {
    const noSeed = buildVideoGenerationRequest(input({ seed: null }))
    expect(noSeed.metadata?.seed).toBeUndefined()

    const withSeed = buildVideoGenerationRequest(input({ seed: 42 }))
    expect(withSeed.metadata?.seed).toBe(42)
  })

  it('emits generate_audio=false explicitly when the user disables audio', () => {
    const body = buildVideoGenerationRequest(input({ generateAudio: false }))
    expect(body.metadata?.generate_audio).toBe(false)
  })

  it('emits return_last_frame=true when requested', () => {
    const body = buildVideoGenerationRequest(input({ returnLastFrame: true }))
    expect(body.metadata?.return_last_frame).toBe(true)
  })

  it('drops 1080p from metadata.resolution when any image is present on 2.0', () => {
    const body = buildVideoGenerationRequest(
      input({
        mode: 'referenceGeneration',
        images: [image('i1')],
        resolution: '1080p',
      })
    )
    expect(body.metadata?.resolution).not.toBe('1080p')
  })

  it('does not emit 1080p for Seedance 2.5 even if requested', () => {
    const body = buildVideoGenerationRequest(
      input({ model: 'Doubao-Seedance-2.5', resolution: '1080p' })
    )
    expect(body.metadata?.resolution).not.toBe('1080p')
  })

  it('emits ratio=adaptive as the official enum string', () => {
    const body = buildVideoGenerationRequest(input({ ratio: 'adaptive' }))
    expect(body.metadata?.ratio).toBe('adaptive')
  })

  it('drops content array when only text (no media) is provided', () => {
    const body = buildVideoGenerationRequest(input())
    expect('content' in (body.metadata ?? {})).toBe(false)
  })

  it('keeps content array out of body for empty resources but does not auto-add text', () => {
    // The Go adaptor auto-appends the prompt as a text content item; the
    // frontend must NOT duplicate it, so the serializer never emits a
    // text content item.
    const body = buildVideoGenerationRequest(input())
    const content = (body.metadata?.content ?? []) as Array<{ type: string }>
    expect(content.find((c) => c.type === 'text')).toBeUndefined()
  })

  it('serialises Seedance 2.0 videoEdit with image + video and no invented mode field', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'videoEdit',
        images: [image('i1')],
        videos: [
          {
            id: 'v1',
            kind: 'video',
            source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
            name: 'v.mp4',
            mimeType: 'video/mp4',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
      })
    )
    expect('mode' in body).toBe(false)
    expect(body.metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/i1.png' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/v.mp4' },
        role: 'reference_video',
      },
    ])
  })

  it('serialises Seedance 2.5 videoExtend with all attached reference resources', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'videoExtend',
        images: [image('i1')],
        videos: [
          {
            id: 'v1',
            kind: 'video',
            source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
            name: 'v.mp4',
            mimeType: 'video/mp4',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
        audios: [
          {
            id: 'a1',
            kind: 'audio',
            source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
            name: 'a.wav',
            mimeType: 'audio/wav',
            byteSize: 1000,
            durationSeconds: 5,
          },
        ],
      })
    )
    expect('mode' in body).toBe(false)
    const content = body.metadata?.content ?? []
    expect(
      content.map((item) => ('role' in item ? item.role : item.type))
    ).toEqual(['reference_image', 'reference_video', 'reference_audio'])
  })

  it('throws when firstFrame has an extra video instead of dropping it', () => {
    expect(() =>
      buildVideoGenerationRequest(
        input({
          mode: 'firstFrame',
          images: [image('i1')],
          videos: [
            {
              id: 'v1',
              kind: 'video',
              source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
              name: 'v.mp4',
              mimeType: 'video/mp4',
              byteSize: 1000,
              durationSeconds: 5,
            },
          ],
        })
      )
    ).toThrow()
  })

  it('throws when composition is illegal (e.g. 2.0 audio-only)', () => {
    expect(() =>
      buildVideoGenerationRequest(
        input({
          mode: 'referenceGeneration',
          audios: [
            {
              id: 'a1',
              kind: 'audio',
              source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
              name: 'a.wav',
              mimeType: 'audio/wav',
              byteSize: 1000,
              durationSeconds: 5,
            },
          ],
        })
      )
    ).toThrow()
  })
})

function image(id: string) {
  return {
    id,
    kind: 'image' as const,
    source: { kind: 'url' as const, url: `https://cdn.example.com/${id}.png` },
    name: `${id}.png`,
    mimeType: 'image/png',
    byteSize: 1000,
  }
}

describe('buildGenericVideoGenerationRequest (models without a dedicated profile)', () => {
  function genericImage(id: string, url: string): VideoImageResource {
    return {
      id,
      kind: 'image',
      source: { kind: 'url', url },
      name: `${id}.png`,
      mimeType: 'image/png',
    }
  }

  function genericVideo(id: string): VideoVideoResource {
    return {
      id,
      kind: 'video',
      source: { kind: 'url', url: `https://cdn.example.com/${id}.mp4` },
      name: `${id}.mp4`,
      mimeType: 'video/mp4',
    }
  }

  function genericAudio(id: string): VideoAudioResource {
    return {
      id,
      kind: 'audio',
      source: { kind: 'url', url: `https://cdn.example.com/${id}.wav` },
      name: `${id}.wav`,
      mimeType: 'audio/wav',
    }
  }

  function genericInput(
    overrides: Partial<GenericVideoRequestInput> = {}
  ): GenericVideoRequestInput {
    return {
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
      mode: 'textToVideo',
      images: [],
      videos: [],
      audios: [],
      ...overrides,
    }
  }

  it('sends exactly model and prompt for text-to-video', () => {
    expect(buildGenericVideoGenerationRequest(genericInput())).toEqual({
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
    })
  })

  it('trims the prompt before sending', () => {
    const body = buildGenericVideoGenerationRequest(
      genericInput({ prompt: '  a cat walks on the moon \n' })
    )
    expect(body.prompt).toBe('a cat walks on the moon')
  })

  it('adds only image for image-to-video with one HTTPS reference image', () => {
    const body = buildGenericVideoGenerationRequest(
      genericInput({
        mode: 'firstFrame',
        images: [genericImage('i1', 'https://cdn.example.com/first.png')],
      })
    )
    expect(body).toEqual({
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
      image: 'https://cdn.example.com/first.png',
    })
  })

  it('never emits duration, ratio, resolution, size, metadata or a provider switch', () => {
    const body = buildGenericVideoGenerationRequest(
      genericInput({
        mode: 'firstFrame',
        images: [genericImage('i1', 'https://cdn.example.com/first.png')],
      })
    ) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['image', 'model', 'prompt'])
  })

  it('preserves the exact model id of each Wan3 model', () => {
    expect(
      buildGenericVideoGenerationRequest(
        genericInput({ model: 'wan3.0-video-prime' })
      ).model
    ).toBe('wan3.0-video-prime')
    expect(
      buildGenericVideoGenerationRequest(
        genericInput({ model: 'Wan3.0-Video' })
      ).model
    ).toBe('Wan3.0-Video')
  })

  it('rejects a second reference image instead of silently dropping it', () => {
    expect(() =>
      buildGenericVideoGenerationRequest(
        genericInput({
          mode: 'firstFrame',
          images: [
            genericImage('i1', 'https://cdn.example.com/a.png'),
            genericImage('i2', 'https://cdn.example.com/b.png'),
          ],
        })
      )
    ).toThrow(VideoRequestError)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({
          mode: 'firstFrame',
          images: [
            genericImage('i1', 'https://cdn.example.com/a.png'),
            genericImage('i2', 'https://cdn.example.com/b.png'),
          ],
        })
      )
    } catch (error) {
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.genericAllowsOneReferenceImage'
      )
    }
  })

  it('rejects an attached reference video with a translatable reason', () => {
    expect.assertions(2)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({ videos: [genericVideo('v1')] })
      )
    } catch (error) {
      expect(error).toBeInstanceOf(VideoRequestError)
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.genericForbidsReferenceVideo'
      )
    }
  })

  it('rejects an attached reference audio with a translatable reason', () => {
    expect.assertions(2)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({ audios: [genericAudio('a1')] })
      )
    } catch (error) {
      expect(error).toBeInstanceOf(VideoRequestError)
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.genericForbidsReferenceAudio'
      )
    }
  })

  it('rejects an inlined base64 image', () => {
    expect.assertions(2)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({
          mode: 'firstFrame',
          images: [
            {
              id: 'i1',
              kind: 'image',
              source: {
                kind: 'base64',
                dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
              },
              name: 'inline.png',
              mimeType: 'image/png',
            },
          ],
        })
      )
    } catch (error) {
      expect(error).toBeInstanceOf(VideoRequestError)
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.genericRequiresHttpsImageUrl'
      )
    }
  })

  it.each([
    ['http://cdn.example.com/first.png', 'plain http'],
    ['https://localhost/first.png', 'localhost'],
    ['https://127.0.0.1/first.png', 'loopback address'],
    ['https://192.168.1.20/first.png', 'private address'],
    ['https://user:pass@cdn.example.com/first.png', 'URL credentials'],
    ['asset://video-asset-id', 'asset library id'],
    ['ftp://cdn.example.com/first.png', 'non-https protocol'],
  ])('rejects the unsafe reference image URL %s (%s)', (url) => {
    expect.assertions(1)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({ mode: 'firstFrame', images: [genericImage('i1', url)] })
      )
    } catch (error) {
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.unsafeUrl'
      )
    }
  })

  it('rejects a reference image whose URL does not look like an image', () => {
    expect.assertions(1)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({
          mode: 'firstFrame',
          images: [genericImage('i1', 'https://cdn.example.com/payload.bin')],
        })
      )
    } catch (error) {
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.preflight.unsupportedFormat'
      )
    }
  })

  it('rejects an empty prompt', () => {
    expect.assertions(1)
    try {
      buildGenericVideoGenerationRequest(genericInput({ prompt: '   ' }))
    } catch (error) {
      expect((error as VideoRequestError).reasonKey).toBe('Prompt is required')
    }
  })

  it('refuses to build a generic body for a model that has a dedicated profile', () => {
    expect.assertions(1)
    try {
      buildGenericVideoGenerationRequest(
        genericInput({ model: 'Doubao-Seedance-2.5' })
      )
    } catch (error) {
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.error.unknownVideoModel'
      )
    }
  })
})

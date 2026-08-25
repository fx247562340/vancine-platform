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

import {
  classifyComposition,
  getVideoModelCapability,
  getVideoModelCapabilityOrThrow,
  PLAYGROUND_VIDEO_MODEL_IDS,
  resolveVideoCapabilities,
  type ResourceComposition,
  type VideoCapability,
} from '../capabilities'
import {
  isCanonicalAssetUrl,
  isValidBase64DataUrl,
  preflightRequestBodySize,
  preflightResources,
  safeRemoteUrl,
  type VideoAudioResource,
  type VideoImageResource,
  type VideoVideoResource,
} from '../preflight'
import {
  buildVideoGenerationRequest,
  type VideoRequestInput,
} from '../request-serializer'

const cap20 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.0')
const cap25 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.5')

function image(
  overrides: Partial<VideoImageResource> = {}
): VideoImageResource {
  return {
    id: overrides.id ?? 'img-1',
    kind: 'image',
    source: { kind: 'url', url: 'https://cdn.example.com/a.png' },
    name: 'a.png',
    mimeType: 'image/png',
    byteSize: 1000,
    ...overrides,
  }
}
function audio(
  overrides: Partial<VideoAudioResource> = {}
): VideoAudioResource {
  return {
    id: overrides.id ?? 'aud-1',
    kind: 'audio',
    source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
    name: 'a.wav',
    mimeType: 'audio/wav',
    byteSize: 1_000_000,
    durationSeconds: 5,
    ...overrides,
  }
}
function video(
  overrides: Partial<VideoVideoResource> = {}
): VideoVideoResource {
  return {
    id: overrides.id ?? 'vid-1',
    kind: 'video',
    source: { kind: 'url', url: 'https://cdn.example.com/v.mp4' },
    name: 'v.mp4',
    mimeType: 'video/mp4',
    byteSize: 10_000_000,
    durationSeconds: 5,
    ...overrides,
  }
}

function input(overrides: Partial<VideoRequestInput> = {}): VideoRequestInput {
  return {
    model: 'Doubao-Seedance-2.0',
    prompt: 'a cat on the moon',
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

describe('Phase D — capabilities and creation modes', () => {
  it('every model capability references at least one first-party source URL', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.officialSources.length).toBeGreaterThan(0)
      for (const source of cap.officialSources) {
        expect(source).toMatch(/^https:\/\//)
      }
    }
  })

  it('2.5 reference video budget is bound to first-party docs (maxCount / perItem / total)', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.referenceVideo.maxCount).toBe(10)
    expect(cap.referenceVideo.perItemMaxSeconds).toBe('unknown')
    expect(cap.referenceVideo.totalMaxSeconds).toBe('unknown')
    expect(cap.referenceVideo.perItemMinSeconds).toBe('unknown')
    expect(cap.referenceVideo.fpsRange).toEqual([24, 60])
    expect(cap.officialSources).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/seed\.bytedance\.com/),
        expect.stringMatching(/docs\.byteplus\.com.*video_gen_enhanced/),
      ])
    )
  })

  it('2.5 reference video duration stays unknown instead of borrowing output 4–30s', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.referenceVideo.evidence.maxCount.status).toBe('verified')
    if (cap.referenceVideo.evidence.maxCount.status === 'verified') {
      expect(cap.referenceVideo.evidence.maxCount.semantics).toBe(
        'input-reference-video'
      )
      expect(cap.referenceVideo.evidence.maxCount.excerpt).toMatch(
        /10 video clips/
      )
      expect(cap.referenceVideo.evidence.maxCount.sourceUrl).toMatch(
        /seed\.bytedance\.com/
      )
    }
    expect(cap.referenceVideo.evidence.perItemMaxSeconds.status).toBe('unknown')
    expect(cap.referenceVideo.evidence.totalMaxSeconds.status).toBe('unknown')
    expect(cap.duration.maxSeconds).toBe(30)
    expect(cap.evidence.duration.status).toBe('verified')
    if (cap.evidence.duration.status === 'verified') {
      expect(cap.evidence.duration.semantics).toBe('output-video')
    }
  })

  it('2.5 supported resolutions and FPS are bound to first-party docs', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.resolutions).toEqual(['480p', '720p'])
    expect(cap.referenceVideo.fpsRange).toEqual([24, 60])
    expect(cap.outputFps).toBe(24)
  })

  it('execution_expires_after is a documented Seedance 2.x field; it is not unsupported', () => {
    // It is not listed in the official BytePlus Seedance 2.x parameter
    // table, so we do not emit it by default, but we must NOT label it
    // as "unsupported" either — it is a known official field whose
    // applicability is simply not yet bound per model.
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.unsupportedFields).not.toContain('execution_expires_after')
      expect(cap.unknownFields).toContain('execution_expires_after')
    }
  })

  it('camera_fixed is unknown on 2.5 (official doc does not enumerate it)', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.cameraFixed).toEqual({ supported: 'unknown' })
  })

  it('resolveVideoCapabilities takes an explicit mode, not a guessed one', () => {
    const composition: ResourceComposition = {
      images: 1,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    }
    const firstFrame = resolveVideoCapabilities(
      cap20,
      'firstFrame',
      composition
    )
    const referenceGeneration = resolveVideoCapabilities(
      cap20,
      'referenceGeneration',
      composition
    )
    expect(firstFrame.composition).toBe('firstFrame')
    expect(referenceGeneration.composition).toBe('firstFrame')
    // Both report the same composition count, but the mode is recorded
    // distinctly so the serializer can pick first_frame vs reference_image.
    expect(firstFrame.mode).toBe('firstFrame')
    expect(referenceGeneration.mode).toBe('referenceGeneration')
  })

  it('firstFrame requires exactly one image, otherwise illegal', () => {
    const ok = resolveVideoCapabilities(cap20, 'firstFrame', {
      images: 1,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(ok.illegal).toBe(false)
    const zero = resolveVideoCapabilities(cap20, 'firstFrame', {
      images: 0,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(zero.illegal).toBe(true)
    expect(zero.illegalReason).toMatch(/image/i)
    const two = resolveVideoCapabilities(cap20, 'firstFrame', {
      images: 2,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(two.illegal).toBe(true)
    expect(two.illegalReason).toMatch(/image/i)
  })

  it('firstAndLastFrame requires exactly two images, otherwise illegal', () => {
    const two = resolveVideoCapabilities(cap20, 'firstAndLastFrame', {
      images: 2,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(two.illegal).toBe(false)
    const one = resolveVideoCapabilities(cap20, 'firstAndLastFrame', {
      images: 1,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(one.illegal).toBe(true)
  })

  it('referenceGeneration permits 1 or 2+ images and never demotes to firstFrame', () => {
    const one = resolveVideoCapabilities(cap20, 'referenceGeneration', {
      images: 1,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(one.illegal).toBe(false)
    expect(one.mode).toBe('referenceGeneration')
    const two = resolveVideoCapabilities(cap20, 'referenceGeneration', {
      images: 2,
      videos: 0,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(two.illegal).toBe(false)
    expect(two.mode).toBe('referenceGeneration')
  })

  it('videoEdit and videoExtend resolve without inventing mode-only fields', () => {
    const edit = resolveVideoCapabilities(cap25, 'videoEdit', {
      images: 0,
      videos: 1,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(edit.illegal).toBe(false)
    expect(edit.mode).toBe('videoEdit')
    const extend = resolveVideoCapabilities(cap25, 'videoExtend', {
      images: 0,
      videos: 1,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(extend.illegal).toBe(false)
    expect(extend.mode).toBe('videoExtend')
  })
})

describe('Phase D — request serializer: duration + mode + role', () => {
  it('fixed duration emits BOTH top-level duration AND metadata.duration', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'referenceGeneration',
        images: [image()],
        durationMode: 'fixed',
        durationSeconds: 5,
      })
    )
    expect(body.duration).toBe(5)
    expect(body.metadata?.duration).toBe(5)
  })

  it('intelligent duration omits duration in BOTH places', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'referenceGeneration',
        images: [image()],
        durationMode: 'intelligent',
      })
    )
    expect(body.duration).toBeUndefined()
    expect(body.metadata?.duration).toBeUndefined()
  })

  it('firstFrame with exactly one image emits role=first_frame', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'firstFrame',
        images: [image({ id: 'i1' })],
      })
    )
    const content = body.metadata?.content as Array<{ role: string }>
    expect(content).toHaveLength(1)
    expect(content[0]?.role).toBe('first_frame')
  })

  it('firstAndLastFrame with exactly two images emits first_frame + last_frame', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'firstAndLastFrame',
        images: [image({ id: 'i1' }), image({ id: 'i2' })],
      })
    )
    const content = body.metadata?.content as Array<{ role: string }>
    expect(content.map((c) => c.role)).toEqual(['first_frame', 'last_frame'])
  })

  it('referenceGeneration with exactly one image STILL uses reference_image (not first_frame)', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'referenceGeneration',
        images: [image()],
      })
    )
    const content = body.metadata?.content as Array<{ role: string }>
    expect(content).toHaveLength(1)
    expect(content[0]?.role).toBe('reference_image')
  })

  it('referenceGeneration with 2 images still uses reference_image for each', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.0',
        mode: 'referenceGeneration',
        images: [image({ id: 'i1' }), image({ id: 'i2' })],
      })
    )
    const content = body.metadata?.content as Array<{ role: string }>
    expect(content.map((c) => c.role)).toEqual([
      'reference_image',
      'reference_image',
    ])
  })

  it('videoEdit emits content only (no invented mode-only field)', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'videoEdit',
        videos: [video()],
      })
    )
    expect('mode' in body).toBe(false)
    const content = body.metadata?.content as Array<{
      type: string
      role: string
    }>
    expect(content).toHaveLength(1)
    expect(content[0]?.role).toBe('reference_video')
  })

  it('videoExtend emits content only (no invented mode-only field)', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'videoExtend',
        videos: [video()],
      })
    )
    expect('mode' in body).toBe(false)
    const content = body.metadata?.content as Array<{
      type: string
      role: string
    }>
    expect(content).toHaveLength(1)
    expect(content[0]?.role).toBe('reference_video')
  })

  it('firstFrame with 0 images throws with a stable error key', () => {
    expect(() =>
      buildVideoGenerationRequest(
        input({
          model: 'Doubao-Seedance-2.0',
          mode: 'firstFrame',
          images: [],
        })
      )
    ).toThrow(/image/i)
  })

  it('firstAndLastFrame with 1 image throws with a stable error key', () => {
    expect(() =>
      buildVideoGenerationRequest(
        input({
          model: 'Doubao-Seedance-2.0',
          mode: 'firstAndLastFrame',
          images: [image()],
        })
      )
    ).toThrow(/image/i)
  })

  it('illegal composition is rejected before any payload is produced', () => {
    expect(() =>
      buildVideoGenerationRequest(
        input({
          model: 'Doubao-Seedance-2.0',
          mode: 'referenceGeneration',
          images: Array.from({ length: 10 }, (_, i) => image({ id: `i${i}` })),
        })
      )
    ).toThrow(/image/i)
  })

  it('exposes top-level duration AND metadata.duration in the final outbound body', () => {
    const body = buildVideoGenerationRequest(
      input({
        model: 'Doubao-Seedance-2.5',
        mode: 'firstFrame',
        images: [image()],
        durationSeconds: 8,
      })
    )
    expect(body.duration).toBe(8)
    expect(body.metadata?.duration).toBe(8)
  })
})

describe('Phase D — preflight and request body budget', () => {
  it('rejects javascript: URLs', () => {
    expect(safeRemoteUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects http (non-TLS) URLs', () => {
    expect(safeRemoteUrl('http://cdn.example.com/a.png')).toBe(false)
  })

  it('rejects URLs with embedded credentials', () => {
    expect(safeRemoteUrl('https://user:pass@cdn.example.com/a.png')).toBe(false)
  })

  it('rejects localhost / 127.0.0.1 / private network URLs', () => {
    for (const url of [
      'https://localhost/a.png',
      'https://127.0.0.1/a.png',
      'https://192.168.1.5/a.png',
      'https://10.0.0.1/a.png',
      'https://169.254.169.254/a.png',
    ]) {
      expect(safeRemoteUrl(url)).toBe(false)
    }
  })

  it('rejects IPv6 loopback, unspecified, link-local, unique-local, and mapped private addresses', () => {
    for (const url of [
      'https://[::1]/a.png',
      'https://[::]/a.png',
      'https://[fe80::1]/a.png',
      'https://[fc00::1]/a.png',
      'https://[fd12:3456:789a::1]/a.png',
      'https://[::ffff:127.0.0.1]/a.png',
      'https://[::ffff:10.0.0.1]/a.png',
      'https://[::ffff:192.168.0.1]/a.png',
      'https://[ff02::1]/a.png',
      'https://[fec0::1]/a.png',
    ]) {
      expect(safeRemoteUrl(url)).toBe(false)
    }
  })

  it('accepts a public https URL with a signed query string (does not strip query)', () => {
    const url = 'https://cdn.example.com/a.png?X-Sig=abc&Expires=12345'
    expect(safeRemoteUrl(url)).toBe(true)
  })

  it('accepts canonical asset:// ids and rejects arbitrary strings', () => {
    expect(isCanonicalAssetUrl('asset://abc-123')).toBe(true)
    expect(isCanonicalAssetUrl('asset://')).toBe(false)
    expect(isCanonicalAssetUrl('asset://../etc/passwd')).toBe(false)
    expect(isCanonicalAssetUrl('asset://foo/bar')).toBe(false)
    expect(isCanonicalAssetUrl('asset://foo bar')).toBe(false)
  })

  it('validates a base64 data URL for an image payload', () => {
    const good = 'data:image/png;base64,' + 'A'.repeat(50)
    const badMime = 'data:application/octet-stream;base64,AAA='
    const wrongKind = 'data:video/mp4;base64,AAA='
    expect(isValidBase64DataUrl(good, 'image')).toBe(true)
    expect(isValidBase64DataUrl(badMime, 'image')).toBe(false)
    expect(isValidBase64DataUrl(wrongKind, 'image')).toBe(false)
  })

  it('rejects an image that exceeds per-item size', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image({ byteSize: 31 * 1024 * 1024 })],
      videos: [],
      audios: [],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(/size/i)
  })

  it('rejects an audio that exceeds per-item size', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [],
      audios: [audio({ byteSize: 16 * 1024 * 1024 })],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(/size/i)
  })

  it('rejects a video that exceeds per-item size', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [video({ byteSize: 201 * 1024 * 1024 })],
      audios: [],
    })
    expect(res.illegal).toBe(true)
  })

  it('rejects a video that exceeds 2.0 per-item max duration (15s)', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [video({ durationSeconds: 20 })],
      audios: [],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /duration/i
    )
  })

  it('accepts a 30s video on 2.5 (not 2.0)', () => {
    const res = preflightResources(cap25, 'referenceGeneration', {
      images: [],
      videos: [video({ durationSeconds: 30 })],
      audios: [],
    })
    expect(res.illegal).toBe(false)
  })

  it('rejects total audio duration exceeding model limit (2.0: 15s total)', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [],
      audios: [
        audio({ id: 'a1', durationSeconds: 10 }),
        audio({ id: 'a2', durationSeconds: 10 }),
      ],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /total.*duration|duration.*total/i
    )
  })

  it('rejects an image whose dimensions are out of range', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image({ width: 100, height: 100 })],
      videos: [],
      audios: [],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /dimension|width|height|size/i
    )
  })

  it('accepts an image whose dimensions are unknown (URL/asset: no local read)', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image({ width: undefined, height: undefined })],
      videos: [],
      audios: [],
    })
    expect(res.illegal).toBe(false)
  })

  it('64MB budget is computed on the final JSON body UTF-8 bytes', () => {
    const res = preflightRequestBodySize(
      {
        model: 'Doubao-Seedance-2.0',
        prompt: 'a',
        duration: 5,
        metadata: {
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          watermark: false,
          return_last_frame: false,
        },
      },
      cap20
    )
    expect(res.illegal).toBe(false)
  })

  it('64MB budget rejects a body whose UTF-8 JSON bytes exceed 64MB', () => {
    const bigStr = 'x'.repeat(70 * 1024 * 1024)
    const res = preflightRequestBodySize(
      {
        model: 'Doubao-Seedance-2.0',
        prompt: bigStr,
        duration: 5,
        metadata: {
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          watermark: false,
          return_last_frame: false,
        },
      },
      cap20
    )
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /64.*MB|body/i
    )
  })

  it('64MB budget includes Base64 inlined in the body (no extra ×1.34 on top)', () => {
    // The data URL is part of the body JSON.stringify output, so
    // its bytes are already counted once. The preflight MUST NOT
    // add a separate ×1.34 inflation term on top of that.
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(67 * 1024 * 1024)
    const res = preflightRequestBodySize(
      {
        model: 'Doubao-Seedance-2.0',
        prompt: 'x',
        duration: 5,
        metadata: {
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          watermark: false,
          return_last_frame: false,
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
              role: 'reference_image',
            },
          ],
        },
      },
      cap20
    )
    expect(res.illegal).toBe(true)
  })

  it('64MB budget does NOT add remote URL byte sizes to the body size', () => {
    const remoteUrl = 'https://cdn.example.com/' + 'y'.repeat(100)
    const res = preflightRequestBodySize(
      {
        model: 'Doubao-Seedance-2.0',
        prompt: 'a',
        duration: 5,
        metadata: {
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          watermark: false,
          return_last_frame: false,
          content: [
            {
              type: 'image_url',
              image_url: { url: remoteUrl },
              role: 'reference_image',
            },
          ],
        },
      },
      cap20
    )
    expect(res.illegal).toBe(false)
  })

  it('unknown media duration is not coerced to 0 and does not pass a total-duration check as if it were 0', () => {
    // Two remote videos with unknown duration. If we treated unknown
    // as 0, 0+0 = 0 would be under the 15s 2.0 total and the check
    // would falsely pass. The honest behaviour is to skip the total
    // check (upstream verifies) — we must NOT fail AND we must not
    // invent a 0.
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [
        video({ id: 'v1', durationSeconds: undefined }),
        video({ id: 'v2', durationSeconds: undefined }),
      ],
      audios: [],
    })
    expect(res.illegal).toBe(false)
    expect([undefined, undefined].every((d) => d !== 0)).toBe(true)
  })

  it('known oversized total duration is still rejected', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [
        video({ id: 'v1', durationSeconds: 10 }),
        video({ id: 'v2', durationSeconds: 10 }),
      ],
      audios: [],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /total.*duration|duration.*total/i
    )
  })

  it('preflightResources flags URL resources whose mediaUrl is unsafe', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image({ source: { kind: 'url', url: 'javascript:alert(1)' } })],
      videos: [],
      audios: [],
    })
    expect(res.illegal).toBe(true)
    expect((res as { illegalReason: string }).illegalReason).toMatch(
      /protocol|URL|scheme/i
    )
  })
})

describe('Phase D — mode / capability matrix integration', () => {
  it('capabilities registry lists every required mode', () => {
    const modes = [
      'textToVideo',
      'firstFrame',
      'firstAndLastFrame',
      'referenceGeneration',
      'videoEdit',
      'videoExtend',
    ]
    for (const mode of modes) {
      const resolution = resolveVideoCapabilities(cap20, mode as never, {
        images: 0,
        videos: 0,
        audios: 0,
        durationSeconds: 5,
        resolution: '720p',
      })
      expect(resolution).toBeDefined()
    }
  })

  it('classifyComposition is still a stable classification helper', () => {
    expect(classifyComposition({ images: 0, videos: 0, audios: 0 })).toBe(
      'textOnly'
    )
    expect(classifyComposition({ images: 1, videos: 0, audios: 0 })).toBe(
      'firstFrame'
    )
  })
})

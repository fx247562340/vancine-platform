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
  base64DecodedByteLength,
  isCanonicalAssetUrl,
  parseBase64DataUrl,
  preflightRequestBodySize,
  preflightResources,
  safeRemoteUrl,
} from '../preflight'
import type {
  VideoAudioResource,
  VideoImageResource,
  VideoVideoResource,
} from '../resource-validation'

const cap20 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.0')
const cap25 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.5')

const image: VideoImageResource = {
  id: 'img-1',
  kind: 'image',
  source: { kind: 'url', url: 'https://cdn.example.com/a.png' },
  name: 'a.png',
  mimeType: 'image/png',
}

const audio: VideoAudioResource = {
  id: 'aud-1',
  kind: 'audio',
  source: { kind: 'url', url: 'https://cdn.example.com/a.wav' },
  name: 'a.wav',
  mimeType: 'audio/wav',
  durationSeconds: 5,
}

const video: VideoVideoResource = {
  id: 'vid-1',
  kind: 'video',
  source: { kind: 'url', url: 'https://cdn.example.com/a.mp4' },
  name: 'a.mp4',
  mimeType: 'video/mp4',
  durationSeconds: 5,
}

describe('canonical preflight resource checks', () => {
  it('accepts a public https image URL', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [],
      }).ok
    ).toBe(true)
  })

  it('rejects javascript and http image URLs', () => {
    expect(safeRemoteUrl('javascript:alert(1)')).toBe(false)
    expect(safeRemoteUrl('http://example.com/a.png')).toBe(false)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [
          { ...image, source: { kind: 'url', url: 'javascript:alert(1)' } },
        ],
        videos: [],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('keeps remote URL and asset byteSize unknown and skips per-item size limits', () => {
    expect(image.byteSize).toBeUndefined()
    expect(audio.byteSize).toBeUndefined()
    expect(video.byteSize).toBeUndefined()
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [],
      }).ok
    ).toBe(true)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [{ ...video, source: { kind: 'asset', assetId: 'abc-123' } }],
        audios: [],
      }).ok
    ).toBe(true)
    expect(
      preflightResources(cap25, 'referenceGeneration', {
        images: [],
        videos: [],
        audios: [audio],
      }).ok
    ).toBe(true)
  })

  it('still enforces per-item size when a local byteSize is measured', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [{ ...image, byteSize: 31 * 1024 * 1024 }],
        videos: [],
        audios: [],
      }).ok
    ).toBe(false)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [{ ...audio, byteSize: 16 * 1024 * 1024 }],
      }).ok
    ).toBe(false)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [{ ...video, byteSize: 201 * 1024 * 1024 }],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('rejects oversize images', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [{ ...image, byteSize: 31 * 1024 * 1024 }],
        videos: [],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('rejects 2.0 audio shorter than 2s or longer than 15s', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [{ ...audio, durationSeconds: 1 }],
      }).ok
    ).toBe(false)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [{ ...audio, durationSeconds: 30 }],
      }).ok
    ).toBe(false)
  })

  it('accepts 30s audio on Seedance 2.5', () => {
    expect(
      preflightResources(cap25, 'referenceGeneration', {
        images: [],
        videos: [],
        audios: [{ ...audio, durationSeconds: 30 }],
      }).ok
    ).toBe(true)
  })

  it('rejects 2.0 video longer than 15s', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [{ ...video, durationSeconds: 20 }],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('rejects http video URLs', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [
          {
            ...video,
            source: { kind: 'url', url: 'http://example.com/a.mp4' },
          },
        ],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('accepts canonical asset ids and rejects arbitrary asset strings', () => {
    expect(isCanonicalAssetUrl('asset://abc-123')).toBe(true)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [
          {
            ...video,
            source: { kind: 'asset', assetId: 'abc-123' },
          },
        ],
        audios: [],
      }).ok
    ).toBe(true)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [
          {
            ...video,
            source: { kind: 'asset', assetId: '../etc/passwd' },
          },
        ],
        audios: [],
      }).ok
    ).toBe(false)
  })

  it('rejects an image base64 payload over the per-item limit using a shrunk capability', () => {
    // Small capability: a few dozen bytes. Small payload keeps the test fast.
    const tinyImageCap = {
      ...cap20,
      referenceImage: { ...cap20.referenceImage, perItemMaxBytes: 16 },
    }
    const payload = 'data:image/png;base64,' + 'A'.repeat(40) // 30 decoded bytes
    const res = preflightResources(tinyImageCap, 'referenceGeneration', {
      images: [
        {
          id: 'img-b64',
          kind: 'image',
          source: { kind: 'base64', dataUrl: payload },
          name: 'big.png',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
        },
      ],
      videos: [],
      audios: [],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.illegalReason).toBe(
        'videoPlayground.preflight.imageSizeTooLarge'
      )
    }
  })

  it('rejects an audio base64 payload over the per-item limit even when byteSize is forged', () => {
    const tinyAudioCap = {
      ...cap20,
      referenceAudio: { ...cap20.referenceAudio, perItemMaxBytes: 16 },
    }
    const payload = 'data:audio/wav;base64,' + 'A'.repeat(40) // 30 decoded bytes
    const res = preflightResources(tinyAudioCap, 'referenceGeneration', {
      images: [image],
      videos: [],
      audios: [
        {
          id: 'aud-b64',
          kind: 'audio',
          source: { kind: 'base64', dataUrl: payload },
          name: 'big.wav',
          mimeType: 'audio/wav',
          byteSize: 1,
          durationSeconds: 5,
        },
      ],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.illegalReason).toBe(
        'videoPlayground.preflight.audioSizeTooLarge'
      )
    }
  })

  it('parses valid padded and unpadded base64 with the canonical parser', () => {
    expect(parseBase64DataUrl('data:image/png;base64,AAAA')).toEqual({
      mime: 'image/png',
      decodedBytes: 3,
    })
    expect(parseBase64DataUrl('data:image/png;base64,AAA=')).toEqual({
      mime: 'image/png',
      decodedBytes: 2,
    })
    expect(parseBase64DataUrl('data:image/png;base64,AA==')).toEqual({
      mime: 'image/png',
      decodedBytes: 1,
    })
    expect(parseBase64DataUrl('data:image/png;base64,AAA')).toEqual({
      mime: 'image/png',
      decodedBytes: 2,
    })
    expect(parseBase64DataUrl('data:image/png;base64,AA')).toEqual({
      mime: 'image/png',
      decodedBytes: 1,
    })
  })

  it('rejects malformed, padded, URL-safe, or whitespace base64 payloads', () => {
    for (const payload of [
      'A', // length % 4 === 1
      '====', // empty payload with padding
      'AA=A', // internal padding
      'AAAA=', // length % 4 === 1 with padding
      'AA===', // excess padding
      'AA==BB', // chars after padding
      'AA BB', // whitespace
      'AA\nBB', // newline
      'A-A_', // URL-safe variants
      '', // empty
      'AAAA AA', // internal whitespace
    ]) {
      expect(parseBase64DataUrl(`data:image/png;base64,${payload}`)).toBeNull()
      expect(
        base64DecodedByteLength(`data:image/png;base64,${payload}`)
      ).toBeNull()
    }
  })

  it('rejects a base64 image without measured dimensions', () => {
    const ok = 'data:image/png;base64,AAAA'
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [
        {
          id: 'img-b64',
          kind: 'image',
          source: { kind: 'base64', dataUrl: ok },
          name: 'a.png',
          mimeType: 'image/png',
        },
      ],
      videos: [],
      audios: [],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.illegalReason).toBe(
        'videoPlayground.preflight.imageDimensionsUnknown'
      )
    }
  })

  it('rejects a base64 audio without measured duration', () => {
    const ok = 'data:audio/wav;base64,AAAA'
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image],
      videos: [],
      audios: [
        {
          id: 'aud-b64',
          kind: 'audio',
          source: { kind: 'base64', dataUrl: ok },
          name: 'a.wav',
          mimeType: 'audio/wav',
        },
      ],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.illegalReason).toBe(
        'videoPlayground.preflight.audioDurationUnknown'
      )
    }
  })

  it('rejects an https .svg URL even when mimeType claims image/png', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [
        {
          id: 'img-svg',
          kind: 'image',
          source: { kind: 'url', url: 'https://cdn.example.com/a.svg' },
          name: 'a.svg',
          mimeType: 'image/png',
          byteSize: undefined,
        },
      ],
      videos: [],
      audios: [],
    })
    expect(res.ok).toBe(false)
  })

  it('rejects data:image/svg+xml even when mimeType claims image/png', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [
        {
          id: 'img-svg',
          kind: 'image',
          source: {
            kind: 'base64',
            dataUrl: 'data:image/svg+xml;base64,AAAA',
          },
          name: 'a.svg',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
        },
      ],
      videos: [],
      audios: [],
    })
    expect(res.ok).toBe(false)
  })

  it('rejects data:audio/ogg even when mimeType claims audio/wav', () => {
    const res = preflightResources(cap20, 'referenceGeneration', {
      images: [image],
      videos: [],
      audios: [
        {
          id: 'aud-ogg',
          kind: 'audio',
          source: { kind: 'base64', dataUrl: 'data:audio/ogg;base64,AAAA' },
          name: 'a.ogg',
          mimeType: 'audio/wav',
          durationSeconds: 5,
        },
      ],
    })
    expect(res.ok).toBe(false)
  })

  it('does not regress valid PNG, WAV, and MP4 resources', () => {
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [
          {
            id: 'img-png',
            kind: 'image',
            source: { kind: 'base64', dataUrl: 'data:image/png;base64,AAAA' },
            name: 'a.png',
            mimeType: 'image/png',
            width: 1024,
            height: 1024,
          },
        ],
        videos: [],
        audios: [],
      }).ok
    ).toBe(true)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [image],
        videos: [],
        audios: [
          {
            id: 'aud-wav',
            kind: 'audio',
            source: { kind: 'base64', dataUrl: 'data:audio/wav;base64,AAAA' },
            name: 'a.wav',
            mimeType: 'audio/wav',
            durationSeconds: 5,
          },
        ],
      }).ok
    ).toBe(true)
    expect(
      preflightResources(cap20, 'referenceGeneration', {
        images: [],
        videos: [
          {
            id: 'vid-mp4',
            kind: 'video',
            source: { kind: 'url', url: 'https://cdn.example.com/a.mp4' },
            name: 'a.mp4',
            mimeType: 'video/mp4',
            durationSeconds: 5,
          },
        ],
        audios: [],
      }).ok
    ).toBe(true)
  })

  it('keeps URL and asset resources unknown-sized and defers to upstream', () => {
    const imageRes = preflightResources(cap20, 'referenceGeneration', {
      images: [image],
      videos: [],
      audios: [],
    })
    const assetRes = preflightResources(cap20, 'referenceGeneration', {
      images: [],
      videos: [{ ...video, source: { kind: 'asset', assetId: 'abc-123' } }],
      audios: [],
    })
    expect(imageRes.ok).toBe(true)
    expect(assetRes.ok).toBe(true)
    expect(image.byteSize).toBeUndefined()
  })

  it('counts 64MB against the final JSON body, not a separate byteSize sum', () => {
    const small = preflightRequestBodySize(
      { model: 'Doubao-Seedance-2.0', prompt: 'a cat' },
      cap20
    )
    expect(small.ok).toBe(true)
    const huge = preflightRequestBodySize(
      { model: 'x', prompt: 'y'.repeat(65 * 1024 * 1024) },
      cap20
    )
    expect(huge.ok).toBe(false)
  })
})

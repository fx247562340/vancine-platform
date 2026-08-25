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
  BYTEPLUS_VIDEO_GEN_ENHANCED,
  BYTEDANCE_SEEDANCE_25_LAUNCH,
  classifyComposition,
  getVideoModelCapability,
  PLAYGROUND_VIDEO_MODEL_IDS,
  resolveVideoCapabilities,
  type FieldEvidence,
  type VideoResolution,
  type VideoCapability,
} from '../capabilities'
import { findModeEntry } from '../contract'
import type { CreationMode } from '../mode'

const cap20 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.0')
const cap25 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.5')

function getVideoModelCapabilityOrThrow(id: string) {
  const cap = getVideoModelCapability(id)
  if (!cap) throw new Error(`unknown model ${id}`)
  return cap
}

describe('video-playground capabilities registry (literal contract)', () => {
  it('exposes both Vancine public model ids', () => {
    expect(PLAYGROUND_VIDEO_MODEL_IDS).toEqual([
      'Doubao-Seedance-2.0',
      'Doubao-Seedance-2.5',
    ])
  })

  it('returns a capability profile for each known model', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.publicModelId).toBe(id)
      expect(cap.officialModelId).toMatch(/^dreamina-seedance-/)
      expect(cap.officialSources.length).toBeGreaterThan(0)
    }
  })

  it('keeps the Seedance 2.0 official id stable', () => {
    expect(
      getVideoModelCapabilityOrThrow('Doubao-Seedance-2.0').officialModelId
    ).toBe('dreamina-seedance-2-0-260128')
  })

  it('keeps the Seedance 2.5 official id stable', () => {
    expect(
      getVideoModelCapabilityOrThrow('Doubao-Seedance-2.5').officialModelId
    ).toBe('dreamina-seedance-2-5-260628')
  })

  it('matches the official Seedance 2.0 resolution and duration limits', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    expect(cap.resolutions).toEqual(['480p', '720p', '1080p', '4k'])
    expect(cap.duration).toEqual({ minSeconds: 4, maxSeconds: 15 })
  })

  it('matches the official Seedance 2.5 resolution and duration limits', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.resolutions).toEqual(['480p', '720p'])
    expect(cap.duration).toEqual({ minSeconds: 4, maxSeconds: 30 })
  })

  it('matches the official aspect-ratio list for both models', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.ratios).toEqual([
        '16:9',
        '4:3',
        '1:1',
        '3:4',
        '9:16',
        '21:9',
        'adaptive',
      ])
    }
  })

  it('matches the official reference image budget per model', () => {
    const cap20 = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    const cap25 = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap20.referenceImage.multimodalMax).toBe(9)
    expect(cap25.referenceImage.multimodalMax).toBe(30)
  })

  it('matches the official reference video budget per model with first-party sources', () => {
    const cap20 = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    const cap25 = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap20.referenceVideo.maxCount).toBe(3)
    expect(cap20.referenceVideo.perItemMaxSeconds).toBe(15)
    expect(cap20.referenceVideo.totalMaxSeconds).toBe(15)
    expect(cap20.referenceVideo.perItemMinSeconds).toBe(2)
    expect(cap20.referenceVideo.perItemMaxBytes).toBe(200 * 1024 * 1024)
    expect(cap20.referenceVideo.supportedFormats).toEqual([
      'video/mp4',
      'video/quicktime',
    ])
    expect(cap20.referenceVideo.fpsRange).toEqual([24, 60])
    expectVerifiedInputVideo(cap20.referenceVideo.evidence.maxCount, {
      field: 'referenceVideo.maxCount',
      model: 'Doubao-Seedance-2.0',
      excerpt: 'up to 3 reference videos',
      sourceUrl: BYTEPLUS_VIDEO_GEN_ENHANCED,
    })

    expect(cap25.referenceVideo.maxCount).toBe(10)
    expect(cap25.referenceVideo.perItemMaxSeconds).toBe('unknown')
    expect(cap25.referenceVideo.totalMaxSeconds).toBe('unknown')
    expect(cap25.referenceVideo.perItemMinSeconds).toBe('unknown')
    expectVerifiedInputVideo(cap25.referenceVideo.evidence.maxCount, {
      field: 'referenceVideo.maxCount',
      model: 'Doubao-Seedance-2.5',
      excerpt: '10 video clips',
      sourceUrl: BYTEDANCE_SEEDANCE_25_LAUNCH,
    })
    expect(cap25.referenceVideo.evidence.perItemMinSeconds.status).toBe(
      'unknown'
    )
    expect(cap25.referenceVideo.evidence.perItemMaxSeconds.status).toBe(
      'unknown'
    )
    expect(cap25.referenceVideo.evidence.totalMaxSeconds.status).toBe('unknown')
  })

  it('matches the official reference audio budget per model with first-party sources', () => {
    const cap20 = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    const cap25 = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap20.referenceAudio.maxCount).toBe(3)
    expect(cap20.referenceAudio.perItemMaxSeconds).toBe(15)
    expect(cap20.referenceAudio.totalMaxSeconds).toBe(15)
    expect(cap20.referenceAudio.audioOnlyAllowed).toBe(false)
    expect(cap25.referenceAudio.maxCount).toBe(10)
    expect(cap25.referenceAudio.perItemMaxSeconds).toBe(30)
    expect(cap25.referenceAudio.totalMaxSeconds).toBe(30)
    expect(cap25.referenceAudio.audioOnlyAllowed).toBe(true)
    expectVerifiedInputAudio(cap25.referenceAudio.evidence.audioOnlyAllowed, {
      field: 'referenceAudio.audioOnlyAllowed',
      model: 'Doubao-Seedance-2.5',
      excerpt: 'supports inputting audio alone',
      sourceUrl: BYTEPLUS_VIDEO_GEN_ENHANCED,
    })
    expectVerifiedInputAudio(cap25.referenceAudio.evidence.perItemMaxBytes, {
      field: 'referenceAudio.perItemMaxBytes',
      model: 'Doubao-Seedance-2.5',
      excerpt: 'Each audio file must not exceed 15 MB',
      sourceUrl: BYTEPLUS_VIDEO_GEN_ENHANCED,
    })
  })

  it('exposes only MP4 / 24 FPS for both models', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.outputFormat).toBe('mp4')
      expect(cap.outputFps).toBe(24)
    }
  })

  it('reports 64 MB request body limit for both models', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.requestBodyLimitBytes).toBe(64 * 1024 * 1024)
    }
  })

  it('disables camera_fixed for Seedance 2.0', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    expect(cap.cameraFixed).toEqual({ supported: false })
  })

  it('reports camera_fixed as unknown for Seedance 2.5', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.5'
    ) as VideoCapability
    expect(cap.cameraFixed).toEqual({ supported: 'unknown' })
  })

  it('enables generate_audio, seed, watermark, return_last_frame for both models', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.generateAudio).toEqual({ supported: true, default: true })
      expect(cap.seed).toEqual({ supported: true })
      expect(cap.watermark).toEqual({ supported: true, default: false })
      expect(cap.returnLastFrame).toEqual({ supported: true, default: false })
    }
  })

  it('treats frames as unknown for both models', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.frames).toEqual({ supported: 'unknown' })
    }
  })

  it('exposes the official content role vocabulary', () => {
    for (const id of PLAYGROUND_VIDEO_MODEL_IDS) {
      const cap = getVideoModelCapability(id) as VideoCapability
      expect(cap.contentRoles).toEqual({
        firstFrame: 'first_frame',
        lastFrame: 'last_frame',
        referenceImage: 'reference_image',
        referenceVideo: 'reference_video',
        referenceAudio: 'reference_audio',
      })
    }
  })

  it('forbids 1080p for Seedance 2.0 when any image is present', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    const hasImage = { images: 1, videos: 0, audios: 0 }
    const isAllowed = (r: VideoResolution) =>
      !cap.resolutionRestrictions.find(
        (rule) => rule.resolution === r && rule.when(hasImage) && !rule.allow
      )
    expect(isAllowed('1080p')).toBe(false)
    expect(isAllowed('720p')).toBe(true)
    expect(isAllowed('480p')).toBe(true)
    expect(isAllowed('4k')).toBe(true)
  })

  it('keeps 1080p available on Seedance 2.0 when only video is provided (no images)', () => {
    const cap = getVideoModelCapability(
      'Doubao-Seedance-2.0'
    ) as VideoCapability
    const resolved = resolveVideoCapabilities(cap, 'referenceGeneration', {
      images: 0,
      videos: 1,
      audios: 0,
      durationSeconds: 5,
      resolution: '720p',
    })
    expect(resolved.resolutions).toEqual(['480p', '720p', '1080p', '4k'])
  })

  it('returns undefined for an unknown public model id', () => {
    expect(
      getVideoModelCapability('Doubao-Seedance-3.0' as never)
    ).toBeUndefined()
  })

  it('classifyComposition returns textOnly for no resources', () => {
    expect(classifyComposition({ images: 0, videos: 0, audios: 0 })).toBe(
      'textOnly'
    )
  })

  it('classifyComposition returns audioOnly for audio-only on 2.0 (illegal) but 2.5 (legal)', () => {
    expect(classifyComposition({ images: 0, videos: 0, audios: 1 })).toBe(
      'audioOnly'
    )
  })

  it('every supported mode can be resolved against both models', () => {
    const modes: CreationMode[] = [
      'textToVideo',
      'firstFrame',
      'firstAndLastFrame',
      'referenceGeneration',
      'videoEdit',
      'videoExtend',
    ]
    for (const mode of modes) {
      for (const cap of [cap20, cap25]) {
        const resolved = resolveVideoCapabilities(cap, mode, {
          images: 0,
          videos: 0,
          audios: 0,
          durationSeconds: 5,
          resolution: '720p',
        })
        expect(resolved).toBeDefined()
        expect(resolved.mode).toBe(mode)
      }
    }
  })

  it('supports videoEdit and videoExtend on both Seedance 2.0 and 2.5', () => {
    expect(findModeEntry('videoEdit').isModeSupportedFor(cap20)).toBe(true)
    expect(findModeEntry('videoExtend').isModeSupportedFor(cap20)).toBe(true)
    expect(findModeEntry('videoEdit').isModeSupportedFor(cap25)).toBe(true)
    expect(findModeEntry('videoExtend').isModeSupportedFor(cap25)).toBe(true)
  })

  it('rejects extra video or audio on firstFrame instead of dropping them', () => {
    expect(
      findModeEntry('firstFrame').isCompositionLegal({
        images: 1,
        videos: 1,
        audios: 0,
      })
    ).toBe('videoPlayground.preflight.firstFrameForbidsExtraResources')
  })

  it('keeps output FPS evidence separate from input reference-video FPS', () => {
    const inputFps = cap20.referenceVideo.evidence.fpsRange
    const outputFps = cap20.evidence.outputFps
    expect(inputFps.status).toBe('verified')
    expect(outputFps.status).toBe('verified')
    if (inputFps.status === 'verified' && outputFps.status === 'verified') {
      expect(inputFps.semantics).toBe('input-reference-video')
      expect(outputFps.semantics).toBe('output-video')
      expect(inputFps.excerpt).toMatch(/\[24, 60\]/)
      expect(outputFps.excerpt).toMatch(/24 fps/)
      expect(inputFps.field).not.toBe(outputFps.field)
    }
  })

  it('does not reuse video evidence objects for audio fields', () => {
    const audioBytes = cap25.referenceAudio.evidence.perItemMaxBytes
    const videoBytes = cap25.referenceVideo.evidence.perItemMaxBytes
    expect(audioBytes).not.toBe(videoBytes)
    expect(audioBytes.status).toBe('verified')
    expect(videoBytes.status).toBe('verified')
    if (audioBytes.status === 'verified' && videoBytes.status === 'verified') {
      expect(audioBytes.semantics).toBe('input-reference-audio')
      expect(videoBytes.semantics).toBe('input-reference-video')
      expect(audioBytes.excerpt).toMatch(/audio file/)
      expect(audioBytes.excerpt).not.toMatch(/200 MB/)
      expect(videoBytes.excerpt).toMatch(/200 MB/)
    }
  })

  it('does not treat Seedance 2.5 output 4–30s as input reference-video duration', () => {
    expect(cap25.duration).toEqual({ minSeconds: 4, maxSeconds: 30 })
    expect(cap25.evidence.duration.status).toBe('verified')
    if (cap25.evidence.duration.status === 'verified') {
      expect(cap25.evidence.duration.semantics).toBe('output-video')
    }
    expect(cap25.referenceVideo.perItemMaxSeconds).toBe('unknown')
    expect(cap25.referenceVideo.evidence.perItemMaxSeconds.status).toBe(
      'unknown'
    )
    if (cap25.referenceVideo.evidence.perItemMaxSeconds.status === 'unknown') {
      expect(cap25.referenceVideo.evidence.perItemMaxSeconds.reason).toMatch(
        /mislabeled/
      )
      expect(
        cap25.referenceVideo.evidence.perItemMaxSeconds.reason
      ).not.toMatch(/4–30 seconds is an input/)
    }
  })
})

function expectVerifiedInputVideo(
  evidence: FieldEvidence,
  expected: {
    field: string
    model: string
    excerpt: string
    sourceUrl: string
  }
) {
  expect(evidence.status).toBe('verified')
  if (evidence.status !== 'verified') return
  expect(evidence.field).toBe(expected.field)
  expect(evidence.model).toBe(expected.model)
  expect(evidence.semantics).toBe('input-reference-video')
  expect(evidence.sourceUrl).toBe(expected.sourceUrl)
  expect(evidence.excerpt).toContain(expected.excerpt)
}

function expectVerifiedInputAudio(
  evidence: FieldEvidence,
  expected: {
    field: string
    model: string
    excerpt: string
    sourceUrl: string
  }
) {
  expect(evidence.status).toBe('verified')
  if (evidence.status !== 'verified') return
  expect(evidence.field).toBe(expected.field)
  expect(evidence.model).toBe(expected.model)
  expect(evidence.semantics).toBe('input-reference-audio')
  expect(evidence.sourceUrl).toBe(expected.sourceUrl)
  expect(evidence.excerpt).toContain(expected.excerpt)
}

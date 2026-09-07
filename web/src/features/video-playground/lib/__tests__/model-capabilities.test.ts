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
 * The capability table is the single source of truth for what the studio offers,
 * so every number the dropdowns can produce is pinned here.
 */
import { describe, expect, it } from 'vitest'

import {
  availableResolutions,
  DEFAULT_VIDEO_DURATION_SECONDS,
  defaultDurationSeconds,
  highestAvailableResolution,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_MIME_TYPES,
  resolutionLabel,
  resolveVideoModelCapability,
} from '../model-capabilities'

const PRODUCTION_MODELS = [
  'wan3.0-video',
  'wan3.0-video-prime',
  'MiniMax-H3',
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.5',
] as const

function everySecond(min: number, max: number): number[] {
  const out: number[] = []
  for (let seconds = min; seconds <= max; seconds += 1) {
    out.push(seconds)
  }
  return out
}

describe('resolveVideoModelCapability', () => {
  it('offers every integer second from 2 to 30 for both Wan3 models', () => {
    for (const modelId of ['wan3.0-video', 'wan3.0-video-prime']) {
      expect(resolveVideoModelCapability(modelId).durations).toEqual(
        everySecond(2, 30)
      )
    }
  })

  it('offers every integer second from 4 to 15 for MiniMax-H3 and Seedance 2.0', () => {
    expect(resolveVideoModelCapability('MiniMax-H3').durations).toEqual(
      everySecond(4, 15)
    )
    expect(
      resolveVideoModelCapability('Doubao-Seedance-2.0').durations
    ).toEqual(everySecond(4, 15))
  })

  it('offers every integer second from 4 to 30 for Seedance 2.5', () => {
    expect(
      resolveVideoModelCapability('Doubao-Seedance-2.5').durations
    ).toEqual(everySecond(4, 30))
  })

  it('offers the exact resolution tiers each vendor documents', () => {
    expect(resolveVideoModelCapability('wan3.0-video').resolutions).toEqual([
      '480P',
      '720P',
      '1080P',
    ])
    expect(
      resolveVideoModelCapability('wan3.0-video-prime').resolutions
    ).toEqual(['480P', '720P', '1080P'])
    expect(resolveVideoModelCapability('MiniMax-H3').resolutions).toEqual([
      '768P',
      '2K',
    ])
    expect(
      resolveVideoModelCapability('Doubao-Seedance-2.0').resolutions
    ).toEqual(['480p', '720p', '1080p', '4k'])
    expect(
      resolveVideoModelCapability('Doubao-Seedance-2.5').resolutions
    ).toEqual(['480p', '720p', '1080p'])
  })

  it('defaults every production model to five seconds', () => {
    expect(DEFAULT_VIDEO_DURATION_SECONDS).toBe(5)
    for (const modelId of PRODUCTION_MODELS) {
      expect(defaultDurationSeconds(resolveVideoModelCapability(modelId))).toBe(
        5
      )
    }
  })

  it('defaults every production model to its highest resolution', () => {
    const expected: Record<string, string> = {
      'wan3.0-video': '1080P',
      'wan3.0-video-prime': '1080P',
      'MiniMax-H3': '2K',
      'Doubao-Seedance-2.0': '4k',
      'Doubao-Seedance-2.5': '1080p',
    }
    for (const modelId of PRODUCTION_MODELS) {
      expect(
        highestAvailableResolution(resolveVideoModelCapability(modelId), 0)
      ).toBe(expected[modelId])
    }
  })

  it('caps reference images per model, including the tighter Vancine cap for MiniMax-H3', () => {
    const expected: Record<string, number> = {
      'wan3.0-video': 10,
      'wan3.0-video-prime': 10,
      // The upstream accepts nine; Vancine stops at five so a request never
      // enters the billed input-image tier.
      'MiniMax-H3': 5,
      'Doubao-Seedance-2.0': 9,
      'Doubao-Seedance-2.5': 30,
    }
    for (const modelId of PRODUCTION_MODELS) {
      expect(resolveVideoModelCapability(modelId).maxReferenceImages).toBe(
        expected[modelId]
      )
    }
  })

  it('looks models up by exact id and never normalizes case or spacing', () => {
    for (const modelId of ['MINIMAX-H3', 'minimax-h3', ' wan3.0-video']) {
      expect(resolveVideoModelCapability(modelId).known).toBe(false)
    }
    expect(resolveVideoModelCapability('MiniMax-H3').known).toBe(true)
  })
})

describe('availableResolutions', () => {
  it('hides 1080p for Seedance 2.0 once a reference image is attached', () => {
    const capability = resolveVideoModelCapability('Doubao-Seedance-2.0')
    expect(availableResolutions(capability, 0)).toEqual([
      '480p',
      '720p',
      '1080p',
      '4k',
    ])
    expect(availableResolutions(capability, 1)).toEqual(['480p', '720p', '4k'])
    expect(availableResolutions(capability, 9)).toEqual(['480p', '720p', '4k'])
  })

  it('converges Seedance 2.0 to 4k, the highest tier still legal with images', () => {
    const capability = resolveVideoModelCapability('Doubao-Seedance-2.0')
    expect(highestAvailableResolution(capability, 1)).toBe('4k')
  })

  it('keeps every Seedance 2.5 tier with reference images and never offers 4k', () => {
    const capability = resolveVideoModelCapability('Doubao-Seedance-2.5')
    expect(availableResolutions(capability, 30)).toEqual([
      '480p',
      '720p',
      '1080p',
    ])
    expect(capability.resolutions).not.toContain('4k')
    expect(JSON.stringify(capability)).not.toContain('4k')
  })

  it('keeps every tier for models with no reference-image restriction', () => {
    for (const modelId of [
      'wan3.0-video',
      'wan3.0-video-prime',
      'MiniMax-H3',
    ]) {
      const capability = resolveVideoModelCapability(modelId)
      expect(availableResolutions(capability, 1)).toEqual(
        capability.resolutions
      )
    }
  })
})

describe('the safe default for a model with no capability entry', () => {
  const unknown = resolveVideoModelCapability('some-future-video-model')

  it('reports itself unverified with no wire contract to serialize into', () => {
    expect(unknown.known).toBe(false)
    expect(unknown.wire).toBeNull()
  })

  it('offers no duration and no resolution, so both selects fall back to Default', () => {
    expect(unknown.durations).toEqual([])
    expect(unknown.resolutions).toEqual([])
    expect(availableResolutions(unknown, 0)).toEqual([])
    expect(highestAvailableResolution(unknown, 0)).toBeNull()
    expect(defaultDurationSeconds(unknown)).toBeNull()
  })

  it('accepts no reference images at all', () => {
    expect(unknown.maxReferenceImages).toBe(0)
  })

  it('keeps the server-supplied model id verbatim', () => {
    expect(unknown.modelId).toBe('some-future-video-model')
  })

  it('does not borrow another model capability from a name substring', () => {
    for (const modelId of [
      'Doubao-Seedance-2.5-experimental',
      'wan3.0-video-turbo',
      'MiniMax-H3-fast',
      'prefix-wan3.0-video',
    ]) {
      const resolved = resolveVideoModelCapability(modelId)
      expect(resolved.known, modelId).toBe(false)
      expect(resolved.durations, modelId).toEqual([])
      expect(resolved.resolutions, modelId).toEqual([])
      expect(resolved.maxReferenceImages, modelId).toBe(0)
    }
  })
})

describe('resolutionLabel', () => {
  it('shows the conventional 4K spelling for the Seedance 4k tier', () => {
    const capability = resolveVideoModelCapability('Doubao-Seedance-2.0')
    expect(resolutionLabel(capability, '4k')).toBe('4K')
  })

  it('shows every other tier exactly as it goes on the wire', () => {
    const capability = resolveVideoModelCapability('Doubao-Seedance-2.0')
    for (const value of ['480p', '720p', '1080p']) {
      expect(resolutionLabel(capability, value)).toBe(value)
    }
    const wan3 = resolveVideoModelCapability('wan3.0-video')
    for (const value of ['480P', '720P', '1080P']) {
      expect(resolutionLabel(wan3, value)).toBe(value)
    }
    const h3 = resolveVideoModelCapability('MiniMax-H3')
    expect(resolutionLabel(h3, '2K')).toBe('2K')
    expect(resolutionLabel(h3, '768P')).toBe('768P')
  })
})

describe('the shared reference-image input rules', () => {
  it('allows only JPEG, PNG and WebP and caps each image at 10 MB', () => {
    expect(REFERENCE_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    expect(MAX_REFERENCE_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })
})

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
import { describe, expect, it } from 'vitest'

import enDocsRaw from '../../i18n/locales/en.json'
import {
  ALL_MODEL_SLUGS,
  getModelEntry,
  getModelEntryByModelId,
  getImageContract,
} from '../model-registry'

const enDocs = enDocsRaw as unknown as {
  modelDetail: {
    in: {
      qwen30: { thinking: string; agentRefs: string }
    }
  }
}

// Tests for the model registry: the single source of truth that the
// /docs/models/<slug> detail pages and the /docs/image / /docs/video
// overviews both depend on. The registry must always reflect the
// currently online models and the verified production contracts.

describe('Docs media model registry', () => {
  it('exposes exactly ten verified entries (five image, five video)', () => {
    expect(ALL_MODEL_SLUGS).toHaveLength(10)
  })

  it('image slugs are five: qwen, wan, and doubao-seedream', () => {
    const imageSlugs = ALL_MODEL_SLUGS.filter((slug) => {
      const entry = getModelEntry(slug)
      return entry?.modality === 'image'
    })
    expect(imageSlugs).toEqual([
      'qwen-image-3.0',
      'qwen-image-3.0-pro',
      'wan2.7-image-pro',
      'doubao-seedream-5.0-pro',
      'doubao-seedream-5.0-lite',
    ])
  })

  it('video slugs are five: wan3 (×2), minimax-h3, doubao-seedance (×2)', () => {
    const videoSlugs = ALL_MODEL_SLUGS.filter((slug) => {
      const entry = getModelEntry(slug)
      return entry?.modality === 'video'
    })
    expect(videoSlugs).toEqual([
      'wan3.0-video',
      'wan3.0-video-prime',
      'minimax-h3',
      'doubao-seedance-2.0',
      'doubao-seedance-2.5',
    ])
  })

  it('preserves the exact case-sensitive model id for every entry', () => {
    // The wire contract is case-sensitive: a doc page that prints
    // `minimax-h3` instead of `MiniMax-H3` is a real bug. The
    // registry must always surface the live spelling.
    const checks: Array<[string, string]> = [
      ['qwen-image-3.0', 'qwen-image-3.0'],
      ['qwen-image-3.0-pro', 'qwen-image-3.0-pro'],
      ['wan2.7-image-pro', 'wan2.7-image-pro'],
      ['doubao-seedream-5.0-pro', 'Doubao-Seedream-5.0-pro'],
      ['doubao-seedream-5.0-lite', 'Doubao-Seedream-5.0-lite'],
      ['wan3.0-video', 'wan3.0-video'],
      ['wan3.0-video-prime', 'wan3.0-video-prime'],
      ['minimax-h3', 'MiniMax-H3'],
      ['doubao-seedance-2.0', 'Doubao-Seedance-2.0'],
      ['doubao-seedance-2.5', 'Doubao-Seedance-2.5'],
    ]
    for (const [slug, expectedId] of checks) {
      const entry = getModelEntry(slug)
      expect(entry).not.toBeNull()
      expect(entry?.modelId).toBe(expectedId)
      expect(getModelEntryByModelId(expectedId)?.slug).toBe(slug)
    }
  })

  it('MiniMax-H3 uses the Video Generation V2 create URL', () => {
    const entry = getModelEntry('minimax-h3')
    expect(entry).not.toBeNull()
    expect(entry?.sources).toHaveLength(1)
    expect(entry?.sources[0]?.url).toBe(
      'https://platform.minimax.io/docs/api-reference/video-generation-v2-create'
    )
    expect(entry?.sources[0]?.url).not.toBe(
      'https://platform.minimax.io/docs/api-reference/video-generation-create'
    )
    expect(entry?.sources[0]?.labelKey).toBe(
      'modelDetail.sources.minimaxVideoV2'
    )
  })

  it('image contracts never re-advertise the retired qwen-image-2.0 series', () => {
    // The production image playground registers qwen-image-2.0 only
    // for backward compatibility, but the docs site must never
    // present it as a currently online model. Any new model id that
    // does not appear in the live /api/pricing payload must not
    // surface in the registry.
    expect(getModelEntry('qwen-image-2.0')).toBeNull()
    expect(getModelEntry('qwen-image-2.0-pro')).toBeNull()
    expect(getModelEntry('wan2.7-image')).toBeNull()
  })

  it('image contracts match the verified Go playground profile', () => {
    // The docs contract is the user-facing mirror of
    // setting/playground/image_profiles.go. Sampling five
    // contract values that are easy to verify across both
    // surfaces keeps a silent drift between Go and TS from
    // shipping.
    const seedreamPro = getImageContract('Doubao-Seedream-5.0-pro')
    expect(seedreamPro).not.toBeNull()
    expect(seedreamPro?.sizes).toEqual(['1K', '1.5K', '2K'])
    expect(seedreamPro?.defaultSize).toBe('2K')
    expect(seedreamPro?.nRange).toEqual({ min: 1, max: 1, default: 1 })
    expect(seedreamPro?.maxReferenceImages).toBe(10)
    expect(seedreamPro?.customSize?.minPixels).toBe(921600)
    expect(seedreamPro?.customSize?.maxPixels).toBe(4624220)

    const seedreamLite = getImageContract('Doubao-Seedream-5.0-lite')
    expect(seedreamLite?.sizes).toEqual(['2K', '3K', '4K'])
    expect(seedreamLite?.customSize?.minPixels).toBe(3686400)
    expect(seedreamLite?.customSize?.maxPixels).toBe(16777216)
    expect(seedreamLite?.maxReferenceImages).toBe(14)

    const qwen = getImageContract('qwen-image-3.0')
    expect(qwen?.sizes).toEqual([
      'Auto',
      '1024x1024',
      '1280x1280',
      '1536x1536',
      '2048x2048',
    ])
    expect(qwen?.defaultSize).toBe('Auto')
    expect(qwen?.nRange).toEqual({ min: 1, max: 6, default: 1 })
    expect(qwen?.maxReferenceImages).toBe(3)
    // Qwen 3.0 agent mode is rejected when references are present;
    // the contract must declare that coupling as an i18n sentence
    // whose English copy mentions both "agent" and "reference".
    expect(
      (qwen?.notes ?? []).some(
        (n) => n.key === 'modelDetail.in.qwen30.agentRefs'
      )
    ).toBe(true)
    const agentRefs = enDocs.modelDetail.in.qwen30.agentRefs.toLowerCase()
    expect(agentRefs).toContain('agent')
    expect(agentRefs).toContain('reference')
  })
})

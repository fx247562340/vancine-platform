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
import assert from 'node:assert/strict'

import { describe, it } from 'vitest'

import type { ImageModelProfile } from '../../types'
import { buildImageFormSchema } from '../form-schema'

const profile: ImageModelProfile = {
  sizes: ['2K', '4K'],
  defaultSize: '2K',
  supportsCustomSize: true,
  nRange: { min: 1, max: 2, default: 1 },
  maxReferenceImages: 0,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: true,
  seedRange: { min: 0, max: 10, default: 0 },
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  minPixels: 768 * 768,
  maxPixels: 4096 * 4096,
}

describe('buildImageFormSchema', () => {
  it('rejects submit values when no profile is loaded', () => {
    const parsed = buildImageFormSchema(null).safeParse({
      prompt: 'a red apple',
      size: '2K',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, false)
  })

  it('rejects empty prompt', () => {
    const parsed = buildImageFormSchema(profile).safeParse({
      prompt: '   ',
      size: '2K',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, false)
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], 'prompt')
    }
  })

  it('rejects a size that the new profile does not support', () => {
    const parsed = buildImageFormSchema(profile).safeParse({
      prompt: 'a red apple',
      size: '1K',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: 0,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, false)
  })

  it('accepts values within the exact profile', () => {
    const parsed = buildImageFormSchema(profile).safeParse({
      prompt: 'a red apple',
      size: '2K',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 2,
      negativePrompt: '',
      seed: 0,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, true)
  })

  it('accepts a cleared seed as null', () => {
    const parsed = buildImageFormSchema(profile).safeParse({
      prompt: 'a red apple',
      size: '2K',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, true)
  })

  it('rejects invalid custom dimensions', () => {
    const parsed = buildImageFormSchema(profile).safeParse({
      prompt: 'a red apple',
      size: '2K',
      sizeMode: 'custom',
      customWidth: 10,
      customHeight: 10,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      thinkingMode: false,
      promptExtendMode: 'direct',
    })
    assert.equal(parsed.success, false)
    if (!parsed.success) {
      assert.ok(
        parsed.error.issues.some((issue) => issue.path[0] === 'customWidth')
      )
    }
  })
})

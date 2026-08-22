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
import { describe, it } from 'node:test'

import type { ImageModelProfile } from '../../types'
import { paramsFromProfile, resetParamsForProfile } from '../params'

const wanProfile: ImageModelProfile = {
  sizes: ['1K', '2K', '4K'],
  defaultSize: '2K',
  supportsCustomSize: true,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 9,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: true,
  seedRange: { min: 0, max: 2147483647, default: 0 },
  supportsWatermark: true,
  defaultWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: true,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  defaultThinkingMode: true,
  minPixels: 768 * 768,
  maxPixels: 4096 * 4096,
  maxPixelsWithRefs: 2048 * 2048,
}

describe('resetParamsForProfile', () => {
  it('drops unsupported fields and resets incompatible size when the model changes', () => {
    const next = resetParamsForProfile(
      {
        size: '2048x2048',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 6,
        negativePrompt: 'blurry',
        seed: 12,
        watermark: true,
        promptExtend: true,
        thinkingMode: false,
        promptExtendMode: 'direct',
      },
      wanProfile
    )

    assert.equal(next.size, '2K')
    assert.equal(next.sizeMode, 'preset')
    assert.equal(next.n, 1)
    assert.equal(next.negativePrompt, '')
    assert.equal(next.seed, 12)
    assert.equal(next.promptExtend, false)
    assert.equal(next.thinkingMode, false)
  })

  it('keeps a valid custom size when the next model supports custom dimensions', () => {
    const next = resetParamsForProfile(
      {
        size: '2K',
        sizeMode: 'custom',
        customWidth: 1280,
        customHeight: 720,
        n: 1,
        negativePrompt: '',
        seed: null,
        watermark: false,
        promptExtend: false,
        thinkingMode: true,
        promptExtendMode: 'direct',
      },
      wanProfile
    )
    assert.equal(next.sizeMode, 'custom')
    assert.equal(next.customWidth, 1280)
    assert.equal(next.customHeight, 720)
  })
})

describe('paramsFromProfile', () => {
  it('does not default seed', () => {
    const params = paramsFromProfile(wanProfile)
    assert.equal(params.seed, null)
    assert.equal(params.size, '2K')
  })
})

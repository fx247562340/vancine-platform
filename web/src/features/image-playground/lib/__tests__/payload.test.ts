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
import { buildImageGenerationPayload } from '../payload'

const qwenProfile: ImageModelProfile = {
  sizes: ['2048x2048'],
  defaultSize: '2048x2048',
  supportsCustomSize: true,
  nRange: { min: 1, max: 6, default: 1 },
  maxReferenceImages: 3,
  supportsNegativePrompt: true,
  maxNegativePromptChars: 500,
  supportsSeed: true,
  seedRange: { min: 0, max: 2147483647, default: 0 },
  supportsWatermark: true,
  defaultWatermark: false,
  supportsPromptExtend: true,
  defaultPromptExtend: true,
  supportsThinkingMode: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
}

const seedreamProfile: ImageModelProfile = {
  sizes: ['1K', '1.5K', '2K'],
  defaultSize: '2K',
  supportsCustomSize: true,
  nRange: { min: 1, max: 1, default: 1 },
  maxReferenceImages: 10,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: true,
  defaultWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
}

describe('buildImageGenerationPayload', () => {
  it('sends explicit false and zero only for supported fields', () => {
    const payload = buildImageGenerationPayload({
      model: 'qwen-image-2.0-pro',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 1,
        negativePrompt: '',
        seed: 0,
        watermark: false,
        promptExtend: false,
        thinkingMode: true,
        promptExtendMode: 'direct',
      },
      profile: qwenProfile,
      references: [],
    })

    assert.equal(payload.watermark, false)
    assert.equal(payload.prompt_extend, false)
    assert.equal(payload.seed, 0)
    assert.equal(payload.thinking_mode, undefined)
    assert.equal(payload.negative_prompt, undefined)
  })

  it('omits seed when it is cleared or unsupported', () => {
    const cleared = buildImageGenerationPayload({
      model: 'qwen-image-2.0-pro',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
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
      },
      profile: qwenProfile,
      references: [],
    })
    assert.equal(cleared.seed, undefined)

    const seedream = buildImageGenerationPayload({
      model: 'Doubao-Seedream-5.0-pro',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2K',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 1,
        negativePrompt: '',
        seed: 12,
        watermark: false,
        promptExtend: false,
        thinkingMode: false,
        promptExtendMode: 'direct',
      },
      profile: seedreamProfile,
      references: [],
    })
    assert.equal(seedream.seed, undefined)
    assert.equal(seedream.size, '2K')
  })

  it('sends custom WxH when sizeMode is custom', () => {
    const payload = buildImageGenerationPayload({
      model: 'qwen-image-2.0',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
        sizeMode: 'custom',
        customWidth: 1280,
        customHeight: 720,
        n: 1,
        negativePrompt: '',
        seed: null,
        watermark: false,
        promptExtend: true,
        thinkingMode: false,
        promptExtendMode: 'direct',
      },
      profile: qwenProfile,
      references: [],
    })
    assert.equal(payload.size, '1280x720')
  })

  it('omits reference images when the profile does not support them', () => {
    const payload = buildImageGenerationPayload({
      model: 'qwen-image-2.0-pro',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
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
      },
      profile: { ...qwenProfile, maxReferenceImages: 0 },
      references: [
        {
          id: '1',
          name: 'a.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,aaa',
        },
      ],
    })
    assert.equal(payload.image, undefined)
  })

  it('does not send empty-string reference images', () => {
    const payload = buildImageGenerationPayload({
      model: 'qwen-image-2.0-pro',
      group: 'default',
      prompt: 'a red apple',
      params: {
        size: '2048x2048',
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
      },
      profile: qwenProfile,
      references: [
        {
          id: '1',
          name: 'a.png',
          mimeType: 'image/png',
          dataUrl: '',
        },
      ],
    })
    assert.equal(payload.image, undefined)
  })
})

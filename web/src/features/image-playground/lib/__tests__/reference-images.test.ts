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

import { MAX_TOTAL_REFERENCE_BYTES } from '../../constants'
import type { ImageModelProfile } from '../../types'
import { validateReferenceFile } from '../reference-images'

const profile: ImageModelProfile = {
  sizes: ['2048x2048'],
  defaultSize: '2048x2048',
  supportsCustomSize: false,
  nRange: { min: 1, max: 1, default: 1 },
  maxReferenceImages: 1,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
}

describe('validateReferenceFile', () => {
  it('rejects an unsupported MIME type before upload', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' })
    assert.equal(
      validateReferenceFile(file, profile, 0),
      'Reference images must be PNG, JPEG, or WebP'
    )
  })

  it('rejects files when the model does not support reference images', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    assert.equal(
      validateReferenceFile(file, { ...profile, maxReferenceImages: 0 }, 0),
      'This model does not support reference images'
    )
  })

  it('rejects files that would exceed the total reference size', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    assert.equal(
      validateReferenceFile(file, profile, 0, MAX_TOTAL_REFERENCE_BYTES),
      'Total reference images exceed the 30 MB limit'
    )
  })

  it('accepts Qwen 3 GIF/BMP/TIFF from the profile allowlist', () => {
    const qwen3 = {
      ...profile,
      allowedReferenceMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/bmp',
        'image/tiff',
        'image/webp',
        'image/gif',
      ],
    }
    assert.equal(
      validateReferenceFile(
        new File(['x'], 'a.gif', { type: 'image/gif' }),
        qwen3,
        0
      ),
      null
    )
    assert.equal(
      validateReferenceFile(
        new File(['x'], 'a.bmp', { type: 'image/bmp' }),
        qwen3,
        0
      ),
      null
    )
    assert.equal(
      validateReferenceFile(
        new File(['x'], 'a.tiff', { type: 'image/tiff' }),
        qwen3,
        0
      ),
      null
    )
  })

  it('does not widen non-Qwen models to GIF', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' })
    assert.equal(
      validateReferenceFile(file, profile, 0),
      'Reference images must be PNG, JPEG, or WebP'
    )
  })
})

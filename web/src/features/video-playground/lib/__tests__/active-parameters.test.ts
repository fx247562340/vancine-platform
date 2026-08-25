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
  countActiveParameters,
  type VideoParameterState,
} from '../parameter-state'

const cap25 = getVideoModelCapabilityOrThrow('Doubao-Seedance-2.5')

const defaults: VideoParameterState = {
  durationMode: 'fixed',
  durationSeconds: 5,
  ratio: '16:9',
  resolution: '720p',
  generateAudio: true,
  seed: '',
  watermark: false,
  returnLastFrame: false,
}

describe('countActiveParameters (badge only counts deviations from model defaults)', () => {
  it('all defaults → 0', () => {
    expect(countActiveParameters(cap25, defaults)).toBe(0)
  })

  it('generate_audio true on 2.5 (default also true) does NOT increment the badge', () => {
    const next: VideoParameterState = { ...defaults, generateAudio: true }
    expect(countActiveParameters(cap25, next)).toBe(0)
  })

  it('generate_audio false on 2.5 DOES increment', () => {
    const next: VideoParameterState = { ...defaults, generateAudio: false }
    expect(countActiveParameters(cap25, next)).toBe(1)
  })

  it('watermark true increments', () => {
    const next: VideoParameterState = { ...defaults, watermark: true }
    expect(countActiveParameters(cap25, next)).toBe(1)
  })

  it('returnLastFrame true increments', () => {
    const next: VideoParameterState = { ...defaults, returnLastFrame: true }
    expect(countActiveParameters(cap25, next)).toBe(1)
  })

  it('non-empty seed increments', () => {
    const next: VideoParameterState = { ...defaults, seed: '42' }
    expect(countActiveParameters(cap25, next)).toBe(1)
  })

  it('intelligent duration increments', () => {
    const next: VideoParameterState = {
      ...defaults,
      durationMode: 'intelligent',
    }
    expect(countActiveParameters(cap25, next)).toBe(1)
  })

  it('all deviations together sum up', () => {
    const next: VideoParameterState = {
      ...defaults,
      generateAudio: false,
      watermark: true,
      returnLastFrame: true,
      seed: '1',
      durationMode: 'intelligent',
    }
    expect(countActiveParameters(cap25, next)).toBe(5)
  })
})

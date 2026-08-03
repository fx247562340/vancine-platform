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
// Vitest. Unit tests for the task media type detection helper: both video
// and 3D tasks share the same `generate` action, so the media type must be
// inferred from data.model / result URLs.
import { describe, expect, it } from 'vitest'
import { TASK_ACTIONS, TASK_STATUS } from '../constants'
import type { TaskLog } from '../types'
import { detectTaskMediaType } from './media-type'

function makeLog(overrides: Partial<TaskLog>): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: 'volcengine',
    task_id: 'task-1',
    action: TASK_ACTIONS.GENERATE,
    channel_id: 1,
    submit_time: 1700000000,
    status: TASK_STATUS.SUCCESS,
    ...overrides,
  }
}

describe('detectTaskMediaType', () => {
  it('detects 3D from a seed3d data.model', () => {
    const log = makeLog({
      data: JSON.stringify({ model: 'doubao-seed3d-2-0-260328' }),
    })
    expect(detectTaskMediaType(log)).toBe('3d')
  })

  it('detects video from a seedance data.model', () => {
    const log = makeLog({
      data: JSON.stringify({ model: 'doubao-seedance-2-0-260128' }),
    })
    expect(detectTaskMediaType(log)).toBe('video')
  })

  it('accepts data as a parsed object too', () => {
    const log = makeLog({
      data: JSON.stringify({ model: 'hitem3d-2.0' }),
    })
    expect(detectTaskMediaType(log)).toBe('3d')
  })

  it('detects 3D from a .glb file_url when no model is present', () => {
    const log = makeLog({
      data: JSON.stringify({
        content: { file_url: 'https://tos.example/out/model.glb?sig=x' },
      }),
    })
    expect(detectTaskMediaType(log)).toBe('3d')
  })

  it('detects video from a video_url when no model is present', () => {
    const log = makeLog({
      data: JSON.stringify({
        content: { video_url: 'https://upstream.example/v.mp4' },
      }),
    })
    expect(detectTaskMediaType(log)).toBe('video')
  })

  it('detects 3D from array-shaped data with a model_url item', () => {
    const log = makeLog({
      data: JSON.stringify([{ model_url: 'https://tos.example/m.glb' }]),
    })
    expect(detectTaskMediaType(log)).toBe('3d')
  })

  it('returns null when there is no evidence', () => {
    expect(detectTaskMediaType(makeLog({ data: '' }))).toBeNull()
    expect(detectTaskMediaType(makeLog({ data: '{}' }))).toBeNull()
    expect(detectTaskMediaType(makeLog({}))).toBeNull()
  })

  it('returns null on malformed data', () => {
    expect(detectTaskMediaType(makeLog({ data: '{not json' }))).toBeNull()
  })
})

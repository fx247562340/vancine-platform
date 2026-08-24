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

import type { TaskLog } from '../../types'
import {
  isTaskVideoAction,
  resolveTaskVideoResultUrl,
} from '../task-video-result'

function makeLog(overrides: Partial<TaskLog> = {}): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: 'kling',
    task_id: 'task-123',
    action: 'generate',
    channel_id: 1,
    submit_time: 1700000000,
    status: 'SUCCESS',
    ...overrides,
  }
}

describe('isTaskVideoAction', () => {
  it('accepts the known video generation actions', () => {
    expect(isTaskVideoAction('generate')).toBe(true)
    expect(isTaskVideoAction('textGenerate')).toBe(true)
    expect(isTaskVideoAction('firstTailGenerate')).toBe(true)
    expect(isTaskVideoAction('referenceGenerate')).toBe(true)
    expect(isTaskVideoAction('remixGenerate')).toBe(true)
  })

  it('rejects non-video actions', () => {
    expect(isTaskVideoAction('MUSIC')).toBe(false)
    expect(isTaskVideoAction('LYRICS')).toBe(false)
    expect(isTaskVideoAction('')).toBe(false)
  })
})

describe('resolveTaskVideoResultUrl', () => {
  it('returns an http(s) result_url', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'https://cdn.example.com/v.mp4?sign=abc' })
      )
    ).toBe('https://cdn.example.com/v.mp4?sign=abc')
  })

  it('returns a data:video result_url', () => {
    const dataUrl = 'data:video/mp4;base64,AAAA'
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: dataUrl }))).toBe(
      dataUrl
    )
  })

  it('returns a non-base64 data:video result_url with a payload', () => {
    const dataUrl = 'data:video/webm,AAAA'
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: dataUrl }))).toBe(
      dataUrl
    )
  })

  it('rejects a data:video URL with no subtype', () => {
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'data:video/' }))
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'data:video/,AAAA' }))
    ).toBe(null)
  })

  it('rejects a data:video URL that is missing the comma separator', () => {
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'data:video/mp4' }))
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;base64' })
      )
    ).toBe(null)
  })

  it('rejects a data:video URL with an empty payload', () => {
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'data:video/mp4,' }))
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;base64,' })
      )
    ).toBe(null)
  })

  it('rejects a data:video URL whose comma sits past the 512-character header limit', () => {
    const dataUrl = `data:video/mp4${'x'.repeat(500)},AAAA`
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: dataUrl }))).toBe(
      null
    )
  })

  it('rejects an oversized data:video URL that has no comma at all', () => {
    const dataUrl = `data:video/mp4${'x'.repeat(10000)}`
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: dataUrl }))).toBe(
      null
    )
  })

  it('rejects a data:video URL with a bare ;foo parameter', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;foo,AAAA' })
      )
    ).toBe(null)
  })

  it('rejects a data:video URL whose parameters contain whitespace or control characters', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;codecs=avc1 42,AAAA' })
      )
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;codecs=avc1\t,AAAA' })
      )
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4;codecs=avc1\u0001,AAAA' })
      )
    ).toBe(null)
  })

  it('returns a data:video URL with legal key=value parameters and a trailing ;base64', () => {
    const dataUrl = 'data:video/mp4;codecs=avc1.42E01E;base64,AAAA'
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: dataUrl }))).toBe(
      dataUrl
    )
  })

  it('rejects a data:video URL with an illegal media type', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/mp4<script>,AAAA' })
      )
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'data:video/../../../x,AAAA' })
      )
    ).toBe(null)
  })

  it('rejects non-video result_url values', () => {
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'not-a-url' }))
    ).toBe(null)
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: '' }))).toBe(null)
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'javascript:alert(1)' }))
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(makeLog({ result_url: 'data:text/plain,hi' }))
    ).toBe(null)
  })

  it('falls back to a legacy http(s) fail_reason holding the result', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ fail_reason: 'http://cdn.example.com/old.mp4?sig=1' })
      )
    ).toBe('http://cdn.example.com/old.mp4?sig=1')
    expect(
      resolveTaskVideoResultUrl(makeLog({ fail_reason: 'generation failed' }))
    ).toBe(null)
  })

  it('falls back to data.content.video_url when data is a JSON string', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({
          data: '{"content":{"video_url":"https://cdn.example.com/x.mp4"}}',
        })
      )
    ).toBe('https://cdn.example.com/x.mp4')
  })

  it('prefers result_url over fail_reason and data.content.video_url', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({
          result_url: 'https://first.example.com/a.mp4',
          fail_reason: 'https://second.example.com/b.mp4',
          data: '{"content":{"video_url":"https://third.example.com/c.mp4"}}',
        })
      )
    ).toBe('https://first.example.com/a.mp4')
  })

  it('prefers fail_reason over data.content.video_url when result_url is absent', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({
          fail_reason: 'https://second.example.com/b.mp4',
          data: '{"content":{"video_url":"https://third.example.com/c.mp4"}}',
        })
      )
    ).toBe('https://second.example.com/b.mp4')
  })

  it('returns null when no video evidence exists', () => {
    expect(resolveTaskVideoResultUrl(makeLog())).toBe(null)
  })

  it('skips a Vancine video proxy result_url and falls back to data.content.video_url', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({
          result_url: 'https://vancine.com/v1/videos/task-123/content',
          data: '{"content":{"video_url":"https://cdn.example.com/direct.mp4"}}',
        })
      )
    ).toBe('https://cdn.example.com/direct.mp4')
  })

  it('returns null when the only address is a Vancine video proxy URL', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({
          result_url: 'https://vancine.com/v1/videos/task-123/content',
        })
      )
    ).toBe(null)
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: '/v1/videos/task-123/content' })
      )
    ).toBe(null)
  })

  it('rejects a data:video payload stored in legacy fail_reason', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ fail_reason: 'data:video/mp4;base64,AAAA' })
      )
    ).toBe(null)
  })

  it('rejects an invalid https URL', () => {
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: 'https://' }))).toBe(
      null
    )
  })

  it('rejects an http(s) URL that embeds a username or password', () => {
    expect(
      resolveTaskVideoResultUrl(
        makeLog({ result_url: 'https://user:pass@cdn.example.com/v.mp4' })
      )
    ).toBe(null)
  })

  it('keeps a legitimate signed query string on a direct https result_url', () => {
    const signed =
      'https://cdn.example.com/v.mp4?X-Amz-Signature=abc&Expires=1700000000'
    expect(resolveTaskVideoResultUrl(makeLog({ result_url: signed }))).toBe(
      signed
    )
  })
})

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

import { pickVideoArtifactContentUrl } from '../task'

const TASK = 'task-123'
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

function url(key: string, taskId = TASK): string {
  return `https://media.test/v1/tasks/${taskId}/artifacts/${key}/content?access=${TOKEN}`
}

function artifact(
  key: string,
  type: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return { key, type, content_url: url(key), ...extra }
}

function response(
  artifacts: unknown[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return { task_id: TASK, artifacts, ...extra }
}

function expectContractError(data: unknown, taskId = TASK): void {
  expect(() => pickVideoArtifactContentUrl(data, taskId)).toThrowError(
    expect.objectContaining({
      name: 'VideoPlaygroundError',
      source: {
        kind: 'system',
        errorKey: 'Failed to load video status',
        terminal: true,
      },
    })
  )
}

describe('pickVideoArtifactContentUrl top-level contract', () => {
  it('accepts a matching task id and returns the video content url', () => {
    expect(
      pickVideoArtifactContentUrl(response([artifact('video', 'video')]), TASK)
    ).toBe(url('video'))
  })

  it('treats a missing artifacts field as a legal empty list', () => {
    expect(pickVideoArtifactContentUrl({ task_id: TASK }, TASK)).toBeNull()
  })

  it('accepts an explicitly empty artifact list', () => {
    expect(pickVideoArtifactContentUrl(response([]), TASK)).toBeNull()
  })

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['a number', 7],
    ['an array', [artifact('video', 'video')]],
    ['undefined', undefined],
  ])('rejects a top-level %s', (_label, value) => {
    expectContractError(value)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['another task', 'other-task'],
    ['a number', 7],
  ])('rejects a task_id that is %s', (_label, task_id) => {
    expectContractError({ task_id, artifacts: [artifact('video', 'video')] })
  })

  it('rejects non-array artifacts', () => {
    expectContractError({ task_id: TASK, artifacts: { key: 'video' } })
  })

  it('rejects more artifacts than the backend cap of 64', () => {
    const artifacts = Array.from({ length: 65 }, (_unused, index) =>
      artifact(`clip-${index}`, 'video')
    )
    expectContractError(response(artifacts))
  })

  it('accepts exactly the backend cap of 64 artifacts', () => {
    const artifacts = Array.from({ length: 64 }, (_unused, index) =>
      artifact(`still-${index}`, 'image')
    )
    expect(pickVideoArtifactContentUrl(response(artifacts), TASK)).toBeNull()
  })

  it('rejects duplicate artifact keys', () => {
    expectContractError(
      response([artifact('video', 'video'), artifact('video', 'video')])
    )
  })

  it.each([
    'space inside',
    '-leading',
    '.leading',
    '~leading',
    'with/slash',
    'with?question',
    'with#hash',
    'x'.repeat(129),
    '',
  ])('rejects the invalid artifact key "%s"', (key) => {
    expectContractError({
      task_id: TASK,
      artifacts: [{ key, type: 'video', content_url: url(key) }],
    })
  })

  it('accepts the longest legal artifact key (128 chars)', () => {
    const key = `v${'x'.repeat(127)}`
    expect(
      pickVideoArtifactContentUrl(response([artifact(key, 'video')]), TASK)
    ).toBe(url(key))
  })
})

describe('pickVideoArtifactContentUrl artifact type contract', () => {
  it.each([
    ['video', 'video'],
    ['image', 'image'],
    ['audio', 'audio'],
    ['file', 'file'],
  ])('accepts the declared type "%s"', (type) => {
    expect(() =>
      pickVideoArtifactContentUrl(response([artifact('one', type)]), TASK)
    ).not.toThrow()
  })

  it('rejects an artifact without a type even when mime claims video', () => {
    expectContractError({
      task_id: TASK,
      artifacts: [
        { key: 'video', mime_type: 'video/mp4', content_url: url('video') },
      ],
    })
  })

  it('rejects an empty type', () => {
    expectContractError(response([artifact('video', '')]))
  })

  it('rejects a non-string type', () => {
    expectContractError({
      task_id: TASK,
      artifacts: [{ key: 'video', type: 7, content_url: url('video') }],
    })
  })

  it('rejects an unknown type', () => {
    expectContractError(response([artifact('video', 'movie')]))
  })

  it('plays a video artifact that carries no mime_type', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([{ key: 'video', type: 'video', content_url: url('video') }]),
        TASK
      )
    ).toBe(url('video'))
  })

  it('plays a video artifact with mime_type video/mp4', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([artifact('video', 'video', { mime_type: 'video/mp4' })]),
        TASK
      )
    ).toBe(url('video'))
  })

  it('never promotes an image artifact with a video mime_type', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([artifact('poster', 'image', { mime_type: 'video/mp4' })]),
        TASK
      )
    ).toBeNull()
  })

  it('never promotes audio or file artifacts with a video mime_type', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([
          artifact('sound', 'audio', { mime_type: 'video/mp4' }),
          artifact('notes', 'file', { mime_type: 'video/mp4' }),
        ]),
        TASK
      )
    ).toBeNull()
  })

  it('picks the first video artifact regardless of position', () => {
    const artifacts = [
      artifact('poster', 'image', { mime_type: 'image/png' }),
      artifact('sound', 'audio', { mime_type: 'audio/mpeg' }),
      artifact('clip-b', 'video'),
      artifact('clip-a', 'video'),
    ]
    expect(pickVideoArtifactContentUrl(response(artifacts), TASK)).toBe(
      url('clip-b')
    )
  })

  it('rejects the whole response when one artifact has a bad content_url', () => {
    expectContractError({
      task_id: TASK,
      artifacts: [
        artifact('video', 'video'),
        {
          key: 'poster',
          type: 'image',
          content_url: 'https://evil.test/raw.png',
        },
      ],
    })
  })

  it('rejects a missing content_url', () => {
    expectContractError({
      task_id: TASK,
      artifacts: [{ key: 'video', type: 'video' }],
    })
  })

  it('rejects a content_url bound to a different artifact key', () => {
    expectContractError({
      task_id: TASK,
      artifacts: [{ key: 'clip', type: 'video', content_url: url('other') }],
    })
  })

  it.each([
    ['a CR', 'video/mp4\rX'],
    ['an LF', 'video/mp4\nX'],
    ['a NUL', 'video/mp4\u0000X'],
  ])('rejects a mime_type containing %s', (_label, mime_type) => {
    expectContractError(response([artifact('video', 'video', { mime_type })]))
  })

  it('accepts a mime_type at the 255 character limit', () => {
    const mime_type = `video/${'x'.repeat(249)}`
    expect(mime_type.length).toBe(255)
    expect(() =>
      pickVideoArtifactContentUrl(
        response([artifact('video', 'video', { mime_type })]),
        TASK
      )
    ).not.toThrow()
  })

  it('rejects an over-long mime_type', () => {
    expectContractError(
      response([
        artifact('video', 'video', { mime_type: `video/${'x'.repeat(250)}` }),
      ])
    )
  })

  it('ignores unknown extra artifact fields instead of trusting them', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([
          artifact('video', 'video', {
            result_url: 'https://evil.test/raw.mp4',
          }),
        ]),
        TASK
      )
    ).toBe(url('video'))
  })
})

describe('pickVideoArtifactContentUrl legacy_content_url compatibility path', () => {
  const legacyUrl = url('video')

  it('uses legacy_content_url when there is no typed video artifact', () => {
    expect(
      pickVideoArtifactContentUrl(
        response([], { legacy_content_url: legacyUrl }),
        TASK
      )
    ).toBe(legacyUrl)
  })

  it('prefers a real video artifact over the legacy field', () => {
    const clip = artifact('clip', 'video')
    expect(
      pickVideoArtifactContentUrl(
        response([clip], { legacy_content_url: legacyUrl }),
        TASK
      )
    ).toBe(url('clip'))
  })

  it('does not require the legacy field to declare an artifact type', () => {
    expect(() =>
      pickVideoArtifactContentUrl(
        response([artifact('poster', 'image')], {
          legacy_content_url: legacyUrl,
        }),
        TASK
      )
    ).not.toThrow()
  })

  it('rejects a legacy raw upstream link that is not a capability URL', () => {
    expectContractError(
      response([], { legacy_content_url: 'https://upstream.test/raw.mp4' })
    )
  })

  it('rejects a legacy capability URL bound to a different task', () => {
    expectContractError(
      response([], { legacy_content_url: url('video', 'other-task') })
    )
  })

  it('rejects a legacy capability URL whose key is not "video"', () => {
    expectContractError(response([], { legacy_content_url: url('clip') }))
  })

  it('rejects a non-string legacy field', () => {
    expectContractError(response([], { legacy_content_url: 7 }))
  })
})

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

import { parseVideoModels } from '../models'

/** A GET /v1/models entry shaped exactly like the server emits it. */
function modelEntry(id: unknown, endpoints?: unknown) {
  const entry: Record<string, unknown> = { id, object: 'model', owned_by: 'v' }
  if (endpoints !== undefined) {
    entry.supported_endpoint_types = endpoints
  }
  return entry
}

function values(payload: unknown): string[] {
  return parseVideoModels(payload).map((option) => option.value)
}

describe('parseVideoModels', () => {
  it('keeps every model the server marks with the openai-video capability', () => {
    expect(
      values({
        data: [
          modelEntry('wan3.0-video', ['openai', 'openai-video']),
          modelEntry('wan3.0-video-prime', ['openai-video']),
          modelEntry('Doubao-Seedance-2.0', ['openai', 'openai-video']),
          modelEntry('Doubao-Seedance-2.5', ['openai-video']),
        ],
      })
    ).toEqual([
      'wan3.0-video',
      'wan3.0-video-prime',
      'Doubao-Seedance-2.0',
      'Doubao-Seedance-2.5',
    ])
  })

  it('excludes chat, image and embedding models that lack openai-video', () => {
    expect(
      values({
        data: [
          modelEntry('gpt-4o', ['openai', 'openai-response']),
          modelEntry('qwen-image', ['image-generation']),
          modelEntry('text-embedding-3-large', ['embeddings']),
          modelEntry('wan3.0-video', ['openai', 'openai-video']),
        ],
      })
    ).toEqual(['wan3.0-video'])
  })

  it('excludes entries whose endpoint array is missing or malformed', () => {
    expect(
      values({
        data: [
          modelEntry('no-endpoints-at-all'),
          modelEntry('endpoints-not-an-array', 'openai-video'),
          modelEntry('endpoints-null', null),
          modelEntry('endpoint-not-a-string', [['openai-video']]),
          modelEntry('wan3.0-video', ['openai-video']),
        ],
      })
    ).toEqual(['wan3.0-video'])
  })

  it('matches the capability exactly instead of by keyword or substring', () => {
    expect(
      values({
        data: [
          modelEntry('my-video-model', ['openai']),
          modelEntry('seedance-lookalike', ['openai']),
          modelEntry('kling-lookalike', ['openai']),
          modelEntry('openai-video-ish', ['openai-videos']),
          modelEntry('OpenAI-Video', ['OpenAI-Video']),
        ],
      })
    ).toEqual([])
  })

  it('ignores malformed payload envelopes without throwing', () => {
    expect(values(null)).toEqual([])
    expect(values(undefined)).toEqual([])
    expect(values('models')).toEqual([])
    expect(values({})).toEqual([])
    expect(values({ data: 'not-an-array' })).toEqual([])
    expect(
      values({
        data: [null, 7, 'id-only', {}, modelEntry('', ['openai-video'])],
      })
    ).toEqual([])
  })

  it('collapses duplicate ids and keeps the server order', () => {
    expect(
      values({
        data: [
          modelEntry('wan3.0-video-prime', ['openai-video']),
          modelEntry('wan3.0-video', ['openai-video']),
          modelEntry('wan3.0-video-prime', ['openai-video']),
        ],
      })
    ).toEqual(['wan3.0-video-prime', 'wan3.0-video'])
  })

  it('preserves the exact server spelling and casing of each model id', () => {
    const options = parseVideoModels({
      data: [
        modelEntry('Wan3.0-Video-Prime', ['openai-video']),
        modelEntry('wan3.0-video', ['openai-video']),
      ],
    })

    expect(options).toEqual([
      { label: 'Wan3.0-Video-Prime', value: 'Wan3.0-Video-Prime' },
      { label: 'wan3.0-video', value: 'wan3.0-video' },
    ])
  })
})

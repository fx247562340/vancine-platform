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

import {
  extractServerErrorFromBody,
  extractUpstreamErrorMessage,
  ImagePlaygroundError,
  mapImageServerErrorToField,
} from '../errors'

function axiosError(
  data: unknown,
  message = 'Request failed with status code 400'
) {
  return {
    isAxiosError: true,
    message,
    response: { data },
    toJSON: () => ({}),
  }
}

describe('extractUpstreamErrorMessage', () => {
  it('prefers OpenAI error.message over generic axios text', () => {
    assert.equal(
      extractUpstreamErrorMessage(
        axiosError({
          error: { message: 'prompt is required' },
          message: 'fallback message',
        })
      ),
      'prompt is required'
    )
  })

  it('falls back to response.data.message', () => {
    assert.equal(
      extractUpstreamErrorMessage(
        axiosError({ message: 'No available channel' })
      ),
      'No available channel'
    )
  })
})

describe('extractServerErrorFromBody', () => {
  it('prefers the nested OpenAI error.message', () => {
    assert.equal(
      extractServerErrorFromBody({
        error: { message: 'prompt is required' },
        message: 'fallback message',
      }),
      'prompt is required'
    )
  })

  it('falls back to the top-level message', () => {
    assert.equal(
      extractServerErrorFromBody({ message: 'No available channel' }),
      'No available channel'
    )
  })

  it('returns undefined for empty, non-object, or message-less bodies', () => {
    assert.equal(extractServerErrorFromBody(null), undefined)
    assert.equal(extractServerErrorFromBody(''), undefined)
    assert.equal(extractServerErrorFromBody('boom'), undefined)
    assert.equal(extractServerErrorFromBody({}), undefined)
    assert.equal(extractServerErrorFromBody({ message: '   ' }), undefined)
    assert.equal(extractServerErrorFromBody({ data: [] }), undefined)
  })
})

describe('ImagePlaygroundError closed source', () => {
  it('system source exposes only the stable i18n errorKey', () => {
    const error = new ImagePlaygroundError({
      kind: 'system',
      errorKey: 'Image generation failed',
    })
    assert.equal(error.source.kind, 'system')
    assert.equal(error.message, 'Image generation failed')
    assert.equal(error.errorKey, 'Image generation failed')
    assert.equal(error.rawUpstreamMessage, undefined)
  })

  it('upstream source exposes only the verbatim raw message', () => {
    const error = new ImagePlaygroundError({
      kind: 'upstream',
      rawMessage: 'upstream blew up',
    })
    assert.equal(error.source.kind, 'upstream')
    assert.equal(error.message, 'upstream blew up')
    assert.equal(error.rawUpstreamMessage, 'upstream blew up')
    assert.equal(error.errorKey, undefined)
  })
})

describe('mapImageServerErrorToField', () => {
  it('maps preset size and 4K reference errors to size', () => {
    const sizeError = mapImageServerErrorToField(
      'size "1K" is not supported for model Doubao-Seedream-5.0-lite',
      { sizeMode: 'preset' }
    )
    assert.equal(sizeError?.name, 'size')

    const wanError = mapImageServerErrorToField(
      'model wan2.7-image-pro does not support reference images at 4K resolution',
      { sizeMode: 'preset' }
    )
    assert.equal(wanError?.name, 'size')
    assert.match(wanError?.message ?? '', /4K/)
  })

  it('maps custom size errors to customWidth', () => {
    const mapped = mapImageServerErrorToField(
      'image size must be at most 4194304 pixels',
      { sizeMode: 'custom' }
    )
    assert.equal(mapped?.name, 'customWidth')
  })
})

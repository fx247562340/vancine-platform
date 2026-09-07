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

/**
 * The exact body each provider wire contract produces.
 *
 * Every case asserts the whole object, not a slice of it, so a field that must
 * not exist is proven absent by the same assertion that proves the allowed
 * fields are right.
 */
import { describe, expect, it } from 'vitest'

import { PROVIDER_DEFAULT } from '../composer-schema'
import { resolveVideoModelCapability } from '../model-capabilities'
import type { VideoImageResource } from '../resource-validation'
import {
  buildVideoGenerationRequest,
  VideoRequestError,
} from '../video-request'

function image(id: string, dataUrl: string): VideoImageResource {
  return {
    id,
    kind: 'image',
    source: { kind: 'base64', dataUrl },
    name: `${id}.png`,
    mimeType: 'image/png',
    byteSize: 8,
  }
}

const CAT = image('a', 'data:image/png;base64,Y2F0')
const DOG = image('b', 'data:image/jpeg;base64,ZG9n')

describe('buildVideoGenerationRequest', () => {
  it('emits Wan3 duration as an int and resolution as top-level size, with no metadata for a text-only clip', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('wan3.0-video'),
        prompt: 'a cat walks on the moon',
        duration: 5,
        resolution: '1080P',
        images: [],
      })
    ).toEqual({
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
      duration: 5,
      size: '1080P',
    })
  })

  it('puts every Wan3 reference image into metadata.input.media, in order, and never into a first-frame field', () => {
    const body = buildVideoGenerationRequest({
      capability: resolveVideoModelCapability('wan3.0-video-prime'),
      prompt: 'two references',
      duration: 30,
      resolution: '480P',
      images: [CAT, DOG],
    })
    expect(body).toEqual({
      model: 'wan3.0-video-prime',
      prompt: 'two references',
      duration: 30,
      size: '480P',
      metadata: {
        input: {
          media: [
            { type: 'reference_image', url: 'data:image/png;base64,Y2F0' },
            { type: 'reference_image', url: 'data:image/jpeg;base64,ZG9n' },
          ],
        },
      },
    })
  })

  it('emits MiniMax-H3 duration as an int and 2K through metadata.resolution with reference_image content', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('MiniMax-H3'),
        prompt: 'a heron landing',
        duration: 8,
        resolution: '2K',
        images: [CAT],
      })
    ).toEqual({
      model: 'MiniMax-H3',
      prompt: 'a heron landing',
      duration: 8,
      metadata: {
        resolution: '2K',
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:image/png;base64,Y2F0' },
          },
        ],
      },
    })
  })

  it('omits metadata.content for MiniMax-H3 text-only so the plugin builds the single text item itself', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('MiniMax-H3'),
        prompt: 'a heron landing',
        duration: 4,
        resolution: '768P',
        images: [],
      })
    ).toEqual({
      model: 'MiniMax-H3',
      prompt: 'a heron landing',
      duration: 4,
      metadata: { resolution: '768P' },
    })
  })

  it('emits Seedance seconds as a string because the Go DTO types it as a string', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('Doubao-Seedance-2.0'),
        prompt: 'a market street',
        duration: 12,
        resolution: '4k',
        images: [],
      })
    ).toEqual({
      model: 'Doubao-Seedance-2.0',
      prompt: 'a market street',
      seconds: '12',
      metadata: { resolution: '4k' },
    })
  })

  it('emits Seedance 2.5 reference images as reference_image content and never mentions 4k', () => {
    const body = buildVideoGenerationRequest({
      capability: resolveVideoModelCapability('Doubao-Seedance-2.5'),
      prompt: 'one long take',
      duration: 30,
      resolution: '1080p',
      images: [CAT, DOG],
    })
    expect(body).toEqual({
      model: 'Doubao-Seedance-2.5',
      prompt: 'one long take',
      seconds: '30',
      metadata: {
        resolution: '1080p',
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:image/png;base64,Y2F0' },
          },
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: 'data:image/jpeg;base64,ZG9n' },
          },
        ],
      },
    })
    expect(JSON.stringify(body)).not.toContain('4k')
  })

  it('trims the prompt and keeps the model id exactly as the server spelled it', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('Doubao-Seedance-2.5'),
        prompt: '   padded   ',
        duration: 5,
        resolution: '720p',
        images: [],
      })
    ).toEqual({
      model: 'Doubao-Seedance-2.5',
      prompt: 'padded',
      seconds: '5',
      metadata: { resolution: '720p' },
    })
  })

  it('sends only model and prompt for a model with no capability entry', () => {
    expect(
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('some-future-video-model'),
        prompt: '  an unverified prompt  ',
        duration: PROVIDER_DEFAULT,
        resolution: PROVIDER_DEFAULT,
        images: [],
      })
    ).toEqual({
      model: 'some-future-video-model',
      prompt: 'an unverified prompt',
    })
  })

  it('refuses rather than silently drops a reference image for a model that accepts none', () => {
    expect(() =>
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('some-future-video-model'),
        prompt: 'an unverified prompt',
        duration: PROVIDER_DEFAULT,
        resolution: PROVIDER_DEFAULT,
        images: [CAT],
      })
    ).toThrow(VideoRequestError)
  })

  it('rejects an empty prompt with the translatable reason', () => {
    try {
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('wan3.0-video'),
        prompt: '    ',
        duration: 5,
        resolution: '720P',
        images: [],
      })
      expect.unreachable('an empty prompt must be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(VideoRequestError)
      expect((error as VideoRequestError).reasonKey).toBe('Prompt is required')
    }
  })

  it('rejects more reference images than the model cap', () => {
    const six = Array.from({ length: 6 }, (_, index) =>
      image(`img-${index}`, `data:image/png;base64,${index}`)
    )
    try {
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('MiniMax-H3'),
        prompt: 'too many',
        duration: 5,
        resolution: '2K',
        images: six,
      })
      expect.unreachable('six images must exceed the MiniMax-H3 cap of five')
    } catch (error) {
      expect((error as VideoRequestError).interpolation).toEqual({ max: 5 })
    }
  })

  it('rejects a resolution the vendor refuses for the current reference-image state', () => {
    expect(() =>
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('Doubao-Seedance-2.0'),
        prompt: 'illegal combination',
        duration: 5,
        resolution: '1080p',
        images: [CAT],
      })
    ).toThrow('Resolution 1080p is not legal for Doubao-Seedance-2.0')
  })

  it('rejects a serialized body over the documented request budget', () => {
    const huge = image(
      'huge',
      `data:image/png;base64,${'A'.repeat(65 * 1024 * 1024)}`
    )
    try {
      buildVideoGenerationRequest({
        capability: resolveVideoModelCapability('MiniMax-H3'),
        prompt: 'too large',
        duration: 5,
        resolution: '768P',
        images: [huge],
      })
      expect.unreachable('a body over 64 MB must be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(VideoRequestError)
      expect((error as VideoRequestError).reasonKey).toBe(
        'videoPlayground.request.bodyTooLarge'
      )
    }
  })
})

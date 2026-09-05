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
  decodeRenderableBase64,
  imageSrc,
  inspectBase64Image,
  parseGeneratedImages,
} from '../results'

const PNG = 'iVBORw0KGgoAAAANSUhEUg'
const JPEG = '/9j/4AAQ'
const PNG_PADDED = 'iVBORw0KGgo='
const JPEG_DOUBLE_PAD = '/9j/4A=='
const GIF89A = Buffer.from('GIF89a').toString('base64')
const GIF87A = Buffer.from('GIF87a').toString('base64')
const GIF8XX = Buffer.from('GIF8xx').toString('base64')
const WEBP = Buffer.from('RIFF\x00\x00\x00\x00WEBP').toString('base64')
const RIFF_WAVE = Buffer.from('RIFF\x00\x00\x00\x00WAVE').toString('base64')
const RIFF_AVI = Buffer.from('RIFF\x00\x00\x00\x00AVI ').toString('base64')

describe('inspectBase64Image', () => {
  it('rejects a legal prefix with illegal trailing characters', () => {
    assert.equal(inspectBase64Image('iVBORw0KGgo%%%'), null)
    assert.equal(inspectBase64Image('iVBORw0KGgo!!!'), null)
    assert.equal(inspectBase64Image(`${JPEG}-not-base64`), null)
  })

  it('rejects incomplete webp and empty or whitespace input', () => {
    assert.equal(inspectBase64Image('UklGR'), null)
    assert.equal(inspectBase64Image(''), null)
    assert.equal(inspectBase64Image(' \n\t'), null)
  })

  it('rejects illegal padding and length mod 4 == 1', () => {
    assert.equal(inspectBase64Image('iVBORw0KGgo==='), null)
    assert.equal(inspectBase64Image('iVBO=Rw0KGgo'), null)
    assert.equal(inspectBase64Image('iVBOR'), null)
    assert.equal(inspectBase64Image('ab=c'), null)
  })

  it('accepts legal png/jpeg/webp/gif with and without padding', () => {
    assert.deepEqual(inspectBase64Image(PNG), { mime: 'image/png' })
    assert.deepEqual(inspectBase64Image(PNG_PADDED), { mime: 'image/png' })
    assert.deepEqual(inspectBase64Image(JPEG), { mime: 'image/jpeg' })
    assert.deepEqual(inspectBase64Image(JPEG_DOUBLE_PAD), {
      mime: 'image/jpeg',
    })
    assert.deepEqual(inspectBase64Image(WEBP), { mime: 'image/webp' })
    assert.deepEqual(inspectBase64Image(GIF89A), { mime: 'image/gif' })
    assert.deepEqual(inspectBase64Image(GIF87A), { mime: 'image/gif' })
  })

  it('rejects RIFF containers that are not WebP and incomplete GIF headers', () => {
    assert.equal(inspectBase64Image(RIFF_WAVE), null)
    assert.equal(inspectBase64Image(RIFF_AVI), null)
    assert.equal(inspectBase64Image(GIF8XX), null)
  })

  it('accepts legal whitespace and newline wrapping', () => {
    assert.deepEqual(inspectBase64Image(`iVBORw0KGgo\nAAAANSUhEUg`), {
      mime: 'image/png',
    })
    assert.deepEqual(inspectBase64Image(`/9j/\r\n4AAQ`), { mime: 'image/jpeg' })
    assert.deepEqual(inspectBase64Image(` ${PNG} `), { mime: 'image/png' })
    assert.deepEqual(inspectBase64Image(`iVBORw0KGgo\fAAAANSUhEUg`), {
      mime: 'image/png',
    })
  })

  it('rejects vertical tab, nbsp, and other unicode whitespace', () => {
    assert.equal(inspectBase64Image(`iVBORw0KGgo\vAAAANSUhEUg`), null)
    assert.equal(inspectBase64Image(`iVBORw0KGgo\u00a0AAAANSUhEUg`), null)
    assert.equal(inspectBase64Image(`\u00a0${PNG}`), null)
    assert.equal(inspectBase64Image(`\u2003${PNG}`), null)
  })
})

describe('parseGeneratedImages', () => {
  it('rejects an empty data array', () => {
    assert.throws(
      () => parseGeneratedImages({ data: [] }),
      /No images were generated/
    )
  })

  it('rejects data items that have neither url nor b64_json', () => {
    assert.throws(
      () => parseGeneratedImages({ data: [{}] }),
      /No images were generated/
    )
    assert.throws(
      () => parseGeneratedImages({ data: [{ url: '', b64_json: '' }] }),
      /No images were generated/
    )
  })

  it('keeps only usable items from a mixed response', () => {
    const images = parseGeneratedImages({
      data: [
        {},
        { url: 'https://example.invalid/a.png' },
        { url: '', b64_json: '' },
      ],
    })
    assert.equal(images.length, 1)
    assert.equal(images[0].url, 'https://example.invalid/a.png')
    assert.equal(images[0].resultId, 'result-1')
  })

  it('gives duplicate urls distinct result ids', () => {
    const images = parseGeneratedImages({
      data: [
        { url: 'https://example.invalid/a.png' },
        { url: 'https://example.invalid/a.png' },
      ],
    })
    assert.equal(images.length, 2)
    assert.equal(images[0].resultId, 'result-0')
    assert.equal(images[1].resultId, 'result-1')
  })

  it('accepts a legal b64_json result', () => {
    const images = parseGeneratedImages({
      data: [{ b64_json: PNG }],
    })
    assert.equal(images.length, 1)
    assert.equal(images[0].b64Json, PNG)
    assert.deepEqual(inspectBase64Image(images[0].b64Json ?? ''), {
      mime: 'image/png',
    })
    assert.ok(imageSrc(images[0]).startsWith('data:image/png;base64,'))
  })

  it('rejects javascript and file urls even if they bypass the backend', () => {
    assert.throws(
      () => parseGeneratedImages({ data: [{ url: 'javascript:alert(1)' }] }),
      /No images were generated/
    )
    assert.throws(
      () => parseGeneratedImages({ data: [{ url: 'file:///tmp/a.png' }] }),
      /No images were generated/
    )
  })

  it('rejects b64-only payloads that fail the structure scan', () => {
    for (const b64_json of [
      'not-an-image',
      '%%%',
      'iVBORw0KGgo%%%',
      'UklGR',
      'iVBOR',
      'iVBORw0KGgo===',
      RIFF_WAVE,
      GIF8XX,
    ]) {
      assert.throws(
        () => parseGeneratedImages({ data: [{ b64_json }] }),
        /No images were generated/
      )
    }
  })

  it('keeps a legal url and drops malformed base64 on the same item', () => {
    const images = parseGeneratedImages({
      data: [
        {
          url: 'https://example.invalid/a.png',
          b64_json: 'iVBORw0KGgo%%%',
        },
      ],
    })
    assert.equal(images.length, 1)
    assert.equal(images[0].url, 'https://example.invalid/a.png')
    assert.equal(images[0].b64Json, undefined)
    assert.equal(imageSrc(images[0]), 'https://example.invalid/a.png')
  })
})

describe('imageSrc', () => {
  it('prefers a remote url and does not invent an empty src', () => {
    assert.equal(
      imageSrc({ url: 'https://example.invalid/a.png' }),
      'https://example.invalid/a.png'
    )
    assert.equal(imageSrc({ url: '', b64Json: '' }), '')
    assert.equal(imageSrc({ url: 'javascript:alert(1)' }), '')
    assert.equal(imageSrc({ url: 'file:///tmp/a.png' }), '')
  })

  it('uses sniffed mime types instead of always png', () => {
    assert.deepEqual(inspectBase64Image(JPEG), { mime: 'image/jpeg' })
    assert.deepEqual(inspectBase64Image('iVBORw0KGgo'), { mime: 'image/png' })
    assert.ok(imageSrc({ b64Json: JPEG }).startsWith('data:image/jpeg'))
    assert.ok(imageSrc({ b64Json: PNG }).startsWith('data:image/png'))
  })

  it('does not render malformed b64-only results as a data URL', () => {
    assert.equal(imageSrc({ b64Json: 'not-an-image' }), '')
    assert.equal(imageSrc({ b64Json: '%%%' }), '')
    assert.equal(imageSrc({ b64Json: 'iVBORw0KGgo%%%' }), '')
    assert.equal(imageSrc({ b64Json: 'UklGR' }), '')
    assert.equal(imageSrc({ b64Json: RIFF_WAVE }), '')
    assert.equal(imageSrc({ b64Json: GIF8XX }), '')
    assert.equal(decodeRenderableBase64('not-an-image'), null)
    assert.equal(decodeRenderableBase64('iVBORw0KGgo!!!'), null)
  })

  it('decodes form-feed wrapped png for download without throwing', () => {
    const decoded = decodeRenderableBase64(`iVBORw0KGgo\fAAAANSUhEUg`)
    assert.equal(decoded?.mime, 'image/png')
    assert.ok(decoded && decoded.bytes.length > 0)
  })

  it('does not fully decode Base64 at the API parse boundary', () => {
    const originalAtob = globalThis.atob
    const seen: number[] = []
    globalThis.atob = ((value: string) => {
      seen.push(value.length)
      return originalAtob(value)
    }) as typeof atob
    try {
      parseGeneratedImages({
        data: [{ b64_json: `${PNG}${'A'.repeat(8000)}` }],
      })
    } finally {
      globalThis.atob = originalAtob
    }
    assert.ok(seen.length > 0)
    assert.ok(seen.every((length) => length <= 16))
  })

  it('prefers a legal url over malformed base64', () => {
    assert.equal(
      imageSrc({
        url: 'https://example.invalid/a.png',
        b64Json: 'iVBORw0KGgo%%%',
      }),
      'https://example.invalid/a.png'
    )
  })
})

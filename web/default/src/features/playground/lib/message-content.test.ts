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
// Run with: node --test src/features/playground/lib/message-content.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  extractMarkdownImages,
  getContentImages,
  getContentText,
  stripImageMarkdown,
} from './message-content.ts'

describe('message content image extraction', () => {
  test('extracts urls from image_url content parts', () => {
    const images = getContentImages([
      { type: 'text', text: 'here is the result' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/a.png' } },
      { type: 'image_url', image_url: { url: 'https://cdn.example/b.png' } },
    ])
    assert.deepEqual(images, [
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ])
  })

  test('extracts urls from markdown image syntax in string content', () => {
    const images = getContentImages(
      '生成结果：![生成图片](https://cdn.example/gen.png)'
    )
    assert.deepEqual(images, ['https://cdn.example/gen.png'])
  })

  test('plain text content has no images', () => {
    assert.deepEqual(getContentImages('just some text'), [])
    assert.deepEqual(getContentImages([{ type: 'text', text: 'words' }]), [])
  })

  test('extractMarkdownImages handles titles and multiple images', () => {
    const images = extractMarkdownImages(
      '![a](https://x/1.png "title") and ![b](https://x/2.png)'
    )
    assert.deepEqual(images, ['https://x/1.png', 'https://x/2.png'])
  })
})

describe('message content text extraction', () => {
  test('string content is returned as-is', () => {
    assert.equal(getContentText('hello'), 'hello')
  })

  test('content parts join text blocks and ignore image blocks', () => {
    assert.equal(
      getContentText([
        { type: 'text', text: 'first' },
        { type: 'image_url', image_url: { url: 'https://x/i.png' } },
        { type: 'text', text: 'second' },
      ]),
      'first\nsecond'
    )
  })
})

describe('stripImageMarkdown', () => {
  test('removes image markdown but keeps surrounding text', () => {
    assert.equal(
      stripImageMarkdown('before ![img](https://x/i.png) after'),
      'before  after'
    )
  })

  test('image-only content becomes empty', () => {
    assert.equal(stripImageMarkdown('![生成图片](https://x/i.png)'), '')
  })

  test('text without images is unchanged (modulo trim)', () => {
    assert.equal(stripImageMarkdown('plain text'), 'plain text')
  })
})

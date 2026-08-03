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
// Run with: node --test src/features/playground/lib/message-utils.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ContentPart } from '../types.ts'
import { buildMessageContent, createUserMessage } from './message-utils.ts'

describe('createUserMessage text-only compatibility', () => {
  test("createUserMessage('hello') keeps plain string content", () => {
    const message = createUserMessage('hello')
    assert.equal(message.from, 'user')
    assert.equal(message.versions[0].content, 'hello')
  })

  test('explicit empty image array behaves like no images', () => {
    const message = createUserMessage('hello', [])
    assert.equal(message.versions[0].content, 'hello')
  })

  test('undefined imageUrls behaves like no images', () => {
    const message = createUserMessage('hello', undefined)
    assert.equal(message.versions[0].content, 'hello')
  })

  test('blank image URLs are filtered out (string content preserved)', () => {
    const message = createUserMessage('hello', ['', '   '])
    assert.equal(message.versions[0].content, 'hello')
  })
})

describe('createUserMessage with image URLs', () => {
  test('a single image URL produces text + image_url content parts', () => {
    const message = createUserMessage('hello', ['https://cdn.example/1.png'])
    const content = message.versions[0].content
    assert.ok(Array.isArray(content))
    assert.deepEqual(content, [
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/1.png' } },
    ])
  })

  test('multiple image URLs produce one image_url part each', () => {
    const message = createUserMessage('hello', [
      'https://cdn.example/1.png',
      'https://cdn.example/2.png',
    ])
    const content = message.versions[0].content as ContentPart[]
    assert.ok(Array.isArray(content))
    const imageParts = content.filter((part) => part.type === 'image_url')
    assert.equal(imageParts.length, 2)
    assert.deepEqual(
      imageParts.map((part) => part.image_url?.url),
      ['https://cdn.example/1.png', 'https://cdn.example/2.png']
    )
  })

  test('empty text with images yields image_url parts only (no empty text part)', () => {
    const message = createUserMessage('', ['https://cdn.example/1.png'])
    const content = message.versions[0].content as ContentPart[]
    assert.ok(Array.isArray(content))
    assert.deepEqual(content, [
      { type: 'image_url', image_url: { url: 'https://cdn.example/1.png' } },
    ])
  })
})

describe('buildMessageContent', () => {
  test('no valid images passes the text through unchanged', () => {
    assert.equal(buildMessageContent('words', []), 'words')
    assert.equal(buildMessageContent('words', ['']), 'words')
  })

  test('text + images puts the text part first', () => {
    const content = buildMessageContent('hi', ['https://cdn.example/a.png'])
    assert.deepEqual(content, [
      { type: 'text', text: 'hi' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/a.png' } },
    ])
  })

  test('empty text with images omits the text part entirely', () => {
    const content = buildMessageContent('', ['https://cdn.example/a.png'])
    assert.deepEqual(content, [
      { type: 'image_url', image_url: { url: 'https://cdn.example/a.png' } },
    ])
  })
})

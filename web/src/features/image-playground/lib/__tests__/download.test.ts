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

import { afterEach, describe, it } from 'vitest'

import { downloadGeneratedImage } from '../download'

const PNG = 'iVBORw0KGgoAAAANSUhEUg'
const originalFetch = globalThis.fetch
const originalOpen = globalThis.open
const originalDocument = globalThis.document
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function stubDownloadDom() {
  const link = {
    href: '',
    download: '',
    rel: '',
    click() {},
    remove() {},
  }
  globalThis.document = {
    createElement: () => link,
    body: {
      appendChild: (node: unknown) => node,
    },
  } as unknown as Document
  URL.createObjectURL = () => 'blob:vancine-test'
  URL.revokeObjectURL = () => undefined
}

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.open = originalOpen
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, 'document')
  } else {
    globalThis.document = originalDocument
  }
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
})

describe('downloadGeneratedImage', () => {
  it('opens a new window when a remote download fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as typeof fetch
    let opened = ''
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage(
      { url: 'https://example.invalid/a.png' },
      0
    )
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, true)
    assert.equal(opened, 'https://example.invalid/a.png')
  })

  it('does not fetch or window.open illegal urls', async () => {
    let fetched = ''
    let opened = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage(
      { url: 'javascript:alert(1)' },
      0
    )
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, false)
    assert.equal(fetched, '')
    assert.equal(opened, '')
  })

  it('falls back to a valid URL when Base64 is malformed', async () => {
    let fetched = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    let opened = ''
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage(
      {
        b64Json: 'iVBORw0KGgo%%%',
        url: 'https://example.invalid/a.png',
      },
      0
    )
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, true)
    assert.equal(fetched, 'https://example.invalid/a.png')
    assert.equal(opened, 'https://example.invalid/a.png')
  })

  it('does not throw when only malformed Base64 is present', async () => {
    let fetched = ''
    let opened = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage({ b64Json: '%%%' }, 0)
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, false)
    assert.equal(fetched, '')
    assert.equal(opened, '')
  })

  it('rejects vertical tab wrapping around legal png base64', async () => {
    let fetched = ''
    let opened = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage(
      { b64Json: `iVBORw0KGgo\vAAAANSUhEUg` },
      0
    )
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, false)
    assert.equal(fetched, '')
    assert.equal(opened, '')
  })

  it('rejects nbsp wrapping around legal png base64', async () => {
    let fetched = ''
    let opened = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const result = await downloadGeneratedImage(
      { b64Json: `iVBORw0KGgo\u00a0AAAANSUhEUg` },
      0
    )
    assert.equal(result.ok, false)
    assert.equal(result.openedWindow, false)
    assert.equal(fetched, '')
    assert.equal(opened, '')
  })

  it('accepts form-feed, space, tab, lf, and cr wrapping around legal base64', async () => {
    stubDownloadDom()
    let fetched = ''
    let opened = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched = String(input)
      throw new Error('network')
    }) as typeof fetch
    globalThis.open = ((url: string) => {
      opened = String(url)
      return {} as Window
    }) as typeof globalThis.open

    const wrapped = [
      ` ${PNG} `,
      `\t${PNG}\t`,
      `\n${PNG}\n`,
      `\r${PNG}\r`,
      `iVBORw0KGgo\fAAAANSUhEUg`,
    ]
    for (const b64Json of wrapped) {
      const result = await downloadGeneratedImage({ b64Json }, 0)
      assert.equal(result.ok, true, b64Json)
    }
    assert.equal(fetched, '')
    assert.equal(opened, '')
  })
})

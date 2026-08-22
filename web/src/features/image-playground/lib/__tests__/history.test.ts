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
import { describe, it } from 'node:test'

import type { ImageGenerationRun } from '../../types'
import {
  IMAGE_HISTORY_MAX_RUNS,
  clearRuns,
  imageHistoryStorageKey,
  loadRuns,
  persistRuns,
} from '../history'

type MemoryStorage = {
  data: Map<string, string>
}

function createMemoryStorage(): MemoryStorage & Storage {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) ?? null) : null),
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  } as MemoryStorage & Storage
}

function makeRun(
  overrides: Partial<ImageGenerationRun> = {}
): ImageGenerationRun {
  return {
    id: 'run-1',
    createdAt: '2026-06-01T10:00:00.000Z',
    model: 'qwen-image-2.0',
    group: 'default',
    provider: 'Ali',
    prompt: 'a red apple',
    size: '1024x1024',
    n: 1,
    referenceCount: 0,
    images: [{ url: 'https://example.invalid/a.png' }],
    ...overrides,
  }
}

describe('image playground history storage', () => {
  it('round-trips url-only runs', () => {
    const storage = createMemoryStorage()
    const run = makeRun({
      images: [
        { url: 'https://example.invalid/a.png', revisedPrompt: 'apple' },
      ],
    })
    persistRuns(1, [run], storage)
    const restored = loadRuns(1, storage)
    assert.equal(restored.length, 1)
    assert.equal(restored[0].model, 'qwen-image-2.0')
    assert.equal(restored[0].images.length, 1)
    assert.equal(restored[0].images[0].url, 'https://example.invalid/a.png')
    assert.equal(restored[0].images[0].revisedPrompt, 'apple')
  })

  it('never serializes b64_json into storage', () => {
    const storage = createMemoryStorage()
    const run = makeRun({
      images: [
        {
          url: 'https://example.invalid/a.png',
          b64Json: 'iVBORw0KGgo',
        },
        { b64Json: 'iVBORw0KGgo' },
      ],
    })
    persistRuns(1, [run], storage)
    const raw = storage.data.get(imageHistoryStorageKey(1)) ?? ''
    assert.ok(!raw.includes('b64_json'))
    assert.ok(!raw.includes('iVBORw0KGgo'))
  })

  it('drops runs whose images have no usable http url', () => {
    const storage = createMemoryStorage()
    const run = makeRun({
      images: [
        { url: 'javascript:alert(1)' },
        { url: 'file:///tmp/a.png' },
        { url: 'data:image/png;base64,iVBORw0KGgo' },
        { b64Json: 'iVBORw0KGgo' },
      ],
    })
    persistRuns(1, [run], storage)
    assert.equal(loadRuns(1, storage).length, 0)
    assert.equal(
      storage.data.get(imageHistoryStorageKey(1)),
      '{"version":1,"runs":[]}'
    )
  })

  it('isolates histories per user id', () => {
    const storage = createMemoryStorage()
    persistRuns(1, [makeRun({ prompt: 'user one' })], storage)
    persistRuns(2, [makeRun({ prompt: 'user two' })], storage)
    assert.equal(loadRuns(1, storage)[0].prompt, 'user one')
    assert.equal(loadRuns(2, storage)[0].prompt, 'user two')
    clearRuns(1, storage)
    assert.equal(loadRuns(1, storage).length, 0)
    assert.equal(loadRuns(2, storage).length, 1)
  })

  it('fails closed on corrupt json', () => {
    const storage = createMemoryStorage()
    storage.data.set(imageHistoryStorageKey(1), '{not json')
    assert.equal(loadRuns(1, storage).length, 0)
  })

  it('fails closed on unknown versions', () => {
    const storage = createMemoryStorage()
    storage.data.set(
      imageHistoryStorageKey(1),
      JSON.stringify({ version: 99, runs: [makeRun()] })
    )
    assert.equal(loadRuns(1, storage).length, 0)
    storage.data.set(imageHistoryStorageKey(1), JSON.stringify([makeRun()]))
    assert.equal(loadRuns(1, storage).length, 0)
  })

  it('ignores individual invalid records but keeps valid ones', () => {
    const storage = createMemoryStorage()
    const good = makeRun({ id: 'good' })
    const badShape = { definitely: 'not a run' }
    const badUrl = makeRun({ id: 'bad-url', images: [{ url: 'not a url' }] })
    storage.data.set(
      imageHistoryStorageKey(1),
      JSON.stringify({ version: 1, runs: [good, badShape, badUrl] })
    )
    const restored = loadRuns(1, storage)
    assert.equal(restored.length, 1)
    assert.equal(restored[0].id, 'good')
  })

  it('drops restored images with invalid urls', () => {
    const storage = createMemoryStorage()
    const run = makeRun({
      images: [
        { url: 'https://example.invalid/a.png' },
        { url: 'javascript:alert(1)' },
      ],
    })
    storage.data.set(
      imageHistoryStorageKey(1),
      JSON.stringify({ version: 1, runs: [run] })
    )
    const restored = loadRuns(1, storage)
    assert.equal(restored.length, 1)
    assert.equal(restored[0].images.length, 1)
  })

  it('keeps only the newest 50 runs when persisting', () => {
    const storage = createMemoryStorage()
    const runs = Array.from({ length: 60 }, (_, index) =>
      makeRun({
        id: `run-${59 - index}`,
        createdAt: new Date(2026, 0, 1 + (59 - index)).toISOString(),
      })
    )
    persistRuns(1, runs, storage)
    const restored = loadRuns(1, storage)
    assert.equal(restored.length, IMAGE_HISTORY_MAX_RUNS)
    assert.equal(restored[0].id, 'run-59')
    assert.equal(restored[IMAGE_HISTORY_MAX_RUNS - 1].id, 'run-10')
  })

  it('never throws when storage operations fail', () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('unavailable')
      },
    } as unknown as Storage
    persistRuns(1, [makeRun()], throwing)
    assert.equal(loadRuns(1, throwing).length, 0)
    clearRuns(1, throwing)
  })

  it('does nothing without storage', () => {
    persistRuns(1, [makeRun()], null)
    assert.equal(loadRuns(1, null).length, 0)
    clearRuns(1, null)
  })
})

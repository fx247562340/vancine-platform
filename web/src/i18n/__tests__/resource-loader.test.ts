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
// Regression tests for the lazy i18n resource loader. These exercise the real
// exported functions and the backend `read` contract (bundle unwrapping,
// unsupported-language fallback, loader-failure fallback, namespace rejection,
// and exactly-once callback invocation) rather than asserting on source text.
//
// Failure paths are exercised through the explicit dependency-injection seams
// (`loadTranslationBundle(language, loaders)` and
// `createLazyResourceBackend(loadBundle)`); the shared module-level
// `LOCALE_LOADERS` is never mutated, so no global state leaks between tests.
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  createLazyResourceBackend,
  loadTranslationBundle,
  unwrapTranslationBundle,
  type LocaleLoaderTable,
} from '../resource-loader'

describe('unwrapTranslationBundle', () => {
  test('unwraps a dynamic-import module with a default export', () => {
    const mod = { default: { translation: { hello: 'Hi' } } }
    assert.deepEqual(unwrapTranslationBundle(mod), { hello: 'Hi' })
  })

  test('unwraps a top-level translation wrapper without default', () => {
    const mod = { translation: { hello: 'Hi' } }
    assert.deepEqual(unwrapTranslationBundle(mod), { hello: 'Hi' })
  })

  test('returns the object itself when there is no translation wrapper', () => {
    const mod = { hello: 'Hi' }
    assert.deepEqual(unwrapTranslationBundle(mod), { hello: 'Hi' })
  })

  test('returns an empty object for non-object input', () => {
    assert.deepEqual(unwrapTranslationBundle(null), {})
    assert.deepEqual(unwrapTranslationBundle(undefined), {})
    assert.deepEqual(unwrapTranslationBundle('not-an-object'), {})
    assert.deepEqual(unwrapTranslationBundle(42), {})
    assert.deepEqual(unwrapTranslationBundle({ default: null }), {})
  })

  test('returns an empty object for arrays and invalid translation wrappers', () => {
    // Arrays are never a valid bundle, top-level or behind a default export.
    assert.deepEqual(unwrapTranslationBundle([]), {})
    assert.deepEqual(unwrapTranslationBundle({ default: [] }), {})
    // A present-but-invalid `translation` wrapper yields an empty bundle.
    assert.deepEqual(unwrapTranslationBundle({ translation: null }), {})
    assert.deepEqual(unwrapTranslationBundle({ translation: [] }), {})
    assert.deepEqual(unwrapTranslationBundle({ translation: 'invalid' }), {})
    assert.deepEqual(unwrapTranslationBundle({ translation: 42 }), {})
  })
})

describe('loadTranslationBundle', () => {
  test('loads a supported language and returns its translation bundle', async () => {
    const bundle = await loadTranslationBundle('en')
    // The real en bundle carries thousands of keys; an empty result would mean
    // the loader silently fell back.
    assert.ok(
      Object.keys(bundle).length > 100,
      'expected the real en translation bundle to be loaded'
    )
  })

  test('returns an empty object for an unsupported language', async () => {
    assert.deepEqual(await loadTranslationBundle('xx'), {})
  })

  test('returns an empty object without rejecting when a loader fails', async () => {
    // Injected locally via the loaders seam; the shared LOCALE_LOADERS is
    // untouched.
    const failing: LocaleLoaderTable = {
      en: () => Promise.reject(new Error('chunk failed to load')),
    }
    const bundle = await loadTranslationBundle('en', failing)
    assert.deepEqual(bundle, {})
  })
})

describe('createLazyResourceBackend().read', () => {
  function collect() {
    let callCount = 0
    let receivedError: unknown = 'sentinel'
    let receivedData: unknown = 'sentinel'
    const callback = (err: unknown, data: unknown): void => {
      callCount += 1
      receivedError = err
      receivedData = data
    }
    return {
      callback,
      summary: () => ({ callCount, receivedError, receivedData }),
    }
  }

  test('translation success invokes the callback once with the real bundle', async () => {
    const backend = createLazyResourceBackend()
    const { callback, summary } = collect()

    await backend.read('en', 'translation', callback)

    const { callCount, receivedError, receivedData } = summary()
    assert.equal(callCount, 1)
    assert.equal(receivedError, null)
    assert.ok(receivedData && typeof receivedData === 'object')
    assert.ok(
      Object.keys(receivedData as object).length > 100,
      'expected the callback to receive the real en bundle'
    )
  })

  test('translation fallback invokes the callback once with an empty object', async () => {
    const backend = createLazyResourceBackend()
    const { callback, summary } = collect()

    await backend.read('xx', 'translation', callback)

    const { callCount, receivedError, receivedData } = summary()
    assert.equal(callCount, 1)
    assert.equal(receivedError, null)
    assert.deepEqual(receivedData, {})
  })

  test('a rejecting loadBundle still invokes the callback once with an empty object', async () => {
    // Injected locally via the loadBundle seam; the shared LOCALE_LOADERS is
    // untouched. This exercises the read's rejection fallback specifically.
    const backend = createLazyResourceBackend(() =>
      Promise.reject(new Error('bundle load failed'))
    )
    const { callback, summary } = collect()

    await backend.read('en', 'translation', callback)

    const { callCount, receivedError, receivedData } = summary()
    assert.equal(callCount, 1)
    assert.equal(receivedError, null)
    assert.deepEqual(receivedData, {})
  })

  test('non-translation namespace invokes the callback once with Error + null', async () => {
    const backend = createLazyResourceBackend()
    const { callback, summary } = collect()

    await backend.read('en', 'docs', callback)

    const { callCount, receivedError, receivedData } = summary()
    assert.equal(callCount, 1)
    assert.ok(receivedError instanceof Error)
    assert.equal(receivedData, null)
  })
})

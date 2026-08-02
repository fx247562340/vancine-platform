// Run with: node --test src/lib/legacy-redirect.test.ts
//
// Executable behavioral tests for the legacy redirect construction
// helper. These tests verify that incoming query params and hash are
// preserved in the output — the exact regression that source-string
// assertions missed.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildLegacyRedirect,
  legacySearchSchema,
} from './legacy-redirect.ts'

describe('buildLegacyRedirect', () => {
  test('preserves all incoming query params', () => {
    const result = buildLegacyRedirect({
      to: '/wallet',
      location: {
        search: { show_history: true, pay: 'stripe' },
        hash: '',
      },
    })

    assert.deepEqual(result.search, { show_history: true, pay: 'stripe' })
  })

  test('preserves incoming hash', () => {
    const result = buildLegacyRedirect({
      to: '/wallet',
      location: {
        search: { show_history: true },
        hash: 'billing',
      },
    })

    assert.equal(result.hash, 'billing')
  })

  test('preserves both query and hash simultaneously', () => {
    const result = buildLegacyRedirect({
      to: '/wallet',
      location: {
        search: { show_history: true, payment_error: 'declined' },
        hash: 'billing',
      },
    })

    assert.deepEqual(result.search, {
      show_history: true,
      payment_error: 'declined',
    })
    assert.equal(result.hash, 'billing')
  })

  test('forwards empty search and empty hash', () => {
    const result = buildLegacyRedirect({
      to: '/channels',
      location: { search: {}, hash: '' },
    })

    assert.deepEqual(result.search, {})
    assert.equal(result.hash, '')
  })

  test('always sets replace: true', () => {
    const result = buildLegacyRedirect({
      to: '/keys',
      location: { search: {}, hash: '' },
    })

    assert.equal(result.replace, true)
  })

  test('sets target path', () => {
    const result = buildLegacyRedirect({
      to: '/dashboard/$section',
      location: { search: {}, hash: '' },
      params: { section: 'overview' },
    })

    assert.equal(result.to, '/dashboard/$section')
  })

  test('includes typed params when provided', () => {
    const result = buildLegacyRedirect({
      to: '/dashboard/$section',
      location: { search: { tab: 'usage' }, hash: 'charts' },
      params: { section: 'overview' },
    })

    assert.deepEqual(result.params, { section: 'overview' })
    assert.deepEqual(result.search, { tab: 'usage' })
    assert.equal(result.hash, 'charts')
  })

  test('omits params key when no params provided', () => {
    const result = buildLegacyRedirect({
      to: '/channels',
      location: { search: {}, hash: '' },
    })

    assert.equal('params' in result, false)
  })

  test('preserves dynamic chat id param with query and hash', () => {
    const result = buildLegacyRedirect({
      to: '/chat/$chatId',
      location: {
        search: { model: 'gpt-4' },
        hash: 'messages',
      },
      params: { chatId: 'session-42' },
    })

    assert.deepEqual(result.params, { chatId: 'session-42' })
    assert.deepEqual(result.search, { model: 'gpt-4' })
    assert.equal(result.hash, 'messages')
  })

  test('does not invent query values', () => {
    // Bare /console/topup with no query must not add show_history
    const result = buildLegacyRedirect({
      to: '/wallet',
      location: { search: {}, hash: '' },
    })

    assert.deepEqual(result.search, {})
    assert.ok(!('show_history' in result.search))
  })

  test('preserves caller-provided show_history when present', () => {
    // /console/topup?show_history=true must forward it
    const result = buildLegacyRedirect({
      to: '/wallet',
      location: { search: { show_history: true }, hash: '' },
    })

    assert.equal(result.search.show_history, true)
  })
})

describe('legacySearchSchema', () => {
  test('captures arbitrary query params', () => {
    const parsed = legacySearchSchema.parse({
      show_history: 'true',
      pay: 'stripe',
      foo: 42,
    })

    assert.deepEqual(parsed, {
      show_history: 'true',
      pay: 'stripe',
      foo: 42,
    })
  })

  test('returns empty object for invalid input', () => {
    const parsed = legacySearchSchema.parse(undefined)
    assert.deepEqual(parsed, {})
  })

  test('returns empty object for non-object input', () => {
    const parsed = legacySearchSchema.parse('invalid')
    assert.deepEqual(parsed, {})
  })
})

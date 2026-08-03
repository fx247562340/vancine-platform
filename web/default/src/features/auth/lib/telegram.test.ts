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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Pure-logic contract tests for the Telegram login param builder.
// Run with: node --test --experimental-strip-types src/features/auth/lib/telegram.test.ts
//
// These guard the exact field list the Classic theme forwards to
// /api/oauth/telegram/login, so the backend HMAC signature check receives the
// same inputs after the Default-theme migration.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildTelegramLoginParams, TELEGRAM_AUTH_FIELDS } from './telegram.ts'

describe('TELEGRAM_AUTH_FIELDS', () => {
  test('matches the Classic field list exactly', () => {
    assert.deepEqual(
      [...TELEGRAM_AUTH_FIELDS],
      [
        'id',
        'first_name',
        'last_name',
        'username',
        'photo_url',
        'auth_date',
        'hash',
        'lang',
      ]
    )
  })
})

describe('buildTelegramLoginParams', () => {
  test('forwards all 8 Classic fields when present', () => {
    const payload = {
      id: 123456789,
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      photo_url: 'https://t.me/avatar.jpg',
      auth_date: 1700000000,
      hash: 'deadbeef',
      lang: 'en',
    }
    assert.deepEqual(buildTelegramLoginParams(payload), payload)
  })

  test('drops unknown/extra fields so they never reach the signature', () => {
    const params = buildTelegramLoginParams({
      id: 1,
      hash: 'h',
      evil_field: 'x',
      another: 'y',
    })
    assert.deepEqual(params, { id: 1, hash: 'h' })
  })

  test('drops empty/undefined values (truthy filter like Classic)', () => {
    const params = buildTelegramLoginParams({
      id: 2,
      first_name: '',
      username: undefined,
      last_name: 'Z',
      hash: 'h',
    })
    assert.deepEqual(params, { id: 2, last_name: 'Z', hash: 'h' })
  })

  test('returns an empty object for an empty payload', () => {
    assert.deepEqual(buildTelegramLoginParams({}), {})
  })
})

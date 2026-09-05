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
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, test } from 'vitest'

import {
  BENCHMARK_JSON_PATH,
  getCodingAgentBenchmarkPublicJson,
} from '../coding-agent-benchmark'

const publicJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'public',
  'benchmarks',
  'pi-coding-agent-2026-08-28.json'
)

describe('public benchmark JSON file', () => {
  test('download path matches the static file name', () => {
    assert.equal(
      BENCHMARK_JSON_PATH,
      '/benchmarks/pi-coding-agent-2026-08-28.json'
    )
  })

  test('file matches the desensitized contract', () => {
    const raw = readFileSync(publicJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as ReturnType<
      typeof getCodingAgentBenchmarkPublicJson
    >
    assert.deepEqual(parsed, getCodingAgentBenchmarkPublicJson())
    for (const forbidden of [
      'user_id',
      'userId',
      'username',
      'api_key',
      'apiKey',
      'token_name',
      'request_id',
      'requestId',
      'upstream_request_id',
      'quota',
      '/Users/',
      'sk-',
    ]) {
      assert.ok(!raw.includes(forbidden), forbidden)
    }
  })
})

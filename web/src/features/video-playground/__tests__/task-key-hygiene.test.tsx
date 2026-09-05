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
import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  createVideoRecorder,
  deferred,
  jsonResponse,
  stubKeyEndpoints,
  statusEnvelope,
  SUBMIT_API_KEY,
  videoArtifact,
  type VideoFetchRoute,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  fillAndSubmitPrompt,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const TASK_ID = 'task-123'

const recorder = createVideoRecorder()
const calls = recorder.calls

function installRecorder(route: VideoFetchRoute): void {
  recorder.install(route)
}

describe('query cache, mutation cache, storage, URL, DOM and console hygiene', () => {
  let i18n: I18n
  let consoleSpies: ReturnType<typeof vi.spyOn>[]

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    clearAllTaskApiKeys()
    vi.unstubAllGlobals()
    apiClientMock.get.mockReset()
    apiClientMock.post.mockReset()
    stubKeyEndpoints(apiClientMock)
    consoleSpies = (['error', 'warn', 'log', 'info', 'debug'] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined)
    )
  })

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore())
    // vi.restoreAllMocks() does not undo vi.stubGlobal: restore fetch too.
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the test key out of storage, request URLs, query cache, mutation cache, console output, and the rendered DOM', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const lateResponse = deferred<Response>()
    installRecorder((url) => {
      if (url === '/v1/models') {
        return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
      }
      if (url === '/v1/video/generations') {
        return lateResponse.promise
      }
      if (url.startsWith('/v1/video/generations/')) {
        return jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS'))
      }
      if (url.startsWith('/v1/tasks/')) {
        return jsonResponse(
          200,
          artifactsEnvelope(TASK_ID, [videoArtifact(TASK_ID)])
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const { unmount } = renderVideoPlayground(i18n, client)
    await fillAndSubmitPrompt()

    // While the submit mutation is still in flight, inspect its observable
    // state (mutations are collected immediately after settling).
    await waitFor(() => {
      expect(client.getMutationCache().getAll().length).toBeGreaterThan(0)
    })
    for (const mutation of client.getMutationCache().getAll()) {
      expect(describeState(mutation.state)).not.toContain(SUBMIT_API_KEY)
    }

    lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
    await screen.findByLabelText('Generated video')

    // Browser storage.
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)

    // Request URLs (the key may only appear in the Authorization header).
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).not.toContain(SUBMIT_API_KEY)
    }

    // Rendered DOM, including attributes.
    expect(document.documentElement.innerHTML).not.toContain(SUBMIT_API_KEY)

    // Public query cache surface: queryKey plus observable state.
    const queries = client.getQueryCache().getAll()
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(JSON.stringify(query.queryKey)).not.toContain(SUBMIT_API_KEY)
      expect(describeState(query.state)).not.toContain(SUBMIT_API_KEY)
    }

    // Console output produced by this flow.
    const logged = consoleSpies
      .flatMap((spy) => spy.mock.calls.flat())
      .map((argument) => describeState(argument))
      .join('\n')
    expect(logged).not.toContain(SUBMIT_API_KEY)

    unmount()
  })
})

function describeState(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return `${value.name} ${value.message}`
  }
  const seen = new WeakSet<object>()
  try {
    return (
      JSON.stringify(value, (_key, inner: unknown) => {
        if (inner instanceof Error) {
          return `${inner.name} ${inner.message}`
        }
        if (inner && typeof inner === 'object') {
          if (seen.has(inner as object)) {
            return '[circular]'
          }
          seen.add(inner as object)
        }
        return inner
      }) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

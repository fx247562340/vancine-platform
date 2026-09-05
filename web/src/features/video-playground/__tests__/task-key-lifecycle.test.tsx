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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { i18n as I18n } from 'i18next'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { getVideoTask, submitVideoGenerationWithApiKey } from '../api'
import { useSubmission } from '../hooks/use-submission'
import {
  clearAllTaskApiKeys,
  lookupTaskApiKey,
  rememberTaskApiKey,
} from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  capabilityUrl,
  createVideoRecorder,
  deferred,
  jsonResponse,
  nextMutationSettled,
  OTHER_API_KEY,
  stubKeyEndpoints,
  statusEnvelope,
  SUBMIT_API_KEY,
  videoArtifact,
  type RecordedCall,
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

/** Status route replies with a fixed Response; artifacts default to one video. */
function stubStatusThenArtifacts(status: Response | Promise<Response>): void {
  installRecorder((url) => {
    if (url.startsWith('/v1/video/generations/')) {
      return status
    }
    if (url.startsWith('/v1/tasks/')) {
      return jsonResponse(
        200,
        artifactsEnvelope(TASK_ID, [videoArtifact(TASK_ID)])
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

function statusRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/video/generations/'))
}

describe('video task API key lifecycle', () => {
  beforeEach(() => {
    clearAllTaskApiKeys()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    // Restore the real global fetch for the next test, whatever it stubs.
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reuses the submit key for status and artifacts while the task runs', async () => {
    stubStatusThenArtifacts(
      jsonResponse(200, statusEnvelope(TASK_ID, 'IN_PROGRESS'))
    )
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    const task = await getVideoTask(TASK_ID)

    expect(task.status).toBe('IN_PROGRESS')
    expect(
      calls.every((call) => call.authorization === `Bearer ${SUBMIT_API_KEY}`)
    ).toBe(true)
    // Still running: the key stays bound for the next poll.
    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
  })

  it('clears the key once SUCCESS and artifacts are fully parsed', async () => {
    stubStatusThenArtifacts(
      jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS'))
    )
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    const task = await getVideoTask(TASK_ID)

    expect(task.content_url).toBe(capabilityUrl(TASK_ID, 'video'))
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('clears the key on FAILURE without requesting artifacts', async () => {
    stubStatusThenArtifacts(
      jsonResponse(
        200,
        statusEnvelope(TASK_ID, 'FAILURE', { fail_reason: 'nope' })
      )
    )
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    await getVideoTask(TASK_ID)

    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    expect(calls.some((call) => call.url.startsWith('/v1/tasks/'))).toBe(false)
  })

  it.each([400, 401, 403, 404, 410])(
    'clears the key and issues exactly one status request on %i',
    async (code) => {
      stubStatusThenArtifacts(
        jsonResponse(code, { error: { message: 'unrecoverable' } })
      )
      rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

      await expect(getVideoTask(TASK_ID)).rejects.toThrowError(
        expect.objectContaining({ name: 'VideoPlaygroundError' })
      )

      expect(statusRequests()).toHaveLength(1)
      expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    }
  )

  it.each([500, 502, 503])(
    'keeps the key across a retryable %i',
    async (code) => {
      stubStatusThenArtifacts(jsonResponse(code, {}))
      rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

      await expect(getVideoTask(TASK_ID)).rejects.toThrowError(
        expect.objectContaining({ name: 'VideoPlaygroundError' })
      )
      expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)

      // A second automatic attempt must still authenticate with the same key.
      await expect(getVideoTask(TASK_ID)).rejects.toThrowError(
        expect.objectContaining({ name: 'VideoPlaygroundError' })
      )
      expect(
        calls.every((call) => call.authorization === `Bearer ${SUBMIT_API_KEY}`)
      ).toBe(true)
      expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
    }
  )

  it('keeps the key across a retryable 429 rate limit', async () => {
    stubStatusThenArtifacts(jsonResponse(429, {}))
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    await expect(getVideoTask(TASK_ID)).rejects.toThrowError(
      expect.objectContaining({ name: 'VideoPlaygroundError' })
    )
    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
  })

  it('clears the key when the artifacts response violates the contract', async () => {
    installRecorder((url) => {
      if (url.startsWith('/v1/video/generations/')) {
        return jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS'))
      }
      return jsonResponse(200, {
        task_id: TASK_ID,
        artifacts: [
          {
            key: 'video',
            type: 'movie',
            content_url: capabilityUrl(TASK_ID, 'video'),
          },
        ],
      })
    })
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    await expect(getVideoTask(TASK_ID)).rejects.toMatchObject({
      source: {
        kind: 'system',
        errorKey: 'Failed to load video status',
        terminal: true,
      },
    })
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('keeps a previously polling task on its own key when a new submit binds a different key', async () => {
    rememberTaskApiKey('task-running-before', OTHER_API_KEY)
    installRecorder(() => jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))

    await submitVideoGenerationWithApiKey(SUBMIT_API_KEY, {
      model: 'Doubao-Seedance-2.5',
      prompt: 'a cat',
    })

    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
    expect(lookupTaskApiKey('task-running-before')).toBe(OTHER_API_KEY)

    // The old task's own polling keeps authenticating with its submit key.
    stubStatusThenArtifacts(
      jsonResponse(200, {
        code: 'success',
        data: { task_id: 'task-running-before', status: 'IN_PROGRESS' },
      })
    )
    const old = await getVideoTask('task-running-before')
    expect(old.status).toBe('IN_PROGRESS')
    expect(
      calls.every((call) => call.authorization === `Bearer ${OTHER_API_KEY}`)
    ).toBe(true)
    expect(lookupTaskApiKey('task-running-before')).toBe(OTHER_API_KEY)
  })

  it('fails terminally when no key is bound to the task', async () => {
    installRecorder(() => jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS')))

    await expect(getVideoTask(TASK_ID)).rejects.toMatchObject({
      source: {
        kind: 'system',
        errorKey: 'Failed to load video status',
        terminal: true,
      },
    })
    // A terminal failure never issues a request.
    expect(calls).toHaveLength(0)
  })
})

describe('late submit responses after unmount or cancel', () => {
  let i18n: I18n

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    clearAllTaskApiKeys()
    vi.unstubAllGlobals()
    apiClientMock.get.mockReset()
    apiClientMock.post.mockReset()
    stubKeyEndpoints(apiClientMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not re-register a key when the page unmounts while a submit is in flight', async () => {
    // Scenario A: a POST that deliberately ignores its AbortSignal and only
    // resolves after the page is gone.
    const lateResponse = deferred<Response>()
    installRecorder((url) => {
      if (url === '/v1/models') {
        return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
      }
      if (url === '/v1/video/generations') {
        return lateResponse.promise
      }
      throw new Error(`unexpected status fetch: ${url}`)
    })

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const { unmount } = renderVideoPlayground(i18n, client)
    await fillAndSubmitPrompt()
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/v1/video/generations')).toBe(
        true
      )
    })

    // Completion event: the in-flight submit mutation reaches a terminal
    // state (rejected by the unmount abort) once the late response is served.
    const submitSettled = nextMutationSettled(client)
    unmount()
    await act(async () => {
      lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
      await submitSettled
    })

    // The late response never re-binds a key, and no status request follows.
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    expect(
      calls.some((call) => call.url.startsWith('/v1/video/generations/'))
    ).toBe(false)
  })

  it('surfaces a cancelled response body as AbortError instead of a system error', async () => {
    // response.json() rejecting with AbortError must not be degraded into an
    // empty payload and then a generic "Failed to load video status" error.
    installRecorder(
      () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw Object.assign(new Error('aborted body'), {
              name: 'AbortError',
            })
          },
        }) as unknown as Response
    )
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)

    await expect(getVideoTask(TASK_ID)).rejects.toMatchObject({
      name: 'AbortError',
    })
    // Cancellation is not a task failure: the key stays bound.
    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
  })

  it('keeps the key when a status poll is aborted while in flight', async () => {
    const pending = deferred<Response>()
    installRecorder((url) => {
      if (url.startsWith('/v1/video/generations/')) {
        return pending.promise
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    rememberTaskApiKey(TASK_ID, SUBMIT_API_KEY)
    const controller = new AbortController()

    const polling = getVideoTask(TASK_ID, controller.signal)
    controller.abort()
    // A stub that ignores its signal still delivers the late body.
    pending.resolve(jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS')))

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' })
    // A late SUCCESS must not clear the key of a task the user is still on.
    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)
  })

  it('rejects an already-aborted submit with AbortError and registers no key', async () => {
    // Scenario A at the api boundary: the request is served even though the
    // caller aborted before the response landed.
    const lateResponse = deferred<Response>()
    installRecorder((url) => {
      if (url === '/v1/video/generations') {
        return lateResponse.promise
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const controller = new AbortController()
    controller.abort()

    const submitted = submitVideoGenerationWithApiKey(
      SUBMIT_API_KEY,
      { model: 'Doubao-Seedance-2.5', prompt: 'a cat' },
      undefined,
      controller.signal
    )
    lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))

    await expect(submitted).rejects.toMatchObject({ name: 'AbortError' })
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('does not resume polling when a cancelled submit resolves with a task id', async () => {
    // Scenario B: cancel while the submit is in flight, then deliver it.
    const lateResponse = deferred<Response>()
    installRecorder((url) => {
      if (url === '/v1/models') {
        return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
      }
      if (url === '/v1/video/generations') {
        return lateResponse.promise
      }
      return jsonResponse(200, statusEnvelope(TASK_ID, 'SUBMITTED'))
    })

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    renderVideoPlayground(i18n, client)
    const user = await fillAndSubmitPrompt()
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/v1/video/generations')).toBe(
        true
      )
    })

    await act(async () => {
      await user.click(
        await screen.findByRole('button', {
          name: 'Cancel pending submissions',
        })
      )
    })

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
      await submitSettled
    })

    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    expect(
      calls.some((call) => call.url.startsWith('/v1/video/generations/'))
    ).toBe(false)
    expect(screen.queryByText(/Task ID: task-123/)).toBeNull()
  })

  it('leaves an already-polling task untouched when a later submit is cancelled', async () => {
    // Scenario B with a sibling: task-A reaches polling first, then task-B is
    // cancelled mid-submit. Only B must be dropped.
    const lateResponse = deferred<Response>()
    let submits = 0
    installRecorder((url) => {
      if (url === '/v1/models') {
        return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
      }
      if (url === '/v1/video/generations') {
        submits += 1
        return submits === 1
          ? jsonResponse(200, { task_id: 'task-a', id: 'task-a' })
          : lateResponse.promise
      }
      if (url === '/v1/video/generations/task-a') {
        return jsonResponse(200, statusEnvelope('task-a', 'IN_PROGRESS'))
      }
      return jsonResponse(200, statusEnvelope(TASK_ID, 'SUBMITTED'))
    })

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    renderVideoPlayground(i18n, client)
    const user = await fillAndSubmitPrompt()
    await screen.findByText(/Task ID: task-a/)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Generate' }))
    })
    await waitFor(() => {
      expect(
        calls.filter((call) => call.url === '/v1/video/generations')
      ).toHaveLength(2)
    })

    await act(async () => {
      await user.click(
        await screen.findByRole('button', {
          name: 'Cancel pending submissions',
        })
      )
    })

    // Completion event: the cancelled second submit settles. The first
    // (task-a) mutation already settled before this watcher was installed.
    const secondSubmitSettled = nextMutationSettled(client)
    await act(async () => {
      lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
      await secondSubmitSettled
    })

    // The cancelled submit never binds a key nor starts a status request.
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    expect(
      calls.some((call) => call.url === `/v1/video/generations/${TASK_ID}`)
    ).toBe(false)
    expect(screen.queryByText(/Task ID: task-123/)).toBeNull()

    // The already-polling task keeps running with its own key.
    expect(lookupTaskApiKey('task-a')).toBe(SUBMIT_API_KEY)
    expect(screen.getByText(/Task ID: task-a/)).toBeTruthy()
    expect(
      calls.some((call) => call.url === '/v1/video/generations/task-a')
    ).toBe(true)
  })

  it('does not move a cancelled submission into polling when submit resolves late', async () => {
    // The useSubmission seam: a submit that hands back a task id AFTER the
    // epoch was invalidated must be dropped, not adopted into polling.
    const late = deferred<{ task_id: string }>()
    const submit = vi.fn(async () => late.promise)
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    function Wrapper({ children }: { children: ReactNode }): ReactElement {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }

    const { result, rerender } = renderHook(
      ({ keyId }: { keyId: number | null }) =>
        useSubmission({ submit, batchSize: 1, keyId }),
      { initialProps: { keyId: 1 }, wrapper: Wrapper }
    )

    act(() => {
      result.current.start({
        body: { model: 'Doubao-Seedance-2.5' },
        modelId: 'Doubao-Seedance-2.5',
        promptPreview: 'a cat',
      })
    })
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1)
    })

    // Key epoch change (which also aborts the batch) before the reply lands.
    rerender({ keyId: 2 })
    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      late.resolve({ task_id: TASK_ID })
      await submitSettled
    })

    expect(result.current.tasks[0]?.status).toBe('cancelled')
    expect(result.current.tasks[0]?.taskId).toBeNull()
    // No second submit was issued for the discarded result.
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('does not resume polling when the API key is switched mid-submit', async () => {
    // Scenario B via key switching: a second usable key lets the page change
    // the epoch while the first submit is still open.
    const lateResponse = deferred<Response>()
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    apiClientMock.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/token/')) {
        return {
          data: {
            success: true,
            data: {
              items: [
                {
                  id: 2,
                  name: 'key-two',
                  key: 'sk-***2222',
                  status: 1,
                  created_time: 200,
                  expired_time: 0,
                  remain_quota: 0,
                  unlimited_quota: true,
                },
                {
                  id: 3,
                  name: 'key-one',
                  key: 'sk-***1111',
                  status: 1,
                  created_time: 100,
                  expired_time: 0,
                  remain_quota: 0,
                  unlimited_quota: true,
                },
              ],
              total: 2,
            },
          },
        }
      }
      throw new Error(`unexpected api.get: ${url}`)
    })
    apiClientMock.post.mockImplementation(async (url: string) => {
      if (url === '/api/token/3/key') {
        return { data: { success: true, data: { key: SUBMIT_API_KEY } } }
      }
      if (url === '/api/token/2/key') {
        return { data: { success: true, data: { key: OTHER_API_KEY } } }
      }
      throw new Error(`unexpected api.post: ${url}`)
    })
    installRecorder((url) => {
      if (url === '/v1/models') {
        return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
      }
      if (url === '/v1/video/generations') {
        return lateResponse.promise
      }
      return jsonResponse(200, statusEnvelope(TASK_ID, 'SUBMITTED'))
    })

    renderVideoPlayground(i18n, client)
    // A task that already got its id and polls under its own key.
    const ESTABLISHED_KEY = 'sk-test-established-key-not-real'
    rememberTaskApiKey('task-established', ESTABLISHED_KEY)
    const user = await fillAndSubmitPrompt()
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/v1/video/generations')).toBe(
        true
      )
    })

    await act(async () => {
      await user.click(screen.getByLabelText('Connection settings'))
    })
    await act(async () => {
      await user.click(await screen.findByLabelText('API Key'))
    })
    await act(async () => {
      await user.click(await screen.findByRole('option', { name: /key-two/ }))
    })

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      lateResponse.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
      await submitSettled
    })

    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
    // Switching the active key must not disturb a task that already has its
    // own binding: it keeps polling with its submit key.
    expect(lookupTaskApiKey('task-established')).toBe(ESTABLISHED_KEY)
    expect(
      calls.some((call) => call.url.startsWith('/v1/video/generations/'))
    ).toBe(false)
  })
})

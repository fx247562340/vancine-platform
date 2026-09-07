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

/**
 * The page owns exactly ONE submission queue, and every task in it is billed.
 *
 * These tests drive the real page with the real `api.ts`; only the relay
 * `fetch` and the dashboard axios client are faked. An in-flight POST is held
 * open by an explicit deferred and released at a chosen point, so nothing here
 * sleeps or races: "one click, one POST" and "a switch never drops an accepted
 * task" are both proven against the recorded request log.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys, lookupTaskApiKey } from '../lib/task-key-registry'
import {
  createVideoRecorder,
  deferred,
  jsonResponse,
  nextMutationSettled,
  OTHER_API_KEY,
  statusEnvelope,
  stubKeyEndpoints,
  SUBMIT_API_KEY,
  type Deferred,
  type RecordedCall,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  pickVideoModel,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  switchApiKey,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const FIRST_MODEL = 'Doubao-Seedance-2.5'
const SECOND_MODEL = 'wan3.0-video'

const recorder = createVideoRecorder()
const calls = recorder.calls

const MODELS_PAYLOAD = {
  data: [
    { id: FIRST_MODEL, supported_endpoint_types: ['openai-video'] },
    { id: SECOND_MODEL, supported_endpoint_types: ['openai-video'] },
  ],
}

type RelayControl = {
  /** True once the Nth (1-based) POST has been opened and is still held. */
  isHolding(index: number): boolean
  /** Resolves the Nth (1-based) held POST with a task id. */
  releasePost(index: number, taskId: string): void
  /** Flips the task status route between a retryable 503 and a healthy 200. */
  setTaskStatusFailing(failing: boolean): void
}

/**
 * The relay route table. Each POST is handed the next task id so two
 * submissions stay distinguishable; the POSTs listed in `holdPosts` are kept
 * open until the test releases them, which is how a response is made to land
 * after a key switch without waiting on a timer.
 */
function stubRelay(options?: { holdPosts?: number[] }): RelayControl {
  const postedIds: string[] = []
  const held: Array<Deferred<Response> | null> = []
  const holdPosts = new Set(options?.holdPosts ?? [])
  let statusFailing = false

  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, MODELS_PAYLOAD)
    }
    if (url === '/v1/video/generations') {
      const index = postedIds.length + 1
      const taskId = `task-${index}`
      postedIds.push(taskId)
      if (holdPosts.has(index)) {
        const gate = deferred<Response>()
        held[index - 1] = gate
        return gate.promise
      }
      held[index - 1] = null
      return jsonResponse(200, { task_id: taskId, id: taskId })
    }
    if (url.startsWith('/v1/video/generations/')) {
      const taskId = url.slice('/v1/video/generations/'.length)
      // A retryable 503 keeps the task's key bound and keeps the query alive,
      // which is what lets a test force one more status GET on demand.
      if (statusFailing) {
        return jsonResponse(503, { error: { message: 'upstream unavailable' } })
      }
      return jsonResponse(200, statusEnvelope(taskId, 'SUBMITTED'))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })

  return {
    isHolding(index) {
      return held[index - 1] != null
    },
    releasePost(index, taskId) {
      const gate = held[index - 1]
      if (!gate) {
        throw new Error(`POST ${index} is not being held`)
      }
      gate.resolve(jsonResponse(200, { task_id: taskId, id: taskId }))
    },
    setTaskStatusFailing(failing) {
      statusFailing = failing
    },
  }
}

/** Two usable keys, so a key switch can be exercised without extra fixtures. */
function stubTwoKeys(): void {
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
}

function postRequests(): RecordedCall[] {
  return calls.filter((call) => call.url === '/v1/video/generations')
}

function statusRequests(taskId: string): RecordedCall[] {
  return calls.filter((call) => call.url === `/v1/video/generations/${taskId}`)
}

function modelRequests(): RecordedCall[] {
  return calls.filter((call) => call.url === '/v1/models')
}

function recentTaskRows(): HTMLElement[] {
  return within(
    screen.getByRole('region', { name: 'Recent tasks' })
  ).getAllByRole('button')
}

function generateButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Generate video' })
}

async function submitPrompt(
  user: ReturnType<typeof userEvent.setup>,
  prompt: string
): Promise<void> {
  const field = screen.getByLabelText('Prompt')
  await user.clear(field)
  await user.type(field, prompt)
  await user.click(generateButton())
}

let i18n: I18n

describe('Video studio shared submission queue', () => {
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates exactly one task and one POST for one click on Generate video', async () => {
    stubRelay()
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')
    await user.click(generateButton())

    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    await waitFor(() => {
      expect(statusRequests('task-1').length).toBeGreaterThan(0)
    })

    expect(postRequests()).toHaveLength(1)
    expect(recentTaskRows()).toHaveLength(1)
    expect(recentTaskRows()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)
  })

  it('lists both tasks under Recent tasks when a second submit lands while the first is still polling', async () => {
    stubRelay()
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'first clip still running')
    await user.click(generateButton())
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    await waitFor(() => {
      expect(statusRequests('task-1').length).toBeGreaterThan(0)
    })

    // The first task is non-terminal, so the form is free to submit again.
    await submitPrompt(user, 'second clip on top of it')
    expect(await screen.findByText(/Task ID: task-2/)).toBeTruthy()

    await waitFor(() => {
      expect(postRequests()).toHaveLength(2)
    })
    const rows = recentTaskRows()
    expect(rows).toHaveLength(2)
    const list = screen.getByRole('region', { name: 'Recent tasks' })
    expect(within(list).getByText('first clip still running')).toBeTruthy()
    expect(within(list).getByText('second clip on top of it')).toBeTruthy()
    // The newest submission is the one the preview follows.
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true')
    expect(rows[0]).toHaveAttribute('aria-pressed', 'false')
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)
    expect(lookupTaskApiKey('task-2')).toBe(SUBMIT_API_KEY)
  })

  it('reads Submitting..., blocks a second POST while the first is in flight and re-enables the form once the task id arrives', async () => {
    const relay = stubRelay({ holdPosts: [1] })
    // pointer-events:none on a disabled button must not stop the test from
    // proving that the click is refused.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const client = renderVideoPlayground(i18n).client
    await typePrompt(user, 'held open in flight')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => {
      expect(relay.isHolding(1)).toBe(true)
    })
    const inFlight = await screen.findByRole('button', {
      name: 'Submitting...',
    })
    expect(inFlight).toBeDisabled()
    expect(inFlight).toHaveAttribute('aria-busy', 'true')

    // A second click on the in-flight button must not open a second POST.
    await user.click(inFlight)
    expect(postRequests()).toHaveLength(1)

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      relay.releasePost(1, 'task-1')
      await submitSettled
    })

    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submitting...' })).toBeNull()
    await readyGenerateButton()
    // The form is usable again: a fresh prompt produces a second, separate task.
    await submitPrompt(user, 'a second clip after the first landed')
    await waitFor(() => {
      expect(postRequests()).toHaveLength(2)
    })
    expect(await screen.findByText(/Task ID: task-2/)).toBeTruthy()
  })

  it('keeps an accepted task polling with its submit-time key across a model switch and an API key switch', async () => {
    stubTwoKeys()
    const relay = stubRelay()
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    relay.setTaskStatusFailing(true)
    await typePrompt(user, 'accepted before both switches')
    await user.click(generateButton())

    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    // The retryable status failure surfaces the retry affordance while the
    // task's own key stays bound, so a later click forces one more status GET.
    const retry = await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 4000 }
    )
    const beforeSwitches = statusRequests('task-1').length
    expect(beforeSwitches).toBeGreaterThan(0)

    await pickVideoModel(user, SECOND_MODEL)
    await switchApiKey(user, 'key-two')
    await waitFor(() => {
      expect(
        modelRequests().some(
          (call) => call.authorization === `Bearer ${OTHER_API_KEY}`
        )
      ).toBe(true)
    })

    // The accepted task survived both switches: still listed, still Running.
    expect(recentTaskRows()).toHaveLength(1)
    expect(
      screen.getByRole('region', { name: 'Recent tasks' })
    ).toHaveTextContent('accepted before both switches')
    // The badge keeps the polling semantic even while the status query errors.
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Cancelled')).toHaveLength(0)

    relay.setTaskStatusFailing(false)
    await user.click(retry)
    await waitFor(() => {
      expect(statusRequests('task-1').length).toBeGreaterThan(beforeSwitches)
    })

    // Every status GET for this task — including the one issued after the key
    // switch — authenticates with the key that submitted it.
    expect(
      statusRequests('task-1').every(
        (call) => call.authorization === `Bearer ${SUBMIT_API_KEY}`
      )
    ).toBe(true)
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)
  })

  it('leaves a POST that resolves after an API key switch cancelled and never starts polling it', async () => {
    stubTwoKeys()
    const relay = stubRelay({ holdPosts: [1] })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const client = renderVideoPlayground(i18n).client
    await typePrompt(user, 'still in flight at the key switch')
    await user.click(screen.getByRole('button', { name: 'Generate video' }))
    await waitFor(() => {
      expect(relay.isHolding(1)).toBe(true)
    })

    await switchApiKey(user, 'key-two')
    expect((await screen.findAllByText('Cancelled')).length).toBeGreaterThan(0)

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      relay.releasePost(1, 'task-1')
      await submitSettled
    })

    // A late task id must not resurrect a submission the switch cancelled.
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Task ID: task-1/)).toBeNull()
    expect(statusRequests('task-1')).toHaveLength(0)
    expect(lookupTaskApiKey('task-1')).toBeNull()
    expect(postRequests()).toHaveLength(1)
  })
})

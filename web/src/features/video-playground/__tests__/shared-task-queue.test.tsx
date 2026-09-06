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
/**
 * The video page owns ONE submission queue, shared by the dedicated (Seedance)
 * and the generic (Wan3) composer.
 *
 * Before this, each composer created its own pipeline and rendered its own
 * TaskGallery, so switching profile unmounted a composer and took its queued
 * tasks with it: an accepted task_id stopped polling, and a POST whose response
 * was still in flight was aborted and lost. These tests drive the real page and
 * assert, from the user's point of view, that the queue outlives the composer
 * that created each task.
 *
 * Only the two genuinely external boundaries are faked — the relay `fetch` and
 * the dashboard axios client. No test sleeps: an in-flight POST is held open by
 * an explicit deferred and settled at a chosen point, and "still polling" is
 * asserted through the live React Query observer for the task, which is the
 * mechanism that schedules the poll interval.
 */
import { QueryClient } from '@tanstack/react-query'
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
  statusEnvelope,
  stubKeyEndpoints,
  SUBMIT_API_KEY,
  type Deferred,
  type VideoRecorder,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const OTHER_API_KEY = 'sk-test-other-key-not-real'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder: VideoRecorder = createVideoRecorder()
const calls = recorder.calls

/** One Wan3 model (generic profile) and one Seedance model (dedicated profile). */
const TWO_PROFILE_MODELS = [
  {
    id: 'wan3.0-video',
    object: 'model',
    owned_by: 'vancine',
    supported_endpoint_types: ['openai', 'openai-video'],
  },
  {
    id: 'Doubao-Seedance-2.5',
    object: 'model',
    owned_by: 'vancine',
    supported_endpoint_types: ['openai', 'openai-video'],
  },
]

type RelayControl = {
  /** Task ids handed out so far, in submission order. */
  postedIds: string[]
  /** Resolves the Nth (1-based) held POST with a task id. */
  releasePost(index: number, taskId: string): void
  /** True once the Nth (1-based) POST has been opened and is still held. */
  isHolding(index: number): boolean
}

/**
 * Installs the relay routes. Every POST is handed the next task id, so a test
 * that submits twice can tell the two tasks apart. From `holdPostFrom` onward a
 * POST is kept open until the test resolves it, which is how a response is made
 * to land after a profile or key switch without waiting on a timer.
 */
function stubRelay(options?: { holdPostFrom?: number }): RelayControl {
  const postedIds: string[] = []
  const held: Array<Deferred<Response> | null> = []
  const holdFrom = options?.holdPostFrom ?? Number.POSITIVE_INFINITY

  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, { object: 'list', data: TWO_PROFILE_MODELS })
    }
    if (url === '/v1/video/generations') {
      const index = postedIds.length + 1
      const taskId = `task-${index}`
      postedIds.push(taskId)
      if (index >= holdFrom) {
        const gate = deferred<Response>()
        held[index - 1] = gate
        return gate.promise
      }
      held[index - 1] = null
      return jsonResponse(200, { task_id: taskId, id: taskId })
    }
    if (url.startsWith('/v1/video/generations/')) {
      const taskId = url.slice('/v1/video/generations/'.length)
      return jsonResponse(200, statusEnvelope(taskId, 'SUBMITTED'))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })

  return {
    postedIds,
    releasePost(index, taskId) {
      const gate = held[index - 1]
      if (!gate) throw new Error(`POST ${index} is not being held`)
      gate.resolve(jsonResponse(200, { task_id: taskId, id: taskId }))
    },
    isHolding(index) {
      return held[index - 1] != null
    },
  }
}

function statusRequests(taskId: string) {
  return calls.filter((call) => call.url === `/v1/video/generations/${taskId}`)
}

function postRequests() {
  return calls.filter((call) => call.url === '/v1/video/generations')
}

async function selectModel(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByLabelText('Video model'))
  await user.click(await screen.findByRole('option', { name }))
}

async function submitPrompt(
  user: ReturnType<typeof userEvent.setup>,
  prompt: string
) {
  await user.type(screen.getByLabelText('Prompt'), prompt)
  await user.click(screen.getByRole('button', { name: 'Generate' }))
}

async function selectApiKey(
  user: ReturnType<typeof userEvent.setup>,
  namePattern: RegExp
) {
  await act(async () => {
    await user.click(screen.getByLabelText('Connection settings'))
  })
  await act(async () => {
    await user.click(await screen.findByLabelText('API Key'))
  })
  await act(async () => {
    await user.click(await screen.findByRole('option', { name: namePattern }))
  })
}

/**
 * The live observer count for one task's status query. A mounted TaskQueueItem
 * holds exactly one observer, and that observer is what schedules the poll
 * interval — so 1 means "still polling", 0 means the card was unmounted and
 * polling stopped, and 2+ means the queue is rendered more than once.
 */
function taskObservers(client: QueryClient, taskId: string) {
  const query = client
    .getQueryCache()
    .find({ queryKey: ['video-playground-task', taskId] })
  return query?.getObserversCount() ?? 0
}

function taskQueueRegions() {
  return screen.queryAllByRole('region', { name: 'Task queue' })
}

/** Waits until the dedicated composer (and only it) is on screen. */
async function expectDedicatedComposer() {
  await waitFor(() =>
    expect(screen.queryByLabelText('Parameter settings')).toBeTruthy()
  )
}

/** Waits until the generic composer (and only it) is on screen. */
async function expectGenericComposer() {
  await waitFor(() =>
    expect(screen.queryByLabelText('Parameter settings')).toBeNull()
  )
}

function noRetryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('VideoPlayground — one shared task queue across profiles', () => {
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps an accepted Wan3 task visible and polling after switching to Seedance', async () => {
    stubRelay()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { client } = renderVideoPlayground(i18n)
    await readyGenerateButton()

    await submitPrompt(user, 'a cat walks on the moon')
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    await waitFor(() =>
      expect(statusRequests('task-1').length).toBeGreaterThan(0)
    )
    expect(taskObservers(client, 'task-1')).toBe(1)

    // The generic composer unmounts here and the dedicated one mounts.
    await selectModel(user, 'Doubao-Seedance-2.5')
    await expectDedicatedComposer()

    expect(screen.getByText(/Task ID: task-1/)).toBeTruthy()
    expect(screen.getByText('a cat walks on the moon')).toBeTruthy()
    expect(taskObservers(client, 'task-1')).toBe(1)
    expect(taskQueueRegions()).toHaveLength(1)
    expect(postRequests()).toHaveLength(1)
  })

  it('keeps an accepted Seedance task visible after switching to Wan3', async () => {
    stubRelay()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { client } = renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectModel(user, 'Doubao-Seedance-2.5')
    await submitPrompt(user, 'a dog runs on the beach')
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    expect(taskObservers(client, 'task-1')).toBe(1)

    // The dedicated composer unmounts here and the generic one mounts.
    await selectModel(user, 'wan3.0-video')
    await expectGenericComposer()

    expect(screen.getByText(/Task ID: task-1/)).toBeTruthy()
    expect(screen.getByText('a dog runs on the beach')).toBeTruthy()
    expect(taskObservers(client, 'task-1')).toBe(1)
    expect(taskQueueRegions()).toHaveLength(1)
  })

  it('accepts a task_id that only resolves after the profile was switched', async () => {
    const relay = stubRelay({ holdPostFrom: 1 })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const client = noRetryClient()
    renderVideoPlayground(i18n, client)
    await readyGenerateButton()

    await submitPrompt(user, 'held open across a profile switch')
    await waitFor(() => expect(relay.isHolding(1)).toBe(true))
    // The placeholder exists but has no id yet.
    expect(await screen.findByText('Submitting...')).toBeTruthy()
    expect(screen.queryByText(/Task ID:/)).toBeNull()

    await selectModel(user, 'Doubao-Seedance-2.5')
    await expectDedicatedComposer()
    // Still submitting: the queue belongs to the page, not to the composer.
    expect(screen.getByText('Submitting...')).toBeTruthy()

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      relay.releasePost(1, 'task-1')
      await submitSettled
    })

    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    expect(screen.queryByText('Submitting...')).toBeNull()
    expect(screen.queryByText('Cancelled')).toBeNull()
    await waitFor(() =>
      expect(statusRequests('task-1').length).toBeGreaterThan(0)
    )
    expect(taskObservers(client, 'task-1')).toBe(1)
    // The late response binds the task to the key it was submitted with, exactly
    // as an immediate response would.
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)
  })

  it('renders one task queue holding tasks from both profiles', async () => {
    stubRelay()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { client } = renderVideoPlayground(i18n)
    await readyGenerateButton()

    await submitPrompt(user, 'generic profile task')
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()

    await selectModel(user, 'Doubao-Seedance-2.5')
    await submitPrompt(user, 'dedicated profile task')
    expect(await screen.findByText(/Task ID: task-2/)).toBeTruthy()

    // One gallery, both tasks inside it.
    const regions = taskQueueRegions()
    expect(regions).toHaveLength(1)
    const queue = regions[0]
    if (!queue) throw new Error('the task queue region disappeared')
    expect(within(queue).getByText('generic profile task')).toBeTruthy()
    expect(within(queue).getByText('dedicated profile task')).toBeTruthy()
    expect(within(queue).getAllByText(/Task ID:/)).toHaveLength(2)

    // Neither task is polled twice and no placeholder was submitted twice.
    expect(taskObservers(client, 'task-1')).toBe(1)
    expect(taskObservers(client, 'task-2')).toBe(1)
    expect(postRequests()).toHaveLength(2)
  })

  it('keeps the API key switch semantics: pending cancelled, accepted untouched', async () => {
    // The first POST is accepted normally; the second is held open so it is
    // still 'submitting' when the key changes.
    const relay = stubRelay({ holdPostFrom: 2 })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const client = noRetryClient()

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

    renderVideoPlayground(i18n, client)
    await readyGenerateButton()

    await submitPrompt(user, 'accepted before the key switch')
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)

    await submitPrompt(user, 'still submitting at the key switch')
    await waitFor(() => expect(relay.isHolding(2)).toBe(true))
    expect(screen.getByText('Submitting...')).toBeTruthy()

    await selectApiKey(user, /key-two/)

    // The key switch cancels the pending item and leaves the accepted one alone.
    // A cancelled card shows the word twice (status badge and status line).
    expect((await screen.findAllByText('Cancelled')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Task ID: task-1/)).toBeTruthy()
    expect(taskObservers(client, 'task-1')).toBe(1)
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      relay.releasePost(2, 'task-2')
      await submitSettled
    })

    // A late task_id must not resurrect a submission the key switch cancelled.
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Task ID: task-2/)).toBeNull()
    expect(taskObservers(client, 'task-2')).toBe(0)
    expect(lookupTaskApiKey('task-2')).toBeNull()
    expect(statusRequests('task-2')).toHaveLength(0)
  })
})

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
 * The frozen task-status vocabulary and the surfaces that hang off it.
 *
 * Six labels, no seventh fallback, and the same mapping in the main preview and
 * in every recent-task row. On top of that: the upstream fail_reason, the
 * SUCCESS-without-playable-result state, and the rule that a transient status
 * query error keeps the badge on Running rather than degrading it to Failed —
 * with the retry affordance re-running the status route only, never the POST.
 *
 * Driven through the real `api.ts`; only the relay `fetch` and the dashboard
 * axios client are faked, so request counts by URL are real evidence.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { TaskStatusBadge } from '../components/task-status-badge'
import { clearAllTaskApiKeys, lookupTaskApiKey } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  capabilityUrl,
  createVideoRecorder,
  deferred,
  jsonResponse,
  nextMutationSettled,
  OTHER_API_KEY,
  statusEnvelope,
  stubKeyEndpoints,
  SUBMIT_API_KEY,
  videoArtifact,
  type RecordedCall,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  renderVideoPlayground,
  stubAuthUser,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const TASK_ID = 'task-status'
const MODEL = 'Doubao-Seedance-2.5'
const PROMPT = 'a lighthouse in a swell'

const recorder = createVideoRecorder()
const calls = recorder.calls

let i18n: I18n

type RouteOverrides = {
  /** Replaces the POST reply, e.g. with a held-open deferred or a 400. */
  submitResponse?: () => Response | Promise<Response>
  statusResponse?: (taskId: string) => Response
  artifactsResponse?: (taskId: string) => Response
}

function stubRoutes(overrides: RouteOverrides = {}): void {
  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, {
        data: [{ id: MODEL, supported_endpoint_types: ['openai-video'] }],
      })
    }
    if (url === '/v1/video/generations') {
      return (
        overrides.submitResponse?.() ??
        jsonResponse(200, { task_id: TASK_ID, id: TASK_ID })
      )
    }
    if (url.startsWith('/v1/video/generations/')) {
      const taskId = decodeURIComponent(
        url.slice('/v1/video/generations/'.length)
      )
      return (
        overrides.statusResponse?.(taskId) ??
        jsonResponse(200, statusEnvelope(taskId, 'SUBMITTED'))
      )
    }
    if (url.startsWith('/v1/tasks/')) {
      const taskId = decodeURIComponent(url.split('/')[3] ?? '')
      return (
        overrides.artifactsResponse?.(taskId) ??
        jsonResponse(200, artifactsEnvelope(taskId, [videoArtifact(taskId)]))
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

/** Two usable keys, so an API key switch can cancel an in-flight POST. */
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

function statusRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/video/generations/'))
}

function artifactRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/tasks/'))
}

function previewSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Preview' })
}

function recentTasksRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Recent tasks' })
}

/**
 * One frozen mapping drives both panes, so a label is only correct when it
 * shows in the main preview AND in the recent-task row.
 */
function expectLabelInBothPanes(label: string): void {
  expect(
    within(previewSection()).getAllByText(label).length,
    `preview "${label}"`
  ).toBeGreaterThan(0)
  expect(
    within(recentTasksRegion()).getAllByText(label).length,
    `recent-task row "${label}"`
  ).toBeGreaterThan(0)
}

async function submitPrompt(user: ReturnType<typeof userEvent.setup>) {
  await typePrompt(user, PROMPT)
  await user.click(screen.getByRole('button', { name: 'Generate video' }))
}

describe('Video studio task status labels', () => {
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

  it('shows Submitting in the preview and the recent-task row while the POST is in flight', async () => {
    const held = deferred<Response>()
    stubRoutes({ submitResponse: () => held.promise })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    await waitFor(() => {
      expect(postRequests()).toHaveLength(1)
    })
    expectLabelInBothPanes('Submitting')
    expect(screen.queryAllByText('Running')).toHaveLength(0)
  })

  it('shows Running while the upstream task has not reached a terminal status', async () => {
    stubRoutes({
      statusResponse: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'IN_PROGRESS')),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    expect(await screen.findByText(`Task ID: ${TASK_ID}`)).toBeTruthy()
    expectLabelInBothPanes('Running')
    expect(
      within(previewSection()).getByText('Waiting for video...')
    ).toBeTruthy()
  })

  it('shows Completed once the upstream task reports SUCCESS', async () => {
    stubRoutes({
      statusResponse: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'SUCCESS')),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    expect(await screen.findByLabelText('Generated video')).toHaveAttribute(
      'src',
      capabilityUrl(TASK_ID, 'video')
    )
    expectLabelInBothPanes('Completed')
    expect(screen.queryAllByText('Running')).toHaveLength(0)
  })

  it('shows Failed once the upstream task reports FAILURE', async () => {
    stubRoutes({
      statusResponse: (taskId) =>
        jsonResponse(
          200,
          statusEnvelope(taskId, 'FAILURE', { fail_reason: 'prompt blocked' })
        ),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    await waitFor(() => {
      expectLabelInBothPanes('Failed')
    })
    expect(screen.queryAllByText('Completed')).toHaveLength(0)
    expect(screen.queryAllByText('Running')).toHaveLength(0)
  })

  it('shows Failed when the POST itself is rejected by the upstream', async () => {
    stubRoutes({
      submitResponse: () =>
        jsonResponse(400, { error: { message: 'insufficient quota' } }),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    await waitFor(() => {
      expectLabelInBothPanes('Failed')
    })
    // A rejected POST never becomes a task, so nothing is polled for it.
    expect(statusRequests()).toHaveLength(0)
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('shows Cancelled when an API key switch cancels an in-flight POST', async () => {
    stubTwoKeys()
    const held = deferred<Response>()
    stubRoutes({ submitResponse: () => held.promise })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const client = renderVideoPlayground(i18n).client
    await submitPrompt(user)
    await waitFor(() => {
      expect(postRequests()).toHaveLength(1)
    })

    await user.click(screen.getByRole('button', { name: 'API Key' }))
    await user.click(
      await screen.findByRole('menuitemradio', { name: /key-two/ })
    )

    await waitFor(() => {
      expectLabelInBothPanes('Cancelled')
    })
    expect(screen.queryAllByText('Running')).toHaveLength(0)

    const submitSettled = nextMutationSettled(client)
    await act(async () => {
      held.resolve(jsonResponse(200, { task_id: TASK_ID, id: TASK_ID }))
      await submitSettled
    })
    // The late task id does not move a cancelled submission back to Running.
    expectLabelInBothPanes('Cancelled')
  })

  it('shows Queued for a not-yet-posted submission and never a seventh Pending label', () => {
    // The studio always creates a single-item batch, so a `pending`
    // placeholder — the queue's "created but not posted yet" state — cannot be
    // reached by clicking through the page. The frozen mapping is asserted on
    // the badge that both panes render.
    render(
      <I18nextProvider i18n={i18n}>
        <TaskStatusBadge status='pending' queryStatus={undefined} isPending />
      </I18nextProvider>
    )

    expect(screen.getByText('Queued')).toBeTruthy()
    expect(screen.queryAllByText('Pending')).toHaveLength(0)
  })
})

describe('Video studio task status surfaces', () => {
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

  it('shows the upstream fail_reason in the preview on FAILURE and never reads the artifacts route', async () => {
    stubRoutes({
      statusResponse: (taskId) =>
        jsonResponse(
          200,
          statusEnvelope(taskId, 'FAILURE', {
            fail_reason: 'upstream rejected the prompt',
          })
        ),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    expect(
      await within(previewSection()).findByText('upstream rejected the prompt')
    ).toBeTruthy()
    expect(within(previewSection()).getByText('Task failed')).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expect(artifactRequests()).toHaveLength(0)
  })

  it('shows No playable video result when SUCCESS carries no video artifact', async () => {
    stubRoutes({
      statusResponse: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'SUCCESS')),
      artifactsResponse: (taskId) =>
        jsonResponse(
          200,
          artifactsEnvelope(taskId, [
            {
              key: 'poster',
              type: 'image',
              mime_type: 'image/png',
              content_url: capabilityUrl(taskId, 'poster'),
            },
          ])
        ),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    expect(
      await within(previewSection()).findByText('No playable video result')
    ).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expectLabelInBothPanes('Completed')
    expect(artifactRequests()).toHaveLength(1)
  })

  it('refetches only the status route from Retry status after a status query error', async () => {
    let failing = true
    stubRoutes({
      statusResponse: (taskId) =>
        failing
          ? jsonResponse(503, { error: { message: 'upstream unavailable' } })
          : jsonResponse(200, statusEnvelope(taskId, 'IN_PROGRESS')),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    // A 503 is retryable, so the query exhausts its own retries (2 x 1s)
    // before the surface appears; the task keeps its key across all of them.
    const retry = await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 4000 }
    )
    const attemptsBeforeRetry = statusRequests().length
    expect(attemptsBeforeRetry).toBeGreaterThan(0)
    expect(artifactRequests()).toHaveLength(0)
    expect(lookupTaskApiKey(TASK_ID)).toBe(SUBMIT_API_KEY)

    failing = false
    await user.click(retry)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry status' })).toBeNull()
    })
    expect(statusRequests().length).toBeGreaterThan(attemptsBeforeRetry)
    expect(
      within(previewSection()).getByText('Waiting for video...')
    ).toBeTruthy()
    // The retry re-runs the status read only: no second POST, no artifacts yet.
    expect(postRequests()).toHaveLength(1)
    expect(artifactRequests()).toHaveLength(0)
  })

  it('keeps the badge on Running while a transient status query error is up', async () => {
    stubRoutes({
      statusResponse: () =>
        jsonResponse(503, { error: { message: 'upstream unavailable' } }),
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitPrompt(user)

    await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 4000 }
    )

    // A transient 503 is not a task failure: the badge keeps the polling
    // semantic in both panes and the error surface carries the message.
    expectLabelInBothPanes('Running')
    expect(screen.queryAllByText('Failed')).toHaveLength(0)
    expect(screen.queryAllByText('Cancelled')).toHaveLength(0)
    expect(
      within(previewSection()).getAllByText('Failed to load video status')
        .length
    ).toBeGreaterThan(0)
  })
})

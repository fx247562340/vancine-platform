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
 * The task poll, counted on the wire.
 *
 * Only the relay `fetch` and the dashboard axios client are faked, so every
 * assertion below is a count of recorded requests grouped by URL: the studio
 * keeps asking while a task is non-terminal, stops for good the moment it is
 * terminal, reads the artifacts route exactly once on SUCCESS and never on
 * FAILURE, and never lets a window focus or a remounted preview re-read a task
 * that has already finished.
 *
 * The clock is a Vitest fake clock installed before the page mounts, so a poll
 * interval is advanced explicitly. No test waits on wall-clock time.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { VIDEO_TASK_POLL_INTERVAL_MS } from '../constants'
import { clearAllTaskApiKeys, lookupTaskApiKey } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  capabilityUrl,
  createVideoRecorder,
  jsonResponse,
  statusEnvelope,
  stubKeyEndpoints,
  videoArtifact,
  type RecordedCall,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const TASK_ID = 'task-poll'
const SECOND_TASK_ID = 'task-poll-2'
const PLAYABLE_URL = capabilityUrl(TASK_ID, 'video')
const MODEL = 'Doubao-Seedance-2.5'

const recorder = createVideoRecorder()
const calls = recorder.calls

let i18n: I18n

function stubRoutes(options: {
  /** Task ids handed out by successive POSTs; the last one repeats. */
  taskIds?: string[]
  statusFor: (taskId: string, poll: number) => Response
}): void {
  const taskIds = options.taskIds ?? [TASK_ID]
  const polls = new Map<string, number>()
  let submits = 0

  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, {
        data: [{ id: MODEL, supported_endpoint_types: ['openai-video'] }],
      })
    }
    if (url === '/v1/video/generations') {
      const taskId = taskIds[Math.min(submits, taskIds.length - 1)] as string
      submits += 1
      return jsonResponse(200, { task_id: taskId, id: taskId })
    }
    if (url.startsWith('/v1/video/generations/')) {
      const taskId = decodeURIComponent(
        url.slice('/v1/video/generations/'.length)
      )
      const poll = polls.get(taskId) ?? 0
      polls.set(taskId, poll + 1)
      return options.statusFor(taskId, poll)
    }
    if (url.startsWith('/v1/tasks/')) {
      const taskId = decodeURIComponent(url.split('/')[3] ?? '')
      return jsonResponse(
        200,
        artifactsEnvelope(taskId, [videoArtifact(taskId)])
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

function postRequests(): RecordedCall[] {
  return calls.filter((call) => call.url === '/v1/video/generations')
}

function statusRequests(taskId?: string): RecordedCall[] {
  const prefix = taskId
    ? `/v1/video/generations/${taskId}`
    : '/v1/video/generations/'
  return calls.filter((call) => call.url.startsWith(prefix))
}

function artifactRequests(taskId?: string): RecordedCall[] {
  const prefix = taskId ? `/v1/tasks/${taskId}/` : '/v1/tasks/'
  return calls.filter((call) => call.url.startsWith(prefix))
}

function generateButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Generate video' })
}

function promptField(): HTMLTextAreaElement {
  return screen.getByLabelText('Prompt') as HTMLTextAreaElement
}

/** Moves the fake clock, never wall-clock time. */
async function tick(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/**
 * Drains pending promise and timer work until `done` holds. This is the
 * fake-clock equivalent of `waitFor`: it stops on the observed state and never
 * on an elapsed duration.
 */
async function settleUntil(done: () => boolean): Promise<void> {
  for (let round = 0; round < 60 && !done(); round += 1) {
    await tick()
  }
  if (!done()) {
    throw new Error('polling test: the expected state was never reached')
  }
}

/** Fills the prompt and presses Generate video, then waits for the POSTs. */
async function submitPrompt(prompt: string, expectedPosts: number) {
  await settleUntil(() => !generateButton().hasAttribute('disabled'))
  fireEvent.change(promptField(), { target: { value: prompt } })
  await settleUntil(() => promptField().value === prompt)
  fireEvent.click(generateButton())
  await settleUntil(() => postRequests().length >= expectedPosts)
}

describe('Video studio task polling', () => {
  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    clearAllTaskApiKeys()
    vi.unstubAllGlobals()
    apiClientMock.get.mockReset()
    apiClientMock.post.mockReset()
    stubKeyEndpoints(apiClientMock)
    // Installed before the page mounts so the poll interval is a fake one.
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps requesting the status route on every poll interval while the task is non-terminal', async () => {
    stubRoutes({
      statusFor: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'IN_PROGRESS')),
    })
    renderVideoPlayground(i18n)
    await submitPrompt('a slow render', 1)

    await settleUntil(() => statusRequests(TASK_ID).length === 1)
    await settleUntil(
      () => screen.queryAllByText('Waiting for video...').length > 0
    )

    // Short of one interval nothing new is requested...
    await tick(VIDEO_TASK_POLL_INTERVAL_MS - 1)
    expect(statusRequests(TASK_ID)).toHaveLength(1)
    // ...and exactly one interval later the next poll lands.
    await tick(1)
    await settleUntil(() => statusRequests(TASK_ID).length === 2)
    await tick(VIDEO_TASK_POLL_INTERVAL_MS)
    await settleUntil(() => statusRequests(TASK_ID).length === 3)

    // Still running: one POST, no artifact read, and the key stays bound.
    expect(postRequests()).toHaveLength(1)
    expect(artifactRequests()).toHaveLength(0)
    expect(lookupTaskApiKey(TASK_ID)).not.toBeNull()
  })

  it('reads the artifacts route exactly once on SUCCESS, plays the validated content_url and never polls again', async () => {
    stubRoutes({
      statusFor: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'SUCCESS')),
    })
    renderVideoPlayground(i18n)
    await submitPrompt('a finished render', 1)

    await settleUntil(() => artifactRequests(TASK_ID).length === 1)
    expect(screen.getByLabelText('Generated video')).toHaveAttribute(
      'src',
      PLAYABLE_URL
    )

    await tick(VIDEO_TASK_POLL_INTERVAL_MS * 6)

    expect(statusRequests(TASK_ID)).toHaveLength(1)
    expect(artifactRequests(TASK_ID)).toHaveLength(1)
    expect(postRequests()).toHaveLength(1)
    // Terminal: the task's in-memory key is gone, so nothing can re-read it.
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('stops polling permanently on FAILURE and never requests the artifacts route', async () => {
    stubRoutes({
      statusFor: (taskId) =>
        jsonResponse(
          200,
          statusEnvelope(taskId, 'FAILURE', { fail_reason: 'prompt blocked' })
        ),
    })
    renderVideoPlayground(i18n)
    await submitPrompt('a rejected render', 1)

    await settleUntil(() => statusRequests(TASK_ID).length === 1)
    await settleUntil(() => screen.queryAllByText('prompt blocked').length > 0)

    await tick(VIDEO_TASK_POLL_INTERVAL_MS * 6)

    expect(statusRequests(TASK_ID)).toHaveLength(1)
    expect(artifactRequests()).toHaveLength(0)
    expect(postRequests()).toHaveLength(1)
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('never re-reads terminal tasks on window focus, visibility change or a remounted preview observer', async () => {
    stubRoutes({
      taskIds: [TASK_ID, SECOND_TASK_ID],
      statusFor: (taskId) =>
        jsonResponse(200, statusEnvelope(taskId, 'SUCCESS')),
    })
    renderVideoPlayground(i18n)
    await submitPrompt('the first finished clip', 1)
    await settleUntil(() => artifactRequests(TASK_ID).length === 1)
    await submitPrompt('the second finished clip', 2)
    await settleUntil(() => artifactRequests(SECOND_TASK_ID).length === 1)

    expect(statusRequests()).toHaveLength(2)
    expect(artifactRequests()).toHaveLength(2)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(VIDEO_TASK_POLL_INTERVAL_MS * 6)
    })

    // Selecting the other row and coming back remounts the preview's observer
    // for each task; a terminal task must not be refreshed by that either.
    const rows = within(
      screen.getByRole('region', { name: 'Recent tasks' })
    ).getAllByRole('button')
    expect(rows).toHaveLength(2)
    fireEvent.click(rows[0] as HTMLElement)
    await tick()
    fireEvent.click(rows[1] as HTMLElement)
    await tick()

    expect(statusRequests()).toHaveLength(2)
    expect(artifactRequests()).toHaveLength(2)
    expect(postRequests()).toHaveLength(2)
  })
})

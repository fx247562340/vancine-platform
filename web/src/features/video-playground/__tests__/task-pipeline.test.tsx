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
import { screen, waitFor } from '@testing-library/react'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys, lookupTaskApiKey } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  capabilityUrl,
  createVideoRecorder,
  jsonResponse,
  stubKeyEndpoints,
  statusEnvelope,
  SUBMIT_API_KEY,
  videoArtifact,
  type PipelineStubOptions,
  type RecordedCall,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  fillAndSubmitPrompt,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const TASK_ID = 'task-123'
const PLAYABLE_URL = capabilityUrl(TASK_ID, 'video')

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder = createVideoRecorder()
const calls = recorder.calls

// Routes every upstream endpoint the page touches: model list, submit,
// status polling, and Task Artifacts. Only the relay `fetch` boundary and the
// dashboard axios client are faked; the pipeline under test is real.
function stubPipeline(options: PipelineStubOptions = {}): void {
  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, { data: [{ id: 'Doubao-Seedance-2.5' }] })
    }
    if (url === '/v1/video/generations') {
      return jsonResponse(200, { task_id: TASK_ID, id: TASK_ID })
    }
    if (url.startsWith('/v1/video/generations/')) {
      return (
        options.pollResponse?.(url) ??
        jsonResponse(
          200,
          statusEnvelope(TASK_ID, options.pollStatus ?? 'SUBMITTED')
        )
      )
    }
    if (url.startsWith('/v1/tasks/')) {
      return (
        options.artifactsResponse?.() ??
        jsonResponse(200, artifactsEnvelope(TASK_ID, [videoArtifact(TASK_ID)]))
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

function statusRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/video/generations/'))
}

function artifactRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/tasks/'))
}

describe('video playground page pipeline (real api module, real routes)', () => {
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
    // Each test owns its global fetch stub: restore it here rather than
    // relying on the next test's beforeEach.
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('submits, then polls the task route with the same in-memory key', async () => {
    stubPipeline({ pollStatus: 'SUBMITTED' })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    expect(await screen.findByText(/Task ID: task-123/)).toBeTruthy()
    await waitFor(() => {
      expect(
        calls.find(
          (call) =>
            call.url === '/v1/video/generations' &&
            call.authorization === `Bearer ${SUBMIT_API_KEY}`
        )
      ).toBeTruthy()
      expect(
        calls.find(
          (call) =>
            call.url === '/v1/video/generations/task-123' &&
            call.authorization === `Bearer ${SUBMIT_API_KEY}`
        )
      ).toBeTruthy()
    })
    // The nonexistent /api/task/:id channel must never be used.
    expect(calls.some((call) => call.url.startsWith('/api/task'))).toBe(false)
  })

  it('fetches upstream artifacts after SUCCESS and renders the capability URL', async () => {
    stubPipeline({ pollStatus: 'SUCCESS' })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    const video = await screen.findByLabelText('Generated video')
    expect(video.getAttribute('src')).toBe(PLAYABLE_URL)
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(
      artifactRequests().every(
        (call) => call.authorization === `Bearer ${SUBMIT_API_KEY}`
      )
    ).toBe(true)
    expect(calls.some((call) => call.url.startsWith('/api/task'))).toBe(false)
  })

  it('surfaces a FAILURE reason and never requests artifacts', async () => {
    stubPipeline({
      pollResponse: () =>
        jsonResponse(
          200,
          statusEnvelope(TASK_ID, 'FAILURE', {
            fail_reason: 'upstream generation failed',
          })
        ),
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    expect(await screen.findByText('upstream generation failed')).toBeTruthy()
    expect(calls.some((call) => call.url.startsWith('/v1/tasks/'))).toBe(false)
  })

  it('shows a server error and stops after one request on 401', async () => {
    stubPipeline({
      pollResponse: () =>
        jsonResponse(401, { error: { message: 'Token is invalid' } }),
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    expect(await screen.findByText('Token is invalid')).toBeTruthy()
    expect(statusRequests()).toHaveLength(1)
  })

  it('shows a system error instead of an empty result when the artifacts contract is violated', async () => {
    stubPipeline({
      pollStatus: 'SUCCESS',
      artifactsResponse: () =>
        jsonResponse(200, {
          task_id: 'some-other-task',
          artifacts: [videoArtifact('some-other-task')],
        }),
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    expect(await screen.findByText('Failed to load video status')).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expect(screen.queryByText('No playable video result')).toBeNull()
    expect(statusRequests()).toHaveLength(1)
  })

  it('shows the no-result state when the task only produced non-video artifacts', async () => {
    stubPipeline({
      pollStatus: 'SUCCESS',
      artifactsResponse: () =>
        jsonResponse(
          200,
          artifactsEnvelope(TASK_ID, [
            {
              key: 'poster',
              type: 'image',
              mime_type: 'video/mp4',
              content_url: capabilityUrl(TASK_ID, 'poster'),
            },
            {
              key: 'notes',
              type: 'file',
              content_url: capabilityUrl(TASK_ID, 'notes'),
            },
          ])
        ),
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    expect(await screen.findByText('No playable video result')).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expect(lookupTaskApiKey(TASK_ID)).toBeNull()
  })

  it('plays the video artifact that follows a non-video artifact', async () => {
    stubPipeline({
      pollStatus: 'SUCCESS',
      artifactsResponse: () =>
        jsonResponse(
          200,
          artifactsEnvelope(TASK_ID, [
            {
              key: 'poster',
              type: 'image',
              mime_type: 'image/png',
              content_url: capabilityUrl(TASK_ID, 'poster'),
            },
            {
              key: 'clip',
              type: 'video',
              mime_type: 'video/mp4',
              content_url: capabilityUrl(TASK_ID, 'clip'),
            },
          ])
        ),
    })
    renderVideoPlayground(i18n)
    await fillAndSubmitPrompt()

    const video = await screen.findByLabelText('Generated video')
    expect(video.getAttribute('src')).toBe(capabilityUrl(TASK_ID, 'clip'))
  })
})

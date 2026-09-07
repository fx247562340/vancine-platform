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
 * The main preview and the recent-task window.
 *
 * These run against the real `api.ts` over a recording `fetch` stub, because
 * the contract under test is exactly which task the preview shows once the
 * upstream statuses arrive in a chosen order. Selection may move only when the
 * user submits or clicks a row: an earlier task finishing later, a sibling
 * turning terminal, a model switch or an API key switch must all leave the
 * preview where the user put it. Every status transition is released through a
 * deferred response, so no test depends on a poll interval or a sleep.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  capabilityUrl,
  createVideoRecorder,
  deferred,
  jsonResponse,
  OTHER_API_KEY,
  stubKeyEndpoints,
  statusEnvelope,
  SUBMIT_API_KEY,
  videoArtifact,
  type Deferred,
  type RecordedCall,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  makeImageFile,
  pickReferenceImages,
  pickResolution,
  pickSeconds,
  pickVideoModel,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  submitStudio,
  switchApiKey,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder = createVideoRecorder()
const calls = recorder.calls

/**
 * The one route table every test drives: the model list, the submit POST, the
 * per-task status route and the Task Artifacts route. Tests mutate this state
 * instead of re-installing fetch, so a held response can be released at an
 * exact point in the scenario.
 */
const studio = {
  models: ['Doubao-Seedance-2.5'] as string[],
  submits: 0,
  /** Upstream message that makes every submit POST fail with a 400. */
  submitFailure: null as string | null,
  statusByTaskId: {} as Record<string, string>,
  failReasonByTaskId: {} as Record<string, string>,
  gatesByTaskId: {} as Record<string, Deferred<Response> | undefined>,
}

function taskIdAt(index: number): string {
  return `task-${index}`
}

function taskStatusResponse(
  taskId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Response {
  const failReason = studio.failReasonByTaskId[taskId]
  return jsonResponse(
    200,
    statusEnvelope(taskId, status, {
      ...extra,
      ...(failReason ? { fail_reason: failReason } : {}),
    })
  )
}

/** Hold the next status response for one task, so a test releases it on cue. */
function holdTaskStatus(taskId: string): Deferred<Response> {
  const gate = deferred<Response>()
  studio.gatesByTaskId[taskId] = gate
  return gate
}

function installStudioRoutes(): void {
  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, {
        data: studio.models.map((id) => ({
          id,
          supported_endpoint_types: ['openai-video'],
        })),
      })
    }
    if (url === '/v1/video/generations') {
      if (studio.submitFailure) {
        return jsonResponse(400, {
          error: { message: studio.submitFailure },
        })
      }
      const taskId = taskIdAt(studio.submits)
      studio.submits += 1
      return jsonResponse(200, { task_id: taskId, id: taskId })
    }
    const statusMatch = /^\/v1\/video\/generations\/([^/]+)$/.exec(url)
    if (statusMatch) {
      const taskId = decodeURIComponent(statusMatch[1] as string)
      const gate = studio.gatesByTaskId[taskId]
      if (gate) {
        delete studio.gatesByTaskId[taskId]
        return gate.promise
      }
      return taskStatusResponse(
        taskId,
        studio.statusByTaskId[taskId] ?? 'IN_PROGRESS'
      )
    }
    const artifactMatch = /^\/v1\/tasks\/([^/]+)\/artifacts$/.exec(url)
    if (artifactMatch) {
      const taskId = decodeURIComponent(artifactMatch[1] as string)
      return jsonResponse(
        200,
        artifactsEnvelope(taskId, [videoArtifact(taskId)])
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

function submitRequests(): RecordedCall[] {
  return calls.filter((call) => call.url === '/v1/video/generations')
}

function statusRequests(): RecordedCall[] {
  return calls.filter((call) => call.url.startsWith('/v1/video/generations/'))
}

function previewRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Preview' })
}

function recentTaskRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Recent tasks' })
}

function taskRow(prompt: string): HTMLElement {
  const row = within(recentTaskRegion()).getByText(prompt).closest('button')
  if (!row) {
    throw new Error(`no recent-task row for ${prompt}`)
  }
  return row
}

/** One full user submit: wait for the button, replace the prompt, press it. */
async function submitPrompt(
  user: UserEvent,
  prompt: string,
  expectedSubmits: number
): Promise<void> {
  await readyGenerateButton()
  const field = screen.getByLabelText('Prompt')
  await user.clear(field)
  await user.type(field, prompt)
  await submitStudio(user)
  await waitFor(() => {
    expect(submitRequests()).toHaveLength(expectedSubmits)
  })
}

/** Wait until the page has really issued the status request for one task. */
async function waitForStatusRequest(taskId: string): Promise<void> {
  await waitFor(() => {
    expect(
      calls.some((call) => call.url === `/v1/video/generations/${taskId}`)
    ).toBe(true)
  })
}

const createObjectUrl = vi.fn(() => 'blob:reference-preview')
const revokeObjectUrl = vi.fn()

let i18n: I18n

beforeEach(async () => {
  i18n = await createVideoPlaygroundI18n()
  stubAuthUser()
  clearAllTaskApiKeys()
  vi.unstubAllGlobals()
  apiClientMock.get.mockReset()
  apiClientMock.post.mockReset()
  stubKeyEndpoints(apiClientMock)
  studio.models = ['Doubao-Seedance-2.5']
  studio.submits = 0
  studio.submitFailure = null
  studio.statusByTaskId = {}
  studio.failReasonByTaskId = {}
  studio.gatesByTaskId = {}
  createObjectUrl.mockClear()
  revokeObjectUrl.mockClear()
  ;(
    URL as unknown as { createObjectURL: typeof createObjectUrl }
  ).createObjectURL = createObjectUrl
  ;(
    URL as unknown as { revokeObjectURL: typeof revokeObjectUrl }
  ).revokeObjectURL = revokeObjectUrl
  installStudioRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (URL as unknown as Record<string, unknown>).createObjectURL
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL
})

describe('Video studio main preview', () => {
  it('shows the preview empty state and no recent-task region before the first submit', async () => {
    renderVideoPlayground(i18n)

    await readyGenerateButton()

    expect(
      within(previewRegion()).getByText(
        'Your generated video will appear here.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Recent tasks' })).toBeNull()
    expect(submitRequests()).toHaveLength(0)
  })

  it('makes a newly submitted task the preview immediately', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)

    expect(within(previewRegion()).getByText('clip alpha')).toBeTruthy()
    expect(within(previewRegion()).getByText(/Task ID: task-0/)).toBeTruthy()
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the preview on the newer submission when an earlier task finishes later', async () => {
    const user = userEvent.setup()
    // The earlier task's first status reply is held until the newer one exists.
    const earlierGate = holdTaskStatus(taskIdAt(0))
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    await waitForStatusRequest(taskIdAt(0))
    await submitPrompt(user, 'clip beta', 2)
    expect(within(previewRegion()).getByText('clip beta')).toBeTruthy()

    await act(async () => {
      earlierGate.resolve(taskStatusResponse(taskIdAt(0), 'SUCCESS'))
    })

    // Finishing earlier must not steal the preview the user is watching.
    await waitFor(() => {
      expect(within(taskRow('clip alpha')).getByText('Completed')).toBeTruthy()
    })
    expect(within(previewRegion()).getByText('clip beta')).toBeTruthy()
    expect(
      within(previewRegion()).queryByLabelText('Generated video')
    ).toBeNull()
    expect(taskRow('clip beta')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the preview on the clicked row when another task finishes afterwards', async () => {
    const user = userEvent.setup()
    const newerGate = holdTaskStatus(taskIdAt(1))
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    await submitPrompt(user, 'clip beta', 2)
    await waitForStatusRequest(taskIdAt(1))
    expect(within(previewRegion()).getByText('clip beta')).toBeTruthy()

    await act(async () => {
      await user.click(taskRow('clip alpha'))
    })
    expect(within(previewRegion()).getByText('clip alpha')).toBeTruthy()
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => {
      newerGate.resolve(taskStatusResponse(taskIdAt(1), 'SUCCESS'))
    })

    // Only a submit or a click may move the preview, so the choice survives.
    await waitFor(() => {
      expect(within(taskRow('clip beta')).getByText('Completed')).toBeTruthy()
    })
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')
    expect(taskRow('clip beta')).toHaveAttribute('aria-pressed', 'false')
    expect(within(previewRegion()).getByText('clip alpha')).toBeTruthy()
    expect(
      within(previewRegion()).queryByLabelText('Generated video')
    ).toBeNull()
  })

  it('renders the video in the same preview section when the selected task turns to SUCCESS', async () => {
    const user = userEvent.setup()
    const gate = holdTaskStatus(taskIdAt(0))
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    await waitFor(() => {
      expect(
        within(previewRegion()).getByText('Waiting for video...')
      ).toBeTruthy()
    })
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => {
      gate.resolve(taskStatusResponse(taskIdAt(0), 'SUCCESS'))
    })

    // The finished result replaces the spinner in place: same section, same
    // selection, and the only media source is the artifact capability URL.
    const video =
      await within(previewRegion()).findByLabelText('Generated video')
    expect(video.getAttribute('src')).toBe(capabilityUrl(taskIdAt(0), 'video'))
    expect(previewRegion().contains(video)).toBe(true)
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')
    expect(submitRequests()).toHaveLength(1)
  })

  it('remounts the same video with no new POST and no extra status request when Reload preview follows a media error', async () => {
    const user = userEvent.setup()
    studio.statusByTaskId[taskIdAt(0)] = 'SUCCESS'
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    const video =
      await within(previewRegion()).findByLabelText('Generated video')
    expect(video.getAttribute('src')).toBe(capabilityUrl(taskIdAt(0), 'video'))
    const statusCallsBeforeReload = statusRequests().length

    fireEvent.error(video)

    expect(
      await within(previewRegion()).findByText('Video failed to load')
    ).toBeTruthy()
    expect(
      within(previewRegion()).queryByLabelText('Generated video')
    ).toBeNull()

    await act(async () => {
      await user.click(
        within(previewRegion()).getByRole('button', { name: 'Reload preview' })
      )
    })

    // Reloading is a media retry only: same capability URL, no regeneration.
    const reloaded =
      await within(previewRegion()).findByLabelText('Generated video')
    expect(reloaded.getAttribute('src')).toBe(
      capabilityUrl(taskIdAt(0), 'video')
    )
    expect(submitRequests()).toHaveLength(1)
    expect(statusRequests()).toHaveLength(statusCallsBeforeReload)
  })
})

describe('Video studio recent-task window', () => {
  it('lists the most recent six submissions plus every unfinished one', async () => {
    const user = userEvent.setup()
    // Three earliest submissions are terminal; the fourth is old but still
    // running, so it must stay visible beyond the six-most-recent window.
    studio.statusByTaskId[taskIdAt(0)] = 'SUCCESS'
    studio.statusByTaskId[taskIdAt(1)] = 'IN_PROGRESS'
    studio.statusByTaskId[taskIdAt(2)] = 'FAILURE'
    studio.failReasonByTaskId[taskIdAt(2)] = 'upstream gave up'
    for (let index = 3; index < 9; index += 1) {
      studio.statusByTaskId[taskIdAt(index)] = 'IN_PROGRESS'
    }
    renderVideoPlayground(i18n)

    const prompts = [
      'clip zero',
      'clip one',
      'clip two',
      'clip three',
      'clip four',
      'clip five',
      'clip six',
      'clip seven',
      'clip eight',
    ]
    for (let index = 0; index < prompts.length; index += 1) {
      await submitPrompt(user, prompts[index] as string, index + 1)
      await waitForStatusRequest(taskIdAt(index))
    }

    // The two terminal submissions leave the window as soon as their status
    // lands; a row is only ever dropped once it has finished.
    await waitFor(() => {
      expect(within(recentTaskRegion()).getAllByRole('button')).toHaveLength(7)
    })
    expect(within(taskRow('clip one')).getByText('Running')).toBeTruthy()

    // Terminal and old: dropped. Old but unfinished: kept. Recent six: kept.
    const rows = within(recentTaskRegion()).getAllByRole('button')
    expect(rows).toHaveLength(7)
    expect(within(recentTaskRegion()).queryAllByText('clip zero')).toHaveLength(
      0
    )
    expect(within(recentTaskRegion()).queryAllByText('clip two')).toHaveLength(
      0
    )
    for (const prompt of [
      'clip one',
      'clip three',
      'clip four',
      'clip five',
      'clip six',
      'clip seven',
      'clip eight',
    ]) {
      expect(within(recentTaskRegion()).getByText(prompt)).toBeTruthy()
    }
    // The newest submission is still the one the preview shows.
    expect(within(previewRegion()).getByText('clip eight')).toBeTruthy()
  })

  it('restores model, prompt, images, seconds and resolution from a failed task without sending a new POST', async () => {
    const user = userEvent.setup()
    studio.models = ['Doubao-Seedance-2.5', 'MiniMax-H3']
    studio.submitFailure = 'upstream rejected the clip'
    renderVideoPlayground(i18n)

    await pickVideoModel(user, 'Doubao-Seedance-2.5')
    await pickSeconds(user, '12 seconds')
    await pickResolution(user, '720p')
    await readyGenerateButton()
    const field = screen.getByLabelText('Prompt')
    await user.type(field, 'a failed clip worth retrying')
    await pickReferenceImages(user, [
      makeImageFile('first.png'),
      makeImageFile('second.png'),
    ])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        2
      )
    })

    await submitStudio(user)
    expect(
      await within(previewRegion()).findByText('upstream rejected the clip')
    ).toBeTruthy()
    expect(submitRequests()).toHaveLength(1)

    // A model switch is what normally wipes the form; restoring must undo it.
    await pickVideoModel(user, 'MiniMax-H3')
    await waitFor(() => {
      expect(
        screen.queryAllByRole('button', { name: /^Remove / })
      ).toHaveLength(0)
    })
    expect(screen.getByLabelText('Prompt')).toHaveValue('')

    await act(async () => {
      await user.click(
        within(previewRegion()).getByRole('button', {
          name: 'Use these settings again',
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'Doubao-Seedance-2.5'
      )
    })
    expect(screen.getByLabelText('Prompt')).toHaveValue(
      'a failed clip worth retrying'
    )
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2)
    expect(screen.getByLabelText('Seconds')).toHaveTextContent('12 seconds')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent('720p')
    // Restoring is a form action only: it must never bill a second time.
    expect(submitRequests()).toHaveLength(1)
  })
})

describe('Video studio selection across switches', () => {
  it('keeps the tasks listed and the preview on the selected task when the model is switched', async () => {
    const user = userEvent.setup()
    studio.models = ['Doubao-Seedance-2.5', 'MiniMax-H3']
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    await waitFor(() => {
      expect(within(previewRegion()).getByText(/Task ID: task-0/)).toBeTruthy()
    })

    await pickVideoModel(user, 'MiniMax-H3')

    // The submission queue outlives the composer reset.
    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'MiniMax-H3'
      )
    })
    expect(within(recentTaskRegion()).getByText('clip alpha')).toBeTruthy()
    expect(within(previewRegion()).getByText('clip alpha')).toBeTruthy()
    expect(within(previewRegion()).getByText(/Task ID: task-0/)).toBeTruthy()
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the tasks listed and the preview on the selected task when the API key is switched', async () => {
    const user = userEvent.setup()
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
    renderVideoPlayground(i18n)

    await submitPrompt(user, 'clip alpha', 1)
    await waitFor(() => {
      expect(within(previewRegion()).getByText(/Task ID: task-0/)).toBeTruthy()
    })

    await act(async () => {
      await switchApiKey(user, 'key-two')
    })

    // Switching keys re-creates the submit epoch, not the visible history.
    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.url === '/v1/models' &&
            call.authorization === `Bearer ${OTHER_API_KEY}`
        )
      ).toBe(true)
    })
    expect(within(recentTaskRegion()).getByText('clip alpha')).toBeTruthy()
    expect(within(previewRegion()).getByText('clip alpha')).toBeTruthy()
    expect(within(previewRegion()).getByText(/Task ID: task-0/)).toBeTruthy()
    expect(taskRow('clip alpha')).toHaveAttribute('aria-pressed', 'true')
    expect(submitRequests()).toHaveLength(1)
  })
})

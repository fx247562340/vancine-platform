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
 * The studio's end-to-end journeys, driven through the real `api.ts`.
 *
 * Only the two genuinely external boundaries are faked: the relay `fetch` and
 * the dashboard axios client. Everything else — key selection, model
 * auto-selection, the composer, the submission queue, the task poll, the
 * artifact read and the preview — is the shipping code, so a break anywhere in
 * that chain fails here rather than only in a narrower unit test.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
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
  makeImageFile,
  pickReferenceImages,
  pickResolution,
  pickSeconds,
  pickVideoModel,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  submitStudio,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const TASK_ID = 'task-flow'
const PLAYABLE_URL = capabilityUrl(TASK_ID, 'video')
const PROMPT = 'a heron landing on a post'
const FIRST_MODEL = 'Doubao-Seedance-2.5'
const SECOND_MODEL = 'wan3.0-video'

const recorder = createVideoRecorder()
const calls = recorder.calls

let i18n: I18n

/** Server order matters: the page must take the FIRST model the key returns. */
const MODELS_PAYLOAD = {
  data: [
    { id: FIRST_MODEL, supported_endpoint_types: ['openai-video'] },
    { id: SECOND_MODEL, supported_endpoint_types: ['openai-video'] },
  ],
}

function stubFlowRoutes(statusResponse: () => Response): void {
  recorder.install((url) => {
    if (url === '/v1/models') {
      return jsonResponse(200, MODELS_PAYLOAD)
    }
    if (url === '/v1/video/generations') {
      return jsonResponse(200, { task_id: TASK_ID, id: TASK_ID })
    }
    if (url.startsWith('/v1/video/generations/')) {
      return statusResponse()
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

function postRequests(): RecordedCall[] {
  return calls.filter((call) => call.url === '/v1/video/generations')
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

function restoreButton(): HTMLElement {
  return within(previewSection()).getByRole('button', {
    name: 'Use these settings again',
  })
}

/**
 * The shared happy-path prefix: keys and models load, the server's first model
 * is auto-selected, a fully specified submission is accepted, and its artifact
 * is playing in the preview.
 */
async function arrangePlayingSubmission(user: UserEvent): Promise<void> {
  stubFlowRoutes(() => jsonResponse(200, statusEnvelope(TASK_ID, 'SUCCESS')))
  renderVideoPlayground(i18n)
  await readyGenerateButton()
  expect(screen.getByLabelText('Video model')).toHaveTextContent(FIRST_MODEL)

  await typePrompt(user, PROMPT)
  await pickReferenceImages(user, [makeImageFile('street.png')])
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Remove street.png' })
    ).toBeTruthy()
  })
  await pickSeconds(user, '8 seconds')
  await pickResolution(user, '720p')
  await submitStudio(user)

  await waitFor(() => {
    expect(postRequests()).toHaveLength(1)
  })
  expect(await screen.findByText(`Task ID: ${TASK_ID}`)).toBeTruthy()
  expect(await screen.findByLabelText('Generated video')).toHaveAttribute(
    'src',
    PLAYABLE_URL
  )
}

describe('Video studio end-to-end flow', () => {
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

  it('submits once, promotes the task to the preview, plays the artifact and offers a download of the same URL', async () => {
    const user = userEvent.setup()
    await arrangePlayingSubmission(user)

    // The fresh submission is the preview and the only, selected recent row.
    expect(within(previewSection()).getByText(PROMPT)).toBeTruthy()
    const rows = within(recentTasksRegion()).getAllByRole('button')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true')
    expect(within(previewSection()).getByText('Completed')).toBeTruthy()

    // The only media source is the validated artifact capability URL, and the
    // download anchor points at exactly the same URL.
    const download = within(previewSection()).getByRole('button', {
      name: 'Download',
    })
    expect(download.tagName).toBe('A')
    expect(download).toHaveAttribute('href', PLAYABLE_URL)
    expect(download).toHaveAttribute('download')
    expect(artifactRequests()).toHaveLength(1)
  })

  it('restores prompt, seconds, resolution and reference image from "Use these settings again" without a second POST', async () => {
    const user = userEvent.setup()
    await arrangePlayingSubmission(user)

    // Move every field away from what was submitted.
    await user.clear(screen.getByLabelText('Prompt'))
    await user.type(screen.getByLabelText('Prompt'), 'an unrelated rewrite')
    await pickSeconds(user, '12 seconds')
    await pickResolution(user, '480p')
    await user.click(screen.getByRole('button', { name: 'Remove street.png' }))

    await user.click(restoreButton())

    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        FIRST_MODEL
      )
      expect(screen.getByLabelText('Prompt')).toHaveValue(PROMPT)
      expect(screen.getByLabelText('Seconds')).toHaveTextContent('8 seconds')
      expect(screen.getByLabelText('Resolution')).toHaveTextContent('720p')
      expect(
        screen.getByRole('button', { name: 'Remove street.png' })
      ).toBeTruthy()
    })
    // Restoring is a form action only: it must never bill a second generation.
    expect(postRequests()).toHaveLength(1)
  })

  it('restores the submitted model together with its seconds and resolution after the user switched model', async () => {
    const user = userEvent.setup()
    await arrangePlayingSubmission(user)

    // Switching model resets the composer and clears the tray.
    await pickVideoModel(user, SECOND_MODEL)
    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        SECOND_MODEL
      )
      expect(screen.getByLabelText('Prompt')).toHaveValue('')
      expect(
        screen.queryByRole('button', { name: 'Remove street.png' })
      ).toBeNull()
    })

    await user.click(restoreButton())

    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        FIRST_MODEL
      )
      expect(screen.getByLabelText('Prompt')).toHaveValue(PROMPT)
      expect(screen.getByLabelText('Seconds')).toHaveTextContent('8 seconds')
      expect(screen.getByLabelText('Resolution')).toHaveTextContent('720p')
      expect(
        screen.getByRole('button', { name: 'Remove street.png' })
      ).toBeTruthy()
    })
    expect(postRequests()).toHaveLength(1)
  })

  it('shows the upstream fail_reason on FAILURE and restores the settings without resubmitting', async () => {
    stubFlowRoutes(() =>
      jsonResponse(
        200,
        statusEnvelope(TASK_ID, 'FAILURE', {
          fail_reason: 'upstream rejected the prompt',
        })
      )
    )
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, PROMPT)
    await submitStudio(user)

    expect(
      await within(previewSection()).findByText('upstream rejected the prompt')
    ).toBeTruthy()
    expect(within(previewSection()).getByText('Failed')).toBeTruthy()
    expect(screen.queryByLabelText('Generated video')).toBeNull()
    expect(artifactRequests()).toHaveLength(0)

    await user.clear(screen.getByLabelText('Prompt'))
    await user.type(screen.getByLabelText('Prompt'), 'something else entirely')

    await user.click(restoreButton())

    await waitFor(() => {
      expect(screen.getByLabelText('Prompt')).toHaveValue(PROMPT)
    })
    expect(postRequests()).toHaveLength(1)
  })
})

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
 * A generic video model receives its reference image through the top-level
 * `image` field. It has no prompt-reference syntax, so the page must not teach
 * the user one: no `@Image1` hint in the placeholder, no insert action on the
 * chip, and nothing injected into the prompt or the outbound body.
 *
 * The dedicated Seedance composer is the opposite contract — its wire format
 * carries `metadata.content` entries that the prompt cites by token — so the
 * last test pins that its insert behaviour is untouched.
 *
 * Only the two genuinely external boundaries are faked: the relay `fetch` and the
 * dashboard axios client.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
import {
  createVideoRecorder,
  jsonResponse,
  statusEnvelope,
  stubKeyEndpoints,
  type VideoRecorder,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const TASK_ID = 'task-reference-contract'
const IMAGE_URL = 'https://cdn.example.com/first.png'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder: VideoRecorder = createVideoRecorder()

/** Every JSON body that reached POST /v1/video/generations, in order. */
let postedBodies: unknown[] = []

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

function stubRelay(models: unknown[]) {
  postedBodies = []
  recorder.install((url, init) => {
    if (url === '/v1/models') {
      return jsonResponse(200, { object: 'list', data: models })
    }
    if (url === '/v1/video/generations') {
      if (init?.body) {
        postedBodies.push(JSON.parse(String(init.body)))
      }
      return jsonResponse(200, { task_id: TASK_ID, id: TASK_ID })
    }
    if (url.startsWith('/v1/video/generations/')) {
      return jsonResponse(200, statusEnvelope(TASK_ID, 'SUBMITTED'))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

async function selectModel(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByLabelText('Video model'))
  await user.click(await screen.findByRole('option', { name }))
}

async function selectMode(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByLabelText('Creation mode'))
  await user.click(await screen.findByRole('option', { name }))
}

async function addImageUrl(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add reference image' }))
  await user.type(await screen.findByLabelText('Public URL'), IMAGE_URL)
  await user.keyboard('{Enter}')
}

function promptValue(): string {
  const prompt = screen.getByLabelText('Prompt')
  if (!(prompt instanceof HTMLTextAreaElement)) {
    throw new Error('the prompt field is not a textarea')
  }
  return prompt.value
}

describe('VideoPlayground — generic models have no prompt-reference syntax', () => {
  let i18n: I18n

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    clearAllTaskApiKeys()
    vi.unstubAllGlobals()
    apiClientMock.get.mockReset()
    apiClientMock.post.mockReset()
    stubKeyEndpoints(apiClientMock)
    stubRelay(TWO_PROFILE_MODELS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not hint at @Image1 in the generic prompt placeholder', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    // wan3.0-video is the auto-selected first model and has no dedicated profile.
    const prompt = await screen.findByLabelText('Prompt')
    expect(prompt.getAttribute('placeholder')).toBe(
      'Describe the video you want to generate.'
    )
    expect(prompt.getAttribute('placeholder')).not.toContain('@Image1')
  })

  it('shows a generic image chip with no insert action', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectMode(user, 'Image to video')
    await addImageUrl(user)

    // The chip keeps the resource name and its remove control.
    expect(await screen.findByText('first.png')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Remove first.png' })
    ).toBeTruthy()
    // No prompt token, and nothing that looks like one.
    expect(screen.queryByText('@Image1')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Insert @Image1 into prompt/ })
    ).toBeNull()
  })

  it('leaves the prompt exactly as the user typed it when an image is attached', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectMode(user, 'Image to video')
    await user.type(screen.getByLabelText('Prompt'), 'the cat starts running')
    expect(promptValue()).toBe('the cat starts running')

    await addImageUrl(user)
    expect(await screen.findByText('first.png')).toBeTruthy()
    expect(promptValue()).toBe('the cat starts running')
  })

  it('sends the user prompt verbatim and the image in the top-level field', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectMode(user, 'Image to video')
    await addImageUrl(user)
    await user.type(screen.getByLabelText('Prompt'), 'the cat starts running')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(postedBodies).toHaveLength(1))
    expect(postedBodies[0]).toEqual({
      model: 'wan3.0-video',
      prompt: 'the cat starts running',
      image: IMAGE_URL,
    })
    // No token can hide in a field the equality check above would not catch.
    expect(JSON.stringify(postedBodies[0])).not.toContain('@Image')
  })

  it('still inserts @Image1 into the prompt for a dedicated Seedance model', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectModel(user, 'Doubao-Seedance-2.5')
    await selectMode(user, 'First frame')
    await addImageUrl(user)

    expect(await screen.findByText('@Image1')).toBeTruthy()
    expect(promptValue()).toBe('')

    await user.click(
      screen.getByRole('button', { name: 'Insert @Image1 into prompt' })
    )
    expect(promptValue()).toBe('@Image1 ')

    // Appending is the dedicated composer's pre-existing behaviour, including its
    // spacing: the second insert separates the existing text with a space and
    // the token keeps its own trailing one.
    await user.click(
      screen.getByRole('button', { name: 'Insert @Image1 into prompt' })
    )
    expect(promptValue()).toBe('@Image1  @Image1 ')
    expect(screen.getByRole('button', { name: 'Remove @Image1' })).toBeTruthy()
  })
})

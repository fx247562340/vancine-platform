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
 * Page behaviour for the dynamically sourced video model list.
 *
 * Only the two genuinely external boundaries are faked — the relay `fetch` and
 * the dashboard axios client — so the real `parseVideoModels`, capability
 * resolver, generic serializer and both composers run. Every assertion is made
 * from the user's point of view: what the model selector offers, which controls
 * are on screen, and which JSON body reaches POST /v1/video/generations.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
import {
  artifactsEnvelope,
  createVideoRecorder,
  jsonResponse,
  statusEnvelope,
  stubKeyEndpoints,
  videoArtifact,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const TASK_ID = 'task-generic-1'
const PROVIDER_DEFAULT_HINT =
  "This model uses the provider's default parameters."

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder = createVideoRecorder()

/** Every JSON body that reached POST /v1/video/generations, in order. */
let postedBodies: unknown[] = []

/** A GET /v1/models entry shaped exactly like the server emits it. */
function serverModel(id: string, endpoints: string[]) {
  return {
    id,
    object: 'model',
    owned_by: 'vancine',
    supported_endpoint_types: endpoints,
  }
}

/**
 * The mixed list a real key returns: two Wan3 video models with no dedicated
 * profile, one Seedance model with a dedicated profile, and chat / image models
 * that must never reach the video page. Server order is deliberately not
 * alphabetical so an order-preserving parser is distinguishable from a sorter.
 */
const MIXED_MODELS = [
  serverModel('gpt-4o', ['openai', 'openai-response']),
  serverModel('wan3.0-video', ['openai', 'openai-video']),
  serverModel('qwen-image', ['image-generation']),
  serverModel('Doubao-Seedance-2.5', ['openai', 'openai-video']),
  serverModel('wan3.0-video-prime', ['openai-video']),
]

function stubRelay(models: unknown[]): void {
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
    if (url.startsWith('/v1/tasks/')) {
      return jsonResponse(
        200,
        artifactsEnvelope(TASK_ID, [videoArtifact(TASK_ID)])
      )
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

async function addReferenceUrl(
  user: ReturnType<typeof userEvent.setup>,
  buttonName: string,
  url: string,
  chip: string
) {
  await user.click(screen.getByRole('button', { name: buttonName }))
  await user.type(await screen.findByLabelText('Public URL'), url)
  await user.keyboard('{Enter}')
  expect(await screen.findByText(chip)).toBeTruthy()
}

describe('VideoPlayground — dynamic video model list', () => {
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

  it('offers only the models the server marks openai-video, in server order', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await user.click(screen.getByLabelText('Video model'))
    const optionNames = (await screen.findAllByRole('option')).map(
      (option) => option.textContent
    )

    expect(optionNames).toEqual([
      'wan3.0-video',
      'Doubao-Seedance-2.5',
      'wan3.0-video-prime',
    ])
  })

  it('shows the generic composer with provider defaults and no dedicated parameters for wan3.0-video', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    // wan3.0-video is the first openai-video model in the server list, so the
    // page already selected it: assert the generic surface directly.
    expect(screen.getByLabelText('Prompt')).toBeTruthy()
    expect(screen.getByText(PROVIDER_DEFAULT_HINT)).toBeTruthy()

    expect(
      screen.queryByRole('button', { name: 'Parameter settings' })
    ).toBeNull()
    expect(screen.queryByLabelText('Aspect ratio')).toBeNull()
    expect(screen.queryByLabelText('Resolution')).toBeNull()
    expect(screen.queryByLabelText('Duration')).toBeNull()
    expect(screen.queryByLabelText('Generate audio')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Add reference video' })
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Add reference audio' })
    ).toBeNull()
    expect(document.body.textContent).not.toContain('fps')

    await user.click(screen.getByLabelText('Creation mode'))
    expect(
      (await screen.findAllByRole('option')).map((option) => option.textContent)
    ).toEqual(['Text to video', 'Image to video'])
  })

  it('keeps every dedicated control for Doubao-Seedance-2.5', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectModel(user, 'Doubao-Seedance-2.5')

    expect(
      screen.getByRole('button', { name: 'Parameter settings' })
    ).toBeTruthy()
    expect(screen.getByLabelText('Aspect ratio')).toBeTruthy()
    expect(screen.getByLabelText('Resolution')).toBeTruthy()
    expect(screen.getByLabelText('Duration')).toBeTruthy()
    expect(screen.getByLabelText('Generate audio')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Add reference video' })
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Add reference audio' })
    ).toBeTruthy()
    expect(screen.queryByText(PROVIDER_DEFAULT_HINT)).toBeNull()
  })

  it('sends only model and prompt for a Wan3 text-to-video submission', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await user.type(
      screen.getByLabelText('Prompt'),
      'a cat walks on the moon  '
    )
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(postedBodies).toHaveLength(1))
    expect(postedBodies[0]).toEqual({
      model: 'wan3.0-video',
      prompt: 'a cat walks on the moon',
    })
  })

  it('sends model, prompt and one image for a Wan3 image-to-video submission', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectMode(user, 'Image to video')
    await addReferenceUrl(
      user,
      'Add reference image',
      'https://cdn.example.com/first.png',
      // A generic chip is inert: it shows the resource name, not an `@Image1`
      // prompt token this model's request format does not carry.
      'first.png'
    )
    await user.type(screen.getByLabelText('Prompt'), 'the cat starts running')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(postedBodies).toHaveLength(1))
    expect(postedBodies[0]).toEqual({
      model: 'wan3.0-video',
      prompt: 'the cat starts running',
      image: 'https://cdn.example.com/first.png',
    })
  })

  it('blocks submission and keeps the incompatible asset visible for removal', async () => {
    stubRelay(MIXED_MODELS)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await selectModel(user, 'Doubao-Seedance-2.5')
    await addReferenceUrl(
      user,
      'Add reference video',
      'https://cdn.example.com/motion.mp4',
      '@Video1'
    )

    await selectModel(user, 'wan3.0-video')
    await user.type(screen.getByLabelText('Prompt'), 'keep the reference')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      const alerts = screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent ?? '')
      expect(
        alerts.some((text) => text.includes('single reference image'))
      ).toBe(true)
    })
    expect(postedBodies).toHaveLength(0)
    // The asset was not dropped behind the user's back: the generic tray still
    // lists it by name and still offers its remove control.
    expect(screen.getByText('motion.mp4')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Remove motion.mp4' })
    ).toBeTruthy()
  })

  it('shows the generic empty state when the key exposes no video model', async () => {
    stubRelay([
      serverModel('gpt-4o', ['openai']),
      serverModel('qwen-image', ['image-generation']),
    ])
    renderVideoPlayground(i18n)

    expect(await screen.findByText('No video models available')).toBeTruthy()
    expect(screen.getByText('This API key has no video models.')).toBeTruthy()
    expect(screen.queryByLabelText('Prompt')).toBeNull()
  })
})

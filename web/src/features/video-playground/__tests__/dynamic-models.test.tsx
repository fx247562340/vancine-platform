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
 * The dynamic video model list contract, asserted from the page.
 *
 * Only the two genuinely external boundaries are faked — the relay `fetch` and
 * the dashboard axios client — so the real `parseVideoModels` runs against a
 * real GET /v1/models payload. What is protected here is the membership rule
 * (the exact server-declared `openai-video` capability and nothing else), the
 * verbatim id spelling that reaches the wire, server order, graceful
 * degradation on a malformed payload, the empty state, and the refetch plus
 * first-entry auto-selection that an API key switch triggers.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys } from '../lib/task-key-registry'
import {
  createVideoRecorder,
  jsonResponse,
  OTHER_API_KEY,
  statusEnvelope,
  stubKeyEndpoints,
  SUBMIT_API_KEY,
} from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  pickVideoModel,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  submitStudio,
  switchApiKey,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const TASK_ID = 'task-dynamic-models'

const recorder = createVideoRecorder()
const calls = recorder.calls

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
 * Installs the relay routes. `modelsBySecret` maps the revealed API key to the
 * model list that key's GET /v1/models returns, so a key switch is observable
 * as a genuinely different server reply.
 */
function stubRelay(modelsBySecret: Record<string, unknown[]>): void {
  postedBodies = []
  recorder.install((url, init) => {
    if (url === '/v1/models') {
      const headers = (init?.headers ?? {}) as Record<string, string>
      const secret = (headers.Authorization ?? '').replace('Bearer ', '')
      return jsonResponse(200, {
        object: 'list',
        data: modelsBySecret[secret] ?? [],
      })
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

/**
 * The model ids the selector currently offers, in the order it lists them.
 *
 * The popup is closed again before returning, so a caller may keep driving the
 * page: a Base UI Select trigger toggles, and a second click on a still-open
 * popup would close it instead of opening it.
 */
async function offeredModelIds(user: UserEvent): Promise<Array<string | null>> {
  await user.click(screen.getByLabelText('Video model'))
  const options = await screen.findAllByRole('option')
  const names = options.map((option) => option.textContent)
  await user.keyboard('{Escape}')
  await waitFor(() => {
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
  return names
}

/** Two usable keys whose secrets reveal to two different model lists. */
function stubTwoUsableKeys(): void {
  apiClientMock.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/token/')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 2,
                name: 'studio',
                key: 'sk-***1111',
                status: 1,
                created_time: 100,
                expired_time: 0,
                remain_quota: 0,
                unlimited_quota: true,
              },
              {
                id: 3,
                name: 'newer',
                key: 'sk-***3333',
                status: 1,
                created_time: 200,
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
    if (url === '/api/token/2/key') {
      return { data: { success: true, data: { key: SUBMIT_API_KEY } } }
    }
    if (url === '/api/token/3/key') {
      return { data: { success: true, data: { key: OTHER_API_KEY } } }
    }
    throw new Error(`unexpected api.post: ${url}`)
  })
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

  it('offers only the models whose supported_endpoint_types contain the exact openai-video capability', async () => {
    stubRelay({
      [SUBMIT_API_KEY]: [
        serverModel('gpt-4o', ['openai', 'openai-response']),
        serverModel('qwen-image', ['image-generation']),
        serverModel('chat-only-model', ['chat']),
        // A near-miss endpoint string is not the capability: membership is exact.
        serverModel('wan3.1-video', ['openai-video-v2']),
        serverModel('wan3.0-video', ['openai', 'openai-video']),
        serverModel('MiniMax-H3', ['openai-video']),
      ],
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(await offeredModelIds(user)).toEqual(['wan3.0-video', 'MiniMax-H3'])
  })

  it('keeps the server id spelling and case in the selector and sends that id byte-for-byte on submit', async () => {
    stubRelay({
      [SUBMIT_API_KEY]: [
        serverModel('MiniMax-H3', ['openai-video']),
        serverModel('wan3.0-video-prime', ['openai-video']),
        serverModel('WEIRD-Case-Video', ['openai-video']),
      ],
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(await offeredModelIds(user)).toEqual([
      'MiniMax-H3',
      'wan3.0-video-prime',
      'WEIRD-Case-Video',
    ])

    await pickVideoModel(user, 'WEIRD-Case-Video')
    expect(screen.getByLabelText('Video model')).toHaveTextContent(
      'WEIRD-Case-Video'
    )
    await typePrompt(user, 'an oddly cased model')
    await submitStudio(user)

    await waitFor(() => expect(postedBodies).toHaveLength(1))
    expect(postedBodies[0]).toEqual({
      model: 'WEIRD-Case-Video',
      prompt: 'an oddly cased model',
    })
  })

  it('collapses a repeated id to its first occurrence and never re-sorts the server order', async () => {
    stubRelay({
      [SUBMIT_API_KEY]: [
        serverModel('Doubao-Seedance-2.5', ['openai-video']),
        serverModel('wan3.0-video', ['openai-video']),
        serverModel('Doubao-Seedance-2.5', ['openai-video']),
        serverModel('MiniMax-H3', ['openai-video']),
        serverModel('wan3.0-video', ['openai-video']),
      ],
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    // Deliberately neither alphabetical nor reverse-alphabetical, so an
    // order-preserving parser is distinguishable from any sorter.
    expect(await offeredModelIds(user)).toEqual([
      'Doubao-Seedance-2.5',
      'wan3.0-video',
      'MiniMax-H3',
    ])
  })

  it('keeps the page usable and offers only the well-formed entries when the model payload is partly malformed', async () => {
    stubRelay({
      [SUBMIT_API_KEY]: [
        null,
        42,
        'not-an-entry',
        { object: 'model', supported_endpoint_types: ['openai-video'] },
        { id: '   ', supported_endpoint_types: ['openai-video'] },
        { id: 'no-endpoint-field' },
        {
          id: 'endpoints-not-a-list',
          supported_endpoint_types: 'openai-video',
        },
        serverModel('wan3.0-video', ['openai-video']),
      ],
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(await offeredModelIds(user)).toEqual(['wan3.0-video'])
    // Degraded, not broken: the composer is still on screen and still usable.
    expect(screen.getByLabelText('Prompt')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
    expect(screen.queryByText('No video models available')).toBeNull()
  })

  it('shows the empty state and blocks generation when the key exposes no openai-video model', async () => {
    stubRelay({
      [SUBMIT_API_KEY]: [
        serverModel('gpt-4o', ['openai', 'openai-response']),
        serverModel('qwen-image', ['image-generation']),
      ],
    })
    renderVideoPlayground(i18n)

    expect(await screen.findByText('No video models available')).toBeTruthy()
    expect(screen.getByText('This API key has no video models.')).toBeTruthy()
    expect(screen.queryByLabelText('Prompt')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate video' })).toBeNull()
  })

  it('refetches the model list and selects the first entry of the new key after an API key switch', async () => {
    stubTwoUsableKeys()
    stubRelay({
      [SUBMIT_API_KEY]: [
        serverModel('wan3.0-video', ['openai-video']),
        serverModel('MiniMax-H3', ['openai-video']),
      ],
      [OTHER_API_KEY]: [
        serverModel('Doubao-Seedance-2.5', ['openai-video']),
        serverModel('wan3.0-video', ['openai-video']),
      ],
    })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    // Move off the first entry, so "the first entry of the new list" is
    // distinguishable from "the model the user had already chosen".
    await pickVideoModel(user, 'MiniMax-H3')
    expect(screen.getByLabelText('Video model')).toHaveTextContent('MiniMax-H3')

    await switchApiKey(user, 'newer')

    await waitFor(() => {
      expect(calls.some((call) => call.url === '/v1/models')).toBe(true)
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'Doubao-Seedance-2.5'
      )
    })
    expect(
      calls.filter(
        (call) =>
          call.url === '/v1/models' &&
          call.authorization === `Bearer ${OTHER_API_KEY}`
      ).length
    ).toBeGreaterThan(0)
    expect(screen.getByLabelText('Video model')).not.toHaveTextContent(
      'MiniMax-H3'
    )
    expect(await offeredModelIds(user)).toEqual([
      'Doubao-Seedance-2.5',
      'wan3.0-video',
    ])
  })
})

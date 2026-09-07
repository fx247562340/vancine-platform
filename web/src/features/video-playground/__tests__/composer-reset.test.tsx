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
 * Composer reset: what a model switch and an API key switch do to the form, and
 * what they must NOT do to an already accepted task.
 *
 * Only the two genuinely external boundaries are faked — the relay `fetch` and
 * the dashboard axios client — so the real capability table, the real composer
 * and the real submission pipeline run. A switch is an immediate, silent reset:
 * no confirmation dialog, no leftover prompt or reference image, and the new
 * model's own defaults for seconds and resolution. Accepted tasks are the
 * opposite: they survive both switches and keep authenticating with the key
 * they were submitted with.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { clearAllTaskApiKeys, lookupTaskApiKey } from '../lib/task-key-registry'
import {
  createVideoRecorder,
  jsonResponse,
  OTHER_API_KEY,
  statusEnvelope,
  SUBMIT_API_KEY,
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
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiClientMock }))

const recorder = createVideoRecorder()
const calls = recorder.calls

/** Every JSON body that reached POST /v1/video/generations, in order. */
let postedBodies: Array<Record<string, unknown>> = []

/** The five production models, as the first key's GET /v1/models returns them. */
const STUDIO_MODELS = [
  'wan3.0-video',
  'wan3.0-video-prime',
  'MiniMax-H3',
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.5',
]

/** The second key's list: a different first entry, so auto-selection is provable. */
const NEWER_MODELS = ['Doubao-Seedance-2.5', 'wan3.0-video']

/**
 * One reset case per model: the model to switch TO, the model the dirty state
 * is prepared ON, the dirty seconds and resolution, and the resolution the
 * switched-to model must come back at.
 */
const RESET_TABLE = [
  {
    modelId: 'wan3.0-video',
    prepareOn: 'MiniMax-H3',
    dirtySeconds: '12 seconds',
    dirtyResolution: '768P',
    expectedResolution: '1080P',
  },
  {
    modelId: 'wan3.0-video-prime',
    prepareOn: 'wan3.0-video',
    dirtySeconds: '8 seconds',
    dirtyResolution: '480P',
    expectedResolution: '1080P',
  },
  {
    modelId: 'MiniMax-H3',
    prepareOn: 'wan3.0-video',
    dirtySeconds: '8 seconds',
    dirtyResolution: '480P',
    expectedResolution: '2K',
  },
  {
    modelId: 'Doubao-Seedance-2.0',
    prepareOn: 'wan3.0-video',
    dirtySeconds: '10 seconds',
    dirtyResolution: '480P',
    expectedResolution: '4K',
  },
  {
    modelId: 'Doubao-Seedance-2.5',
    prepareOn: 'wan3.0-video',
    dirtySeconds: '9 seconds',
    dirtyResolution: '480P',
    expectedResolution: '1080p',
  },
] as const

function serverModels(ids: ReadonlyArray<string>): unknown[] {
  return ids.map((id) => ({
    id,
    object: 'model',
    owned_by: 'vancine',
    supported_endpoint_types: ['openai-video'],
  }))
}

/** Two usable keys revealing two different secrets and two different model lists. */
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

/** Installs the relay routes; every submit is accepted and stays non-terminal. */
function stubRelay(): void {
  postedBodies = []
  let submitCount = 0
  recorder.install((url, init) => {
    if (url === '/v1/models') {
      const headers = (init?.headers ?? {}) as Record<string, string>
      const secret = (headers.Authorization ?? '').replace('Bearer ', '')
      const ids = secret === OTHER_API_KEY ? NEWER_MODELS : STUDIO_MODELS
      return jsonResponse(200, {
        object: 'list',
        data: serverModels(ids),
      })
    }
    if (url === '/v1/video/generations') {
      if (init?.body) {
        postedBodies.push(JSON.parse(String(init.body)))
      }
      submitCount += 1
      const taskId = `task-${submitCount}`
      return jsonResponse(200, { task_id: taskId, id: taskId })
    }
    if (url.startsWith('/v1/video/generations/')) {
      const taskId = decodeURIComponent(url.split('/').at(-1) ?? '')
      return jsonResponse(200, statusEnvelope(taskId, 'SUBMITTED'))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

/** Status polls recorded for one task, in order. */
function statusCalls(taskId: string, from?: RecordedCall[]): RecordedCall[] {
  const source = from ?? calls
  return source.filter((call) =>
    call.url.startsWith(`/v1/video/generations/${taskId}`)
  )
}

/** Puts a prompt and two reference images into the composer. */
async function dirtyTheForm(user: UserEvent): Promise<void> {
  await typePrompt(user, 'a prompt that must be cleared')
  await pickReferenceImages(user, [
    makeImageFile('one.png'),
    makeImageFile('two.png'),
  ])
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2)
  })
}

/** The whole form is back at the given model's defaults, with nothing attached. */
async function expectResetForm(expectedResolution: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByLabelText('Prompt')).toHaveValue('')
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(
      0
    )
    expect(screen.getByLabelText('Seconds')).toHaveTextContent('5 seconds')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent(
      expectedResolution
    )
  })
}

let i18n: I18n

beforeEach(async () => {
  i18n = await createVideoPlaygroundI18n()
  stubAuthUser()
  clearAllTaskApiKeys()
  vi.unstubAllGlobals()
  apiClientMock.get.mockReset()
  apiClientMock.post.mockReset()
  stubTwoUsableKeys()
  stubRelay()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VideoPlayground — composer reset', () => {
  it.each(RESET_TABLE)(
    'switching to $modelId clears the prompt and every reference image and restores 5 seconds and $expectedResolution',
    async ({
      modelId,
      prepareOn,
      dirtySeconds,
      dirtyResolution,
      expectedResolution,
    }) => {
      const user = userEvent.setup()
      renderVideoPlayground(i18n)
      await readyGenerateButton()
      if (prepareOn !== 'wan3.0-video') {
        await pickVideoModel(user, prepareOn)
      }

      await dirtyTheForm(user)
      await pickSeconds(user, dirtySeconds)
      await pickResolution(user, dirtyResolution)
      // The state really is dirty, so the reset below is observable.
      expect(screen.getByLabelText('Seconds')).toHaveTextContent(dirtySeconds)
      expect(screen.getByLabelText('Resolution')).toHaveTextContent(
        dirtyResolution
      )

      await pickVideoModel(user, modelId)

      expect(screen.getByLabelText('Video model')).toHaveTextContent(modelId)
      await expectResetForm(expectedResolution)
    }
  )

  it('resets the form and selects the first model of the new key on an API key switch', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickVideoModel(user, 'Doubao-Seedance-2.0')
    await dirtyTheForm(user)
    await pickSeconds(user, '10 seconds')
    await pickResolution(user, '720p')

    await switchApiKey(user, 'newer')

    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'Doubao-Seedance-2.5'
      )
    })
    await expectResetForm('1080p')
  })

  it('switches model with no confirmation dialog of any kind', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await dirtyTheForm(user)

    await pickVideoModel(user, 'MiniMax-H3')

    await expectResetForm('2K')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('switches API key with no confirmation dialog of any kind', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await dirtyTheForm(user)

    await switchApiKey(user, 'newer')

    await expectResetForm('1080p')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps an accepted task listed and polling with its submit-time key across a model switch and an API key switch', async () => {
    const user = userEvent.setup()
    const { client } = renderVideoPlayground(i18n)
    await readyGenerateButton()

    await typePrompt(user, 'a task that outlives both switches')
    await submitStudio(user)
    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()
    await waitFor(() => expect(statusCalls('task-1').length).toBeGreaterThan(0))
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)

    await pickVideoModel(user, 'MiniMax-H3')
    const recentTasks = screen.getByRole('region', { name: 'Recent tasks' })
    expect(
      within(recentTasks).getByText('a task that outlives both switches')
    ).toBeTruthy()

    const callsBeforeKeySwitch = calls.length
    await switchApiKey(user, 'newer')
    await waitFor(() => {
      expect(screen.getByLabelText('Video model')).toHaveTextContent(
        'Doubao-Seedance-2.5'
      )
    })

    // The task is still on screen, under the same recent-task region.
    expect(
      within(screen.getByRole('region', { name: 'Recent tasks' })).getByText(
        'a task that outlives both switches'
      )
    ).toBeTruthy()
    expect(lookupTaskApiKey('task-1')).toBe(SUBMIT_API_KEY)

    // Drive the task's next status read deterministically instead of waiting
    // for the 5s poll interval: it must still carry the submit-time key.
    await act(async () => {
      await client.refetchQueries({
        queryKey: ['video-playground-task', 'task-1'],
      })
    })

    const afterSwitch = statusCalls('task-1', calls.slice(callsBeforeKeySwitch))
    expect(afterSwitch.length).toBeGreaterThan(0)
    for (const call of afterSwitch) {
      expect(call.authorization).toBe(`Bearer ${SUBMIT_API_KEY}`)
    }
  })

  it('keeps the submitted form exactly as it was after a successful submit and accepts an edited second submit', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    await pickVideoModel(user, 'MiniMax-H3')
    await typePrompt(user, 'a heron landing on a post')
    await pickReferenceImages(user, [makeImageFile('heron.jpg', 'image/jpeg')])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        1
      )
    })
    await pickSeconds(user, '8 seconds')
    await pickResolution(user, '768P')
    await submitStudio(user)

    expect(await screen.findByText(/Task ID: task-1/)).toBeTruthy()

    // Nothing was cleared by the successful submit.
    expect(screen.getByLabelText('Video model')).toHaveTextContent('MiniMax-H3')
    expect(screen.getByLabelText('Prompt')).toHaveValue(
      'a heron landing on a post'
    )
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1)
    expect(screen.getByLabelText('Seconds')).toHaveTextContent('8 seconds')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent('768P')

    // The user can edit and submit again from the same form state.
    await user.type(screen.getByLabelText('Prompt'), ' at dawn')
    await submitStudio(user)

    await waitFor(() => expect(postedBodies).toHaveLength(2))
    expect(postedBodies[1]).toEqual({
      model: 'MiniMax-H3',
      prompt: 'a heron landing on a post at dawn',
      duration: 8,
      metadata: {
        resolution: '768P',
        content: [
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: expect.stringContaining('data:image/jpeg;') },
          },
        ],
      },
    })
    expect(await screen.findByText(/Task ID: task-2/)).toBeTruthy()
  })
})

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
 * The studio's submit lifecycle, error ownership and form retention.
 *
 * A real user drives the mounted page: pick a model, attach local images,
 * type a prompt, press generate. What is asserted is only what the user can
 * observe — how many POSTs leave the page, where a failure is shown, whether
 * it is toasted, and whether the form survives a submit so it can be tweaked
 * and sent again. The exhaustive per-provider request bodies belong to
 * `outbound-request.test.tsx`; this file spot-checks one duration/resolution
 * slot per model so a page-level wiring regression still fails here.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { getVideoTask, submitVideoGenerationRequest } from '../api'
import { VideoPlaygroundError } from '../lib/errors'
import { deferred } from './pipeline-harness'
import {
  capturedSubmitBodies,
  createVideoPlaygroundI18n,
  makeImageFile,
  pickReferenceImages,
  pickResolution,
  pickSeconds,
  pickVideoModel,
  renderVideoPlayground,
  stubAuthUser,
  stubVideoApi,
  submitStudio,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationRequest: vi.fn(),
    submitVideoGenerationWithApiKey: vi.fn(),
    getVideoTask: vi.fn(),
  }
})

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}))

/** jsdom implements neither object URL, and the tray thumbnails need both. */
const createObjectUrl = vi.fn(() => 'blob:reference-preview')
const revokeObjectUrl = vi.fn()

const UPSTREAM_MESSAGE = 'insufficient quota for video generation'

function composerForm(): HTMLElement {
  // Anchored on the prompt field, not on the generate button: that button's
  // accessible name changes to "Submitting..." while a POST is in flight.
  const form = screen.getByLabelText('Prompt').closest('form')
  if (!form) {
    throw new Error('the prompt field is not inside a form')
  }
  return form
}

function submitSlot(): HTMLElement {
  return within(composerForm()).getByRole('alert')
}

function recentTaskRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Recent tasks' })
}

function previewRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Preview' })
}

async function waitForSubmitCount(count: number): Promise<void> {
  await waitFor(() => {
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(count)
  })
}

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  // Keep the status query honest: an accepted task stays "running", so nothing
  // in these tests depends on a task reaching a terminal state.
  vi.mocked(getVideoTask).mockImplementation(async (taskId: string) => ({
    task_id: taskId,
    status: 'SUBMITTED',
  }))
  toastError.mockReset()
  createObjectUrl.mockClear()
  revokeObjectUrl.mockClear()
  ;(
    URL as unknown as { createObjectURL: typeof createObjectUrl }
  ).createObjectURL = createObjectUrl
  ;(
    URL as unknown as { revokeObjectURL: typeof revokeObjectUrl }
  ).revokeObjectURL = revokeObjectUrl
  i18n = await createVideoPlaygroundI18n()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (URL as unknown as Record<string, unknown>).createObjectURL
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL
})

describe('Video studio submit lifecycle', () => {
  it('sends exactly one POST for one generate click and a second click while it is held open sends none', async () => {
    const gate = deferred<{ id?: string; task_id?: string }>()
    vi.mocked(submitVideoGenerationRequest).mockImplementation(
      () => gate.promise
    )
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')

    await submitStudio(user)
    await waitForSubmitCount(1)

    // While the POST is open the single generate button reports it and refuses
    // a second attempt, so a nervous double click cannot bill twice.
    const button = within(composerForm()).getByRole('button', {
      name: 'Submitting...',
    })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(1)

    gate.resolve({ task_id: 'task-stub', id: 'task-stub' })
    await waitFor(() => {
      expect(
        within(composerForm()).getByRole('button', { name: 'Generate video' })
      ).toBeEnabled()
    })
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(1)
  })

  it('shows an upstream submit failure verbatim above the generate button, on the task row and in the preview', async () => {
    vi.mocked(submitVideoGenerationRequest).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: UPSTREAM_MESSAGE,
        httpStatus: 402,
      })
    )
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')

    await submitStudio(user)

    // One owning error, three intentional surfaces: the submit slot above the
    // button, the selected task's preview, and a Failed badge on its row.
    const inline = await screen.findAllByText(UPSTREAM_MESSAGE)
    expect(inline).toHaveLength(2)
    expect(submitSlot()).toHaveTextContent(UPSTREAM_MESSAGE)
    expect(within(previewRegion()).getByText(UPSTREAM_MESSAGE)).toBeTruthy()
    const row = within(recentTaskRegion()).getByRole('button')
    expect(within(row).getByText('Failed')).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('shows the translated system failure above the generate button when the submit response carries no task id', async () => {
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({})
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')

    await submitStudio(user)

    const inline = await screen.findAllByText('Video generation failed')
    expect(inline).toHaveLength(2)
    expect(submitSlot()).toHaveTextContent('Video generation failed')
    expect(
      within(previewRegion()).getByText('Video generation failed')
    ).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('emits no toast at all when a submit fails', async () => {
    vi.mocked(submitVideoGenerationRequest).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'system',
        errorKey: 'Video generation failed',
      })
    )
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')

    await submitStudio(user)
    await screen.findAllByText('Video generation failed')

    // The mutation's onError is deliberately a no-op: the inline slot owns it.
    expect(toastError).not.toHaveBeenCalled()
  })

  it('clears an over-budget rejection above the generate button as soon as the user edits the prompt', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'MiniMax-H3')
    await pickReferenceImages(
      user,
      [1, 2, 3, 4, 5].map((index) =>
        makeImageFile(`heavy-${index}.png`, 'image/png', 10 * 1024 * 1024)
      )
    )
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        5
      )
    })
    await typePrompt(user, 'a very heavy clip')

    await submitStudio(user)

    expect(await screen.findByText(/The request is too large/)).toBeTruthy()
    expect(vi.mocked(submitVideoGenerationRequest)).not.toHaveBeenCalled()

    // A rejection is never sticky: the next keystroke clears it.
    await user.type(screen.getByLabelText('Prompt'), '!')
    await waitFor(() => {
      expect(within(composerForm()).queryByRole('alert')).toBeNull()
    })
    expect(vi.mocked(submitVideoGenerationRequest)).not.toHaveBeenCalled()
  })

  it('removes the previous submit failure above the generate button once a later submit succeeds', async () => {
    vi.mocked(submitVideoGenerationRequest)
      .mockRejectedValueOnce(
        new VideoPlaygroundError({
          kind: 'upstream',
          rawMessage: UPSTREAM_MESSAGE,
          httpStatus: 503,
        })
      )
      .mockResolvedValue({ task_id: 'task-stub', id: 'task-stub' })
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a cat walks on the moon')

    await submitStudio(user)
    await screen.findAllByText(UPSTREAM_MESSAGE)
    expect(submitSlot()).toHaveTextContent(UPSTREAM_MESSAGE)

    await submitStudio(user)
    await waitForSubmitCount(2)

    // The slot shows only the newest attempt, so the old failure is gone.
    await waitFor(() => {
      expect(screen.queryAllByText(UPSTREAM_MESSAGE)).toHaveLength(0)
    })
    expect(within(composerForm()).queryByRole('alert')).toBeNull()
  })
})

describe('Video studio form retention', () => {
  it('keeps model, prompt, images, seconds and resolution after a successful submit so a tweak can be sent again', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.5')
    await pickSeconds(user, '12 seconds')
    await pickResolution(user, '720p')
    await typePrompt(user, 'a long single take')
    await pickReferenceImages(user, [makeImageFile('station.png')])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        1
      )
    })

    await submitStudio(user)
    await waitForSubmitCount(1)

    // Nothing was consumed by the submit: the user can tweak and go again.
    expect(screen.getByLabelText('Video model')).toHaveTextContent(
      'Doubao-Seedance-2.5'
    )
    expect(screen.getByLabelText('Prompt')).toHaveValue('a long single take')
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1)
    expect(screen.getByLabelText('Seconds')).toHaveTextContent('12 seconds')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent('720p')

    await pickSeconds(user, '8 seconds')
    await submitStudio(user)
    await waitForSubmitCount(2)

    const bodies = await capturedSubmitBodies()
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toMatchObject({ seconds: '8' })
    // The retained image and prompt travelled into the second body unchanged.
    expect(bodies[1]).toMatchObject({
      model: 'Doubao-Seedance-2.5',
      prompt: 'a long single take',
      metadata: { resolution: '720p' },
    })
    expect(
      (bodies[1] as { metadata?: { content?: unknown[] } }).metadata?.content
    ).toHaveLength(1)
  })

  it('clears the reference-image tray on a model switch so an over-cap body cannot be sent', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.5')
    await pickReferenceImages(
      user,
      Array.from({ length: 30 }, (_, index) =>
        makeImageFile(`frame-${index}.png`)
      )
    )
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(
        30
      )
    })

    // MiniMax-H3 accepts at most five, so keeping the tray would guarantee an
    // over-cap body. The switch empties it instead.
    await pickVideoModel(user, 'MiniMax-H3')
    await waitFor(() => {
      expect(
        screen.queryAllByRole('button', { name: /^Remove / })
      ).toHaveLength(0)
    })

    await typePrompt(user, 'a heron landing on a post')
    await submitStudio(user)
    await waitForSubmitCount(1)

    const bodies = await capturedSubmitBodies()
    expect(bodies[0]).toMatchObject({ model: 'MiniMax-H3' })
    // The emptied tray must leave no image anywhere in the body.
    expect(
      (bodies[0] as { metadata?: { content?: unknown[] } }).metadata?.content
    ).toBeUndefined()
    expect(bodies[0]).not.toHaveProperty('image')
    expect(bodies[0]).not.toHaveProperty('images')
  })
})

describe('Video studio per-model parameter slot', () => {
  type SlotCheck = {
    model: string
    models?: ReadonlyArray<string>
    seconds?: string
    resolution?: string
    slot: Record<string, unknown>
    exact?: boolean
  }

  const slotChecks: SlotCheck[] = [
    {
      model: 'wan3.0-video',
      slot: { duration: 5, size: '1080P' },
    },
    {
      model: 'wan3.0-video-prime',
      seconds: '10 seconds',
      resolution: '720P',
      slot: { duration: 10, size: '720P' },
    },
    {
      model: 'MiniMax-H3',
      slot: { duration: 5, metadata: { resolution: '2K' } },
    },
    {
      model: 'Doubao-Seedance-2.0',
      slot: { seconds: '5', metadata: { resolution: '4k' } },
    },
    {
      model: 'Doubao-Seedance-2.5',
      seconds: '30 seconds',
      slot: { seconds: '30', metadata: { resolution: '1080p' } },
    },
    {
      model: 'some-future-video-model',
      models: ['some-future-video-model'],
      slot: {},
      exact: true,
    },
  ]

  it.each(slotChecks)(
    'sends $model its own duration and resolution slot',
    async (check) => {
      if (check.models) {
        await stubVideoApi({ models: check.models })
      }
      const user = userEvent.setup()
      renderVideoPlayground(i18n)
      await pickVideoModel(user, check.model)
      if (check.seconds) {
        await pickSeconds(user, check.seconds)
      }
      if (check.resolution) {
        await pickResolution(user, check.resolution)
      }
      await typePrompt(user, 'a slot check clip')

      await submitStudio(user)
      await waitForSubmitCount(1)

      const bodies = await capturedSubmitBodies()
      if (check.exact) {
        // No capability evidence: the plugin owns every parameter.
        expect(bodies[0]).toEqual({
          model: check.model,
          prompt: 'a slot check clip',
        })
        return
      }
      expect(bodies[0]).toMatchObject(check.slot)
    }
  )
})

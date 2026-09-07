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
 * The safe default for a video model Vancine holds no capability evidence for.
 *
 * Such a model stays fully usable — selectable, submittable — but the page
 * invents nothing about it: both parameter selects collapse to a single
 * "Default" entry, the reference-image tray refuses all three input paths, and
 * only `model` plus the trimmed prompt go on the wire. The last group of tests
 * is the anti-guessing regression: an id that merely CONTAINS a known id as a
 * substring must earn exactly the same safe default, never the known model's
 * capability table.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { submitVideoGenerationRequest } from '../api'
import {
  createVideoPlaygroundI18n,
  dropReferenceImages,
  makeImageFile,
  pasteFromClipboard,
  pickReferenceImages,
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

/** An id that contains no known model id at all: the neutral unknown case. */
const UNVERIFIED_MODEL = 'some-future-video-model'

const NO_IMAGES_MESSAGE = 'This model does not accept reference images.'

/**
 * Ids that merely contain a capability-table id as a substring. Each must be
 * treated as unverified: guessing from a name would hand the user a duration
 * range, a resolution tier and a reference-image budget Vancine never checked.
 */
const SUBSTRING_IDS = [
  'Doubao-Seedance-2.5-experimental',
  'wan3.0-video-turbo',
  'MiniMax-H3-fast',
  'prefix-wan3.0-video',
] as const

/** The body handed to `submitVideoGenerationRequest` by the given call. */
function submittedBody(callIndex = 0): unknown {
  return vi.mocked(submitVideoGenerationRequest).mock.calls[callIndex]?.[1]
}

async function waitForSubmitCount(count: number): Promise<void> {
  await waitFor(() => {
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(count)
  })
}

/**
 * The option labels one select currently offers.
 *
 * The popup is closed again before returning: a Base UI Select trigger toggles,
 * so leaving it open would make the next click close it instead of opening the
 * other select.
 */
async function offeredOptions(
  user: UserEvent,
  label: string
): Promise<Array<string | null>> {
  await user.click(screen.getByLabelText(label))
  const options = await screen.findAllByRole('option')
  const names = options.map((option) => option.textContent)
  await user.keyboard('{Escape}')
  await waitFor(() => {
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
  return names
}

/**
 * Renders the studio on a key that offers one known model plus `modelId`, then
 * selects `modelId`. The api stub has to be in place before the first render,
 * because the model list is fetched once on mount.
 */
async function renderOnUnverifiedModel(
  user: UserEvent,
  i18n: I18n,
  modelId: string
): Promise<void> {
  await stubVideoApi({ models: ['wan3.0-video', modelId] })
  renderVideoPlayground(i18n)
  await pickVideoModel(user, modelId)
  expect(screen.getByLabelText('Video model')).toHaveTextContent(modelId)
}

/** Asserts the tray refused the last input and kept every image out. */
async function expectTrayRefusedImages(): Promise<void> {
  const tray = await screen.findByRole('group', { name: 'Reference images' })
  expect(await within(tray).findByText(NO_IMAGES_MESSAGE)).toBeTruthy()
  expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(0)
}

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  i18n = await createVideoPlaygroundI18n()
})

describe('VideoPlayground — a video model with no capability entry', () => {
  it('stays selectable and submittable', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    await typePrompt(user, 'an unverified model still generates')
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
    await submitStudio(user)

    await waitForSubmitCount(1)
    expect(submittedBody()).toEqual({
      model: UNVERIFIED_MODEL,
      prompt: 'an unverified model still generates',
    })
  })

  it('offers exactly one Default option in both the Seconds and the Resolution select', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    expect(await offeredOptions(user, 'Seconds')).toEqual(['Default'])
    expect(await offeredOptions(user, 'Resolution')).toEqual(['Default'])
  })

  it('refuses a file picked through the tray and attaches no image', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    await pickReferenceImages(user, [makeImageFile('picked.png')])

    await expectTrayRefusedImages()
  })

  it('refuses a file dropped on the tray and attaches no image', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    dropReferenceImages([makeImageFile('dropped.png')])

    await expectTrayRefusedImages()
  })

  it('refuses an image pasted from the clipboard and leaves the prompt untouched', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    const paste = pasteFromClipboard([makeImageFile('pasted.png')])
    // The tray owns the paste, so the clipboard image never reaches the prompt.
    expect(paste.defaultPrevented()).toBe(true)

    await expectTrayRefusedImages()
    expect(screen.getByLabelText('Prompt')).toHaveValue('')
  })

  it('sends only model and the trimmed prompt, with no duration, seconds, size or metadata', async () => {
    const user = userEvent.setup()
    await renderOnUnverifiedModel(user, i18n, UNVERIFIED_MODEL)

    await typePrompt(user, '   provider owns every parameter   ')
    await submitStudio(user)

    await waitForSubmitCount(1)
    expect(submittedBody()).toEqual({
      model: UNVERIFIED_MODEL,
      prompt: 'provider owns every parameter',
    })
    expect(submittedBody()).not.toHaveProperty('duration')
    expect(submittedBody()).not.toHaveProperty('seconds')
    expect(submittedBody()).not.toHaveProperty('size')
    expect(submittedBody()).not.toHaveProperty('metadata')
  })

  it.each(SUBSTRING_IDS)(
    'gives %s the identical unverified default instead of the capability its name contains',
    async (substringId) => {
      const user = userEvent.setup()
      await renderOnUnverifiedModel(user, i18n, substringId)

      expect(await offeredOptions(user, 'Seconds')).toEqual(['Default'])
      expect(await offeredOptions(user, 'Resolution')).toEqual(['Default'])

      await pickReferenceImages(user, [makeImageFile('reference.png')])
      await expectTrayRefusedImages()

      await typePrompt(user, 'a substring id is still unverified')
      await submitStudio(user)

      await waitForSubmitCount(1)
      expect(submittedBody()).toEqual({
        model: substringId,
        prompt: 'a substring id is still unverified',
      })
    }
  )
})

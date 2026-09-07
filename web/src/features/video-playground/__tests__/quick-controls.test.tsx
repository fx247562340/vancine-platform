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
 * The video studio retired the whole parameter-heavy composer.
 *
 * Hiding a control is not enough: the value it used to own must also be gone
 * from the request that reaches POST /v1/video/generations. So this file
 * asserts both halves of the retirement — every removed control is unqueryable
 * for a dedicated model AND for a model the capability table knows nothing
 * about, and a fully exercised form still puts none of the retired fields on
 * the wire, at either the top level or inside `metadata`.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { submitVideoGenerationRequest } from '../api'
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

/**
 * Every label the retired controls used to render, spelled exactly as the
 * locale files spell them, so a control that comes back is caught by name.
 */
const RETIRED_LABELS = [
  // Creation-mode selector and each mode it offered.
  'Creation mode',
  'Text to video',
  'Image to video',
  'First frame',
  'First and last frame',
  'Reference generation',
  'Video edit',
  'Video extend',
  // Aspect ratio.
  'Aspect ratio',
  '16:9',
  '9:16',
  // Reference video and reference audio intake.
  'Add reference video',
  'Add reference audio',
  'Reference video',
  'Reference audio',
  'https://cdn.example.com/reference.mp4',
  'https://cdn.example.com/reference.wav',
  // Generate-audio toggle.
  'Generate audio',
  'Audio on',
  'Silent',
  // Seed.
  'Random seed (optional)',
  'Leave empty for random',
  // Watermark and return-last-frame switches.
  'Watermark',
  'Return last frame',
  // Intelligent duration and batch count.
  'Intelligent duration',
  'Fixed duration',
  'Number of tasks',
  // The parameters popover and its quick pills.
  'Parameter settings',
  'Parameters',
  // The removed cancel affordance: an accepted task may already be billed.
  'Cancel pending submissions',
  // Every image-by-URL intake path.
  'Public URL',
  'Asset id (allowlist)',
  'https://cdn.example.com/reference.png',
  // Reference-token insertion into the prompt.
  '@Image1',
  'Insert @Image1 into prompt',
  // The connection-settings gear popover; the key moved into the page header.
  'Connection settings',
  // The seventh badge state the frozen mapping deliberately does not have.
  'Pending',
] as const

/** The controls that replaced them, asserted so an empty page cannot pass. */
function expectStudioControlsPresent(): void {
  expect(screen.getByRole('button', { name: 'API Key' })).toBeTruthy()
  expect(screen.getByLabelText('Video model')).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Reference images' })).toBeTruthy()
  expect(screen.getByLabelText('Prompt')).toBeTruthy()
  expect(screen.getByLabelText('Seconds')).toBeTruthy()
  expect(screen.getByLabelText('Resolution')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Generate video' })).toBeTruthy()
}

/**
 * A retired control must be unqueryable in every way a user could reach it:
 * as visible text, as an accessible name, as a form label and as a placeholder.
 */
function expectRetiredControlsAbsent(): void {
  for (const label of RETIRED_LABELS) {
    expect(screen.queryAllByText(label), `text "${label}"`).toHaveLength(0)
    expect(
      screen.queryAllByRole('button', { name: label }),
      `button "${label}"`
    ).toHaveLength(0)
    expect(
      screen.queryAllByLabelText(label),
      `labelled control "${label}"`
    ).toHaveLength(0)
    expect(
      screen.queryAllByPlaceholderText(label),
      `placeholder "${label}"`
    ).toHaveLength(0)
  }
  expect(
    screen.queryAllByRole('toolbar', { name: 'Composer toolbar' })
  ).toHaveLength(0)
}

/**
 * Fields the retired controls owned. Each one is asserted structurally with
 * `not.toHaveProperty` at both levels of the body, so a renamed-but-equivalent
 * value cannot slip through a string search of the serialized JSON.
 */
const RETIRED_FIELDS = [
  'ratio',
  'generate_audio',
  'audio',
  'seed',
  'watermark',
  'return_last_frame',
  'frames',
  'mode',
  'n',
  'batch',
  'batch_count',
  'image',
  'images',
  'input_reference',
  'first_frame',
  'last_frame',
  'reference_video',
  'reference_audio',
] as const

type CapturedBody = {
  model: string
  prompt: string
  seconds?: string
  metadata?: Record<string, unknown>
} & Record<string, unknown>

function expectNoRetiredFields(body: CapturedBody): void {
  for (const field of RETIRED_FIELDS) {
    expect(body, `top-level ${field}`).not.toHaveProperty(field)
    if (body.metadata) {
      expect(body.metadata, `metadata.${field}`).not.toHaveProperty(field)
    }
  }
}

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  i18n = await createVideoPlaygroundI18n()
})

describe('Video studio retired controls', () => {
  it('renders no retired control for a dedicated capability model', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.5')

    expectStudioControlsPresent()
    expectRetiredControlsAbsent()
  })

  it('renders no retired control for a model the capability table does not know', async () => {
    await stubVideoApi({ models: ['some-future-video-model'] })
    renderVideoPlayground(i18n)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Generate video' })
      ).toBeEnabled()
    })

    expect(screen.getByLabelText('Video model')).toHaveTextContent(
      'some-future-video-model'
    )
    expectStudioControlsPresent()
    expectRetiredControlsAbsent()
  })

  it('sends no retired field after exercising model, reference image, prompt, seconds and resolution', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await pickVideoModel(user, 'Doubao-Seedance-2.5')
    await typePrompt(user, 'a market street at dusk')
    await pickReferenceImages(user, [makeImageFile('street.png')])
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Remove street.png' })
      ).toBeTruthy()
    })
    await pickSeconds(user, '9 seconds')
    await pickResolution(user, '720p')

    await submitStudio(user)
    await waitFor(() => {
      expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(1)
    })

    const body = (await capturedSubmitBodies())[0] as CapturedBody
    // The form was genuinely exercised, so the absence below is not vacuous.
    expect(body.model).toBe('Doubao-Seedance-2.5')
    expect(body.prompt).toBe('a market street at dusk')
    expect(body.seconds).toBe('9')
    expect(body.metadata?.resolution).toBe('720p')
    expect(body.metadata?.content).toHaveLength(1)
    expectNoRetiredFields(body)
  })
})

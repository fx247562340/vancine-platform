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
 * Video studio accessibility.
 *
 * One responsibility: everything an assistive-tech user needs to operate the
 * rebuilt two-column studio. That is the accessible name of every control, full
 * keyboard operability (tab order, keyboard submit, keyboard task selection),
 * the ARIA states that must track the visible state (`aria-expanded`,
 * `aria-selected`, `aria-checked`, `aria-pressed`, `aria-busy`, `aria-invalid`),
 * and the rule that failures are announced in the page, never through a
 * blocking browser `alert`.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { getVideoTask, submitVideoGenerationRequest } from '../api'
import { VideoPlaygroundError } from '../lib/errors'
import { deferred } from './pipeline-harness'
import {
  createVideoPlaygroundI18n,
  readyGenerateButton,
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

const FINISHED_CLIP_URL =
  'https://media.test/v1/tasks/task-finished/artifacts/video/content?access=tok'

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  i18n = await createVideoPlaygroundI18n()
})

/**
 * Walk the browser tab order from wherever focus currently is and return the
 * element that received focus at each stop. Stops that land on `document.body`
 * (the wrap point) are dropped, so the result is the real sequence of keyboard
 * stops a user reaches.
 */
async function walkTabOrder(user: UserEvent, stopCount: number) {
  const stops: Element[] = []
  for (let index = 0; index < stopCount; index += 1) {
    await user.tab()
    const active = document.activeElement
    if (active && active !== document.body) {
      stops.push(active)
    }
  }
  return stops
}

/** Put one accepted task on the page so the preview column has real content. */
async function submitAcceptedTask(
  user: UserEvent,
  prompt: string,
  taskId: string
) {
  vi.mocked(submitVideoGenerationRequest).mockResolvedValue({ task_id: taskId })
  vi.mocked(getVideoTask).mockResolvedValue({
    task_id: taskId,
    status: 'IN_PROGRESS',
  })
  await typePrompt(user, prompt)
  await submitStudio(user)
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Recent tasks' })).toBeTruthy()
  })
}

describe('Video studio accessible names', () => {
  it('gives the header key picker, every composer control and the preview region their announced accessible names', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(
      screen.getByRole('button', { name: 'API Key' })
    ).toHaveAccessibleName('API Key')
    expect(
      screen.getByRole('combobox', { name: 'Video model' })
    ).toHaveAccessibleName('Video model')
    expect(
      screen.getByRole('group', { name: 'Reference images' })
    ).toHaveAccessibleName('Reference images')
    expect(
      screen.getByRole('button', { name: 'Choose files' })
    ).toHaveAccessibleName('Choose files')
    expect(
      screen.getByRole('textbox', { name: 'Prompt' })
    ).toHaveAccessibleName('Prompt')
    expect(
      screen.getByRole('combobox', { name: 'Seconds' })
    ).toHaveAccessibleName('Seconds')
    expect(
      screen.getByRole('combobox', { name: 'Resolution' })
    ).toHaveAccessibleName('Resolution')
    expect(
      screen.getByRole('button', { name: 'Generate video' })
    ).toHaveAccessibleName('Generate video')
    expect(
      screen.getByRole('region', { name: 'Preview' })
    ).toHaveAccessibleName('Preview')
  })

  it('names the reference-image tray from a visible text label rather than an aria-label', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const tray = screen.getByRole('group', { name: 'Reference images' })
    const label = screen.getByText('Reference images')
    expect(tray).not.toHaveAttribute('aria-label')
    expect(label.id).not.toBe('')
    expect(tray).toHaveAttribute('aria-labelledby', label.id)
    expect(tray).toContainElement(label)
  })

  it('names the finished-task preview controls Generated video, Download and Use these settings again', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
      task_id: 'task-finished',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-finished',
      status: 'SUCCESS',
      content_url: FINISHED_CLIP_URL,
    })
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a finished clip')
    await submitStudio(user)

    const video = await screen.findByLabelText('Generated video')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('src', FINISHED_CLIP_URL)
    expect(
      screen.getByRole('button', { name: 'Download' })
    ).toHaveAccessibleName('Download')
    expect(
      screen.getByRole('button', { name: 'Use these settings again' })
    ).toHaveAccessibleName('Use these settings again')
  })

  it('names the recovery control Reload preview when the rendered video fails to load', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
      task_id: 'task-finished',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-finished',
      status: 'SUCCESS',
      content_url: FINISHED_CLIP_URL,
    })
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a finished clip')
    await submitStudio(user)
    fireEvent.error(await screen.findByLabelText('Generated video'))

    const reload = await screen.findByRole('button', { name: 'Reload preview' })
    expect(reload).toHaveAccessibleName('Reload preview')
    expect(screen.queryByLabelText('Generated video')).toBeNull()
  })

  it('names the recovery control Retry status when the task status request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
      task_id: 'task-stalled',
    })
    vi.mocked(getVideoTask).mockRejectedValue(
      new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: 'upstream 503',
        httpStatus: 503,
        terminal: true,
      })
    )
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a stalled clip')
    await submitStudio(user)

    const retry = await screen.findByRole('button', { name: 'Retry status' })
    expect(retry).toHaveAccessibleName('Retry status')
  })
})

describe('Video studio keyboard operability', () => {
  it('reaches every composer control in DOM order by Tab and submits with the keyboard', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
      task_id: 'task-keyboard',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-keyboard',
      status: 'IN_PROGRESS',
    })
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    screen.getByRole('combobox', { name: 'Video model' }).focus()

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Choose files' })
    )

    await user.tab()
    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    expect(document.activeElement).toBe(prompt)
    await user.keyboard('a keyboard-only prompt')

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('combobox', { name: 'Seconds' })
    )

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('combobox', { name: 'Resolution' })
    )

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Generate video' })
    )
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(1)
    })
    expect(vi.mocked(submitVideoGenerationRequest).mock.calls[0]?.[1]).toEqual({
      model: 'wan3.0-video',
      prompt: 'a keyboard-only prompt',
      duration: 5,
      size: '1080P',
    })
  })

  it('keeps Choose files as the tray keyboard entry point and never focuses the file input while tabbing', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const fileInput = screen.getByTestId('reference-image-file-input')
    expect(fileInput).toHaveAttribute('type', 'file')
    expect(fileInput).toHaveAttribute('aria-hidden', 'true')

    ;(document.activeElement as HTMLElement | null)?.blur()
    const stops = await walkTabOrder(user, 10)

    expect(stops).toContain(
      screen.getByRole('button', { name: 'Choose files' })
    )
    expect(stops).not.toContain(fileInput)
  })

  it('selects a recent task with Enter and moves the preview onto it, flipping aria-pressed', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest)
      .mockResolvedValueOnce({ task_id: 'task-first' })
      .mockResolvedValueOnce({ task_id: 'task-second' })
    vi.mocked(getVideoTask).mockImplementation(async (taskId: string) => ({
      task_id: taskId,
      status: taskId === 'task-first' ? 'SUCCESS' : 'IN_PROGRESS',
      content_url:
        taskId === 'task-first'
          ? 'https://media.test/v1/tasks/task-first/artifacts/video/content?access=tok'
          : null,
    }))
    renderVideoPlayground(i18n)
    await typePrompt(user, 'first prompt')
    await submitStudio(user)
    await screen.findByLabelText('Generated video')
    await user.clear(screen.getByRole('textbox', { name: 'Prompt' }))
    await typePrompt(user, 'second prompt')
    await submitStudio(user)

    const list = await screen.findByRole('region', { name: 'Recent tasks' })
    await waitFor(() => {
      expect(within(list).getAllByRole('button')).toHaveLength(2)
    })
    const firstRow = within(list).getByRole('button', { name: /first prompt/ })
    const secondRow = within(list).getByRole('button', {
      name: /second prompt/,
    })
    // Natively keyboard operable: a real button, not a div with a click handler.
    expect(firstRow.tagName).toBe('BUTTON')
    expect(firstRow).toHaveAttribute('type', 'button')
    // The just-submitted task owns the preview.
    expect(firstRow).toHaveAttribute('aria-pressed', 'false')
    expect(secondRow).toHaveAttribute('aria-pressed', 'true')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByText('second prompt')).toBeTruthy()

    firstRow.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(firstRow).toHaveAttribute('aria-pressed', 'true')
    })
    expect(secondRow).toHaveAttribute('aria-pressed', 'false')
    expect(within(preview).getByText('first prompt')).toBeTruthy()
    expect(within(preview).getByLabelText('Generated video')).toBeTruthy()
  })
})

describe('Video studio ARIA state consistency', () => {
  it('mirrors the API Key menu visibility in aria-expanded and the chosen key in aria-checked', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const trigger = screen.getByRole('button', { name: 'API Key' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toBeDisabled()

    await user.click(trigger)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    const entries = screen.getAllByRole('menuitemradio')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveAccessibleName(/studio/)
    expect(entries[0]).toHaveAttribute('aria-checked', 'true')
    expect(entries[1]).toHaveAccessibleName(/newer/)
    expect(entries[1]).toHaveAttribute('aria-checked', 'false')

    await user.click(entries[1] as HTMLElement)
    await waitFor(() => {
      expect(trigger).toHaveTextContent('newer · sk-***9999')
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    const reopened = screen.getAllByRole('menuitemradio')
    expect(reopened[0]).toHaveAttribute('aria-checked', 'false')
    expect(reopened[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('marks only the currently chosen Seconds option aria-selected and closes the listbox again', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const seconds = screen.getByRole('combobox', { name: 'Seconds' })
    expect(seconds).toHaveAttribute('aria-expanded', 'false')

    await user.click(seconds)
    await waitFor(() => {
      expect(seconds).toHaveAttribute('aria-expanded', 'true')
    })
    const options = screen.getAllByRole('option')
    const selected = options.filter(
      (option) => option.getAttribute('aria-selected') === 'true'
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveAccessibleName('5 seconds')
    expect(seconds).toHaveTextContent('5 seconds')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(seconds).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('disables Generate video and sets aria-busy while the POST is in flight, then clears both when the task id arrives', async () => {
    const user = userEvent.setup()
    const gate = deferred<{ id?: string; task_id?: string }>()
    vi.mocked(submitVideoGenerationRequest).mockImplementation(
      () => gate.promise
    )
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-slow',
      status: 'IN_PROGRESS',
    })
    renderVideoPlayground(i18n)
    const generate = await readyGenerateButton()
    expect(generate).toBeEnabled()
    expect(generate).not.toHaveAttribute('aria-busy')

    await typePrompt(user, 'a slow upload')
    await submitStudio(user)

    await waitFor(() => {
      expect(generate).toBeDisabled()
    })
    expect(generate).toHaveAttribute('aria-busy', 'true')
    expect(generate).toHaveAccessibleName('Submitting...')
    expect(vi.mocked(submitVideoGenerationRequest)).toHaveBeenCalledTimes(1)

    gate.resolve({ task_id: 'task-slow' })

    await waitFor(() => {
      expect(generate).toBeEnabled()
    })
    expect(generate).not.toHaveAttribute('aria-busy')
    expect(generate).toHaveAccessibleName('Generate video')
  })

  it('sets aria-invalid plus a role=alert message on an empty-prompt submit and clears both once a prompt is typed', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    expect(prompt).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()

    await user.type(prompt, '   ')
    await submitStudio(user)

    await waitFor(() => {
      expect(prompt).toHaveAttribute('aria-invalid', 'true')
    })
    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Prompt is required')
    expect(prompt).toHaveAttribute('aria-describedby', message.id)
    expect(vi.mocked(submitVideoGenerationRequest)).not.toHaveBeenCalled()

    await user.type(prompt, 'a real prompt')

    await waitFor(() => {
      expect(prompt).not.toHaveAttribute('aria-invalid')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a rejected submission inline and never calls window.alert', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.mocked(submitVideoGenerationRequest).mockRejectedValue(
      new Error('upstream refused')
    )
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a rejected clip')
    await submitStudio(user)

    const messages = await screen.findAllByText('Video generation failed')
    expect(messages.length).toBeGreaterThan(0)
    expect(alertSpy).not.toHaveBeenCalled()
  })
})

describe('Video studio focus order', () => {
  it('puts the header API Key control before the composer controls and the composer before the preview', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await submitAcceptedTask(user, 'a focus-order clip', 'task-focus')
    await readyGenerateButton()

    ;(document.activeElement as HTMLElement | null)?.blur()
    const stops = await walkTabOrder(user, 12)

    const keyTrigger = screen.getByRole('button', { name: 'API Key' })
    const modelSelect = screen.getByRole('combobox', { name: 'Video model' })
    const generate = screen.getByRole('button', { name: 'Generate video' })
    const preview = screen.getByRole('region', { name: 'Preview' })
    const previewLogLink = within(preview).getByRole('link', {
      name: 'View in usage logs',
    })

    for (const stop of [keyTrigger, modelSelect, generate, previewLogLink]) {
      expect(stops).toContain(stop)
    }
    expect(stops.indexOf(keyTrigger)).toBeLessThan(stops.indexOf(modelSelect))
    expect(stops.indexOf(modelSelect)).toBeLessThan(stops.indexOf(generate))
    expect(stops.indexOf(generate)).toBeLessThan(stops.indexOf(previewLogLink))
    // The preview landmark wraps the link, so reaching the link last also means
    // the whole preview column is reached after the composer.
    expect(preview.contains(previewLogLink)).toBe(true)
  })
})

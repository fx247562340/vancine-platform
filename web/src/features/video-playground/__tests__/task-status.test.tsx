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
 * User-visible task status mapping tests. The internal state machine
 * (useSubmission / polling / server status) is unchanged — only the
 * six canonical labels surface in the UI:
 *   Queued, Submitting, Running, Completed, Failed, Cancelled.
 *
 * These tests also assert that the user never sees a seventh
 * "Pending" state: a query failure keeps the last non-terminal
 * semantic (Running) instead of falling back, and a successful retry
 * resumes one of the six canonical labels.
 */
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  listUsableVideoApiKeys,
  loadVideoApiSecret,
  submitVideoGenerationWithApiKey,
} from '../api'
import {
  FAKE_SECRET,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)

vi.mock('../lib/media-duration', () => ({
  readMediaDuration: vi.fn(async () => undefined),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationWithApiKey: vi.fn(),
    getVideoTask: vi.fn(),
  }
})

async function createI18n(): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          Prompt: 'Prompt',
          Generate: 'Generate',
          Queued: 'Queued',
          Submitting: 'Submitting',
          Running: 'Running',
          Completed: 'Completed',
          Failed: 'Failed',
          Cancelled: 'Cancelled',
          'Task queue': 'Task queue',
          'Parameter settings': 'Parameter settings',
          'Failed to load video status': 'Failed to load video status',
          'Retry status': 'Retry status',
          'Submitting...': 'Submitting...',
        },
      },
    },
  })
  return instance
}

const setup = () => {
  stubAuthUser()
  vi.mocked(listUsableVideoApiKeys).mockResolvedValue([
    {
      id: 7,
      name: 'phaseD',
      maskedKey: 'sk-***7777',
      status: 1,
      createdTime: 100,
    },
  ])
  vi.mocked(loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
  vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
    { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
  ])
  vi.mocked(submitVideoGenerationWithApiKey).mockReset()
  vi.mocked(getVideoTask).mockReset()
}

describe('VideoPlayground user-visible task status mapping', () => {
  beforeEach(setup)
  afterEach(() => {
    // Drop any deferred promise resolver between tests.
    vi.useRealTimers()
  })

  it('shows the Submitting label while the POST is in flight', async () => {
    let resolveSubmit!: (value: { task_id: string }) => void
    const submitPromise = new Promise<{ task_id: string }>((resolve) => {
      resolveSubmit = resolve
    })
    vi.mocked(submitVideoGenerationWithApiKey).mockImplementation(
      () => submitPromise
    )
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-1',
      status: 'IN_PROGRESS',
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a cat walks on the moon')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('Submitting')).toBeTruthy()
    // Resolve the in-flight submit inside act so the post-resolve
    // re-render is flushed before the test ends.
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    await act(async () => {
      resolveSubmit({ task_id: 'task-1' })
      // Let react-query and the polling fetch settle.
      await Promise.resolve()
    })
  })

  it('shows the Running label while the upstream task is still pending', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-run',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-run',
      status: 'IN_PROGRESS',
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(
      screen.getByLabelText('Prompt'),
      'a dog running in the park'
    )
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(await screen.findByText('Running')).toBeTruthy()
  })

  it('shows the Completed label when the upstream task succeeds', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-ok',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-ok',
      status: 'SUCCESS',
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a bright sunrise')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('Completed')).toBeTruthy()
  })

  it('shows the Failed label when the upstream task reports failure', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-fail',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-fail',
      status: 'FAILURE',
      fail_reason: 'content moderation rejected the prompt',
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a banned scene')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('Failed')).toBeTruthy()
  })

  it('keeps the Running label when the polling query fails, never falls back to a Pending seventh state', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-qfail',
    })
    // First call: a transient failure. Subsequent retries also fail
    // so the query error state is eventually reachable in the test.
    vi.mocked(getVideoTask).mockRejectedValue(
      new Error('upstream 503 — service unavailable')
    )
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a quiet street')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    // Running is the last non-terminal semantic; a query failure
    // must not collapse it into a seventh "Pending" state.
    expect(await screen.findByText('Running')).toBeTruthy()
    // Wait for the retry budget to exhaust and the dedicated error
    // alert to surface — the badge keeps the last non-terminal
    // semantic and never falls back to a generic "Pending" state.
    expect(
      await screen.findByRole(
        'button',
        { name: 'Retry status' },
        { timeout: 5000 }
      )
    ).toBeTruthy()
    // The exact "Pending" text is never produced.
    expect(screen.queryByText('Pending')).toBeNull()
  })

  it('transitions from Running to Completed after a successful Retry status', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-retry-success',
    })
    // The first poll (and its two react-query retries) all fail.
    // Only the final attempt driven by the user's Retry status click
    // succeeds. The counter increments per actual queryFn call, so the
    // user-driven retry is the 4th call overall.
    let call = 0
    vi.mocked(getVideoTask).mockImplementation(async () => {
      call += 1
      if (call < 4) {
        throw new Error('upstream 503 — service unavailable')
      }
      return { task_id: 'task-retry-success', status: 'SUCCESS' }
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a calm dusk')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    // 1. While react-query retries, the badge stays on the polling
    //    semantic — Running, never a generic Pending.
    expect(await screen.findByText('Running')).toBeTruthy()

    // 2. The retry budget exhausts and the dedicated error alert
    //    surfaces a Retry status button. Wait for that exact signal
    //    instead of counting API calls.
    const retryButton = await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 5000 }
    )
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.queryByText('Pending')).toBeNull()

    // 3. The user clicks Retry status. The next call returns SUCCESS
    //    and the badge transitions to Completed; the error alert
    //    and the retry button leave the DOM.
    await user.click(retryButton)
    expect(await screen.findByText('Completed')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry status' })).toBeNull()
  })

  it('transitions from Running to Failed after a Retry status that reports failure', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-retry-failure',
    })
    let call = 0
    vi.mocked(getVideoTask).mockImplementation(async () => {
      call += 1
      if (call < 4) {
        throw new Error('upstream 503 — service unavailable')
      }
      return {
        task_id: 'task-retry-failure',
        status: 'FAILURE',
        fail_reason: 'upstream rejected the output',
      }
    })
    const i18n = await createI18n()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a stormy day')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByText('Running')).toBeTruthy()

    const retryButton = await screen.findByRole(
      'button',
      { name: 'Retry status' },
      { timeout: 5000 }
    )
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.queryByText('Pending')).toBeNull()

    // The user's Retry click drives the final API call to FAILURE.
    await user.click(retryButton)
    expect(await screen.findByText('Failed')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry status' })).toBeNull()
  })
})

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
 * Page-level integration tests for Video Playground.
 *
 * Each title describes a real user action that the test performs on
 * the mounted page. Mocked `submitVideoGenerationWithApiKey` records
 * the POST body. Zero-POST cases wait for an inline error (or
 * cancelled status) that proves the submit path finished.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  listUsableVideoApiKeys,
  loadVideoApiSecret,
  submitVideoGenerationWithApiKey,
} from '../api'
import {
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
} from './test-utils'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => {
    let href = to
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value)
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
}))

// jsdom never fires media-element events, so the duration probe would
// hang. The probe is a browser-API boundary — stub it to report an
// unreadable local file (undefined), which the adder must reject.
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

interface CapturedBody {
  model: string
  prompt: string
  duration?: number
  metadata?: {
    content?: Array<{
      type: string
      role: string
      image_url?: { url: string }
      video_url?: { url: string }
      audio_url?: { url: string }
    }>
    ratio?: string
    resolution?: string
    generate_audio?: boolean
    watermark?: boolean
    return_last_frame?: boolean
    duration?: number
    seed?: number
  }
}

function getCapturedBody(callIndex = 0): CapturedBody {
  const calls = vi.mocked(submitVideoGenerationWithApiKey).mock.calls
  const args = calls[callIndex]
  if (!args) throw new Error('no submit call captured')
  return args[1] as unknown as CapturedBody
}

async function selectMode(user: UserEvent, name: string) {
  await user.click(screen.getByLabelText('Creation mode'))
  await user.click(await screen.findByRole('option', { name }))
}

async function selectModel(user: UserEvent, name: string) {
  await user.click(screen.getByLabelText('Video model'))
  await user.click(await screen.findByRole('option', { name }))
}

async function addUrl(
  user: UserEvent,
  ariaLabel: string,
  placeholder: string,
  url: string,
  chip: string
) {
  await user.click(screen.getByRole('button', { name: ariaLabel }))
  expect(await screen.findByLabelText('Public URL')).toBeTruthy()
  const input = await screen.findByPlaceholderText(placeholder)
  await user.clear(input)
  await user.type(input, url)
  await user.keyboard('{Enter}')
  expect(await screen.findByText(chip)).toBeTruthy()
}

async function addImageUrl(user: UserEvent, url: string, chip = '@Image1') {
  await addUrl(
    user,
    'Add reference image',
    'https://cdn.example.com/reference.png',
    url,
    chip
  )
}

async function addVideoUrl(user: UserEvent, url: string, chip = '@Video1') {
  await addUrl(
    user,
    'Add reference video',
    'https://cdn.example.com/reference.mp4',
    url,
    chip
  )
}

async function addAudioUrl(user: UserEvent, url: string, chip = '@Audio1') {
  await addUrl(
    user,
    'Add reference audio',
    'https://cdn.example.com/reference.wav',
    url,
    chip
  )
}

async function openParameters(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Parameter settings' }))
}

async function chooseOption(
  user: UserEvent,
  comboboxName: string,
  optionName: string
) {
  await user.click(screen.getByRole('combobox', { name: comboboxName }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

describe('VideoPlayground — page-level POST body', () => {
  let i18n: I18n

  beforeEach(async () => {
    i18n = await createVideoPlaygroundI18n()
    stubAuthUser()
    vi.mocked(listUsableVideoApiKeys).mockResolvedValue([
      {
        id: 7,
        name: 'phaseD',
        maskedKey: 'sk-***7777',
        status: 1,
        createdTime: 100,
      },
      {
        id: 8,
        name: 'newer',
        maskedKey: 'sk-***8888',
        status: 1,
        createdTime: 200,
      },
    ])
    vi.mocked(loadVideoApiSecret).mockResolvedValue(FAKE_SECRET)
    vi.mocked(getVideoModelsWithApiKey).mockResolvedValue([
      { label: 'Doubao-Seedance-2.5', value: 'Doubao-Seedance-2.5' },
      { label: 'Doubao-Seedance-2.0', value: 'Doubao-Seedance-2.0' },
    ])
    vi.mocked(submitVideoGenerationWithApiKey).mockReset()
    vi.mocked(getVideoTask).mockReset()
  })

  afterEach(() => {
    const html = document.body.innerHTML
    expect(html).not.toContain(FAKE_SECRET)
    expect(html).not.toContain(`sk-${FAKE_SECRET}`)
    expect(localStorage.getItem(FAKE_SECRET)).toBeNull()
    expect(sessionStorage.getItem(FAKE_SECRET)).toBeNull()
  })

  it('writes a non-default fixed duration chosen in the UI to both duration fields', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-dur',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-dur',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await chooseOption(user, 'Duration', '8 seconds')
    await user.type(screen.getByLabelText('Prompt'), 'a cat walks on the moon')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(body.duration).toBe(8)
    expect(body.metadata?.duration).toBe(8)
  })

  it('omits duration in both places after switching to intelligent duration', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-intel',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-intel',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await user.click(screen.getByRole('button', { name: 'Fixed duration' }))
    expect(
      screen.getByRole('button', { name: 'Intelligent duration' })
    ).toBeTruthy()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(body.duration).toBeUndefined()
    expect(body.metadata?.duration).toBeUndefined()
  })

  it('sends the ratio chosen in the UI', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-ratio',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-ratio',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await chooseOption(user, 'Aspect ratio', '9:16')
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.ratio).toBe('9:16')
  })

  it('sends the resolution chosen in the UI', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-res',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-res',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await chooseOption(user, 'Resolution', '480p')
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.resolution).toBe('480p')
  })

  it('writes a seed typed in the UI to metadata.seed', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-seed',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-seed',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await user.type(screen.getByLabelText('Random seed (optional)'), '42')
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.seed).toBe(42)
  })

  it('sends generate_audio false, watermark true, and return_last_frame true after toggling the switches', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-sw',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-sw',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await openParameters(user)
    await user.click(screen.getByRole('switch', { name: 'Generate audio' }))
    await user.click(screen.getByRole('switch', { name: 'Watermark' }))
    await user.click(screen.getByRole('switch', { name: 'Return last frame' }))
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(body.metadata?.generate_audio).toBe(false)
    expect(body.metadata?.watermark).toBe(true)
    expect(body.metadata?.return_last_frame).toBe(true)
  })

  it('omits metadata.content for textToVideo with zero attached resources', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-text',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-text',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(await screen.findByLabelText('Prompt'), 'a dog running')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.content).toBeUndefined()
  })

  it('rejects textToVideo with an attached image: inline error and zero POST', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await addImageUrl(user, 'https://cdn.example.com/cat.png')
    await user.type(screen.getByLabelText('Prompt'), 'a dog @Image1')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText(
        'Text to video mode does not allow reference assets.'
      )
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('does not add an unsafe javascript: URL and never sends it in a POST', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-safe',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-safe',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.click(
      screen.getByRole('button', { name: 'Add reference image' })
    )
    const input = await screen.findByPlaceholderText(
      'https://cdn.example.com/reference.png'
    )
    await user.type(input, 'javascript:alert(1).png')
    const popover =
      input.closest('[data-slot="popover-content"]') ?? document.body
    await user.click(
      within(popover as HTMLElement).getByRole('button', { name: 'Add' })
    )
    expect(await screen.findByText('This URL is not supported.')).toBeTruthy()
    expect(screen.queryByText('@Image1')).toBeNull()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(JSON.stringify(body)).not.toContain('javascript:')
    expect(body.metadata?.content).toBeUndefined()
  })

  it('serialises firstFrame with the attached image as role first_frame', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-ff',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-ff',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First frame')
    await addImageUrl(user, 'https://cdn.example.com/first.png')
    await user.type(screen.getByLabelText('Prompt'), 'start from @Image1')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/first.png' },
        role: 'first_frame',
      },
    ])
  })

  it('serialises firstAndLastFrame with first_frame then last_frame roles', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-fl',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-fl',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First and last frame')
    await addImageUrl(user, 'https://cdn.example.com/first.png', '@Image1')
    await addImageUrl(user, 'https://cdn.example.com/last.png', '@Image2')
    await user.type(screen.getByLabelText('Prompt'), 'from @Image1 to @Image2')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/first.png' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/last.png' },
        role: 'last_frame',
      },
    ])
  })

  it('serialises referenceGeneration content for attached image, video, and audio URLs', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-ref',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-ref',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'Reference generation')
    await addImageUrl(user, 'https://cdn.example.com/ref.png')
    await addVideoUrl(user, 'https://cdn.example.com/ref.mp4')
    await addAudioUrl(user, 'https://cdn.example.com/ref.wav')
    await user.type(
      screen.getByLabelText('Prompt'),
      'use @Image1 @Video1 @Audio1'
    )
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/ref.png' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/ref.mp4' },
        role: 'reference_video',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example.com/ref.wav' },
        role: 'reference_audio',
      },
    ])
  })

  it('shows Video edit and Video extend for both Seedance 2.5 and 2.0', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.click(screen.getByLabelText('Creation mode'))
    expect(
      await screen.findByRole('option', { name: 'Video edit' })
    ).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Video extend' })).toBeTruthy()
    await user.keyboard('{Escape}')
    await selectModel(user, 'Doubao-Seedance-2.0')
    await user.click(screen.getByLabelText('Creation mode'))
    expect(
      await screen.findByRole('option', { name: 'Video edit' })
    ).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Video extend' })).toBeTruthy()
  })

  it('serialises Seedance 2.0 videoEdit with image + video in content', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-edit20',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-edit20',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectModel(user, 'Doubao-Seedance-2.0')
    await selectMode(user, 'Video edit')
    await addImageUrl(user, 'https://cdn.example.com/scene.png')
    await addVideoUrl(user, 'https://cdn.example.com/clip.mp4')
    await user.type(screen.getByLabelText('Prompt'), 'replace the scene')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(body.model).toBe('Doubao-Seedance-2.0')
    expect('mode' in body).toBe(false)
    expect(body.metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/scene.png' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/clip.mp4' },
        role: 'reference_video',
      },
    ])
  })

  it('serialises Seedance 2.5 videoExtend with the attached reference video', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-ext25',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-ext25',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'Video extend')
    await addVideoUrl(user, 'https://cdn.example.com/extend.mp4')
    await user.type(screen.getByLabelText('Prompt'), 'continue this clip')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const body = getCapturedBody()
    expect(body.model).toBe('Doubao-Seedance-2.5')
    expect('mode' in body).toBe(false)
    expect(body.metadata?.content).toEqual([
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/extend.mp4' },
        role: 'reference_video',
      },
    ])
  })

  it('firstFrame without an image shows an inline error and sends zero POST', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First frame')
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText('First frame mode requires exactly one image.')
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('clamps Seedance 2.0 off 1080p as soon as a reference image is added', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectModel(user, 'Doubao-Seedance-2.0')
    await openParameters(user)
    await chooseOption(user, 'Resolution', '1080p')
    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')
    await addImageUrl(user, 'https://cdn.example.com/ref.png')
    await openParameters(user)
    await user.click(screen.getByRole('combobox', { name: 'Resolution' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((node) => node.textContent)).not.toContain('1080p')
  })

  it('reloads the secret after switching keys and does not reuse the old key on the second submit', async () => {
    const secretSeven = 'vp-secret-seven'
    const secretEight = 'vp-secret-eight'
    vi.mocked(loadVideoApiSecret).mockImplementation(async (id) =>
      id === 7 ? secretSeven : secretEight
    )
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-key',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-key',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'first submit')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(
      String(vi.mocked(submitVideoGenerationWithApiKey).mock.calls[0]?.[0])
    ).toContain(secretSeven)
    await user.click(screen.getByLabelText('Connection settings'))
    await user.click(await screen.findByLabelText('API Key'))
    await user.click(await screen.findByRole('option', { name: /newer/ }))
    await readyGenerateButton()
    await user.clear(screen.getByLabelText('Prompt'))
    await user.type(screen.getByLabelText('Prompt'), 'second submit')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(2)
    })
    expect(
      String(vi.mocked(submitVideoGenerationWithApiKey).mock.calls[1]?.[0])
    ).toContain(secretEight)
    expect(
      String(vi.mocked(submitVideoGenerationWithApiKey).mock.calls[1]?.[0])
    ).not.toContain(secretSeven)
    expect(getCapturedBody(1).prompt).toBe('second submit')
    expect(document.body.innerHTML).not.toContain(secretSeven)
    expect(document.body.innerHTML).not.toContain(secretEight)
  })

  it('cancels remaining batch items, sends no further POST, and does not show Submission failed', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockImplementation(
      () =>
        new Promise(() => {
          /* hang until cancelled */
        })
    )
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.click(screen.getByRole('button', { name: '4' }))
    await user.type(screen.getByLabelText('Prompt'), 'batch cancel')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(1)
    })
    await user.click(
      screen.getByRole('button', { name: 'Cancel pending submissions' })
    )
    expect(await screen.findAllByText('Cancelled')).not.toHaveLength(0)
    expect(screen.queryByText('Submission failed')).toBeNull()
    expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(1)
  })

  it('never writes the full API key into the DOM or storage', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-leak',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-leak',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'a dog running')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(document.body.innerHTML).not.toContain(FAKE_SECRET)
    expect(window.localStorage.getItem(FAKE_SECRET)).toBeNull()
    expect(window.sessionStorage.getItem(FAKE_SECRET)).toBeNull()
  })

  it('keeps signed query strings on attached image, video, and audio URLs in the POST body', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-signed',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-signed',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'Reference generation')
    await addImageUrl(
      user,
      'https://cdn.example.com/cat.png?sig=abc&exp=999',
      '@Image1'
    )
    await addVideoUrl(
      user,
      'https://cdn.example.com/clip.mp4?token=v1',
      '@Video1'
    )
    await addAudioUrl(user, 'https://cdn.example.com/voice.wav?k=1', '@Audio1')
    await user.type(screen.getByLabelText('Prompt'), 'use the signed refs')
    expect(
      screen.getAllByText('Size unknown — upstream will verify.').length
    ).toBeGreaterThanOrEqual(3)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    expect(getCapturedBody().metadata?.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/cat.png?sig=abc&exp=999' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/clip.mp4?token=v1' },
        role: 'reference_video',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example.com/voice.wav?k=1' },
        role: 'reference_audio',
      },
    ])
  })

  it('rejects IPv6 multicast and sends zero POST in first-frame mode', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First frame')
    await user.click(
      screen.getByRole('button', { name: 'Add reference image' })
    )
    const input = await screen.findByPlaceholderText(
      'https://cdn.example.com/reference.png'
    )
    await user.click(input)
    await user.paste('https://[ff02::1]/x.png')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('This URL is not supported.')).toBeTruthy()
    expect(screen.queryByText('@Image1')).toBeNull()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText('First frame mode requires exactly one image.')
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('rejects an IPv6 loopback image URL and sends zero POST in first-frame mode', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First frame')
    await user.click(
      screen.getByRole('button', { name: 'Add reference image' })
    )
    const input = await screen.findByPlaceholderText(
      'https://cdn.example.com/reference.png'
    )
    await user.click(input)
    await user.paste('https://[::1]/x.png')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('This URL is not supported.')).toBeTruthy()
    expect(screen.queryByText('@Image1')).toBeNull()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText('First frame mode requires exactly one image.')
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('rejects a non-canonical asset id and sends zero POST in video edit mode', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'Video edit')
    await user.click(
      screen.getByRole('button', { name: 'Add reference video' })
    )
    const asset = await screen.findByPlaceholderText('asset://<id>')
    await user.type(asset, '../etc/passwd')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('This URL is not supported.')).toBeTruthy()
    await user.type(screen.getByLabelText('Prompt'), 'edit this')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText(
        'Video edit and extend modes require at least one reference video.'
      )
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('keeps historical task model and prompt after the form changes', async () => {
    vi.mocked(submitVideoGenerationWithApiKey).mockResolvedValue({
      task_id: 'task-snap',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-snap',
      status: 'IN_PROGRESS',
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.type(screen.getByLabelText('Prompt'), 'original snapshot prompt')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalled()
    })
    const queue = await screen.findByRole('region', { name: 'Task queue' })
    expect(within(queue).getByText('original snapshot prompt')).toBeTruthy()
    expect(within(queue).getByText('Doubao-Seedance-2.5')).toBeTruthy()
    await user.clear(screen.getByLabelText('Prompt'))
    await user.type(screen.getByLabelText('Prompt'), 'changed later')
    await selectModel(user, 'Doubao-Seedance-2.0')
    expect(within(queue).getByText('original snapshot prompt')).toBeTruthy()
    expect(within(queue).getByText('Doubao-Seedance-2.5')).toBeTruthy()
    expect(within(queue).queryByText('changed later')).toBeNull()
    expect(within(queue).queryByText('Doubao-Seedance-2.0')).toBeNull()
  })

  it('rejects a local image that cannot be decoded and sends zero POST', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'First frame')
    await user.click(
      screen.getByRole('button', { name: 'Add reference image' })
    )
    const fileInput = await screen.findByLabelText('Local file')
    const file = new File(['not-an-image'], 'bad.png', { type: 'image/png' })
    await user.upload(fileInput, file)
    expect(await screen.findByText('Could not read this image.')).toBeTruthy()
    expect(screen.queryByText('@Image1')).toBeNull()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText('First frame mode requires exactly one image.')
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('rejects a local audio that cannot be read and sends zero POST', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await selectMode(user, 'Reference generation')
    await user.click(
      screen.getByRole('button', { name: 'Add reference audio' })
    )
    const fileInput = await screen.findByLabelText('Local file')
    const file = new File(['not-an-audio'], 'bad.wav', {
      type: 'audio/wav',
    })
    await user.upload(fileInput, file)
    expect(await screen.findByText('Could not read this audio.')).toBeTruthy()
    // The Local file input is marked invalid and points at its own FieldError.
    expect(fileInput.getAttribute('aria-invalid')).toBe('true')
    const describedBy = fileInput.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const errorNode = document.getElementById(String(describedBy))
    expect(errorNode?.textContent).toContain('Could not read this audio.')
    // The Public URL input in the same popover must NOT be marked invalid.
    const urlInput = screen.getByPlaceholderText(
      'https://cdn.example.com/reference.wav'
    )
    expect(urlInput.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('@Audio1')).toBeNull()
    await user.type(screen.getByLabelText('Prompt'), 'a dog')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(
      await screen.findByText(
        'Reference generation requires at least one reference asset.'
      )
    ).toBeTruthy()
    expect(submitVideoGenerationWithApiKey).not.toHaveBeenCalled()
  })

  it('continues remaining batch POSTs after a middle item fails', async () => {
    vi.mocked(submitVideoGenerationWithApiKey)
      .mockResolvedValueOnce({ task_id: 'task-b1' })
      .mockRejectedValueOnce(new Error('upstream 503 — service unavailable'))
      .mockResolvedValueOnce({ task_id: 'task-b3' })
      .mockResolvedValueOnce({ task_id: 'task-b4' })
    vi.mocked(getVideoTask).mockImplementation(async (id: string) => ({
      task_id: id,
      status: 'IN_PROGRESS',
    }))
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    await user.click(screen.getByRole('button', { name: '4' }))
    await user.type(screen.getByLabelText('Prompt'), 'batch continue')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => {
      expect(submitVideoGenerationWithApiKey).toHaveBeenCalledTimes(4)
    })
    expect(await screen.findByText(/task-b1/)).toBeTruthy()
    expect(await screen.findByText(/task-b3/)).toBeTruthy()
    expect(await screen.findByText(/task-b4/)).toBeTruthy()
  })
})

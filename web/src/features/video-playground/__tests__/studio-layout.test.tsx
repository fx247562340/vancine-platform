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
 * Video studio responsive structure.
 *
 * One responsibility: the rebuilt two-column studio keeps its shape at every
 * width. Asserted as behaviour contracts — containment, DOM order, which column
 * holds what, whether the primary action stays in normal flow, and whether an
 * empty state can hide already-submitted work. No class-string snapshots and no
 * pixel measurements; the single unavoidable class assertion is the presence of
 * two stable grid tokens on the one studio grid container.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import { getVideoTask, submitVideoGenerationRequest } from '../api'
import {
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  PRODUCTION_VIDEO_MODELS,
  readyGenerateButton,
  renderVideoPlayground,
  stubAuthUser,
  stubVideoApi,
  submitStudio,
  switchApiKey,
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

const KEPT_TASK_URL =
  'https://media.test/v1/tasks/task-kept/artifacts/video/content?access=tok'

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
    task_id: 'task-kept',
  })
  vi.mocked(getVideoTask).mockResolvedValue({
    task_id: 'task-kept',
    status: 'SUCCESS',
    content_url: KEPT_TASK_URL,
  })
  i18n = await createVideoPlaygroundI18n()
})

/**
 * The studio grid: the one container whose two children are the form column and
 * the preview/tasks column. Reached structurally through the Preview landmark so
 * no Tailwind class string has to be asserted to find it.
 */
function studioGrid(): HTMLElement {
  const preview = screen.getByRole('region', { name: 'Preview' })
  const grid = preview.parentElement?.parentElement
  if (!grid) {
    throw new Error('the Preview landmark has no studio grid ancestor')
  }
  return grid
}

function studioColumns(): [HTMLElement, HTMLElement] {
  const grid = studioGrid()
  const columns = [...grid.children] as HTMLElement[]
  if (columns.length !== 2) {
    throw new Error(`the studio grid has ${columns.length} columns, want 2`)
  }
  return [columns[0] as HTMLElement, columns[1] as HTMLElement]
}

/** Put one accepted, finished task on the page so the task list is populated. */
async function submitKeptTask(user: ReturnType<typeof userEvent.setup>) {
  await typePrompt(user, 'a kept clip')
  await submitStudio(user)
  const list = await screen.findByRole('region', { name: 'Recent tasks' })
  await waitFor(() => {
    expect(within(list).getAllByRole('button')).toHaveLength(1)
  })
  return list
}

describe('Video studio responsive structure', () => {
  it('renders the form column and the preview column as the two siblings of one grid container on desktop', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    const list = await submitKeptTask(user)
    const [formColumn, previewColumn] = studioColumns()

    expect(formColumn.parentElement).toBe(studioGrid())
    expect(previewColumn.parentElement).toBe(studioGrid())
    expect(formColumn.contains(previewColumn)).toBe(false)
    expect(previewColumn.contains(formColumn)).toBe(false)

    const composerControls = [
      screen.getByRole('combobox', { name: 'Video model' }),
      screen.getByRole('button', { name: 'Choose files' }),
      screen.getByRole('textbox', { name: 'Prompt' }),
      screen.getByRole('combobox', { name: 'Seconds' }),
      screen.getByRole('combobox', { name: 'Resolution' }),
      screen.getByRole('button', { name: 'Generate video' }),
    ]
    for (const control of composerControls) {
      expect(formColumn.contains(control)).toBe(true)
      expect(previewColumn.contains(control)).toBe(false)
    }

    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(previewColumn.contains(preview)).toBe(true)
    expect(previewColumn.contains(list)).toBe(true)
    expect(formColumn.contains(preview)).toBe(false)
    expect(formColumn.contains(list)).toBe(false)
  })

  it('keeps the same single DOM order at a 375px viewport so the form precedes the preview and the tasks', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n, undefined, { innerWidth: 375 })
    const list = await submitKeptTask(user)
    const [formColumn, previewColumn] = studioColumns()
    const columns = [...studioGrid().children]

    // DOM order alone carries the mobile order: nothing reorders it in CSS.
    expect(columns[0]).toBe(formColumn)
    expect(columns[1]).toBe(previewColumn)
    expect(columns.indexOf(formColumn)).toBeLessThan(
      columns.indexOf(previewColumn)
    )
    expect(formColumn.className).not.toMatch(/(^|\s)order-/)
    expect(previewColumn.className).not.toMatch(/(^|\s)order-/)

    expect(
      formColumn.contains(
        screen.getByRole('button', { name: 'Generate video' })
      )
    ).toBe(true)
    expect(
      previewColumn.contains(screen.getByRole('region', { name: 'Preview' }))
    ).toBe(true)
    expect(previewColumn.contains(list)).toBe(true)
  })

  it('keeps the API Key selector named API Key inside the header below the title at a 375px viewport', async () => {
    renderVideoPlayground(i18n, undefined, { innerWidth: 375 })
    await readyGenerateButton()

    const headerElement = document.querySelector('header') as HTMLElement
    const keyButton = within(headerElement).getByRole('button', {
      name: 'API Key',
    })
    expect(keyButton).toHaveAccessibleName('API Key')
    expect(keyButton).toHaveTextContent('studio · sk-***7777')

    const title = screen.getByRole('heading', { level: 1 })
    const headerNodes = [...headerElement.querySelectorAll('*')]
    expect(headerNodes).toContain(title)
    expect(headerNodes).toContain(keyButton)
    expect(headerNodes.indexOf(title)).toBeLessThan(
      headerNodes.indexOf(keyButton)
    )
  })

  it('declares a fixed left track and a flexible minmax(0,1fr) right track on the one studio grid at xl', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    const grid = studioGrid()

    expect(grid.children).toHaveLength(2)
    // Only the two stable tokens on that one container — never a class string.
    expect(grid.className).toContain('xl:grid-cols-')
    expect(grid.className).toContain('minmax(0,1fr)')
  })

  it('keeps Generate video in normal flow inside the form column and renders no interactive fixed-position overlay', async () => {
    renderVideoPlayground(i18n, undefined, { innerWidth: 375 })
    await readyGenerateButton()
    const [formColumn] = studioColumns()
    const page = screen.getByTestId('video-playground-page')
    const generate = screen.getByRole('button', { name: 'Generate video' })

    // In normal flow inside the form column: not portaled out of the page.
    expect(formColumn.contains(generate)).toBe(true)
    expect(page.contains(generate)).toBe(true)

    for (
      let node: HTMLElement | null = generate;
      node != null && node !== page.parentElement;
      node = node.parentElement
    ) {
      const position = getComputedStyle(node).position
      expect(position).not.toBe('fixed')
      expect(position).not.toBe('sticky')
    }

    // The only fixed-position nodes in the page are the aria-hidden focus
    // guards the select primitive renders; nothing interactive floats over the
    // content on a narrow viewport.
    const fixed = [...page.querySelectorAll('*')].filter(
      (element) => getComputedStyle(element).position === 'fixed'
    )
    for (const element of fixed) {
      expect(element).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('renders no dialog, sheet or drawer and no retired parameters popover on load', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
    expect(screen.queryByLabelText('Parameter settings')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Parameters' })).toBeNull()
    expect(
      screen.queryByRole('toolbar', { name: 'Composer toolbar' })
    ).toBeNull()
  })

  it('shows the no-API-keys empty state in the left column while the preview column stays mounted', async () => {
    await stubVideoApi({ keys: [] })
    renderVideoPlayground(i18n)

    const emptyTitle = await screen.findByText('No API keys available')
    const [formColumn, previewColumn] = studioColumns()

    expect(formColumn.contains(emptyTitle)).toBe(true)
    expect(
      formColumn.contains(screen.getByRole('link', { name: 'Create API Key' }))
    ).toBe(true)
    expect(previewColumn.contains(emptyTitle)).toBe(false)
    expect(
      previewColumn.contains(screen.getByRole('region', { name: 'Preview' }))
    ).toBe(true)
  })

  it('shows the no-video-models empty state in the left column while an already submitted task stays visible on the right', async () => {
    const user = userEvent.setup()
    const api = await import('../api')
    // The initial key serves the production models; any other key serves none.
    // Recorded per request so the fixture never recomputes how the page
    // normalizes a secret before it reaches the model endpoint.
    const modelRequestKeys: string[] = []
    vi.mocked(api.loadVideoApiSecret).mockImplementation(async (id: number) =>
      id === 7 ? FAKE_SECRET : 'vp-second-key-not-real'
    )
    vi.mocked(api.getVideoModelsWithApiKey).mockImplementation(
      async (apiKey: string) => {
        modelRequestKeys.push(apiKey)
        return apiKey === modelRequestKeys[0]
          ? PRODUCTION_VIDEO_MODELS.map((value) => ({ label: value, value }))
          : []
      }
    )
    renderVideoPlayground(i18n)
    const list = await submitKeptTask(user)

    await switchApiKey(user, 'newer')

    const emptyTitle = await screen.findByText('No video models available')
    const [formColumn, previewColumn] = studioColumns()
    expect(formColumn.contains(emptyTitle)).toBe(true)
    expect(formColumn.contains(list)).toBe(false)
    expect(previewColumn.contains(list)).toBe(true)
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(
      previewColumn.contains(screen.getByRole('region', { name: 'Preview' }))
    ).toBe(true)
    expect(screen.getByLabelText('Generated video')).toHaveAttribute(
      'src',
      KEPT_TASK_URL
    )
  })
})

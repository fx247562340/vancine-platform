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
 * Video studio page frame.
 *
 * One responsibility: the chrome around the studio — heading hierarchy, the
 * Image/Video route navigation, the header-hosted API Key selector and its
 * masked-only rendering, the removal of the retired composer toolbar and
 * connection popover, which element owns page scrolling, and where the two load
 * failures are announced.
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

let i18n: I18n

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
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

function pageHeader(): HTMLElement {
  const header = document.querySelector('header')
  if (!header) {
    throw new Error('the page renders no header element')
  }
  return header
}

/** Assert the alert sits above the grid: a preceding sibling, never inside it. */
function expectAlertAboveStudioGrid(alert: HTMLElement): void {
  const grid = studioGrid()
  const siblings = [...(grid.parentElement?.children ?? [])]
  expect(siblings).toContain(alert)
  expect(siblings.indexOf(alert)).toBeLessThan(siblings.indexOf(grid))
  expect(alert).toHaveClass('text-destructive')
}

describe('Video studio page frame', () => {
  it('renders exactly one h1 reading Video generation and demotes the Recent tasks title to h2', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGenerationRequest).mockResolvedValue({
      task_id: 'task-frame',
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      task_id: 'task-frame',
      status: 'IN_PROGRESS',
    })
    renderVideoPlayground(i18n)
    await typePrompt(user, 'a framed clip')
    await submitStudio(user)
    const list = await screen.findByRole('region', { name: 'Recent tasks' })

    const levelOne = screen
      .getAllByRole('heading')
      .filter((heading) => heading.tagName === 'H1')
    expect(levelOne).toHaveLength(1)
    expect(levelOne[0]).toHaveTextContent('Video generation')
    expect(
      within(list).getByRole('heading', { name: 'Recent tasks' }).tagName
    ).toBe('H2')
  })

  it('links both playgrounds from the Media type nav and marks only Video aria-current=page', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const nav = await screen.findByRole('navigation', { name: 'Media type' })
    const imageLink = within(nav).getByRole('link', { name: 'Image' })
    const videoLink = within(nav).getByRole('link', { name: 'Video' })
    expect(imageLink).toHaveAttribute('href', '/playground/image')
    expect(videoLink).toHaveAttribute('href', '/playground/video')
    expect(videoLink).toHaveAttribute('aria-current', 'page')
    expect(imageLink).not.toHaveAttribute('aria-current')
  })

  it('keeps the Usage logs entry reachable inside the page header', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const link = within(pageHeader()).getByRole('link', { name: 'Usage logs' })
    expect(link).toHaveAttribute('href', '/usage-logs')
  })

  it('hosts the API Key selector inside the header and names the chosen key as name · maskedKey', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const keyButton = within(pageHeader()).getByRole('button', {
      name: 'API Key',
    })
    expect(keyButton).toHaveAccessibleName('API Key')
    expect(keyButton).toHaveTextContent('studio · sk-***7777')
    expect(studioGrid().contains(keyButton)).toBe(false)
  })

  it('never renders the loaded API secret into the document, even with the key menu open', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyGenerateButton()
    // The model list load has already pulled the real secret into memory.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Video model' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'API Key' }))
    await waitFor(() => {
      expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
    })

    expect(document.body.innerHTML).not.toContain(FAKE_SECRET)
  })

  it('no longer renders a Composer toolbar or a Connection settings control', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    expect(
      screen.queryByRole('toolbar', { name: 'Composer toolbar' })
    ).toBeNull()
    expect(screen.queryByLabelText('Connection settings')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Connection settings' })
    ).toBeNull()
  })

  it('makes the page root the vertical scroller and clips horizontal overflow instead of the studio grid', async () => {
    renderVideoPlayground(i18n)
    await readyGenerateButton()

    const page = screen.getByTestId('video-playground-page')
    expect(page).toHaveClass('overflow-y-auto')
    expect(page).toHaveClass('overflow-x-hidden')

    const grid = studioGrid()
    const columns = [grid.children[0], grid.children[1]] as HTMLElement[]
    for (const element of [
      page.firstElementChild as HTMLElement,
      grid,
      ...columns,
    ]) {
      expect(element).not.toHaveClass('overflow-y-auto')
      expect(element).not.toHaveClass('overflow-x-auto')
    }
  })

  it('announces the API key load failure as a destructive alert above the studio grid', async () => {
    const api = await import('../api')
    vi.mocked(api.listUsableVideoApiKeys).mockRejectedValue(
      new Error('keys endpoint down')
    )
    renderVideoPlayground(i18n)

    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(alert).toHaveTextContent('Failed to load API keys')
    })
    expectAlertAboveStudioGrid(alert)
  })

  it('announces the video model load failure as a destructive alert above the studio grid', async () => {
    const api = await import('../api')
    vi.mocked(api.getVideoModelsWithApiKey).mockRejectedValue(
      new Error('models endpoint down')
    )
    renderVideoPlayground(i18n)

    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(alert).toHaveTextContent('Failed to load video models')
    })
    expectAlertAboveStudioGrid(alert)
  })
})

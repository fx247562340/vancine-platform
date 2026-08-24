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

For commercial licensing, please contact support@quantumnous.com
*/
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import type { TaskLog } from '../../../types'
import { useTaskLogsColumns } from '../task-logs-columns'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

afterEach(cleanup)

function makeTaskLog(overrides: Partial<TaskLog> = {}): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: 'kling',
    task_id: 'task-123',
    action: 'generate',
    channel_id: 1,
    submit_time: 1700000000,
    status: 'SUCCESS',
    ...overrides,
  }
}

/** Renders the "Details" (fail_reason) column cell exactly as the table does. */
function TaskDetailsCell(props: { log: TaskLog }): ReactNode {
  const columns = useTaskLogsColumns(false)
  const table = useReactTable({
    data: [props.log],
    columns: columns as ColumnDef<TaskLog>[],
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0].getAllCells()
    .find((c) => c.column.id === 'fail_reason')
  if (!cell) throw new Error('fail_reason column not found')
  return flexRender(cell.column.columnDef.cell, cell.getContext())
}

function openPreview(log: TaskLog): HTMLElement {
  render(
    <I18nextProvider i18n={i18n}>
      <TaskDetailsCell log={log} />
    </I18nextProvider>
  )
  act(() => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Click to preview video' })
    )
  })
  return screen.getByRole('dialog', { name: 'Video Preview' })
}

describe('task logs Details column video entry', () => {
  it('shows a video preview entry instead of "-" for a SUCCESS video task with result_url', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            result_url: 'https://upstream.example.com/v.mp4?sign=abc',
          })}
        />
      </I18nextProvider>
    )

    expect(
      screen.getByRole('button', { name: 'Click to preview video' })
    ).toBeTruthy()
  })

  it('opens a dialog with an accessible name when the entry is clicked', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            result_url: 'https://upstream.example.com/v.mp4',
          })}
        />
      </I18nextProvider>
    )

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Click to preview video' })
      )
    })

    expect(screen.getByRole('dialog', { name: 'Video Preview' })).toBeTruthy()
  })

  it('uses the signed result_url for playback, open, and download and does not build a video proxy URL', () => {
    const resultUrl = 'https://upstream.example.com/v.mp4?sign=SECRET'
    const dialog = openPreview(makeTaskLog({ result_url: resultUrl }))
    const video = dialog.querySelector('video')

    expect(video?.getAttribute('src')).toBe(resultUrl)
    expect(
      screen.getByRole('link', { name: 'Open in new tab' }).getAttribute('href')
    ).toBe(resultUrl)
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('href')
    ).toBe(resultUrl)
    expect(document.body.innerHTML).not.toContain('/v1/videos/')
  })

  it('prefers result_url over a legacy fail_reason URL and data.content.video_url', () => {
    const dialog = openPreview(
      makeTaskLog({
        result_url: 'https://first.example.com/a.mp4',
        fail_reason: 'https://second.example.com/b.mp4',
        data: '{"content":{"video_url":"https://third.example.com/c.mp4"}}',
      })
    )

    expect(dialog.querySelector('video')?.getAttribute('src')).toBe(
      'https://first.example.com/a.mp4'
    )
    expect(document.body.innerHTML).not.toContain('second.example.com')
    expect(document.body.innerHTML).not.toContain('third.example.com')
  })

  it('still shows the video entry for a legacy SUCCESS task whose result lives in fail_reason', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            fail_reason: 'http://legacy.example.com/old.mp4',
          })}
        />
      </I18nextProvider>
    )

    expect(
      screen.getByRole('button', { name: 'Click to preview video' })
    ).toBeTruthy()
  })

  it('plays and downloads a legacy fail_reason task through the stored result URL, not a proxy', () => {
    const legacyUrl = 'http://legacy.example.com/old.mp4'
    const dialog = openPreview(makeTaskLog({ fail_reason: legacyUrl }))

    expect(dialog.querySelector('video')?.getAttribute('src')).toBe(legacyUrl)
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('href')
    ).toBe(legacyUrl)
    expect(document.body.innerHTML).not.toContain('/v1/videos/')
  })
})

describe('task logs Details column regressions', () => {
  it('keeps showing the failure reason without a video entry for FAILED tasks', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            status: 'FAILURE',
            fail_reason: 'generation failed: quota exceeded',
          })}
        />
      </I18nextProvider>
    )

    expect(screen.getByText('generation failed: quota exceeded')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Click to preview video' })
    ).toBeNull()
  })

  it('does not show a video entry when result_url is only a Vancine video proxy address', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            result_url: 'https://vancine.com/v1/videos/task-123/content',
          })}
        />
      </I18nextProvider>
    )

    expect(
      screen.queryByRole('button', { name: 'Click to preview video' })
    ).toBeNull()
    expect(screen.getByText('-')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('/v1/videos/')
  })

  it('plays a direct data.content.video_url when result_url is a Vancine video proxy', () => {
    const directUrl = 'https://cdn.example.com/direct.mp4'
    const dialog = openPreview(
      makeTaskLog({
        result_url: 'https://vancine.com/v1/videos/task-123/content',
        data: '{"content":{"video_url":"https://cdn.example.com/direct.mp4"}}',
      })
    )

    expect(dialog.querySelector('video')?.getAttribute('src')).toBe(directUrl)
    expect(document.body.innerHTML).not.toContain('/v1/videos/')
  })

  it('does not show a video entry for a SUCCESS video task without result evidence', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            result_url: '',
            data: undefined,
          })}
        />
      </I18nextProvider>
    )

    expect(
      screen.queryByRole('button', { name: 'Click to preview video' })
    ).toBeNull()
    expect(screen.getByText('-')).toBeTruthy()
  })

  it('keeps the Suno audio preview for successful music tasks', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            platform: 'suno',
            action: 'MUSIC',
            data: '[{"audio_url":"https://cdn.example.com/a.mp3"}]',
          })}
        />
      </I18nextProvider>
    )

    expect(
      screen.getByRole('button', { name: 'Click to preview audio' })
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Click to preview video' })
    ).toBeNull()
  })
})

describe('task logs Details column video entry keyboard interaction', () => {
  function renderVideoEntry(): HTMLElement {
    render(
      <I18nextProvider i18n={i18n}>
        <TaskDetailsCell
          log={makeTaskLog({
            result_url: 'https://upstream.example.com/v.mp4',
          })}
        />
      </I18nextProvider>
    )
    const entry = screen.getByRole('button', { name: 'Click to preview video' })
    entry.focus()
    return entry
  }

  it('opens the preview dialog when activated with the Enter key', async () => {
    const user = userEvent.setup()
    renderVideoEntry()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: 'Video Preview' })).toBeTruthy()
  })

  it('opens the preview dialog when activated with the Space key', async () => {
    const user = userEvent.setup()
    renderVideoEntry()

    await user.keyboard(' ')

    expect(screen.getByRole('dialog', { name: 'Video Preview' })).toBeTruthy()
  })

  it('closes the open dialog with the Escape key and returns focus to the entry button', async () => {
    const user = userEvent.setup()
    const entry = renderVideoEntry()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Video Preview' })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Video Preview' })).toBeNull()
    expect(entry).toHaveFocus()
  })
})

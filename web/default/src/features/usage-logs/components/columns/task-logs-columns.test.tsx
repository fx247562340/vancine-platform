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
// Vitest + jsdom. Renders the REAL task-logs Details column cell with
// crafted task logs: video results must open an in-page preview dialog
// (not a bare target=_blank link), 3D results keep the direct download link.
import type { ComponentType } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_ACTIONS, TASK_STATUS } from '../../constants'
import type { TaskLog } from '../../types'
import { useTaskLogsColumns } from './task-logs-columns'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// jsdom lacks ResizeObserver (data-table internals) and Element.getAnimations
beforeEach(() => {
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => []
  }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

function makeLog(overrides: Partial<TaskLog>): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: 'volcengine',
    task_id: 'task-1',
    action: TASK_ACTIONS.GENERATE,
    channel_id: 1,
    submit_time: 1700000000,
    status: TASK_STATUS.SUCCESS,
    ...overrides,
  }
}

interface FakeRow {
  original: TaskLog
  getValue: (key: string) => unknown
}

function DetailsCellRenderer({ log }: { log: TaskLog }) {
  const columns = useTaskLogsColumns(false)
  const details = columns.find(
    (c) => 'accessorKey' in c && c.accessorKey === 'fail_reason'
  )
  const Cell = details!.cell as unknown as ComponentType<{ row: FakeRow }>
  const row: FakeRow = {
    original: log,
    getValue: (key) => (key === 'fail_reason' ? log.fail_reason : undefined),
  }
  return <Cell row={row} />
}

describe('task logs details column — video results', () => {
  const videoLog = makeLog({
    fail_reason: '',
    data: JSON.stringify({
      content: { video_url: 'https://upstream.example/v.mp4' },
    }),
  })

  it('renders a preview button instead of a bare target=_blank link', () => {
    render(<DetailsCellRenderer log={videoLog} />)
    expect(
      screen.getByRole('button', { name: /Click to preview video/ })
    ).toBeInTheDocument()
    expect(document.querySelector('a[target="_blank"]')).toBeNull()
  })

  it('opens an in-page video preview dialog with the proxied content URL', () => {
    render(<DetailsCellRenderer log={videoLog} />)
    fireEvent.click(
      screen.getByRole('button', { name: /Click to preview video/ })
    )

    const dialog = screen.getByRole('dialog')
    const video = dialog.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('src', '/v1/videos/task-1/content')
  })
})

describe('task logs details column — 3D results', () => {
  it('keeps the direct download link for 3D models', () => {
    const modelLog = makeLog({
      fail_reason: '',
      data: JSON.stringify({
        content: { model_url: 'https://tos.example/model.glb' },
      }),
    })
    render(<DetailsCellRenderer log={modelLog} />)

    const link = screen.getByRole('link', {
      name: /Click to download 3D model/,
    }) as HTMLAnchorElement
    expect(link.href).toBe('https://tos.example/model.glb')
    expect(link.target).toBe('_blank')
    // no video dialog machinery for 3D results
    expect(document.querySelector('video')).toBeNull()
  })
})

function TaskIdCellRenderer({ log }: { log: TaskLog }) {
  const columns = useTaskLogsColumns(false)
  const taskIdColumn = columns.find(
    (c) => 'accessorKey' in c && c.accessorKey === 'task_id'
  )
  const Cell = taskIdColumn!.cell as unknown as ComponentType<{ row: FakeRow }>
  const row: FakeRow = {
    original: log,
    getValue: (key) => (key === 'task_id' ? log.task_id : undefined),
  }
  return <Cell row={row} />
}

describe('task logs Task ID column — action label disambiguation', () => {
  it('labels 3D generate tasks as Image to 3D', () => {
    const log = makeLog({
      task_id: 'task-3d',
      data: JSON.stringify({ model: 'doubao-seed3d-2-0-260328' }),
    })
    render(<TaskIdCellRenderer log={log} />)
    expect(screen.getByText(/Image to 3D/)).toBeInTheDocument()
    expect(screen.queryByText(/Image to Video/)).toBeNull()
  })

  it('keeps the Image to Video label for video generate tasks', () => {
    const log = makeLog({
      task_id: 'task-video',
      data: JSON.stringify({ model: 'doubao-seedance-2-0-260128' }),
    })
    render(<TaskIdCellRenderer log={log} />)
    expect(screen.getByText(/Image to Video/)).toBeInTheDocument()
    expect(screen.queryByText(/Image to 3D/)).toBeNull()
  })
})

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
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import type { TaskLog } from '../../types'
import { useTaskLogsColumns } from '../columns/task-logs-columns'
import { UsageLogsMobileList } from '../usage-logs-mobile-card'

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

/** Renders the mobile task log card with the same columns as the desktop table. */
function MobileTaskCard(props: { log: TaskLog }): ReactNode {
  const columns = useTaskLogsColumns(false)
  const table = useReactTable({
    data: [props.log],
    columns: columns as ColumnDef<TaskLog>[],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <I18nextProvider i18n={i18n}>
      <UsageLogsMobileList table={table} logCategory='task' />
    </I18nextProvider>
  )
}

describe('mobile task log card video entry', () => {
  it('exposes the same video preview entry as the desktop Details column', () => {
    render(
      <MobileTaskCard
        log={makeTaskLog({
          result_url: 'https://upstream.example.com/v.mp4?sign=abc',
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Click to preview video' })
    ).toBeTruthy()
  })
})

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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listSystemTasks } from '@/features/system-settings/api'

import { SystemTasksPanel } from '../system-tasks-panel'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('@/features/system-settings/api', () => ({
  listSystemTasks: vi.fn(),
}))

const listSystemTasksMock = vi.mocked(listSystemTasks)

afterEach(() => {
  listSystemTasksMock.mockReset()
  cleanup()
})

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <SystemTasksPanel />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

const RUNNING_TASK = {
  id: 1,
  task_id: 'task-1',
  type: 'log_cleanup',
  status: 'running' as const,
  locked_by: 'node-1',
  created_at: 1700000000,
  updated_at: 1700000000,
  state: { progress: 42 },
}

const SUCCEEDED_TASK = {
  id: 2,
  task_id: 'task-2',
  type: 'model_update',
  status: 'succeeded' as const,
  locked_by: 'node-2',
  created_at: 1700000000,
  updated_at: 1700000000,
  state: {},
}

describe('SystemTasksPanel body states', () => {
  it('shows skeletons while the tasks query is loading', () => {
    listSystemTasksMock.mockReturnValue(new Promise(() => undefined))
    renderPanel()

    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('We could not load system tasks.')).toBeNull()
    expect(screen.queryByText('No system tasks yet.')).toBeNull()
    expect(screen.queryByText('Active Tasks')).toBeNull()
  })

  it('shows the error state and recovers via Retry refetch', async () => {
    listSystemTasksMock.mockRejectedValueOnce(new Error('boom'))
    listSystemTasksMock.mockResolvedValueOnce({
      success: true,
      message: '',
      data: [],
    })
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() =>
      expect(screen.getByText('We could not load system tasks.')).toBeTruthy()
    )
    expect(screen.getByText('boom')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.getByText('No system tasks yet.')).toBeTruthy()
    )
    expect(listSystemTasksMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('We could not load system tasks.')).toBeNull()
  })

  it('shows the empty message when no tasks exist', async () => {
    listSystemTasksMock.mockResolvedValue({
      success: true,
      message: '',
      data: [],
    })
    renderPanel()

    await waitFor(() =>
      expect(screen.getByText('No system tasks yet.')).toBeTruthy()
    )
  })

  it('renders active and history task tables when tasks exist', async () => {
    listSystemTasksMock.mockResolvedValue({
      success: true,
      message: '',
      data: [RUNNING_TASK, SUCCEEDED_TASK],
    })
    renderPanel()

    await waitFor(() => expect(screen.getByText('Active Tasks')).toBeTruthy())
    expect(screen.getByText('Task History')).toBeTruthy()
    expect(screen.getByText('Log cleanup')).toBeTruthy()
    expect(screen.getByText('Batch upstream model update')).toBeTruthy()
    expect(screen.getByText('node-1')).toBeTruthy()
    expect(screen.queryByText('No system tasks yet.')).toBeNull()
  })
})

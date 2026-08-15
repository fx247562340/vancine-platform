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

import { getMultiKeyStatus } from '../../../api'
import { MultiKeyManageDialog } from '../multi-key-manage-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const hoisted = vi.hoisted(() => ({
  currentRow: { id: 7, name: 'Test Channel', channel_info: undefined },
}))

vi.mock('../../channels-provider', () => ({
  useChannels: () => ({ currentRow: hoisted.currentRow }),
}))

vi.mock('../../../api', () => ({
  getMultiKeyStatus: vi.fn(),
  enableMultiKey: vi.fn(),
  disableMultiKey: vi.fn(),
  deleteMultiKey: vi.fn(),
  enableAllMultiKeys: vi.fn(),
  disableAllMultiKeys: vi.fn(),
  deleteDisabledMultiKeys: vi.fn(),
}))

const getMultiKeyStatusMock = vi.mocked(getMultiKeyStatus)

afterEach(() => {
  getMultiKeyStatusMock.mockReset()
  cleanup()
})

function renderDialog(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MultiKeyManageDialog open onOpenChange={() => undefined} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function statusResponse(keys: Array<{ index: number; status: number }>) {
  return {
    success: true,
    data: {
      keys,
      total: keys.length,
      page: 1,
      page_size: 10,
      total_pages: keys.length > 10 ? 2 : 1,
      enabled_count: keys.filter((k) => k.status === 1).length,
      manual_disabled_count: keys.filter((k) => k.status === 2).length,
      auto_disabled_count: keys.filter((k) => k.status === 3).length,
    },
  }
}

describe('MultiKeyManageDialog key list states', () => {
  it('keeps the spinner while the initial load is pending', async () => {
    getMultiKeyStatusMock.mockReturnValue(new Promise(() => undefined))
    renderDialog()

    await waitFor(() =>
      expect(getMultiKeyStatusMock).toHaveBeenCalledWith(7, 1, 10, undefined)
    )
    expect(
      document.querySelectorAll('svg.lucide-loader-circle').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('No keys found')).toBeNull()
    expect(screen.queryByText('#1')).toBeNull()
  })

  it('shows the empty message after loading completes with no keys', async () => {
    getMultiKeyStatusMock.mockResolvedValue(statusResponse([]))
    renderDialog()

    await waitFor(() => expect(screen.getByText('No keys found')).toBeTruthy())
  })

  it('renders the key table when keys are returned', async () => {
    getMultiKeyStatusMock.mockResolvedValue(
      statusResponse([
        { index: 0, status: 1 },
        { index: 1, status: 3 },
      ])
    )
    renderDialog()

    await waitFor(() => expect(screen.getByText('#1')).toBeTruthy())
    expect(screen.getByText('#2')).toBeTruthy()
    expect(screen.queryByText('No keys found')).toBeNull()
  })

  it('keeps the loading spinner instead of stale rows while the next page loads', async () => {
    getMultiKeyStatusMock.mockResolvedValueOnce({
      success: true,
      data: {
        keys: [
          { index: 0, status: 1 },
          { index: 1, status: 1 },
        ],
        total: 20,
        page: 1,
        page_size: 10,
        total_pages: 2,
        enabled_count: 2,
        manual_disabled_count: 0,
        auto_disabled_count: 0,
      },
    })
    getMultiKeyStatusMock.mockReturnValueOnce(new Promise(() => undefined))
    const user = userEvent.setup()
    renderDialog()

    await waitFor(() => expect(screen.getByText('#1')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByText('#1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

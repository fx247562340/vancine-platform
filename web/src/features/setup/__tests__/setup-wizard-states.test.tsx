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

import { getSetupStatus } from '../api'
import { SetupWizard } from '../setup-wizard'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Vancine',
    logo: '/test-logo.svg',
    footerHtml: '',
    demoSiteEnabled: false,
    loading: false,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../api', () => ({
  getSetupStatus: vi.fn(),
  submitSetup: vi.fn(),
  buildSetupPayload: vi.fn(),
}))

const getSetupStatusMock = vi.mocked(getSetupStatus)

afterEach(() => {
  getSetupStatusMock.mockReset()
  cleanup()
})

function renderWizard(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <SetupWizard />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

const NOT_INITIALIZED = {
  success: true,
  data: {
    status: false,
    root_init: false,
    database_type: 'sqlite',
  },
}

describe('SetupWizard body states', () => {
  it('shows the loading state while the setup status is pending', async () => {
    getSetupStatusMock.mockReturnValue(new Promise(() => undefined))
    renderWizard()

    await waitFor(() => expect(getSetupStatusMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Loading setup status…')).toBeTruthy()
    expect(screen.queryByText('Next')).toBeNull()
    expect(screen.queryByText('Detected database')).toBeNull()
  })

  it('shows the error state and refetches when Retry is clicked', async () => {
    getSetupStatusMock.mockRejectedValueOnce(new Error('boom'))
    getSetupStatusMock.mockResolvedValueOnce(NOT_INITIALIZED)
    const user = userEvent.setup()
    renderWizard()

    await waitFor(() =>
      expect(
        screen.getByText('We could not load the setup status.')
      ).toBeTruthy()
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.getByText('Detected database')).toBeTruthy()
    )
    expect(getSetupStatusMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('We could not load the setup status.')).toBeNull()
  })

  it('shows the first step form and navigation when setup is not initialized', async () => {
    getSetupStatusMock.mockResolvedValue(NOT_INITIALIZED)
    renderWizard()

    await waitFor(() =>
      expect(screen.getByText('Detected database')).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.queryByText('Loading setup status…')).toBeNull()
    expect(screen.queryByText('We could not load the setup status.')).toBeNull()
  })
})

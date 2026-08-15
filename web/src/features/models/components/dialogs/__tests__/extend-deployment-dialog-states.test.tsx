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

import { estimatePrice, getDeployment } from '../../../api'
import { ExtendDeploymentDialog } from '../extend-deployment-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('../../../api', () => ({
  getDeployment: vi.fn(),
  estimatePrice: vi.fn(),
  extendDeployment: vi.fn(),
}))

const getDeploymentMock = vi.mocked(getDeployment)
const estimatePriceMock = vi.mocked(estimatePrice)

afterEach(() => {
  getDeploymentMock.mockReset()
  estimatePriceMock.mockReset()
  cleanup()
})

const PRICEABLE_DETAILS = {
  success: true,
  data: {
    id: 1,
    hardware_id: 2,
    gpus_per_container: 4,
    total_containers: 2,
    locations: [{ id: 9 }],
    status: 'running',
  },
}

function renderDialog(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ExtendDeploymentDialog
          open
          onOpenChange={() => undefined}
          deploymentId={1}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('ExtendDeploymentDialog estimated cost states', () => {
  it('shows Calculating while the price estimate is pending', async () => {
    getDeploymentMock.mockResolvedValue(PRICEABLE_DETAILS)
    estimatePriceMock.mockReturnValue(new Promise(() => undefined))
    renderDialog()

    await waitFor(() => expect(screen.getByText('Calculating...')).toBeTruthy())
    expect(screen.queryByText('Not available')).toBeNull()
  })

  it('shows the price summary when the estimate resolves with a total', async () => {
    getDeploymentMock.mockResolvedValue(PRICEABLE_DETAILS)
    estimatePriceMock.mockResolvedValue({
      success: true,
      data: { total_cost: 250, currency: 'usdc' },
    })
    renderDialog()

    await waitFor(() => expect(screen.getByText('250 USDC')).toBeTruthy())
    expect(screen.queryByText('Calculating...')).toBeNull()
  })

  it('shows Not available and no failure hint when the estimate lacks a total', async () => {
    getDeploymentMock.mockResolvedValue(PRICEABLE_DETAILS)
    estimatePriceMock.mockResolvedValue({ success: true, data: {} })
    renderDialog()

    await waitFor(() =>
      expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
    )
    expect(
      screen.queryByText('Unable to estimate price for this deployment.')
    ).toBeNull()
  })

  it('shows Not available with the failure hint when no price parameters exist', async () => {
    getDeploymentMock.mockResolvedValue({
      success: true,
      data: {
        id: 1,
        hardware_id: 0,
        gpus_per_container: 0,
        total_containers: 0,
        locations: [],
        status: 'running',
      },
    })
    renderDialog()

    await waitFor(() => expect(screen.getByText('Not available')).toBeTruthy())
    expect(
      screen.getByText('Unable to estimate price for this deployment.')
    ).toBeTruthy()
  })

  it('shows Calculating instead of the previous summary when hours change', async () => {
    getDeploymentMock.mockResolvedValue(PRICEABLE_DETAILS)
    estimatePriceMock.mockResolvedValueOnce({
      success: true,
      data: { total_cost: 250, currency: 'usdc' },
    })
    estimatePriceMock.mockReturnValueOnce(new Promise(() => undefined))
    const user = userEvent.setup()
    renderDialog()

    await waitFor(() => expect(screen.getByText('250 USDC')).toBeTruthy())

    const hoursInput = screen.getByRole('spinbutton') as HTMLInputElement
    await user.clear(hoursInput)
    await user.type(hoursInput, '2')

    await waitFor(() => expect(screen.getByText('Calculating...')).toBeTruthy())
    expect(screen.queryByText('250 USDC')).toBeNull()
  })
})

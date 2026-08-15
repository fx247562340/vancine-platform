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
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMissingModels } from '../../../api'
import { MissingModelsDialog } from '../missing-models-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('../../models-provider', () => ({
  useModels: () => ({ setOpen: vi.fn(), setCurrentRow: vi.fn() }),
}))

vi.mock('../../../api', () => ({
  getMissingModels: vi.fn(),
}))

const getMissingModelsMock = vi.mocked(getMissingModels)

afterEach(() => {
  getMissingModelsMock.mockReset()
  cleanup()
})

function renderDialog(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MissingModelsDialog open onOpenChange={() => undefined} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('MissingModelsDialog body states', () => {
  it('shows the loading spinner while the missing models query is pending', () => {
    getMissingModelsMock.mockReturnValue(new Promise(() => undefined))
    renderDialog()

    expect(
      document.querySelectorAll('svg.lucide-loader-circle').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('No missing models found.')).toBeNull()
    expect(
      screen.queryByRole('textbox', { name: 'Search missing models' })
    ).toBeNull()
  })

  it('shows the empty message when no missing models exist', async () => {
    getMissingModelsMock.mockResolvedValue({ success: true, data: [] })
    renderDialog()

    await waitFor(() =>
      expect(screen.getByText('No missing models found.')).toBeTruthy()
    )
    expect(
      screen.getByText('All models in use are properly configured.')
    ).toBeTruthy()
  })

  it('renders the missing model list with configure actions', async () => {
    getMissingModelsMock.mockResolvedValue({
      success: true,
      data: ['gpt-4o', 'claude-3-5-sonnet'],
    })
    renderDialog()

    await waitFor(() => expect(screen.getByText('gpt-4o')).toBeTruthy())
    expect(screen.getByText('claude-3-5-sonnet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Configure' })).toHaveLength(2)
    expect(screen.getByText('Showing 1-2 of 2')).toBeTruthy()
    expect(screen.queryByText('No missing models found.')).toBeNull()
  })
})

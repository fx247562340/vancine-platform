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

import { fetchUpstreamModels, updateChannel } from '../../../api'
import { FetchModelsDialog } from '../fetch-models-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const hoisted = vi.hoisted(() => ({
  currentRow: null as { id: number; name: string; models: string } | null,
}))

vi.mock('../../channels-provider', () => ({
  useChannels: () => ({ currentRow: hoisted.currentRow }),
}))

vi.mock('../../../api', () => ({
  fetchUpstreamModels: vi.fn(),
  updateChannel: vi.fn(),
}))

// Stable reference so the open effect does not re-run on every render.
const customFetcher = vi.fn()

const fetchUpstreamModelsMock = vi.mocked(fetchUpstreamModels)
const updateChannelMock = vi.mocked(updateChannel)

afterEach(() => {
  hoisted.currentRow = null
  fetchUpstreamModelsMock.mockReset()
  updateChannelMock.mockReset()
  customFetcher.mockReset()
  cleanup()
})

function renderDialog(
  props: {
    channelName?: string | null
    existingModelsOverride?: string[]
    redirectSourceModels?: string[]
    useCustomFetcher?: boolean
  } = {}
): { rerender: (next: typeof props) => void } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const renderOnce = (p: typeof props) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <FetchModelsDialog
          open
          onOpenChange={() => undefined}
          customFetcher={
            p.useCustomFetcher === false ? undefined : customFetcher
          }
          channelName={p.channelName}
          existingModelsOverride={p.existingModelsOverride}
          redirectSourceModels={p.redirectSourceModels}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
  const view = render(renderOnce(props))
  return {
    rerender: (next: typeof props) => {
      view.rerender(renderOnce(next))
    },
  }
}

describe('FetchModelsDialog body states', () => {
  it('shows No channel selected and skips fetching without a channel', () => {
    renderDialog({ useCustomFetcher: false })

    expect(screen.getByText('No channel selected')).toBeTruthy()
    expect(
      screen.getByText('Fetch available models from upstream')
    ).toBeTruthy()
    expect(customFetcher).not.toHaveBeenCalled()
    expect(fetchUpstreamModelsMock).not.toHaveBeenCalled()
  })

  it('shows the spinner while the custom fetch is pending', async () => {
    customFetcher.mockReturnValue(new Promise(() => undefined))
    renderDialog()

    await waitFor(() => expect(customFetcher).toHaveBeenCalledTimes(1))
    expect(
      document.querySelectorAll('svg.lucide-loader-circle').length
    ).toBeGreaterThan(0)
    expect(screen.queryByText('No models fetched yet.')).toBeNull()
    expect(screen.queryByPlaceholderText('Search models...')).toBeNull()
  })

  it('shows the empty state with a fetch button when no models are returned', async () => {
    customFetcher.mockResolvedValue([])
    renderDialog()

    await waitFor(() =>
      expect(screen.getByText('No models fetched yet.')).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: 'Fetch Models' })).toBeTruthy()
    expect(document.querySelectorAll('svg.lucide-loader-circle').length).toBe(0)
  })

  it('renders the model list and tabs when models are returned', async () => {
    customFetcher.mockResolvedValue(['gpt-4o', 'claude-3-5-sonnet'])
    renderDialog()

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search models...')).toBeTruthy()
    )
    expect(screen.getByRole('tab', { name: 'New Models (2)' })).toBeTruthy()
    expect(screen.queryByText('No models fetched yet.')).toBeNull()
  })

  it('prefers the active channel name over the channelName fallback in the description', async () => {
    hoisted.currentRow = { id: 1, name: 'Main Channel', models: 'gpt-4o' }
    fetchUpstreamModelsMock.mockResolvedValue({ success: true, data: [] })
    const { rerender } = renderDialog({
      channelName: 'Fallback Channel',
      useCustomFetcher: false,
    })

    await waitFor(() => expect(screen.getByText('Main Channel')).toBeTruthy())
    expect(screen.queryByText('Fallback Channel')).toBeNull()

    hoisted.currentRow = null
    rerender({ channelName: 'Fallback Channel', useCustomFetcher: false })
    expect(screen.getByText('Fallback Channel')).toBeTruthy()
    expect(screen.queryByText('Main Channel')).toBeNull()

    rerender({ channelName: null, useCustomFetcher: false })
    expect(
      screen.getByText('Fetch available models from upstream')
    ).toBeTruthy()
  })

  it('defaults to the new models tab when new models exist', async () => {
    customFetcher.mockResolvedValue(['gpt-4o', 'claude-3-5-sonnet'])
    renderDialog({ existingModelsOverride: ['gpt-4o'] })

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'New Models (1)' })).toBeTruthy()
    )
    expect(screen.getByRole('tab', { name: 'New Models (1)' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.getByRole('tab', { name: 'Existing Models (1)' })
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('defaults to the removed models tab when only removed models exist', async () => {
    customFetcher.mockResolvedValue(['gpt-4o'])
    renderDialog({ existingModelsOverride: ['gpt-4o', 'old-model'] })

    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Removed Models (1)' })
      ).toBeTruthy()
    )
    expect(
      screen.getByRole('tab', { name: 'Removed Models (1)' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('defaults to the existing models tab when nothing is new or removed', async () => {
    customFetcher.mockResolvedValue(['gpt-4o'])
    renderDialog({ existingModelsOverride: ['gpt-4o'] })

    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Existing Models (1)' })
      ).toBeTruthy()
    )
    expect(
      screen.getByRole('tab', { name: 'Existing Models (1)' })
    ).toHaveAttribute('aria-selected', 'true')
  })
})

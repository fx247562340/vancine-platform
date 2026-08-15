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
import { cleanup, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Rankings } from '../index'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

// Isolate the page from the full public header/footer (their dynamic nav
// needs backend config); PublicLayout degrades to a plain wrapper.
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ period: 'week' }),
  useNavigate: () => vi.fn(),
}))

// The data sections are presentation leaves fed by the snapshot; the page
// branch under test is loading / error / content, so the sections degrade
// to stable slots.
vi.mock('../components', () => ({
  RankingsHero: () => <div data-testid='rankings-hero' />,
  ModelsSection: () => <div data-testid='models-section' />,
  MarketShareSection: () => <div data-testid='market-share-section' />,
  PulseSection: () => <div data-testid='pulse-section' />,
}))

const hoisted = vi.hoisted(() => ({
  query: {
    isLoading: false,
    error: null as Error | null,
    data: undefined as unknown,
  },
}))

vi.mock('../hooks/use-rankings', () => ({
  useRankings: () => hoisted.query,
}))

afterEach(() => {
  hoisted.query.isLoading = false
  hoisted.query.error = null
  hoisted.query.data = undefined
  cleanup()
})

const SNAPSHOT = {
  models: [],
  vendors: [],
  top_movers: [],
  top_droppers: [],
  models_history: {},
  vendor_share_history: {},
}

describe('Rankings page body states', () => {
  it('shows the loading skeleton instead of sections while loading', () => {
    hoisted.query.isLoading = true
    hoisted.query.error = null
    hoisted.query.data = { data: SNAPSHOT }
    render(
      <I18nextProvider i18n={i18n}>
        <Rankings />
      </I18nextProvider>
    )

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    expect(screen.queryByTestId('models-section')).toBeNull()
    expect(screen.queryByTestId('market-share-section')).toBeNull()
    expect(screen.queryByTestId('pulse-section')).toBeNull()
    expect(screen.queryByText('Unable to load rankings')).toBeNull()
  })

  it('shows the error card with the query error message when no snapshot exists', () => {
    hoisted.query.isLoading = false
    hoisted.query.error = new Error('network down')
    hoisted.query.data = { data: undefined }
    render(
      <I18nextProvider i18n={i18n}>
        <Rankings />
      </I18nextProvider>
    )

    expect(screen.getByText('Unable to load rankings')).toBeTruthy()
    expect(screen.getByText('network down')).toBeTruthy()
    expect(screen.queryByTestId('models-section')).toBeNull()
  })

  it('shows the default error message when no snapshot and no error object exist', () => {
    hoisted.query.isLoading = false
    hoisted.query.error = null
    hoisted.query.data = undefined
    render(
      <I18nextProvider i18n={i18n}>
        <Rankings />
      </I18nextProvider>
    )

    expect(screen.getByText('Unable to load rankings')).toBeTruthy()
    expect(screen.getByText('Unable to load rankings data')).toBeTruthy()
  })

  it('renders the ranking sections when a snapshot is available', () => {
    hoisted.query.isLoading = false
    hoisted.query.error = null
    hoisted.query.data = { data: SNAPSHOT }
    render(
      <I18nextProvider i18n={i18n}>
        <Rankings />
      </I18nextProvider>
    )

    expect(screen.getByTestId('models-section')).toBeTruthy()
    expect(screen.getByTestId('market-share-section')).toBeTruthy()
    expect(screen.getByTestId('pulse-section')).toBeTruthy()
    expect(screen.getByTestId('rankings-hero')).toBeTruthy()
    expect(screen.queryByText('Unable to load rankings')).toBeNull()
  })
})

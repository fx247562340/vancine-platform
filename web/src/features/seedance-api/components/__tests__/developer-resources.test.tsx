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
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'
import { trackEvent } from '@/lib/analytics'

import {
  SEEDANCE_DEVELOPER_GITHUB_URL,
  SEEDANCE_DEVELOPER_N8N_URL,
  SEEDANCE_DEVELOPER_POSTMAN_URL,
  SEEDANCE_DEVELOPER_RESOURCES,
} from '../../lib/landing'
import { DeveloperResources } from '../developer-resources'

// Capture emissions instead of hitting Umami; the analytics helper's own
// behaviour is covered by src/lib/__tests__/analytics.test.ts.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const trackEventMock = trackEvent as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Independent i18n instance fed from the real en.json, so the assertions read
// the shipped copy rather than a hand-copied stub.
// ---------------------------------------------------------------------------
const testI18n = i18n.createInstance()
let i18nReady: Promise<unknown> | null = null

async function ensureI18n(): Promise<unknown> {
  if (!i18nReady) {
    i18nReady = testI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: enLocale.translation } },
      nsSeparator: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
  return i18nReady
}

function renderSection(): void {
  render(
    <I18nextProvider i18n={testI18n}>
      <DeveloperResources />
    </I18nextProvider>
  )
}

beforeEach(async () => {
  trackEventMock.mockClear()
  await ensureI18n()
})

afterEach(() => {
  cleanup()
})

describe('developer resource destinations', () => {
  it('links exactly the three verified targets', () => {
    renderSection()

    expect(
      screen.getByRole('link', { name: /GitHub starter/ })
    ).toHaveAttribute('href', SEEDANCE_DEVELOPER_GITHUB_URL)
    expect(
      screen.getByRole('link', { name: /Postman documentation/ })
    ).toHaveAttribute('href', SEEDANCE_DEVELOPER_POSTMAN_URL)
    expect(
      screen.getByRole('link', { name: /n8n workflow template/ })
    ).toHaveAttribute('href', SEEDANCE_DEVELOPER_N8N_URL)
  })

  it('points the Postman entry at the documentation, not the unpublished Collection', () => {
    renderSection()

    const link = screen.getByRole('link', { name: /Postman documentation/ })
    expect(link.getAttribute('href')).toContain(
      'documenter.getpostman.com/view/'
    )
    expect(link.getAttribute('href')).not.toContain('/collection/')
  })

  it('renders the n8n public-page description and not the retired polling claims', () => {
    renderSection()

    expect(
      screen.getByText(
        'Public n8n workflow page for generating Seedance videos with the Vancine Doubao API.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/importable/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/bounded polling/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/explicit failure handling/i)
    ).not.toBeInTheDocument()
  })

  it('names the Postman entry as documentation, never as runnable', () => {
    renderSection()

    expect(
      screen.getByRole('heading', { name: /Postman documentation/ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/run in postman/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/collection/i)).not.toBeInTheDocument()
  })

  it('opens every external resource in a new tab with a safe rel', () => {
    renderSection()

    for (const resource of SEEDANCE_DEVELOPER_RESOURCES) {
      const link = screen.getByRole('link', { name: resource.titleKey })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})

describe('developer resource analytics', () => {
  it('records the fixed resource and location for each click', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('link', { name: /GitHub starter/ }))
    await user.click(
      screen.getByRole('link', { name: /Postman documentation/ })
    )
    await user.click(
      screen.getByRole('link', { name: /n8n workflow template/ })
    )

    expect(trackEventMock.mock.calls).toEqual([
      [
        'developer_resource_clicked',
        { resource: 'github', location: 'seedance_developer_resources' },
      ],
      [
        'developer_resource_clicked',
        { resource: 'postman', location: 'seedance_developer_resources' },
      ],
      [
        'developer_resource_clicked',
        { resource: 'n8n', location: 'seedance_developer_resources' },
      ],
    ])
  })

  it('never puts a URL, query string, or identity into the payload', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('link', { name: /GitHub starter/ }))

    const serialized = JSON.stringify(trackEventMock.mock.calls)
    expect(serialized).not.toContain('http')
    expect(serialized).not.toContain('github.com')
    expect(serialized).not.toContain('utm')
    expect(serialized).not.toContain('?')
  })
})

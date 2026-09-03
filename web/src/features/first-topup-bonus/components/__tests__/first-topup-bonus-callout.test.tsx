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
// The shared first-top-up-bonus callout contract: renders nothing unless the
// server flags the promotion active AND the raw values are valid, and every
// variant states on first sight the dynamic Credits amount, the USD
// API-balance equivalent, the first-successful-top-up condition and the
// one-bonus-per-account limit — with no misleading promo copy.

/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import { FirstTopUpBonusCallout } from '../first-topup-bonus-callout'

// The callout reads the promotion configuration from the shared /api/status
// cache. The hook is mocked at the use-status boundary so each test controls
// the raw server payload directly.
const statusMock = vi.hoisted(() => ({ current: {} as unknown }))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: statusMock.current,
    loading: false,
    error: null,
  }),
}))

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: enLocale },
})

function activeStatus(extra: Record<string, unknown> = {}) {
  return {
    first_topup_bonus_quota: 500000,
    first_topup_bonus_active: true,
    quota_per_unit: 500000,
    ...extra,
  }
}

function renderCallout(variant: 'compact' | 'full' | 'signup' = 'compact') {
  return render(
    <I18nextProvider i18n={i18n}>
      <FirstTopUpBonusCallout variant={variant} />
    </I18nextProvider>
  )
}

beforeEach(() => {
  statusMock.current = {}
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('FirstTopUpBonusCallout', () => {
  it('renders nothing when the promotion config is missing', () => {
    const { container } = renderCallout()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the promotion quota is 0', () => {
    statusMock.current = activeStatus({
      first_topup_bonus_quota: 0,
      first_topup_bonus_active: false,
    })
    const { container } = renderCallout()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when active=false even with a positive quota', () => {
    statusMock.current = activeStatus({ first_topup_bonus_active: false })
    const { container } = renderCallout()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when quota_per_unit is invalid', () => {
    statusMock.current = activeStatus({ quota_per_unit: 0 })
    const { container } = renderCallout()
    expect(container).toBeEmptyDOMElement()
  })

  it('compact variant shows label, amount, USD equivalent, condition and per-account limit', () => {
    statusMock.current = activeStatus()
    renderCallout('compact')
    expect(screen.getByText('First top-up bonus')).toBeInTheDocument()
    expect(
      screen.getByText('500,000 Bonus Credits · $1 API balance')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'After your first successful top-up · one bonus per account'
      )
    ).toBeInTheDocument()
  })

  it('full variant carries the same complete disclosure as compact', () => {
    statusMock.current = activeStatus()
    renderCallout('full')
    expect(
      screen.getByText('500,000 Bonus Credits · $1 API balance')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'After your first successful top-up · one bonus per account'
      )
    ).toBeInTheDocument()
  })

  it('signup variant states that signing up alone grants 0 Credits', () => {
    statusMock.current = activeStatus()
    renderCallout('signup')
    expect(
      screen.getByText(
        'Sign-up itself grants 0 Credits. Complete your first successful top-up to receive 500,000 Bonus Credits. One bonus per account.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('500,000 Bonus Credits · $1 API balance')
    ).toBeInTheDocument()
  })

  it('never uses misleading promo copy when active', () => {
    statusMock.current = activeStatus()
    const { container } = renderCallout('full')
    const text = container.textContent ?? ''
    expect(text).not.toContain('Tokens')
    expect(text.toLowerCase()).not.toContain('signup bonus')
    expect(text.toLowerCase()).not.toContain('free credit')
    expect(text.toLowerCase()).not.toContain('no credit card')
    expect(text).not.toContain('20% bonus')
  })
})

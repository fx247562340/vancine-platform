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
import { render } from '@testing-library/react'
import i18next from 'i18next'
import type React from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { formatLogQuota } from '@/lib/format'

import { LogCostDisplay } from '../log-cost-display'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Subscription: 'Subscription',
        'Deducted by subscription': 'Deducted by subscription',
        'Includes tool-call surcharge': 'Includes tool-call surcharge',
      },
    },
  },
})

function renderCost(props: React.ComponentProps<typeof LogCostDisplay>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LogCostDisplay {...props} />
    </I18nextProvider>
  )
}

function normalizedText(value: string | null): string {
  return (value ?? '').replaceAll(/\s/g, '')
}

describe('log cost display', () => {
  it('keeps the regular cost visible and adds an accessible surcharge marker', () => {
    const { container } = renderCost({
      quota: 12500,
      other: {
        tool_surcharges: [{ name: 'lookup_customer', count: 1, price: 5 }],
      },
    })

    expect(
      normalizedText(container.textContent).includes(
        normalizedText(formatLogQuota(12500))
      )
    ).toBe(true)
    const marker = container.querySelector(
      '[data-tool-surcharge-indicator="true"]'
    )
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('aria-label')).toBe(
      'Includes tool-call surcharge'
    )
    expect(marker?.getAttribute('tabindex')).toBe('0')
  })

  it('preserves the subscription badge and adds the same legacy surcharge marker', () => {
    const { container } = renderCost({
      quota: 5000,
      other: {
        billing_source: 'subscription',
        web_search: true,
        web_search_call_count: 1,
        web_search_price: 10,
      },
    })

    expect(container.textContent?.includes('Subscription')).toBe(true)
    expect(
      container.querySelector('[data-tool-surcharge-indicator="true"]')
    ).not.toBeNull()
  })
})

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
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { ToolPriceSettings } from '../tool-price-settings'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Price ($/1K calls)': 'Price ($/1K calls)',
        'Please enter a valid number': 'Please enter a valid number',
        'Tool identifier': 'Tool identifier',
      },
    },
  },
})

let queryClient: QueryClient

afterEach(() => {
  queryClient.clear()
})

function setNativeValue(input: HTMLInputElement, value: string) {
  // Set the value through the prototype setter so React's controlled-input
  // tracker registers the change, then dispatch input to fire onChange.
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set
  expect(valueSetter).toBeDefined()
  if (valueSetter) valueSetter.call(input, value)
  fireEvent.input(input)
}

function renderSettings(props: React.ComponentProps<typeof ToolPriceSettings>) {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToolPriceSettings {...props} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('tool price validation', () => {
  it('blocks an empty price without converting it to an explicit zero', () => {
    renderSettings({ defaultValue: '{"web_search":10}' })

    const priceInput = screen.getByLabelText(
      'Price ($/1K calls): web_search'
    ) as HTMLInputElement

    setNativeValue(priceInput, '')

    expect(priceInput.getAttribute('aria-invalid')).toBe('true')
    expect(
      priceInput.closest('[data-slot="field"]')?.querySelector('[role="alert"]')
        ?.textContent
    ).toBe('Please enter a valid number')
    const saveButton = screen.getByRole('button', { name: 'Save tool prices' })
    expect(saveButton).toBeDisabled()

    setNativeValue(priceInput, '0')

    expect(priceInput.getAttribute('aria-invalid')).toBe('false')
    expect(saveButton).toBeEnabled()
  })
})

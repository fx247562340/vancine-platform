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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'

import { ApiKeysMutateDrawer } from '../api-keys-mutate-drawer'
import { ApiKeysProvider } from '../api-keys-provider'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiMethod = (url: string, data?: unknown) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod; post: ApiMethod }

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPost = apiClient.post

let queryClient: QueryClient

afterEach(() => {
  apiClient.get = originalGet
  apiClient.post = originalPost
  window.localStorage.clear()
  cleanup()
  if (queryClient) queryClient.clear()
})

function installApiFixtures(createdPayloads: Array<Record<string, unknown>>) {
  apiClient.get = async (url) => {
    switch (url) {
      case '/api/status':
        return { data: { data: { default_use_auto_group: true } } }
      case '/api/user/models':
        return { data: { success: true, data: [] } }
      case '/api/user/self/groups':
        return {
          data: {
            success: true,
            data: {
              auto: { desc: 'Automatic routing', ratio: 'auto' },
              default: { desc: 'Standard access', ratio: 1 },
              vip: { desc: 'Priority access', ratio: 2 },
            },
          },
        }
      case '/api/token/auto-groups':
        return {
          data: {
            success: true,
            data: { groups: ['vip', 'default'], max_count: 3 },
          },
        }
      default:
        throw new Error(`Unexpected GET ${url}`)
    }
  }
  apiClient.post = async (url, data) => {
    expect(url).toBe('/api/token/')
    expect(data && typeof data === 'object').toBe(true)
    createdPayloads.push(data as Record<string, unknown>)
    return { data: { success: true, data: {} } }
  }
}

async function renderCreateDrawer(): Promise<void> {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(
    ['status'],
    { default_use_auto_group: true },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-models'],
    { success: true, data: [] },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-groups'],
    {
      success: true,
      data: {
        auto: { desc: 'Automatic routing', ratio: 'auto' },
        default: { desc: 'Standard access', ratio: 1 },
        vip: { desc: 'Priority access', ratio: 2 },
      },
    },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['token-auto-groups'],
    {
      success: true,
      data: { groups: ['vip', 'default'], max_count: 3 },
    },
    { updatedAt: freshAt }
  )

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiKeysProvider>
          <ApiKeysMutateDrawer open onOpenChange={() => undefined} />
        </ApiKeysProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
}

function getControlByLabel<T extends HTMLElement>(labelText: string): T {
  const found = [
    ...document.body.querySelectorAll<HTMLLabelElement>('label'),
  ].find((candidate) => candidate.textContent?.trim() === labelText)
  expect(found).not.toBeUndefined()
  const label = found as HTMLLabelElement
  expect(label.htmlFor).toBeTruthy()
  const control =
    label.control ??
    label
      .closest('[data-slot="form-item"]')
      ?.querySelector<HTMLElement>(
        '[data-slot="form-control"], input, textarea, button[role="combobox"], [role="group"]'
      )
  expect(control).not.toBeNull()
  return control as T
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set
  expect(valueSetter).toBeDefined()
  if (valueSetter) valueSetter.call(input, value)
  fireEvent.input(input)
}

async function selectComboboxOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLButtonElement,
  optionDescription: string
) {
  await user.click(trigger)
  const option = [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-slot="command-item"]'
    ),
  ].find((candidate) => candidate.textContent?.includes(optionDescription))
  expect(option).not.toBeUndefined()
  await user.click(option as HTMLElement)
}

describe('API keys mutate drawer Auto group integration', () => {
  it('inherits the root Auto order and sends an empty override for every batch-created key', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    const groupTrigger = getControlByLabel<HTMLButtonElement>('Group')
    expect(groupTrigger.textContent?.includes('auto')).toBe(true)
    expect(
      document.body.textContent?.includes(
        'Using the complete global Auto order (2 groups)'
      )
    ).toBe(true)
    expect(
      [
        ...document.body.querySelectorAll(
          '[data-slot="global-auto-order-name"]'
        ),
      ].map((item) => item.textContent)
    ).toEqual(['vip', 'default'])
    expect(
      screen.getByRole('button', { name: 'Restore global Auto' })
    ).toBeDisabled()

    setNativeValue(getControlByLabel<HTMLInputElement>('Name'), 'batch')
    setNativeValue(getControlByLabel<HTMLInputElement>('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(2))

    expect(createdPayloads[0]?.name).toBe('batch')
    for (const payload of createdPayloads) {
      expect(payload.group).toBe('auto')
      expect(payload.auto_groups).toEqual([])
      expect(payload.cross_group_retry).toBe(true)
    }
  })

  it('preserves an unsaved custom order and mode after Auto to ordinary to Auto changes', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    const autoOrderControl = getControlByLabel<HTMLElement>('Auto group order')
    const addGroupTrigger = autoOrderControl.querySelector<HTMLButtonElement>(
      'button[role="combobox"]'
    )
    expect(addGroupTrigger).not.toBeNull()
    await selectComboboxOption(
      user,
      addGroupTrigger as HTMLButtonElement,
      'Priority access'
    )

    expect(
      document.body.querySelector('button[aria-label="Remove vip"]')
    ).not.toBeNull()
    expect(document.body.textContent?.includes('1 / 3 groups selected')).toBe(
      true
    )
    expect(
      screen.getByRole('button', { name: 'Restore global Auto' })
    ).toBeEnabled()

    const groupTrigger = getControlByLabel<HTMLButtonElement>('Group')
    await selectComboboxOption(user, groupTrigger, 'Standard access')
    expect(
      document.body.querySelector('button[aria-label="Remove vip"]')
    ).toBeNull()
    await selectComboboxOption(user, groupTrigger, 'Automatic routing')

    expect(
      document.body.querySelector('button[aria-label="Remove vip"]')
    ).not.toBeNull()
    expect(document.body.textContent?.includes('1 / 3 groups selected')).toBe(
      true
    )
    expect(
      screen.getByRole('button', { name: 'Restore global Auto' })
    ).toBeEnabled()

    setNativeValue(getControlByLabel<HTMLInputElement>('Name'), 'custom')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))
    expect(createdPayloads[0]?.auto_groups).toEqual(['vip'])
  })
})

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

import { PrefillGroupFormDrawer } from '../prefill-group-form-drawer'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiMethod = (url: string, data?: unknown) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod; post: ApiMethod; put: ApiMethod }

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPost = apiClient.post
const originalPut = apiClient.put

afterEach(() => {
  apiClient.get = originalGet
  apiClient.post = originalPost
  apiClient.put = originalPut
  cleanup()
})

function installApiFixtures(createdPayloads: Array<Record<string, unknown>>) {
  apiClient.get = async () => ({ data: {} })
  apiClient.post = async (url, data) => {
    expect(url).toBe('/api/prefill_group')
    expect(data && typeof data === 'object').toBe(true)
    createdPayloads.push(data as Record<string, unknown>)
    return { data: { success: true } }
  }
}

function installEditApiFixtures(
  updatedPayloads: Array<Record<string, unknown>>,
  createdPayloads?: Array<Record<string, unknown>>
) {
  apiClient.get = async () => ({ data: {} })
  apiClient.post = async (url, data) => {
    if (createdPayloads) {
      expect(url).toBe('/api/prefill_group')
      expect(data && typeof data === 'object').toBe(true)
      createdPayloads.push(data as Record<string, unknown>)
    }
    return { data: { success: true } }
  }
  apiClient.put = async (url, data) => {
    expect(url).toBe('/api/prefill_group')
    expect(data && typeof data === 'object').toBe(true)
    updatedPayloads.push(data as Record<string, unknown>)
    return { data: { success: true } }
  }
}

async function renderCreateDrawer(): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <PrefillGroupFormDrawer
          open
          onClose={() => undefined}
          currentGroup={null}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
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

async function selectGroupType(
  user: ReturnType<typeof userEvent.setup>,
  optionLabel: string
): Promise<void> {
  const typeTrigger = getControlByLabel<HTMLButtonElement>('Group Type')
  await user.click(typeTrigger)
  const option = [
    ...document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ].find((candidate) => candidate.textContent?.includes(optionLabel))
  expect(option).not.toBeUndefined()
  await user.click(option as HTMLElement)
}

describe('Prefill group form submit payloads', () => {
  it('submits a model group with a string-array items payload', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    setNativeValue(
      getControlByLabel<HTMLInputElement>('Group Name'),
      'Premium chat models'
    )
    const tagInput = screen.getByPlaceholderText(
      'Enter a value and press Enter'
    )
    await user.type(tagInput, 'gpt-4o{Enter}')

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    expect(createdPayloads[0]).toEqual({
      name: 'Premium chat models',
      type: 'model',
      description: '',
      items: ['gpt-4o'],
    })
  })

  it('submits a tag group with a string-array items payload', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    await selectGroupType(user, 'Tag Group')
    setNativeValue(
      getControlByLabel<HTMLInputElement>('Group Name'),
      'vip tags'
    )
    const tagInput = screen.getByPlaceholderText(
      'Enter a value and press Enter'
    )
    await user.type(tagInput, 'vip{Enter}')

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    expect(createdPayloads[0]).toEqual({
      name: 'vip tags',
      type: 'tag',
      description: '',
      items: ['vip'],
    })
  })

  it('submits an endpoint group with a string JSON items payload', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    await selectGroupType(user, 'Endpoint Group')
    setNativeValue(
      getControlByLabel<HTMLInputElement>('Group Name'),
      'edge endpoints'
    )
    await user.click(screen.getByRole('button', { name: 'Add Row' }))
    setNativeValue(
      screen.getByPlaceholderText('provider') as HTMLInputElement,
      'openai'
    )
    setNativeValue(
      screen.getByPlaceholderText(
        '{"path": "/v1/...","method": "POST"}'
      ) as HTMLInputElement,
      '{"path": "/v1/chat/completions", "method": "POST"}'
    )

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    const payload = createdPayloads[0]
    expect(payload.name).toBe('edge endpoints')
    expect(payload.type).toBe('endpoint')
    expect(payload.description).toBe('')
    expect(typeof payload.items).toBe('string')
    const parsedItems = JSON.parse(payload.items as string) as Record<
      string,
      { path: string; method: string }
    >
    expect(parsedItems.openai).toEqual({
      path: '/v1/chat/completions',
      method: 'POST',
    })
  })

  it('submits an update payload with the group id when editing', async () => {
    const user = userEvent.setup()
    const updatedPayloads: Array<Record<string, unknown>> = []
    installEditApiFixtures(updatedPayloads)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <PrefillGroupFormDrawer
            open
            onClose={() => undefined}
            currentGroup={{
              id: 12,
              name: 'legacy bundle',
              type: 'model',
              items: ['gpt-4o'],
            }}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })
    setNativeValue(
      getControlByLabel<HTMLInputElement>('Group Name'),
      'renamed bundle'
    )

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updatedPayloads).toHaveLength(1))

    expect(updatedPayloads[0]).toEqual({
      id: 12,
      name: 'renamed bundle',
      type: 'model',
      description: '',
      items: ['gpt-4o'],
    })
  })

  it('keeps the create branch when currentGroup.id is zero', async () => {
    const user = userEvent.setup()
    const createdPayloads: Array<Record<string, unknown>> = []
    const updatedPayloads: Array<Record<string, unknown>> = []
    installEditApiFixtures(updatedPayloads, createdPayloads)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <PrefillGroupFormDrawer
            open
            onClose={() => undefined}
            currentGroup={{ id: 0, name: 'zero', type: 'model', items: [] }}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    // Boolean(0) is false: the drawer stays in create mode.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    })
    setNativeValue(
      getControlByLabel<HTMLInputElement>('Group Name'),
      'zero group'
    )

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    expect(createdPayloads[0]).toEqual({
      name: 'zero group',
      type: 'model',
      description: '',
      items: [],
    })
    expect(updatedPayloads).toHaveLength(0)
  })
})

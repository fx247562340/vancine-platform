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
import { toast } from 'sonner'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'

import { createVendor, updateVendor } from '../../../api'
import type { Vendor } from '../../../types'
import { VendorMutateDialog } from '../vendor-mutate-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('../../../api', () => ({
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
}))

const createVendorMock = vi.mocked(createVendor)
const updateVendorMock = vi.mocked(updateVendor)

const EDIT_VENDOR: Vendor = {
  id: 7,
  name: 'Anthropic',
  description: '',
  icon: '',
  status: 1,
  created_time: 0,
  updated_time: 0,
}

let toastSuccessSpy: MockInstance<typeof toast.success>

function renderDialog(currentVendor: Vendor | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <VendorMutateDialog
          open
          onOpenChange={onOpenChange}
          currentVendor={currentVendor}
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
  return { invalidateSpy, onOpenChange }
}

async function submitWithName(name: string, submitLabel: string) {
  const user = userEvent.setup()
  const nameInput = screen.getByPlaceholderText(
    'OpenAI, Anthropic, etc.'
  ) as HTMLInputElement
  await user.clear(nameInput)
  await user.type(nameInput, name)
  await user.click(screen.getByRole('button', { name: submitLabel }))
}

beforeEach(() => {
  createVendorMock.mockReset()
  updateVendorMock.mockReset()
  createVendorMock.mockResolvedValue({ success: true })
  updateVendorMock.mockResolvedValue({ success: true })
  toastSuccessSpy = vi.spyOn(toast, 'success')
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('VendorMutateDialog submit payloads', () => {
  it('submits a create payload without calling update', async () => {
    const { invalidateSpy, onOpenChange } = renderDialog()
    await submitWithName('DeepSeek', 'Create')

    await waitFor(() => expect(createVendorMock).toHaveBeenCalledTimes(1))
    expect(createVendorMock).toHaveBeenCalledWith({
      name: 'DeepSeek',
      description: '',
      icon: '',
      status: 1,
    })
    expect(updateVendorMock).not.toHaveBeenCalled()
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('submits an update payload with the vendor id when editing', async () => {
    const { invalidateSpy, onOpenChange } = renderDialog(EDIT_VENDOR)
    await submitWithName('Anthropic v2', 'Update')

    await waitFor(() => expect(updateVendorMock).toHaveBeenCalledTimes(1))
    expect(updateVendorMock).toHaveBeenCalledWith({
      id: 7,
      name: 'Anthropic v2',
      description: '',
      icon: '',
      status: 1,
    })
    expect(createVendorMock).not.toHaveBeenCalled()
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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

import type { GroupOption, ModelOption } from '../../../types'
import { PlaygroundInput } from '../playground-input'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const models: ModelOption[] = [
  { label: 'gpt-4o', value: 'gpt-4o' },
  { label: 'claude-3', value: 'claude-3' },
]

const groups: GroupOption[] = [{ label: 'default', value: 'default', ratio: 1 }]

let toastErrorSpy: MockInstance<typeof toast.error>

// jsdom does not implement blob URL helpers; stub the browser boundary so
// attached files receive a stable blob URL. The ORIGINAL descriptors are
// captured at suite init and must be restored wholesale after each test.
const originalCreateObjectURLDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL'
)
const originalRevokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL'
)

function stubBlobUrls() {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:mock-url',
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined,
  })
}

function expectBlobUrlDescriptorsRestored() {
  expect(Object.getOwnPropertyDescriptor(URL, 'createObjectURL')).toEqual(
    originalCreateObjectURLDescriptor
  )
  expect(Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')).toEqual(
    originalRevokeObjectURLDescriptor
  )
}

function restoreBlobUrls() {
  // Restore the FULL original descriptors verbatim when they existed, and
  // delete the test-created properties when they did not. A value-only
  // redefine would silently drop the original writable/enumerable flags.
  if (originalCreateObjectURLDescriptor) {
    Object.defineProperty(
      URL,
      'createObjectURL',
      originalCreateObjectURLDescriptor
    )
  } else {
    delete (URL as { createObjectURL?: unknown }).createObjectURL
  }
  if (originalRevokeObjectURLDescriptor) {
    Object.defineProperty(
      URL,
      'revokeObjectURL',
      originalRevokeObjectURLDescriptor
    )
  } else {
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
  }
}

function renderPlaygroundInput() {
  const onSubmit = vi.fn()
  const onModelChange = vi.fn()
  const onGroupChange = vi.fn()
  const onConfigChange = vi.fn()
  const onParameterEnabledChange = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <PlaygroundInput
        config={{
          model: 'gpt-4o',
          group: 'default',
          temperature: 0.7,
          top_p: 1,
          max_tokens: 1024,
          frequency_penalty: 0,
          presence_penalty: 0,
          seed: null,
          stream: true,
        }}
        onSubmit={onSubmit}
        models={models}
        modelValue='gpt-4o'
        onModelChange={onModelChange}
        groups={groups}
        groupValue='default'
        onGroupChange={onGroupChange}
        onConfigChange={onConfigChange}
        onParameterEnabledChange={onParameterEnabledChange}
        parameterEnabled={{
          temperature: true,
          top_p: true,
          max_tokens: true,
          frequency_penalty: true,
          presence_penalty: true,
          seed: true,
        }}
      />
    </I18nextProvider>
  )
  return { onSubmit }
}

beforeEach(() => {
  stubBlobUrls()
  toastErrorSpy = vi.spyOn(toast, 'error')
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blob read failed'))
})

afterEach(() => {
  // Unmount before restoring the URL stubs: the local attachments cleanup
  // revokes blob URLs during unmount.
  cleanup()
  vi.restoreAllMocks()
  restoreBlobUrls()
  // The stub must be gone completely: the original descriptors (including
  // writable/enumerable) are back verbatim.
  expectBlobUrlDescriptorsRestored()
})

describe('PlaygroundInput attachment error feedback', () => {
  it('shows exactly one toast when attachment conversion fails', async () => {
    const { onSubmit } = renderPlaygroundInput()

    const file = new File(['pdf-content'], 'report.pdf', {
      type: 'application/pdf',
    })
    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [file] },
    })
    fireEvent.submit(
      screen.getByRole('textbox').closest('form') as HTMLFormElement
    )

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith(
        'Failed to prepare attachments.'
      )
    })
    expect(toastErrorSpy).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

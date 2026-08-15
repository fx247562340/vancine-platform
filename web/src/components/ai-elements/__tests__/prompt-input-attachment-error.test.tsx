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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  usePromptInputAttachments,
} from '../prompt-input'

// Public attachment contract: renders the attached file names so tests can
// observe retention through real UI state.
function AttachmentNames() {
  const attachments = usePromptInputAttachments()
  return (
    <ul>
      {attachments.files.map((file) => (
        <li key={file.id}>{file.filename}</li>
      ))}
    </ul>
  )
}

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

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

async function attachFile() {
  const file = new File(['pdf-content'], 'report.pdf', {
    type: 'application/pdf',
  })
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [file] },
  })
  await screen.findByText('report.pdf')
}

beforeEach(() => {
  stubBlobUrls()
  // Blob URL conversion hits fetch first; rejecting it exercises the
  // attachment preparation failure path deterministically.
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

describe('blob URL stub restore semantics', () => {
  it('removes the stub property and restores full descriptors verbatim', () => {
    // Property-absent environment (jsdom): the stub CREATES the property and
    // the restore must delete it again. A value-only redefine would leave a
    // degraded descriptor (writable/enumerable false) behind — exactly what
    // the afterEach assertion catches.
    const target: Record<string, unknown> = {}
    const captured = Object.getOwnPropertyDescriptor(target, 'probe')
    expect(captured).toBeUndefined()

    Object.defineProperty(target, 'probe', {
      configurable: true,
      value: () => 'stub',
    })
    Object.defineProperty(target, 'probe', {
      configurable: true,
      value: undefined,
    })
    expect(Object.getOwnPropertyDescriptor(target, 'probe')).toEqual({
      value: undefined,
      writable: false,
      enumerable: false,
      configurable: true,
    })
    expect(Object.getOwnPropertyDescriptor(target, 'probe')).not.toEqual(
      captured
    )

    delete (target as { probe?: unknown }).probe
    expect(Object.getOwnPropertyDescriptor(target, 'probe')).toEqual(captured)

    // Descriptor-present environment (Node): the captured descriptor is
    // restored verbatim, keeping writable/enumerable/configurable.
    const withDescriptor: Record<string, unknown> = {}
    const full = {
      value: () => 'original',
      writable: true,
      enumerable: true,
      configurable: true,
    }
    Object.defineProperty(withDescriptor, 'probe', full)
    const capturedFull = Object.getOwnPropertyDescriptor(
      withDescriptor,
      'probe'
    )
    expect(capturedFull).toEqual(full)

    Object.defineProperty(withDescriptor, 'probe', {
      configurable: true,
      value: () => 'stub',
    })
    Object.defineProperty(
      withDescriptor,
      'probe',
      capturedFull as PropertyDescriptor
    )
    expect(Object.getOwnPropertyDescriptor(withDescriptor, 'probe')).toEqual(
      full
    )
  })
})

describe('PromptInput attachment conversion failure', () => {
  it('reports attachment_conversion via onError, never submits, and keeps attachments', async () => {
    const onSubmit = vi.fn()
    const onError = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <PromptInput
          data-testid='prompt-form'
          onSubmit={onSubmit}
          onError={onError}
        >
          <PromptInputTextarea />
          <AttachmentNames />
        </PromptInput>
      </I18nextProvider>
    )

    await attachFile()
    fireEvent.submit(screen.getByTestId('prompt-form'))

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError).toHaveBeenCalledWith({
      code: 'attachment_conversion',
      message: 'Failed to prepare attachments.',
    })
    expect(onSubmit).not.toHaveBeenCalled()
    // Attachments stay attached for a retry.
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })

  it('keeps the provider-controlled text intact on conversion failure', async () => {
    const onSubmit = vi.fn()
    const onError = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <PromptInputProvider initialInput='keep me'>
          <PromptInput
            data-testid='prompt-form'
            onSubmit={onSubmit}
            onError={onError}
          >
            <PromptInputTextarea />
            <AttachmentNames />
          </PromptInput>
        </PromptInputProvider>
      </I18nextProvider>
    )

    await attachFile()
    fireEvent.submit(screen.getByTestId('prompt-form'))

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onSubmit).not.toHaveBeenCalled()
    // Provider text is only cleared on success, so it survives the failure.
    expect(screen.getByRole('textbox')).toHaveValue('keep me')
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })
})

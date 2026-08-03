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
// Vitest + jsdom. Renders the REAL PlaygroundInput; only the upload API is
// mocked so we can observe the paste → upload → thumbnail → submit flow.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaygroundInput } from './playground-input'

const { uploadMock, toastMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  toastMock: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

vi.mock('../api', () => ({
  uploadImage: (...args: unknown[]) => uploadMock(...args),
}))
vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function renderInput(onSubmit = vi.fn()) {
  const utils = render(
    <PlaygroundInput
      groups={[]}
      groupValue='default'
      models={[]}
      modelValue='gpt-4o'
      onGroupChange={() => {}}
      onModelChange={() => {}}
      onSubmit={onSubmit}
    />
  )
  const textarea = screen.getByPlaceholderText('Ask anything')
  return { ...utils, onSubmit, textarea }
}

function imagePasteEvent(file: File) {
  return {
    clipboardData: {
      items: [{ type: file.type, getAsFile: () => file }],
      files: [],
    },
  }
}

beforeEach(() => {
  uploadMock.mockReset()
  toastMock.error.mockReset()
  toastMock.info.mockReset()
  toastMock.success.mockReset()
  // jsdom does not implement matchMedia (needed by model/group selector)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('PlaygroundInput paste-to-upload', () => {
  it('uploads an image pasted into the input', async () => {
    uploadMock.mockResolvedValue('https://cdn.example/pasted.png')
    const { textarea } = renderInput()

    const file = new File(['pngdata'], 'pasted.png', { type: 'image/png' })
    fireEvent.paste(textarea, imagePasteEvent(file))

    // the upload starts once FileReader produced the preview (async)
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1))
    expect(uploadMock).toHaveBeenCalledWith(file)
  })

  it('shows a loading indicator while the upload is in flight', async () => {
    let resolveUpload!: (url: string) => void
    uploadMock.mockImplementation(
      () => new Promise((resolve) => (resolveUpload = resolve))
    )
    const { textarea } = renderInput()

    fireEvent.paste(
      textarea,
      imagePasteEvent(new File(['x'], 'a.png', { type: 'image/png' }))
    )

    await screen.findByText('Uploading')

    // resolve to keep state consistent for teardown
    resolveUpload('https://cdn.example/a.png')
    await screen.findByAltText(/a\.png/)
  })

  it('submits the uploaded HTTP URL with the message', async () => {
    uploadMock.mockResolvedValue('https://cdn.example/pasted.png')
    const { textarea, onSubmit } = renderInput()

    fireEvent.paste(
      textarea,
      imagePasteEvent(new File(['x'], 'p.png', { type: 'image/png' }))
    )

    // wait until the thumbnail exists and the upload settled (spinner gone)
    await screen.findByAltText('p.png')
    await waitFor(() => expect(screen.queryByText('Uploading')).toBeNull())

    fireEvent.change(textarea, { target: { value: 'describe this' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('describe this', [
        'https://cdn.example/pasted.png',
      ])
    )
  })

  it('clears the attachment previews after sending', async () => {
    uploadMock.mockResolvedValue('https://cdn.example/pasted.png')
    const { textarea, onSubmit } = renderInput()

    fireEvent.paste(
      textarea,
      imagePasteEvent(new File(['x'], 'p.png', { type: 'image/png' }))
    )
    await screen.findByAltText('p.png')
    await waitFor(() => expect(screen.queryByText('Uploading')).toBeNull())

    fireEvent.change(textarea, { target: { value: 'with image' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('with image', [
        'https://cdn.example/pasted.png',
      ])
    )
    // thumbnails are gone once the message is on its way
    expect(screen.queryByAltText('p.png')).toBeNull()
  })

  it('removes the attachment when the delete button is clicked', async () => {
    uploadMock.mockResolvedValue('https://cdn.example/pasted.png')
    const { textarea, onSubmit } = renderInput()

    fireEvent.paste(
      textarea,
      imagePasteEvent(new File(['x'], 'p.png', { type: 'image/png' }))
    )
    await screen.findByAltText('p.png')
    await waitFor(() => expect(screen.queryByText('Uploading')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()

    fireEvent.change(textarea, { target: { value: 'no images now' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('no images now', undefined)
    )
  })

  it('does not upload when the paste contains no image', () => {
    const { textarea } = renderInput()

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ type: 'text/plain', getAsFile: () => null }],
        files: [],
      },
    })

    expect(uploadMock).not.toHaveBeenCalled()
  })
})

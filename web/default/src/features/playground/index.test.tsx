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
// Vitest + jsdom. Renders the REAL <Playground /> (chat + input + handler
// wiring) with mocked API endpoints, and reproduces the reported bug:
// a pasted image must show inside the user message bubble after sending.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './index'

const {
  getUserModelsMock,
  getUserGroupsMock,
  uploadImageMock,
  sendPlaygroundRequestMock,
  sendChatCompletionMock,
} = vi.hoisted(() => ({
  getUserModelsMock: vi.fn(),
  getUserGroupsMock: vi.fn(),
  uploadImageMock: vi.fn(),
  sendPlaygroundRequestMock: vi.fn(),
  sendChatCompletionMock: vi.fn(),
}))

vi.mock('./api', () => ({
  getUserModels: (...args: unknown[]) => getUserModelsMock(...args),
  getUserGroups: (...args: unknown[]) => getUserGroupsMock(...args),
  uploadImage: (...args: unknown[]) => uploadImageMock(...args),
  sendPlaygroundRequest: (...args: unknown[]) =>
    sendPlaygroundRequestMock(...args),
  sendChatCompletion: (...args: unknown[]) => sendChatCompletionMock(...args),
  sendAudioSpeech: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// jsdom lacks matchMedia (model/group selector), ResizeObserver
// (conversation scroll container) and Element.getAnimations (base-ui
// scroll-area schedules a deferred animation check after unmount).
beforeEach(() => {
  localStorage.clear()
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => []
  }
  getUserModelsMock.mockReset()
  getUserGroupsMock.mockReset()
  uploadImageMock.mockReset()
  sendPlaygroundRequestMock.mockReset()
  sendChatCompletionMock.mockReset()
  getUserGroupsMock.mockResolvedValue([
    { label: 'default', value: 'default', ratio: 1 },
  ])
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

function presetConfig(model: string) {
  localStorage.setItem(
    'playground_config',
    JSON.stringify({ model, group: 'default', stream: false })
  )
}

function renderPlayground() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Playground />
    </QueryClientProvider>
  )
}

function persistedMessages(): Array<{
  from: string
  versions: Array<{ content: unknown }>
}> {
  const raw = localStorage.getItem('playground_messages')
  expect(raw).not.toBeNull()
  return JSON.parse(raw!)
}

function imagePasteEvent(file: File) {
  return {
    clipboardData: {
      items: [{ type: file.type, getAsFile: () => file }],
      files: [],
    },
  }
}

describe('Playground sends a pasted image with the user message', () => {
  it('shows the pasted image inside the user message bubble after sending', async () => {
    presetConfig('seedream-4.0')
    getUserModelsMock.mockResolvedValue([
      {
        label: 'seedream-4.0',
        value: 'seedream-4.0',
        endpoints: ['image-generation'],
      },
    ])
    uploadImageMock.mockResolvedValue('https://cdn.example/pasted.png')
    sendPlaygroundRequestMock.mockResolvedValue({
      data: [{ url: 'https://cdn.example/generated.png' }],
    })

    renderPlayground()
    const textarea = await screen.findByPlaceholderText('Ask anything')

    // paste + wait for the upload to settle
    fireEvent.paste(
      textarea,
      imagePasteEvent(new File(['x'], 'pasted.png', { type: 'image/png' }))
    )
    await screen.findByAltText('pasted.png')
    await waitFor(() => expect(screen.queryByText('Uploading')).toBeNull())

    fireEvent.change(textarea, { target: { value: 'edit this image' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    // the user message content is persisted as structured content parts
    await waitFor(() => {
      const messages = persistedMessages()
      const userMessage = messages.find((m) => m.from === 'user')
      expect(userMessage).toBeDefined()
      const content = userMessage!.versions[0].content
      expect(Array.isArray(content)).toBe(true)
      expect(content).toEqual([
        { type: 'text', text: 'edit this image' },
        {
          type: 'image_url',
          image_url: { url: 'https://cdn.example/pasted.png' },
        },
      ])
    })

    // ...and the pasted image is visible in the chat (the reported bug)
    await waitFor(() => {
      const images = screen.getAllByRole('img') as HTMLImageElement[]
      expect(
        images.some((img) => img.src === 'https://cdn.example/pasted.png')
      ).toBe(true)
    })

    // no regression: the upstream payload still receives the image URL
    await waitFor(() => expect(sendPlaygroundRequestMock).toHaveBeenCalled())
    const [endpoint, payload] = sendPlaygroundRequestMock.mock.calls[0]
    expect(endpoint).toBe('image-generation')
    expect(payload.image).toBe('https://cdn.example/pasted.png')
    expect(payload).not.toHaveProperty('size')
  })
})

describe('Playground text-only message keeps plain string content', () => {
  it('persists string content for a message without images', async () => {
    presetConfig('gpt-4o')
    getUserModelsMock.mockResolvedValue([
      { label: 'gpt-4o', value: 'gpt-4o', endpoints: ['openai'] },
    ])
    sendChatCompletionMock.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'pong' } }],
    })

    renderPlayground()
    const textarea = await screen.findByPlaceholderText('Ask anything')

    fireEvent.change(textarea, { target: { value: 'just text' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await waitFor(() => {
      const messages = persistedMessages()
      const userMessage = messages.find((m) => m.from === 'user')
      expect(userMessage!.versions[0].content).toBe('just text')
    })
    expect(screen.queryByRole('img')).toBeNull()
  })
})

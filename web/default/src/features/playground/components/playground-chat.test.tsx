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
// Vitest + jsdom. Renders the REAL PlaygroundChat with real message-image /
// task-result-hint / message-audio components. Only the markdown <Response>
// renderer is stubbed (Streamdown/shiki are unrelated to these behaviors).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import type { ContentPart, Message } from '../types'
import { PlaygroundChat } from './playground-chat'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ai-elements/response', () => ({
  Response: ({ children }: { children?: string }) => (
    <div data-testid='markdown-response'>{children}</div>
  ),
}))

// jsdom has no ResizeObserver (needed by the Conversation scroll container)
beforeEach(() => {
  useAuthStore.getState().auth.setUser(null)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

function makeMessage(overrides: Partial<Message> & { key: string }): Message {
  return {
    from: 'assistant',
    versions: [{ id: 'v1', content: '' }],
    status: 'complete',
    ...overrides,
  }
}

describe('PlaygroundChat image rendering', () => {
  it('renders <img> for image_url content parts', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'here you go' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/a.png' } },
    ]
    render(
      <PlaygroundChat
        messages={[
          makeMessage({ key: 'm1', versions: [{ id: 'v1', content: parts }] }),
        ]}
      />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://cdn.example/a.png')
  })

  it('renders <img> for markdown image syntax in string content', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm2',
            versions: [
              { id: 'v1', content: '![生成图片](https://cdn.example/gen.png)' },
            ],
          }),
        ]}
      />
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/gen.png'
    )
  })

  it('does not render images for plain text messages', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm3',
            versions: [{ id: 'v1', content: 'just plain text' }],
          }),
        ]}
      />
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('just plain text')).toBeInTheDocument()
  })

  it('shows a fallback when the image fails to load', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm4',
            versions: [
              { id: 'v1', content: '![x](https://broken.example/x.png)' },
            ],
          }),
        ]}
      />
    )
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).toBeNull()
    expect(
      screen.getByText(
        /Image failed to load.*https:\/\/broken\.example\/x\.png/
      )
    ).toBeInTheDocument()
  })

  it('opens an enlarged preview dialog when the image is clicked', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm5',
            versions: [
              { id: 'v1', content: '![x](https://cdn.example/big.png)' },
            ],
          }),
        ]}
      />
    )
    fireEvent.click(screen.getByRole('img'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/big.png'
    )
  })
})

describe('PlaygroundChat task submission hint', () => {
  it('renders the task id and a link to the task logs page', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm6',
            taskInfo: { taskId: 'task-xyz-789' },
            versions: [
              {
                id: 'v1',
                content:
                  '✅ Task submitted, task ID: task-xyz-789\n\nGo to Task Logs to check progress and results.\n/usage-logs/task',
              },
            ],
          }),
        ]}
      />
    )
    expect(screen.getByText('task-xyz-789')).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/usage-logs/task')
  })
})

describe('PlaygroundChat audio rendering', () => {
  it('renders an <audio> player for TTS results', () => {
    const { container } = render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'm7',
            audioUrl: 'data:audio/mpeg;base64,//uQx',
            versions: [{ id: 'v1', content: 'Voice has been generated' }],
          }),
        ]}
      />
    )
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio).toHaveAttribute('src', 'data:audio/mpeg;base64,//uQx')
  })
})

describe('PlaygroundChat user/assistant distinction', () => {
  it('marks user messages is-user, right-aligned, with the user avatar', () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'xinuser',
      role: 1,
    })
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'u1',
            from: 'user',
            versions: [{ id: 'v1', content: 'hello there' }],
          }),
        ]}
      />
    )
    const root = document.querySelector('.is-user')
    expect(root!.className).toContain('justify-end')
    expect(root!.className.split(/\s+/)).not.toContain('justify-start')
    // avatar fallback shows the first two letters of the username
    expect(screen.getByText('xi')).toBeInTheDocument()
  })

  it('falls back to a neutral name when no user is signed in', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'u2',
            from: 'user',
            versions: [{ id: 'v1', content: 'anon hello' }],
          }),
        ]}
      />
    )
    expect(screen.getByText('Me')).toBeInTheDocument()
  })

  it('marks assistant messages is-assistant, left-aligned, with an Assistant avatar', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'a1',
            versions: [{ id: 'v1', content: 'hi, how can I help?' }],
          }),
        ]}
      />
    )
    const root = document.querySelector('.is-assistant')
    expect(root).not.toBeNull()
    expect(root!.className).toContain('justify-start')
    // the assistant row must be a normal (non-reversed) flex row, otherwise
    // justify-start lands on the visual right side
    const classes = root!.className.split(/\s+/)
    expect(classes).toContain('flex-row')
    expect(classes).not.toContain('flex-row-reverse')
    // avatar fallback shows the first two letters of 'Assistant'
    expect(screen.getByText('As')).toBeInTheDocument()
  })

  it('orders user DOM children [content, avatar] and assistant [avatar, content]', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'u5',
            from: 'user',
            versions: [{ id: 'v1', content: 'user ordering' }],
          }),
          makeMessage({
            key: 'a5',
            versions: [{ id: 'v1', content: 'assistant ordering' }],
          }),
        ]}
      />
    )

    const userChildren = Array.from(
      document.querySelector('.is-user')!.children
    )
    expect(
      userChildren[userChildren.length - 1].getAttribute('data-slot')
    ).toBe('avatar')
    expect(userChildren[0].className).toContain('max-w-[80%]')

    const assistantChildren = Array.from(
      document.querySelector('.is-assistant')!.children
    )
    expect(assistantChildren[0].getAttribute('data-slot')).toBe('avatar')
    expect(assistantChildren[assistantChildren.length - 1].className).toContain(
      'max-w-[80%]'
    )
  })

  it('renders primary background for user bubbles and secondary for assistant bubbles', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'u3',
            from: 'user',
            versions: [{ id: 'v1', content: 'styled user text' }],
          }),
          makeMessage({
            key: 'a3',
            versions: [{ id: 'v1', content: 'styled assistant text' }],
          }),
        ]}
      />
    )
    const userRoot = document.querySelector('.is-user')
    const assistantRoot = document.querySelector('.is-assistant')
    expect(
      userRoot!.querySelector('[class*="group-[.is-user]:bg-primary"]')
    ).not.toBeNull()
    expect(
      assistantRoot!.querySelector(
        '[class*="group-[.is-assistant]:bg-secondary"]'
      )
    ).not.toBeNull()
  })

  it('keeps both roles within 80% of the row width', () => {
    render(
      <PlaygroundChat
        messages={[
          makeMessage({
            key: 'u4',
            from: 'user',
            versions: [{ id: 'v1', content: 'width limited' }],
          }),
          makeMessage({
            key: 'a4',
            versions: [{ id: 'v1', content: 'assistant width limited' }],
          }),
        ]}
      />
    )
    const userRoot = document.querySelector('.is-user')
    const assistantRoot = document.querySelector('.is-assistant')
    expect(userRoot!.querySelector('[class*="max-w-[80%]"]')).not.toBeNull()
    expect(
      assistantRoot!.querySelector('[class*="max-w-[80%]"]')
    ).not.toBeNull()
  })
})

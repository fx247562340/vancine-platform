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
// Vitest + jsdom + renderHook. Exercises the REAL useChatHandler routing and
// message finalization; the API layer, toast, analytics and i18n are mocked.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../constants'
import { createLoadingAssistantMessage, createUserMessage } from '../lib'
import type { Message, ModelOption, PlaygroundConfig } from '../types'
import { useChatHandler } from './use-chat-handler'

const {
  sendChatCompletionMock,
  sendPlaygroundRequestMock,
  sendAudioSpeechMock,
  toastMock,
} = vi.hoisted(() => ({
  sendChatCompletionMock: vi.fn(),
  sendPlaygroundRequestMock: vi.fn(),
  sendAudioSpeechMock: vi.fn(),
  toastMock: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

vi.mock('../api', () => ({
  sendChatCompletion: (...args: unknown[]) => sendChatCompletionMock(...args),
  sendPlaygroundRequest: (...args: unknown[]) =>
    sendPlaygroundRequestMock(...args),
  sendAudioSpeech: (...args: unknown[]) => sendAudioSpeechMock(...args),
}))
vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/api', () => ({ getCommonHeaders: () => ({}) }))

interface SetupOptions {
  config?: Partial<PlaygroundConfig>
  models?: ModelOption[]
}

function setup(options: SetupOptions = {}) {
  const config: PlaygroundConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
  }
  const models = options.models ?? [
    { label: config.model, value: config.model, endpoints: ['openai'] },
  ]

  let messages: Message[] = [
    createUserMessage('make me a video of a cat'),
    createLoadingAssistantMessage(),
  ]
  const onMessageUpdate = (updater: (prev: Message[]) => Message[]) => {
    messages = updater(messages)
  }

  const { result } = renderHook(() =>
    useChatHandler({
      config,
      parameterEnabled: DEFAULT_PARAMETER_ENABLED,
      models,
      onMessageUpdate,
    })
  )

  return {
    result,
    getMessages: () => messages,
    lastMessage: () => messages[messages.length - 1],
  }
}

beforeEach(() => {
  sendChatCompletionMock.mockReset()
  sendPlaygroundRequestMock.mockReset()
  sendAudioSpeechMock.mockReset()
  toastMock.error.mockReset()
})

describe('useChatHandler async task submission (no polling)', () => {
  it('appends a hint message with the task id and task logs link on success', async () => {
    sendPlaygroundRequestMock.mockResolvedValue({ task_id: 'task-123' })
    const { result, lastMessage } = setup({
      config: { model: 'seedance-2.0' },
      models: [
        {
          label: 'seedance-2.0',
          value: 'seedance-2.0',
          endpoints: ['openai-video'],
        },
      ],
    })

    await act(async () => {
      result.current.sendChat([
        createUserMessage('make me a video of a cat'),
        createLoadingAssistantMessage(),
      ])
    })

    await waitFor(() => expect(lastMessage().status).toBe('complete'))
    const content = lastMessage().versions[0].content
    expect(typeof content).toBe('string')
    expect(content).toContain('task-123')
    expect(content).toContain('/usage-logs/task')
    expect(lastMessage().taskInfo).toEqual({ taskId: 'task-123' })
    // no polling: the API was called exactly once
    expect(sendPlaygroundRequestMock).toHaveBeenCalledTimes(1)
  })

  it('shows an error message when the task submission fails', async () => {
    sendPlaygroundRequestMock.mockRejectedValue({
      response: { data: { message: 'quota exceeded' } },
    })
    const { result, lastMessage } = setup({
      config: { model: 'seedance-2.0' },
      models: [
        {
          label: 'seedance-2.0',
          value: 'seedance-2.0',
          endpoints: ['openai-video'],
        },
      ],
    })

    await act(async () => {
      result.current.sendChat([
        createUserMessage('make me a video of a cat'),
        createLoadingAssistantMessage(),
      ])
    })

    await waitFor(() => expect(lastMessage().status).toBe('error'))
    expect(lastMessage().versions[0].content).toContain('quota exceeded')
    expect(toastMock.error).toHaveBeenCalled()
  })
})

describe('useChatHandler TTS routing', () => {
  it('sends the audio speech payload with voice and stores a playable audio url', async () => {
    sendAudioSpeechMock.mockResolvedValue(
      new Blob(['mp3bytes'], { type: 'audio/mpeg' })
    )
    const { result, lastMessage } = setup({
      config: { model: 'doubao-tts2.0', voice: 'zh_female_vv_uranus_bigtts' },
    })

    await act(async () => {
      result.current.sendChat([
        createUserMessage('speak this text'),
        createLoadingAssistantMessage(),
      ])
    })

    expect(sendAudioSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'doubao-tts2.0',
        input: 'speak this text',
        voice: 'zh_female_vv_uranus_bigtts',
      })
    )

    await waitFor(() => expect(lastMessage().status).toBe('complete'))
    expect(lastMessage().audioUrl).toMatch(/^data:audio/)
  })

  it('routes non-audio models away from the audio endpoint (regression)', async () => {
    sendChatCompletionMock.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'pong' } }],
    })
    const { result, lastMessage } = setup({
      config: { model: 'gpt-4o', stream: false },
    })

    await act(async () => {
      result.current.sendChat([
        createUserMessage('ping'),
        createLoadingAssistantMessage(),
      ])
    })

    await waitFor(() => expect(lastMessage().status).toBe('complete'))
    expect(sendAudioSpeechMock).not.toHaveBeenCalled()
    expect(lastMessage().versions[0].content).toBe('pong')
  })
})

describe('useChatHandler image generation with pasted images', () => {
  it('attaches pending images to the image generation payload', async () => {
    sendPlaygroundRequestMock.mockResolvedValue({
      data: [{ url: 'https://cdn.example/out.png' }],
    })
    const { result, lastMessage } = setup({
      config: { model: 'seedream-4.0' },
      models: [
        {
          label: 'seedream-4.0',
          value: 'seedream-4.0',
          endpoints: ['image-generation'],
        },
      ],
    })

    act(() => {
      result.current.setPendingImages(['https://cdn.example/ref.png'])
    })

    await act(async () => {
      result.current.sendChat([
        createUserMessage('edit this image'),
        createLoadingAssistantMessage(),
      ])
    })

    await waitFor(() => expect(lastMessage().status).toBe('complete'))
    const [endpoint, payload] = sendPlaygroundRequestMock.mock.calls[0]
    expect(endpoint).toBe('image-generation')
    expect(payload.image).toBe('https://cdn.example/ref.png')
    expect(lastMessage().versions[0].content).toContain(
      'https://cdn.example/out.png'
    )
  })
})

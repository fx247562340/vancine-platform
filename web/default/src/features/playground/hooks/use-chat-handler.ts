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
import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { sendChatCompletion, sendPlaygroundRequest, getApiPathForEndpoint } from '../api'
import { MESSAGE_STATUS, ERROR_MESSAGES } from '../constants'
import {
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  processStreamingContent,
  finalizeMessage,
} from '../lib'
import type { Message, PlaygroundConfig, ParameterEnabled, ModelOption } from '../types'
import { useStreamRequest } from './use-stream-request'

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  models: ModelOption[]
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void
}

/**
 * 获取模型的主 endpoint 类型
 */
function getPrimaryEndpoint(model: string, models: ModelOption[]): string {
  const found = models.find((m) => m.value === model)
  if (found?.endpoints?.length) {
    return found.endpoints[0]
  }
  return 'openai'
}

/**
 * 判断 endpoint 类型是否是 task 类（异步任务，非 chat 流式）
 */
function isTaskEndpoint(endpointType: string): boolean {
  return ['openai-video', '3d-generation'].includes(endpointType)
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  parameterEnabled,
  models,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const pendingImagesRef = useRef<string[]>([])

  // 当前模型的 endpoint 类型
  const endpointType = useMemo(
    () => getPrimaryEndpoint(config.model, models),
    [config.model, models]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (type: 'reasoning' | 'content', chunk: string) => {
      onMessageUpdate((prev) =>
        updateLastAssistantMessage(prev, (message) => {
          if (message.status === MESSAGE_STATUS.ERROR) return message

          if (type === 'reasoning') {
            // Direct API reasoning_content
            return {
              ...message,
              reasoning: {
                content: (message.reasoning?.content || '') + chunk,
                duration: 0,
              },
              isReasoningStreaming: true,
              status: MESSAGE_STATUS.STREAMING,
            }
          }

          // Content streaming: handle <think> tags
          return {
            ...processStreamingContent(message, chunk),
            status: MESSAGE_STATUS.STREAMING,
          }
        })
      )
    },
    [onMessageUpdate]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(() => {
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) =>
        message.status === MESSAGE_STATUS.COMPLETE ||
        message.status === MESSAGE_STATUS.ERROR
          ? message
          : { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
      )
    )
  }, [onMessageUpdate])

  // Handle stream error
  const handleStreamError = useCallback(
    (error: string, errorCode?: string) => {
      toast.error(error)
      onMessageUpdate((prev) =>
        updateAssistantMessageWithError(prev, error, errorCode)
      )
    },
    [onMessageUpdate]
  )

  // 发送图片生成请求
  const sendImageRequest = useCallback(
    async (messages: Message[]) => {
      // 取最后一条用户消息作为 prompt
      const lastUserMsg = [...messages].reverse().find((m) => m.from === 'user')
      const prompt = lastUserMsg?.versions?.[0]?.content || ''

      const payload = {
        model: config.model,
        group: config.group,
        prompt,
        size: '2K',
        response_format: 'url',
      }

      try {
        const response = await sendPlaygroundRequest('image-generation', payload) as {
          data?: Array<{ url?: string; b64_json?: string }>
          error?: { message?: string }
        }

        if (response?.data?.[0]?.url) {
          const imageUrl = response.data[0].url
          onMessageUpdate((prev) =>
            updateLastAssistantMessage(prev, (message) => ({
              ...finalizeMessage({
                ...message,
                versions: [{
                  ...message.versions[0],
                  content: `![生成图片](${imageUrl})`,
                }],
              }),
              status: MESSAGE_STATUS.COMPLETE,
            }))
          )
        } else if (response?.error?.message) {
          handleStreamError(response.error.message)
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string }
        handleStreamError(
          err?.response?.data?.message || err?.message || ERROR_MESSAGES.API_REQUEST_ERROR
        )
      }
    },
    [config, onMessageUpdate, handleStreamError]
  )

  // 发送任务类请求（视频/3D）
  const sendTaskRequest = useCallback(
    async (messages: Message[]) => {
      const lastUserMsg = [...messages].reverse().find((m) => m.from === 'user')
      const prompt = lastUserMsg?.versions?.[0]?.content || ''

      const apiPath = getApiPathForEndpoint(endpointType)
      const payload: Record<string, unknown> = {
        model: config.model,
        group: config.group,
        prompt,
      }
      // Include images if pending (for 3D generation)
      if (pendingImagesRef.current.length > 0) {
        payload.images = pendingImagesRef.current
        pendingImagesRef.current = []
      }

      try {
        const response = await sendPlaygroundRequest(endpointType, payload) as {
          task_id?: string
          id?: string
          error?: { message?: string }
        }

        const taskId = response?.task_id || response?.id
        if (taskId) {
          onMessageUpdate((prev) =>
            updateLastAssistantMessage(prev, (message) => ({
              ...finalizeMessage({
                ...message,
                versions: [{
                  ...message.versions[0],
                  content: `任务已提交，ID: ${taskId}\n\n请在任务管理中查看进度。`,
                }],
              }),
              status: MESSAGE_STATUS.COMPLETE,
            }))
          )
        } else if (response?.error?.message) {
          handleStreamError(response.error.message)
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string }
        handleStreamError(
          err?.response?.data?.message || err?.message || ERROR_MESSAGES.API_REQUEST_ERROR
        )
      }
    },
    [config, endpointType, onMessageUpdate, handleStreamError]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      sendStreamRequest(
        payload,
        handleStreamUpdate,
        handleStreamComplete,
        handleStreamError
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )

      try {
        const response = await sendChatCompletion(payload)
        const choice = response.choices?.[0]
        if (!choice) return

        onMessageUpdate((prev) =>
          updateLastAssistantMessage(prev, (message) => ({
            ...finalizeMessage(
              {
                ...message,
                versions: [
                  {
                    ...message.versions[0],
                    content: choice.message?.content || '',
                  },
                ],
              },
              choice.message?.reasoning_content
            ),
            status: MESSAGE_STATUS.COMPLETE,
          }))
        )
      } catch (error: unknown) {
        const err = error as {
          response?: {
            data?: { message?: string; error?: { code?: string } }
          }
          message?: string
        }
        handleStreamError(
          err?.response?.data?.message ||
            err?.message ||
            ERROR_MESSAGES.API_REQUEST_ERROR,
          err?.response?.data?.error?.code || undefined
        )
      }
    },
    [config, parameterEnabled, onMessageUpdate, handleStreamError]
  )

  // Send chat request (route by endpoint type)
  const sendChat = useCallback(
    (messages: Message[]) => {
      if (endpointType === 'image-generation') {
        sendImageRequest(messages)
      } else if (isTaskEndpoint(endpointType)) {
        sendTaskRequest(messages)
      } else if (config.stream) {
        sendStreamingChat(messages)
      } else {
        sendNonStreamingChat(messages)
      }
    },
    [endpointType, config.stream, sendImageRequest, sendTaskRequest, sendStreamingChat, sendNonStreamingChat]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    stopStream()
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) =>
        message.status === MESSAGE_STATUS.LOADING ||
        message.status === MESSAGE_STATUS.STREAMING
          ? { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
          : message
      )
    )
  }, [stopStream, onMessageUpdate])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming,
    setPendingImages: (imgs: string[]) => {
      pendingImagesRef.current = imgs
    },
  }
}

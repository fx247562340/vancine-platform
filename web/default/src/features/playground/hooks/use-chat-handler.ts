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
import { trackEvent } from '@/lib/analytics'
import { createPlaygroundAnalytics } from '@/lib/playground-analytics'
import { sendChatCompletion, sendPlaygroundRequest } from '../api'
import { MESSAGE_STATUS, ERROR_MESSAGES } from '../constants'
import {
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  processStreamingContent,
  finalizeMessage,
} from '../lib'
import type {
  Message,
  PlaygroundConfig,
  ParameterEnabled,
  ModelOption,
} from '../types'
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

  // One analytics tracker instance per hook. Each request then gets its own
  // isolated handle (via analytics.start) that its async callbacks close over,
  // so concurrent requests never cross-contaminate.
  const analytics = useMemo(
    () => createPlaygroundAnalytics(trackEvent),
    [],
  )

  // The handle of the most recently started, still-on-the-wire request. Used
  // by stopGeneration to cancel in flight. Each send function replaces it.
  const latestRequestRef = useRef<ReturnType<typeof analytics.start> | null>(
    null,
  )

  // 当前模型的 endpoint 类型
  const endpointType = useMemo(
    () => getPrimaryEndpoint(config.model, models),
    [config.model, models]
  )

  // 本地辅助：为一新请求开启跟踪并注册为当前请求。返回该请求专属 handle，
  // 所有异步回调闭包都应引用此 handle。
  function trackRequestHandle(model: string, epType: string) {
    const handle = analytics.start(model, epType)
    latestRequestRef.current = handle
    return handle
  }

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

  // 发送图片生成请求。该 handle 在整个请求生命周期中被持有（包括可能耗时较长的
  // 任务轮询），因此即使在异步完成时也能准确归因。
  const sendImageRequest = useCallback(
    async (messages: Message[]) => {
      const handle = trackRequestHandle(config.model, 'image-generation')

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
        const response = (await sendPlaygroundRequest(
          'image-generation',
          payload
        )) as {
          data?: Array<{ url?: string; b64_json?: string }>
          error?: { message?: string }
        }

        if (response?.data?.[0]?.url) {
          const imageUrl = response.data[0].url
          onMessageUpdate((prev) =>
            updateLastAssistantMessage(prev, (message) => ({
              ...finalizeMessage({
                ...message,
                versions: [
                  {
                    ...message.versions[0],
                    content: `![生成图片](${imageUrl})`,
                  },
                ],
              }),
              status: MESSAGE_STATUS.COMPLETE,
            }))
          )
          handle.success() // sync image URL obtained
        } else if (response?.error?.message) {
          handleStreamError(response.error.message)
          handle.fail()
        }
      } catch (error: unknown) {
        const err = error as {
          response?: { data?: { message?: string } }
          message?: string
        }
        handleStreamError(
          err?.response?.data?.message ||
            err?.message ||
            ERROR_MESSAGES.API_REQUEST_ERROR
        )
        handle.fail()
      }
    },
    [config, onMessageUpdate, handleStreamError]
  )

  // 发送任务类请求（视频/3D）。success = 后端接受并返回有效 task_id。这不等于
  // 最终生成完成，仅仅是任务受理成功。
  const sendTaskRequest = useCallback(
    async (messages: Message[]) => {
      const handle = trackRequestHandle(
        config.model,
        isTaskEndpoint(endpointType)
          ? endpointType
          : 'openai-video',
      )

      const lastUserMsg = [...messages].reverse().find((m) => m.from === 'user')
      const prompt = lastUserMsg?.versions?.[0]?.content || ''

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
        const response = (await sendPlaygroundRequest(
          endpointType,
          payload
        )) as {
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
                versions: [
                  {
                    ...message.versions[0],
                    content: `任务已提交，ID: ${taskId}\n\n请在任务管理中查看进度。`,
                  },
                ],
              }),
              status: MESSAGE_STATUS.COMPLETE,
            }))
          )
          handle.success() // backend accepted the task (valid task_id)
        } else if (response?.error?.message) {
          handleStreamError(response.error.message)
          handle.fail()
        }
      } catch (error: unknown) {
        const err = error as {
          response?: { data?: { message?: string } }
          message?: string
        }
        handleStreamError(
          err?.response?.data?.message ||
            err?.message ||
            ERROR_MESSAGES.API_REQUEST_ERROR
        )
        handle.fail()
      }
    },
    [config, endpointType, onMessageUpdate, handleStreamError]
  )

  // Send streaming chat request. The handle is created here and threaded into
  // stream-success and stream-error paths via a wrapping callback, so the
  // exact request that was dispatched is the one whose success is recorded.
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const handle = trackRequestHandle(config.model, 'openai')

      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      sendStreamRequest(
        payload,
        handleStreamUpdate,
        () => {
          // Stream received its normal completion signal ([DONE]).
          handle.success()
          onMessageUpdate((prev) =>
            updateLastAssistantMessage(prev, (message) =>
              message.status === MESSAGE_STATUS.COMPLETE ||
              message.status === MESSAGE_STATUS.ERROR
                ? message
                : { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
            )
          )
        },
        (error, errorCode) => {
          handle.fail()
          handleStreamError(error, errorCode)
        }
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      handleStreamUpdate,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[]) => {
      const handle = trackRequestHandle(config.model, 'openai')

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
        handle.success() // valid choice returned
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
        handle.fail()
      }
    },
    [config, parameterEnabled, onMessageUpdate, handleStreamError]
  )

  // Send chat request (route by endpoint type). Each branch creates its own
  // handle through trackRequestHandle, so 'started' is recorded exactly once per
  // real request, before the model is invoked.
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
    [
      config.stream,
      endpointType,
      sendImageRequest,
      sendTaskRequest,
      sendStreamingChat,
      sendNonStreamingChat,
    ]
  )

  // Cancel the latest in-flight request's analytics handle, so a racing
  // success callback (e.g. late [DONE]) does not get reported after a stop.
  const stopGeneration = useCallback(() => {
    const latest = latestRequestRef.current
    latestRequestRef.current = null
    latest?.cancel()
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

/*
Copyright (C) 2025 QuantumNous

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

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SSE } from 'sse.js';
import {
  API_ENDPOINTS,
  MESSAGE_STATUS,
  DEBUG_TABS,
} from '../../constants/playground.constants';
import {
  getUserIdFromLocalStorage,
  handleApiError,
  processThinkTags,
  processIncompleteThinkTags,
} from '../../helpers';
import { trackEvent } from '../../helpers/analytics';
import { createPlaygroundAnalytics } from '../../helpers/playground-analytics';

export const useApiRequest = (
  setMessage,
  setDebugData,
  setActiveDebugTab,
  sseSourceRef,
  saveMessages,
) => {
  const { t } = useTranslation();

  // One analytics tracker instance per hook (survives re-renders). Each
  // individual request then gets its own isolated handle via start(), so
  // concurrent requests never cross-contaminate. Only { model, endpoint_type }
  // are ever recorded — no prompt, messages, images, or files.
  const analytics = useRef(createPlaygroundAnalytics(trackEvent)).current;

  // The handle of the most recently started, still-on-the-wire request. Used
  // by onStopGenerator to cancel in flight. Each send function replaces it with
  // its own fresh handle.
  const latestRequestRef = useRef(null);

  /**
   * Begin tracking a request and register its handle as the current one. Returns
   * the per-request handle so the async callbacks running for this request can
   * close over it (and only it).
   */
  function trackRequestHandle(model, endpointType) {
    const handle = analytics.start(model, endpointType);
    latestRequestRef.current = handle;
    return handle;
  }

  // 处理消息自动关闭逻辑的公共函数
  const applyAutoCollapseLogic = useCallback(
    (message, isThinkingComplete = true) => {
      const shouldAutoCollapse =
        isThinkingComplete && !message.hasAutoCollapsed;
      return {
        isThinkingComplete,
        hasAutoCollapsed: shouldAutoCollapse || message.hasAutoCollapsed,
        isReasoningExpanded: shouldAutoCollapse
          ? false
          : message.isReasoningExpanded,
      };
    },
    [],
  );

  // 流式消息更新
  const streamMessageUpdate = useCallback(
    (textChunk, type) => {
      setMessage((prevMessage) => {
        const lastMessage = prevMessage[prevMessage.length - 1];
        if (!lastMessage) return prevMessage;
        if (lastMessage.role !== 'assistant') return prevMessage;
        if (lastMessage.status === MESSAGE_STATUS.ERROR) {
          return prevMessage;
        }

        if (
          lastMessage.status === MESSAGE_STATUS.LOADING ||
          lastMessage.status === MESSAGE_STATUS.INCOMPLETE
        ) {
          let newMessage = { ...lastMessage };

          if (type === 'reasoning') {
            newMessage = {
              ...newMessage,
              reasoningContent:
                (lastMessage.reasoningContent || '') + textChunk,
              status: MESSAGE_STATUS.INCOMPLETE,
              isThinkingComplete: false,
            };
          } else if (type === 'content') {
            const shouldCollapseReasoning =
              !lastMessage.content && lastMessage.reasoningContent;
            const newContent = (lastMessage.content || '') + textChunk;

            let shouldCollapseFromThinkTag = false;
            let thinkingCompleteFromTags = lastMessage.isThinkingComplete;

            if (
              lastMessage.isReasoningExpanded &&
              newContent.includes('</think>')
            ) {
              const thinkMatches = newContent.match(/<think>/g);
              const thinkCloseMatches = newContent.match(/<\/think>/g);
              if (
                thinkMatches &&
                thinkCloseMatches &&
                thinkCloseMatches.length >= thinkMatches.length
              ) {
                shouldCollapseFromThinkTag = true;
                thinkingCompleteFromTags = true; // think标签闭合也标记思考完成
              }
            }

            // 如果开始接收content内容，且之前有reasoning内容，或者think标签已闭合，则标记思考完成
            const isThinkingComplete =
              (lastMessage.reasoningContent &&
                !lastMessage.isThinkingComplete) ||
              thinkingCompleteFromTags;

            const autoCollapseState = applyAutoCollapseLogic(
              lastMessage,
              isThinkingComplete,
            );

            newMessage = {
              ...newMessage,
              content: newContent,
              status: MESSAGE_STATUS.INCOMPLETE,
              ...autoCollapseState,
            };
          }

          return [...prevMessage.slice(0, -1), newMessage];
        }

        return prevMessage;
      });
    },
    [setMessage, applyAutoCollapseLogic],
  );

  // UI-only: finalise the last assistant message to the given status. No
  // analytics here — success/fail are reported at the exact detection points
  // inside each send function via the per-request handle they close over.
  const completeMessage = useCallback(
    (status = MESSAGE_STATUS.COMPLETE) => {
      setMessage((prevMessage) => {
        const lastMessage = prevMessage[prevMessage.length - 1];
        if (
          lastMessage.status === MESSAGE_STATUS.COMPLETE ||
          lastMessage.status === MESSAGE_STATUS.ERROR
        ) {
          return prevMessage;
        }

        const autoCollapseState = applyAutoCollapseLogic(lastMessage, true);

        const updatedMessages = [
          ...prevMessage.slice(0, -1),
          {
            ...lastMessage,
            status: status,
            ...autoCollapseState,
          },
        ];

        // 在消息完成时保存，传入更新后的消息列表
        if (
          status === MESSAGE_STATUS.COMPLETE ||
          status === MESSAGE_STATUS.ERROR
        ) {
          setTimeout(() => saveMessages(updatedMessages), 0);
        }

        return updatedMessages;
      });
    },
    [setMessage, applyAutoCollapseLogic, saveMessages],
  );

  // 非流式请求
  const handleNonStreamRequest = useCallback(
    async (payload) => {
      const handle = trackRequestHandle(payload?.model, 'openai');
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        sseMessages: null, // 非流式请求清除 SSE 消息
        isStreaming: false,
      }));
      setActiveDebugTab(DEBUG_TABS.REQUEST);

      try {
        const response = await fetch(API_ENDPOINTS.CHAT_COMPLETIONS, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'New-Api-User': getUserIdFromLocalStorage(),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let errorBody = '';
          let parsedError = null;
          try {
            errorBody = await response.text();
            const errorJson = JSON.parse(errorBody);
            if (errorJson?.error) {
              parsedError = errorJson.error;
            }
          } catch (e) {
            if (!errorBody) {
              errorBody = '无法读取错误响应体';
            }
          }

          const errorInfo = handleApiError(
            new Error(
              `HTTP error! status: ${response.status}, body: ${errorBody}`,
            ),
            response,
          );

          setDebugData((prev) => ({
            ...prev,
            response: JSON.stringify(errorInfo, null, 2),
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          const err = new Error(
            parsedError?.message ||
              `HTTP error! status: ${response.status}, body: ${errorBody}`,
          );
          err.errorCode = parsedError?.code || null;
          err.errorType = parsedError?.type || null;
          throw err;
        }

        const data = await response.json();

        setDebugData((prev) => ({
          ...prev,
          response: JSON.stringify(data, null, 2),
        }));
        setActiveDebugTab(DEBUG_TABS.RESPONSE);

        if (data.choices?.[0]) {
          const choice = data.choices[0];
          // Non-stream chat returned a valid choice → request succeeded.
          handle.success();
          let content = choice.message?.content || '';
          let reasoningContent =
            choice.message?.reasoning_content ||
            choice.message?.reasoning ||
            '';

          const processed = processThinkTags(content, reasoningContent);

          setMessage((prevMessage) => {
            const newMessages = [...prevMessage];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage?.status === MESSAGE_STATUS.LOADING) {
              const autoCollapseState = applyAutoCollapseLogic(
                lastMessage,
                true,
              );

              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: processed.content,
                reasoningContent: processed.reasoningContent,
                status: MESSAGE_STATUS.COMPLETE,
                ...autoCollapseState,
              };
            }
            return newMessages;
          });
        }
      } catch (error) {
        console.error('Non-stream request error:', error);

        const errorInfo = handleApiError(error);
        setDebugData((prev) => ({
          ...prev,
          response: JSON.stringify(errorInfo, null, 2),
        }));
        setActiveDebugTab(DEBUG_TABS.RESPONSE);

        setMessage((prevMessage) => {
          const newMessages = [...prevMessage];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.status === MESSAGE_STATUS.LOADING) {
            const autoCollapseState = applyAutoCollapseLogic(lastMessage, true);

            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content: t('请求发生错误: ') + error.message,
              errorCode: error.errorCode || null,
              status: MESSAGE_STATUS.ERROR,
              ...autoCollapseState,
            };
          }
          return newMessages;
        });
        handle.fail();
      }
    },
    [setDebugData, setActiveDebugTab, setMessage, t, applyAutoCollapseLogic],
  );

  // SSE请求
  const handleSSE = useCallback(
    (payload) => {
      // Owned handle for this exact request; all async callbacks below close
      // over it. On [DONE] -> success(); any stream/parse error -> fail().
      const handle = trackRequestHandle(payload?.model, 'openai');
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        sseMessages: [], // 新增：存储 SSE 消息数组
        isStreaming: true, // 新增：标记流式状态
      }));
      setActiveDebugTab(DEBUG_TABS.REQUEST);

      const source = new SSE(API_ENDPOINTS.CHAT_COMPLETIONS, {
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        method: 'POST',
        payload: JSON.stringify(payload),
      });

      sseSourceRef.current = source;

      let responseData = '';
      let hasReceivedFirstResponse = false;
      let isStreamComplete = false; // 添加标志位跟踪流是否正常完成

      source.addEventListener('message', (e) => {
        if (e.data === '[DONE]') {
          isStreamComplete = true; // 标记流正常完成
          source.close();
          sseSourceRef.current = null;
          setDebugData((prev) => ({
            ...prev,
            response: responseData,
            sseMessages: [...(prev.sseMessages || []), '[DONE]'], // 添加 DONE 标记
            isStreaming: false,
          }));
          handle.success(); // stream completed normally
          completeMessage();
          return;
        }

        try {
          const payload = JSON.parse(e.data);
          responseData += e.data + '\n';

          if (!hasReceivedFirstResponse) {
            setActiveDebugTab(DEBUG_TABS.RESPONSE);
            hasReceivedFirstResponse = true;
          }

          // 新增：将 SSE 消息添加到数组
          setDebugData((prev) => ({
            ...prev,
            sseMessages: [...(prev.sseMessages || []), e.data],
          }));

          const delta = payload.choices?.[0]?.delta;
          if (delta) {
            if (delta.reasoning_content) {
              streamMessageUpdate(delta.reasoning_content, 'reasoning');
            }
            if (delta.reasoning) {
              streamMessageUpdate(delta.reasoning, 'reasoning');
            }
            if (delta.content) {
              streamMessageUpdate(delta.content, 'content');
            }
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
          const errorInfo = `解析错误: ${error.message}`;

          setDebugData((prev) => ({
            ...prev,
            response: responseData + `\n\nError: ${errorInfo}`,
            sseMessages: [...(prev.sseMessages || []), e.data], // 即使解析失败也保存原始数据
            isStreaming: false,
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          streamMessageUpdate(t('解析响应数据时发生错误'), 'content');
          handle.fail(); // malformed SSE frame
          completeMessage(MESSAGE_STATUS.ERROR);
        }
      });

      source.addEventListener('error', (e) => {
        // 只有在流没有正常完成且连接状态异常时才处理错误
        if (!isStreamComplete && source.readyState !== 2) {
          handle.fail(); // network / stream error
          console.error('SSE Error:', e);
          let errorMessage = e.data || t('请求发生错误');
          let errorCode = null;

          if (e.data) {
            try {
              const errorJson = JSON.parse(e.data);
              if (errorJson?.error) {
                errorMessage = errorJson.error.message || errorMessage;
                errorCode = errorJson.error.code || null;
              }
            } catch (_) {
              // not JSON, use raw data as error message
            }
          }

          const errorInfo = handleApiError(new Error(errorMessage));
          errorInfo.readyState = source.readyState;

          setDebugData((prev) => ({
            ...prev,
            response:
              responseData +
              '\n\nSSE Error:\n' +
              JSON.stringify(errorInfo, null, 2),
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          setMessage((prevMessage) => {
            const newMessages = [...prevMessage];
            const lastMessage = newMessages[newMessages.length - 1];
            if (
              lastMessage &&
              lastMessage.status !== MESSAGE_STATUS.COMPLETE &&
              lastMessage.status !== MESSAGE_STATUS.ERROR
            ) {
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: (lastMessage.content || '') + errorMessage,
                errorCode: errorCode,
                status: MESSAGE_STATUS.ERROR,
              };
            }
            return newMessages;
          });
          sseSourceRef.current = null;
          source.close();
        }
      });

      source.addEventListener('readystatechange', (e) => {
        // 检查 HTTP 状态错误，但避免与正常关闭重复处理
        if (
          e.readyState >= 2 &&
          source.status !== undefined &&
          source.status !== 200 &&
          !isStreamComplete
        ) {
          const errorInfo = handleApiError(new Error('HTTP状态错误'));
          errorInfo.status = source.status;
          errorInfo.readyState = source.readyState;

          setDebugData((prev) => ({
            ...prev,
            response:
              responseData +
              '\n\nHTTP Error:\n' +
              JSON.stringify(errorInfo, null, 2),
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          source.close();
          streamMessageUpdate(t('连接已断开'), 'content');
          handle.fail(); // HTTP readystate error
          completeMessage(MESSAGE_STATUS.ERROR);
        }
      });

      try {
        source.stream();
      } catch (error) {
        console.error('Failed to start SSE stream:', error);
        const errorInfo = handleApiError(error);

        setDebugData((prev) => ({
          ...prev,
          response: 'Stream启动失败:\n' + JSON.stringify(errorInfo, null, 2),
        }));
        setActiveDebugTab(DEBUG_TABS.RESPONSE);

        streamMessageUpdate(t('建立连接时发生错误'), 'content');
        handle.fail(); // could not even start the stream
        completeMessage(MESSAGE_STATUS.ERROR);
      }
    },
    [
      setDebugData,
      setActiveDebugTab,
      setMessage,
      streamMessageUpdate,
      completeMessage,
      t,
      applyAutoCollapseLogic,
    ],
  );

  const taskPollingTimerRef = useRef(null);

  // 查询任务状态。handle 是发起轮询的那个图片任务的专属 analytics 句柄；
  // 在轮询结束（最终成功或失败）时调用 success() 或 fail()，而不是由
  // completeMessage 处理。当未传入 handle 时不记录分析事件（允许无埋点的调用）。
  const pollTask = useCallback(
    (submitData, isImageTask = false, handle = null) => {
      taskPollingTimerRef.current = setInterval(async () => {
        try {
          const pollUrl = `${API_ENDPOINTS.TASKS}${submitData.taskId}`;
          const pollRes = await fetch(pollUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'New-Api-User': getUserIdFromLocalStorage(),
            },
          });
          if (!pollRes.ok) throw new Error(`HTTP ${pollRes.status}`);
          const res = await pollRes.json();

          const task = res.data;
          if (!task) throw new Error('未找到任务数据');

          const status = task.status;
          if (
            status &&
            status !== 'NOT_START' &&
            status !== 'SUBMITTED' &&
            status !== 'QUEUED' &&
            status !== 'IN_PROGRESS'
          ) {
            clearInterval(taskPollingTimerRef.current);
            taskPollingTimerRef.current = null;

            if (status === 'SUCCESS') {
              if (isImageTask) {
                const images = task.data || [];
                const imgContent = Array.isArray(images)
                  ? images
                      .map((img) => `![image](${img.url || img})`)
                      .join('\n')
                  : `任务已完成`;
                streamMessageUpdate(imgContent, 'content');
              } else {
                // 视频/3D等任务 — 优先用 result_url
                if (task.result_url) {
                  streamMessageUpdate(
                    `任务完成！\n\n${task.result_url}`,
                    'content',
                  );
                } else {
                  streamMessageUpdate(
                    '任务已完成，请在任务日志中查看详情',
                    'content',
                  );
                }
              }
              completeMessage(MESSAGE_STATUS.COMPLETE);
              if (handle) handle.success(); // async task reached final SUCCESS
            } else {
              // 失败
              const failReason = task.fail_reason || '任务失败';
              streamMessageUpdate(`任务失败: ${failReason}`, 'content');
              completeMessage(MESSAGE_STATUS.ERROR);
              if (handle) handle.fail();
            }
          }
        } catch (err) {
          clearInterval(taskPollingTimerRef.current);
          taskPollingTimerRef.current = null;
          streamMessageUpdate(`查询任务状态失败: ${err.message}`, 'content');
          completeMessage(MESSAGE_STATUS.ERROR);
          if (handle) handle.fail();
        }
      }, 3000);
    },
    [streamMessageUpdate, completeMessage],
  );

  // 发送图片生成请求
  const sendImageRequest = useCallback(
    (payload) => {
      const handle = trackRequestHandle(payload?.model, 'image-generation');
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        isStreaming: false,
      }));
      setActiveDebugTab(DEBUG_TABS.REQUEST);

      fetch(API_ENDPOINTS.IMAGES_GENERATIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            return response.text().then((text) => {
              throw new Error(`HTTP ${response.status}: ${text}`);
            });
          }
          return response.json();
        })
        .then((data) => {
          setDebugData((prev) => ({
            ...prev,
            response: JSON.stringify(data, null, 2),
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          // 兼容多种响应格式
          const imgData = data.data?.[0];
          const imgUrl =
            imgData?.url || imgData?.image_url || imgData?.b64_json;
          if (imgUrl) {
            const isBase64 =
              imgUrl.startsWith('data:') ||
              (!imgUrl.startsWith('http') && imgData?.b64_json);
            const imgSrc = isBase64
              ? `data:image/png;base64,${imgData.b64_json || imgUrl}`
              : imgUrl;
            streamMessageUpdate(`![image](${imgSrc})`, 'content');
            handle.success(); // sync image URL obtained
            completeMessage(MESSAGE_STATUS.COMPLETE);
          } else if (data.task_id) {
            // async image-generation task: poll with this same handle so the
            // eventual SUCCESS/FAIL is attributed to the originating request.
            pollTask({ taskId: data.task_id }, true, handle);
          } else {
            console.log(
              'Seedream response:',
              JSON.stringify(data).substring(0, 500),
            );
            streamMessageUpdate('图片生成成功，但未返回图片URL', 'content');
            handle.success(); // API call succeeded (degrade gracefully)
            completeMessage(MESSAGE_STATUS.COMPLETE);
          }
        })
        .catch((error) => {
          setDebugData((prev) => ({ ...prev, response: error.message }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);
          streamMessageUpdate(`图片生成失败: ${error.message}`, 'content');
          handle.fail();
          completeMessage(MESSAGE_STATUS.ERROR);
        });
    },
    [
      setDebugData,
      setActiveDebugTab,
      streamMessageUpdate,
      completeMessage,
      pollTask,
    ],
  );

  // 发送任务请求（视频/3D等）。success = 后端接受并返回了有效 task_id（任务受
  // 理成功）。这不等于最终视频/3D 产出完成。
  const sendTaskRequest = useCallback(
    (payload, endpoint) => {
      const handle = trackRequestHandle(
        payload?.model,
        endpoint === API_ENDPOINTS.THREE_D_GENERATIONS
          ? '3d-generation'
          : 'openai-video',
      );
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        isStreaming: false,
      }));
      setActiveDebugTab(DEBUG_TABS.REQUEST);

      fetch(endpoint || API_ENDPOINTS.VIDEO_GENERATIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            return response.text().then((text) => {
              throw new Error(`HTTP ${response.status}: ${text}`);
            });
          }
          return response.json();
        })
        .then((data) => {
          setDebugData((prev) => ({
            ...prev,
            response: JSON.stringify(data, null, 2),
          }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);

          const taskId = data.task_id || data.id;
          if (taskId) {
            streamMessageUpdate(
              `任务已提交！ID: ${taskId}\n\n请在任务日志中查看进度，完成后视频将在此显示。`,
              'content',
            );
            handle.success(); // backend accepted the task (valid task_id)
            completeMessage(MESSAGE_STATUS.COMPLETE);
          } else if (data.error) {
            streamMessageUpdate(
              `任务提交失败: ${data.error.message || JSON.stringify(data.error)}`,
              'content',
            );
            handle.fail();
            completeMessage(MESSAGE_STATUS.ERROR);
          } else {
            streamMessageUpdate('任务提交成功，但未返回任务ID', 'content');
            handle.fail(); // treat missing task_id as failure to accept
            completeMessage(MESSAGE_STATUS.COMPLETE);
          }
        })
        .catch((error) => {
          setDebugData((prev) => ({ ...prev, response: error.message }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);
          streamMessageUpdate(`任务请求失败: ${error.message}`, 'content');
          handle.fail();
          completeMessage(MESSAGE_STATUS.ERROR);
        });
    },
    [setDebugData, setActiveDebugTab, streamMessageUpdate, completeMessage],
  );

  // 发送语音合成请求（TTS 返回二进制音频，非 JSON）
  const sendAudioRequest = useCallback(
    (payload) => {
      const handle = trackRequestHandle(payload?.model, 'audio_speech');
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        isStreaming: false,
      }));
      setActiveDebugTab(DEBUG_TABS.REQUEST);

      fetch(API_ENDPOINTS.AUDIO_SPEECH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            return response.text().then((text) => {
              throw new Error(`HTTP ${response.status}: ${text}`);
            });
          }
          return response.blob();
        })
        .then((blob) => {
          // 转 base64 data URL：data URL 不依赖页面生命周期，且渲染器对
          // data:audio 链接渲染为 <audio> 播放器（blob: URL 点击会跳空页面）
          const reader = new FileReader();
          reader.onload = () => {
            const audioUrl = reader.result;
            setDebugData((prev) => ({
              ...prev,
              response: `Audio received: ${blob.size} bytes, type: ${blob.type || 'audio/mpeg'}`,
            }));
            setActiveDebugTab(DEBUG_TABS.RESPONSE);
            // Markdown 渲染器对 data:audio 链接渲染为 <audio controls> 播放器
            streamMessageUpdate(
              `🔊 ${t('语音已生成')}：\n\n[▶ ${t('播放')} / ⬇ ${t('下载')}](${audioUrl})`,
              'content',
            );
            handle.success(); // audio blob received and decoded
            completeMessage(MESSAGE_STATUS.COMPLETE);
          };
          reader.onerror = () => {
            setDebugData((prev) => ({ ...prev, response: t('音频解码失败') }));
            setActiveDebugTab(DEBUG_TABS.RESPONSE);
            streamMessageUpdate(
              `${t('语音合成失败')}: ${t('音频解码失败')}`,
              'content',
            );
            handle.fail();
            completeMessage(MESSAGE_STATUS.ERROR);
          };
          reader.readAsDataURL(blob);
        })
        .catch((error) => {
          setDebugData((prev) => ({ ...prev, response: error.message }));
          setActiveDebugTab(DEBUG_TABS.RESPONSE);
          streamMessageUpdate(
            `${t('语音合成失败')}: ${error.message}`,
            'content',
          );
          handle.fail();
          completeMessage(MESSAGE_STATUS.ERROR);
        });
    },
    [setDebugData, setActiveDebugTab, streamMessageUpdate, completeMessage, t],
  );

  // 停止生成。注意：中止取消的是最新的进行中的请求，即使没有活动的 SSE。
  // （用户触发的是全局“停止”，并非请求级取消 —— 最新的正在进行中的请求
  //  即使没有活动的 SSE 连接也会被取消。）
  const onStopGenerator = useCallback(() => {
    // 取消最新进行中的请求句柄，使任何后续的成功信号无效。
    const latest = latestRequestRef.current;
    latestRequestRef.current = null;
    if (latest) latest.cancel();
    // 清理任务轮询
    if (taskPollingTimerRef.current) {
      clearInterval(taskPollingTimerRef.current);
      taskPollingTimerRef.current = null;
    }
    // 如果仍有活动的 SSE 连接，首先关闭
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }

    // 无论是否存在 SSE 连接，都尝试处理最后一条正在生成的消息
    setMessage((prevMessage) => {
      if (prevMessage.length === 0) return prevMessage;
      const lastMessage = prevMessage[prevMessage.length - 1];

      if (
        lastMessage.status === MESSAGE_STATUS.LOADING ||
        lastMessage.status === MESSAGE_STATUS.INCOMPLETE
      ) {
        const processed = processIncompleteThinkTags(
          lastMessage.content || '',
          lastMessage.reasoningContent || '',
        );

        const autoCollapseState = applyAutoCollapseLogic(lastMessage, true);

        const updatedMessages = [
          ...prevMessage.slice(0, -1),
          {
            ...lastMessage,
            status: MESSAGE_STATUS.COMPLETE,
            reasoningContent: processed.reasoningContent || null,
            content: processed.content,
            ...autoCollapseState,
          },
        ];

        // 停止生成时也保存，传入更新后的消息列表
        setTimeout(() => saveMessages(updatedMessages), 0);

        return updatedMessages;
      }
      return prevMessage;
    });
  }, [setMessage, applyAutoCollapseLogic, saveMessages]);

  // 发送请求
  const sendRequest = useCallback(
    (payload, isStream) => {
      if (isStream) {
        handleSSE(payload);
      } else {
        handleNonStreamRequest(payload);
      }
    },
    [handleSSE, handleNonStreamRequest],
  );

  return {
    sendRequest,
    sendImageRequest,
    sendTaskRequest,
    sendAudioRequest,
    onStopGenerator,
    streamMessageUpdate,
    completeMessage,
  };
};

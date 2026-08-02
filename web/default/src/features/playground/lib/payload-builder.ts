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
import type {
  AudioSpeechRequest,
  ChatCompletionRequest,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
} from '../types'
import { getVoiceOptions } from './audio-models.ts'
import { formatMessageForAPI, isValidMessage } from './message-utils.ts'

/**
 * Build API request payload from messages and config
 */
export function buildChatCompletionPayload(
  messages: Message[],
  config: PlaygroundConfig,
  parameterEnabled: ParameterEnabled
): ChatCompletionRequest {
  // Filter and format valid messages
  const processedMessages = messages
    .filter(isValidMessage)
    .map(formatMessageForAPI)

  const payload: ChatCompletionRequest = {
    model: config.model,
    group: config.group,
    messages: processedMessages,
    stream: config.stream,
  }

  // Add enabled parameters
  const parameterKeys: Array<keyof ParameterEnabled> = [
    'temperature',
    'top_p',
    'max_tokens',
    'frequency_penalty',
    'presence_penalty',
    'seed',
  ]

  parameterKeys.forEach((key) => {
    if (parameterEnabled[key]) {
      const value = config[key as keyof PlaygroundConfig]
      if (value !== undefined && value !== null) {
        ;(payload as unknown as Record<string, unknown>)[key] = value
      }
    }
  })

  return payload
}

/**
 * Build the /pg/audio/speech payload for a TTS model.
 *
 * Voice selection must match the model generation: uranus voices bind to
 * seed-tts-2.0 and mars voices to seed-tts-1.0, so a voice persisted for a
 * different generation (or an empty value) falls back to the first voice of
 * the current model's list instead of failing upstream.
 */
export function buildAudioSpeechPayload(
  input: string,
  config: PlaygroundConfig
): AudioSpeechRequest {
  const options = getVoiceOptions(config.model)
  const voice = options.some((option) => option.value === config.voice)
    ? config.voice
    : (options[0]?.value ?? '')

  return {
    model: config.model,
    group: config.group,
    input,
    voice,
    response_format: 'mp3',
  }
}

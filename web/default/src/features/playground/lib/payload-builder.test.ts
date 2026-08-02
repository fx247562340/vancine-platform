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
// Run with: node --test src/features/playground/lib/payload-builder.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  DOUBAO_TTS_VOICES,
} from '../constants.ts'
import {
  createLoadingAssistantMessage,
  createUserMessage,
} from './message-utils.ts'
import {
  buildAudioSpeechPayload,
  buildChatCompletionPayload,
} from './payload-builder.ts'

describe('buildAudioSpeechPayload', () => {
  test('audio request payload contains model, group, input and voice', () => {
    const payload = buildAudioSpeechPayload('你好，世界', {
      ...DEFAULT_CONFIG,
      model: 'doubao-tts2.0',
      group: 'my-group',
      voice: 'en_female_nadia_uranus_bigtts',
    })

    assert.equal(payload.model, 'doubao-tts2.0')
    assert.equal(payload.group, 'my-group')
    assert.equal(payload.input, '你好，世界')
    assert.equal(payload.voice, 'en_female_nadia_uranus_bigtts')
  })

  test('a stale voice (wrong model version) falls back to the current voice list', () => {
    // uranus voice persisted from a 2.0 model, now speaking with a 1.0 model
    const payload = buildAudioSpeechPayload('hi', {
      ...DEFAULT_CONFIG,
      model: 'doubao-tts',
      voice: 'zh_female_vv_uranus_bigtts',
    })

    assert.ok(
      DOUBAO_TTS_VOICES.some((option) => option.value === payload.voice),
      `expected a mars voice, got ${payload.voice}`
    )
  })

  test('empty voice falls back to a valid default for the model', () => {
    const payload = buildAudioSpeechPayload('hi', {
      ...DEFAULT_CONFIG,
      model: 'doubao-tts2.0',
      voice: '',
    })
    assert.ok(payload.voice.length > 0)
    assert.ok(payload.voice.includes('uranus'))
  })
})

describe('buildChatCompletionPayload (regression)', () => {
  test('still builds a chat payload with messages and stream flag', () => {
    const messages = [
      createUserMessage('hello'),
      createLoadingAssistantMessage(),
    ]
    const payload = buildChatCompletionPayload(
      messages,
      { ...DEFAULT_CONFIG, model: 'gpt-4o', stream: false },
      DEFAULT_PARAMETER_ENABLED
    )

    assert.equal(payload.model, 'gpt-4o')
    assert.equal(payload.stream, false)
    // loading assistant placeholder is filtered out
    assert.equal(payload.messages.length, 1)
    assert.deepEqual(payload.messages[0], { role: 'user', content: 'hello' })
  })
})

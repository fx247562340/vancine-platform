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
// Run with: node --test src/features/playground/lib/audio-models.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DOUBAO_TTS_VOICES, DOUBAO_TTS2_VOICES } from '../constants.ts'
import {
  getDefaultVoice,
  getVoiceOptions,
  isAudioSpeechModel,
  isTTS2Model,
} from './audio-models.ts'

describe('playground audio model detection (aligned with classic isAudioSpeechModel)', () => {
  test("isAudioSpeechModel('doubao-tts') === true", () => {
    assert.equal(isAudioSpeechModel('doubao-tts'), true)
  })

  test("isAudioSpeechModel('doubao-tts2.0') === true", () => {
    assert.equal(isAudioSpeechModel('doubao-tts2.0'), true)
  })

  test("isAudioSpeechModel('tts-1-hd') === true", () => {
    assert.equal(isAudioSpeechModel('tts-1-hd'), true)
  })

  test('model name matching is case-insensitive', () => {
    assert.equal(isAudioSpeechModel('Doubao-TTS'), true)
  })

  test("isAudioSpeechModel('gpt-4o') === false", () => {
    assert.equal(isAudioSpeechModel('gpt-4o'), false)
  })

  test('empty / undefined model is not an audio model', () => {
    assert.equal(isAudioSpeechModel(''), false)
    assert.equal(isAudioSpeechModel(undefined), false)
    assert.equal(isAudioSpeechModel(null), false)
  })

  test("isTTS2Model('doubao-tts2.0') === true", () => {
    assert.equal(isTTS2Model('doubao-tts2.0'), true)
  })

  test("isTTS2Model('doubao-tts') === false", () => {
    assert.equal(isTTS2Model('doubao-tts'), false)
  })
})

describe('playground voice option selection', () => {
  test('2.0 model gets the uranus (seed-tts-2.0) voice list', () => {
    const options = getVoiceOptions('doubao-tts2.0')
    assert.deepEqual(options, DOUBAO_TTS2_VOICES)
    assert.ok(options.length > 0)
    assert.ok(options.every((option) => option.value.includes('uranus')))
  })

  test('1.0 model gets the mars (seed-tts-1.0) voice list', () => {
    const options = getVoiceOptions('doubao-tts')
    assert.deepEqual(options, DOUBAO_TTS_VOICES)
    assert.ok(options.length > 0)
    assert.ok(options.every((option) => option.value.includes('mars')))
  })

  test('voice lists switch when the model version changes', () => {
    assert.notDeepEqual(
      getVoiceOptions('doubao-tts'),
      getVoiceOptions('doubao-tts2.0')
    )
  })

  test('default voice always comes from the matching voice list', () => {
    const v1 = getDefaultVoice('doubao-tts')
    const v2 = getDefaultVoice('doubao-tts2.0')
    assert.ok(DOUBAO_TTS_VOICES.some((option) => option.value === v1))
    assert.ok(DOUBAO_TTS2_VOICES.some((option) => option.value === v2))
  })
})

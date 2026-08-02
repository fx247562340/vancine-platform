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
import {
  AUDIO_SPEECH_MODELS,
  DOUBAO_TTS_VOICES,
  DOUBAO_TTS2_VOICES,
} from '../constants.ts'
import type { VoiceOption } from '../types'

/**
 * Whether a model name refers to an audio speech (TTS) model.
 * Aligned with classic `isAudioSpeechModel`: case-insensitive prefix match.
 * The backend reports TTS models with the generic 'openai' endpoint, so the
 * model name is the reliable signal for routing to /pg/audio/speech.
 */
export function isAudioSpeechModel(model?: string | null): boolean {
  if (!model) return false
  const lower = model.toLowerCase()
  return AUDIO_SPEECH_MODELS.some((m) => lower.startsWith(m))
}

/**
 * Whether a TTS model is the 2.0 generation (seed-tts-2.0 / uranus voices).
 * Aligned with classic: `model.toLowerCase().includes('2.0')`.
 */
export function isTTS2Model(model?: string | null): boolean {
  if (!model) return false
  return model.toLowerCase().includes('2.0')
}

/**
 * Voice options for a model: uranus list for 2.0 models, mars list otherwise.
 */
export function getVoiceOptions(model?: string | null): VoiceOption[] {
  return isTTS2Model(model) ? DOUBAO_TTS2_VOICES : DOUBAO_TTS_VOICES
}

/**
 * Default voice for a model (first entry of its version's voice list).
 */
export function getDefaultVoice(model?: string | null): string {
  return getVoiceOptions(model)[0]?.value ?? ''
}

/**
 * Convert an audio Blob to a base64 data URL. Data URLs (unlike blob: URLs)
 * survive re-renders and can be used for both playback and download.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to decode audio'))
    reader.readAsDataURL(blob)
  })
}

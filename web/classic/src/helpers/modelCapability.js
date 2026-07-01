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

import {
  IMAGE_GENERATION_MODELS,
  VIDEO_GENERATIONS_MODELS,
  AUDIO_SPEECH_MODELS,
  AUDIO_TRANSLATION_MODELS,
  SEND_MESSAGE_MODE,
} from '../constants/playground.constants';

export function getSendMessageMode(modelName) {
  if (isImageGenerationModel(modelName)) {
    return SEND_MESSAGE_MODE.IMAGE;
  }
  if (isVideoGenerationModel(modelName)) {
    return SEND_MESSAGE_MODE.VIDEO;
  }
  if (isAudioSpeechModel(modelName)) {
    return SEND_MESSAGE_MODE.AUDIO_SPEECH;
  }
  if (isAudioTranslationModel(modelName)) {
    return SEND_MESSAGE_MODE.AUDIO_TRANSLATION;
  }
  return SEND_MESSAGE_MODE.NORMAL;
}

export function isImageGenerationModel(modelName) {
  if (!modelName) return false;
  return IMAGE_GENERATION_MODELS.some((m) => modelName.startsWith(m));
}

export function isVideoGenerationModel(modelName) {
  if (!modelName) return false;
  return VIDEO_GENERATIONS_MODELS.some((m) => modelName.startsWith(m));
}

export function isAudioSpeechModel(modelName) {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return AUDIO_SPEECH_MODELS.some((m) => lower.startsWith(m));
}

export function isAudioTranslationModel(modelName) {
  if (!modelName) return false;
  return AUDIO_TRANSLATION_MODELS.some((m) => modelName.startsWith(m));
}

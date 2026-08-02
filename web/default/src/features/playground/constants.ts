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
import type { PlaygroundConfig, ParameterEnabled, VoiceOption } from './types'

// Message constants
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const

export const MESSAGE_STATUS = {
  LOADING: 'loading',
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const

// API endpoints
export const API_ENDPOINTS = {
  CHAT_COMPLETIONS: '/pg/chat/completions',
  IMAGE_GENERATIONS: '/pg/images/generations',
  VIDEO_GENERATIONS: '/pg/video/generations',
  THREE_D_GENERATIONS: '/pg/3d/generations',
  AUDIO_SPEECH: '/pg/audio/speech',
  UPLOAD_IMAGE: '/api/upload/image',
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
} as const

// Endpoint type → API path mapping
export const ENDPOINT_API_PATHS: Record<string, string> = {
  openai: API_ENDPOINTS.CHAT_COMPLETIONS,
  'openai-response': API_ENDPOINTS.CHAT_COMPLETIONS,
  'openai-response-compact': API_ENDPOINTS.CHAT_COMPLETIONS,
  anthropic: API_ENDPOINTS.CHAT_COMPLETIONS,
  gemini: API_ENDPOINTS.CHAT_COMPLETIONS,
  'image-generation': API_ENDPOINTS.IMAGE_GENERATIONS,
  'openai-video': API_ENDPOINTS.VIDEO_GENERATIONS,
  '3d-generation': API_ENDPOINTS.THREE_D_GENERATIONS,
  embeddings: API_ENDPOINTS.CHAT_COMPLETIONS,
}

// Audio speech (TTS) model detection — aligned with classic
// AUDIO_SPEECH_MODELS. The backend reports TTS models with the generic
// 'openai' endpoint, so routing must match on the model name itself.
export const AUDIO_SPEECH_MODELS = [
  'tts-1',
  'tts-1-hd',
  'doubao-tts',
  'doubao-tts2.0',
] as const

// TTS voices — ported from classic playground.constants.js.
// Volcano Engine seed-tts resource binding:
//   - uranus suffix → seed-tts-2.0 (Doubao-tts2.0)
//   - mars suffix   → seed-tts-1.0 (Doubao-tts)
// Mixing suffixes across versions fails with "resource ID is mismatched
// with speaker related resource", so lists are kept strictly per version.
export const DOUBAO_TTS2_VOICES: VoiceOption[] = [
  {
    value: 'zh_female_vv_uranus_bigtts',
    label: 'Vivi · 中文 女 · 温柔（多语种）',
  },
  { value: 'en_female_nadia_uranus_bigtts', label: 'Nadia · English Female' },
  { value: 'en_female_jane_uranus_bigtts', label: 'Jane · English Female' },
  {
    value: 'en_female_rachel_p1_uranus_bigtts',
    label: 'Rachel · English Female',
  },
  { value: 'en_male_david_uranus_bigtts', label: 'David · English Male' },
  { value: 'en_male_alex_uranus_bigtts', label: 'Alex · English Male' },
  { value: 'en_male_kevin_uranus_bigtts', label: 'Kevin · English Male' },
  {
    value: 'en_female_stokie_uranus_bigtts',
    label: 'Stokie · English (UK) Female',
  },
  { value: 'es_female_bv084_uranus_bigtts', label: 'Español · 西语 女' },
  { value: 'fr_female_fr_bv078_uranus_bigtts', label: 'Français · 法语 女' },
  { value: 'de_female_bv081_uranus_bigtts', label: 'Deutsch · 德语 女' },
  { value: 'ar_female_dina_uranus_bigtts', label: 'العربية · 阿语 女' },
]

export const DOUBAO_TTS_VOICES: VoiceOption[] = [
  { value: 'zh_female_cancan_mars_bigtts', label: '灿灿 · 中文 女 · 明亮' },
  { value: 'zh_male_wenhao_mars_bigtts', label: '文豪 · 中文 男 · 沉稳' },
  { value: 'en_female_amanda_mars_bigtts', label: 'Amanda · English Female' },
  { value: 'en_female_emily_mars_bigtts', label: 'Emily · English Female' },
  { value: 'en_male_adam_mars_bigtts', label: 'Adam · English Male' },
  { value: 'en_male_jackson_mars_bigtts', label: 'Jackson · English Male' },
  { value: 'en_female_sarah_mars_bigtts', label: 'Sarah · English Female' },
  { value: 'en_male_smith_mars_bigtts', label: 'Smith · English Male' },
  { value: 'en_female_anna_mars_bigtts', label: 'Anna · English Female' },
  { value: 'en_male_dryw_mars_bigtts', label: 'Dryw · English Male' },
]

// Default group — uses 'default' as the safe fallback; auto-group is
// only selected when the backend confirms it is available for the user.
export const DEFAULT_GROUP = 'default' as const

// Default configuration
export const DEFAULT_CONFIG: PlaygroundConfig = {
  model: 'gpt-4o',
  group: DEFAULT_GROUP,
  // Same default voice as the classic playground (2.0 / uranus list)
  voice: 'zh_female_vv_uranus_bigtts',
  temperature: 0.7,
  top_p: 1,
  max_tokens: 4096,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: null,
  stream: true,
}

export const DEFAULT_PARAMETER_ENABLED: ParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
}

// Storage keys
export const STORAGE_KEYS = {
  CONFIG: 'playground_config',
  MESSAGES: 'playground_messages',
  PARAMETER_ENABLED: 'playground_parameter_enabled',
} as const

// Error messages
export const ERROR_MESSAGES = {
  API_REQUEST_ERROR: 'Request error occurred',
  NETWORK_ERROR: 'Network connection failed or server not responding',
  PARSE_ERROR: 'Error parsing response data',
  STREAM_START_ERROR: 'Error establishing connection',
  CONNECTION_CLOSED: 'Connection closed',
  INTERRUPTED: 'Generation was interrupted',
} as const

// Message action button styles
export const MESSAGE_ACTION_BUTTON_STYLES = {
  BASE: 'size-7 text-muted-foreground hover:text-foreground',
  DELETE: 'size-7 text-muted-foreground hover:text-destructive',
  ICON: 'size-4',
} as const

// Message action labels
export const MESSAGE_ACTION_LABELS = {
  COPY: 'Copy',
  COPIED: 'Copied!',
  REGENERATE: 'Regenerate',
  EDIT: 'Edit',
  DELETE: 'Delete',
  NO_CONTENT: 'No content to copy',
  WAIT_GENERATION: 'Please wait for the current generation to complete',
} as const

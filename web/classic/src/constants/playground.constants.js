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

export const MESSAGE_STATUS = {
  LOADING: 'loading',
  INCOMPLETE: 'incomplete',
  COMPLETE: 'complete',
  ERROR: 'error',
};

export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

// 默认消息示例 - 使用函数生成以支持 i18n
export const getDefaultMessages = (t) => [
  {
    role: MESSAGE_ROLES.USER,
    id: '2',
    createAt: 1715676751919,
    content: t('默认用户消息'),
  },
  {
    role: MESSAGE_ROLES.ASSISTANT,
    id: '3',
    createAt: 1715676751919,
    content: t('默认助手消息'),
    reasoningContent: '',
    isReasoningExpanded: false,
  },
];

// 保留旧的导出以保持向后兼容
export const DEFAULT_MESSAGES = [
  {
    role: MESSAGE_ROLES.USER,
    id: '2',
    createAt: 1715676751919,
    content: 'Hello',
  },
  {
    role: MESSAGE_ROLES.ASSISTANT,
    id: '3',
    createAt: 1715676751919,
    content: 'Hello! How can I help you today?',
    reasoningContent: '',
    isReasoningExpanded: false,
  },
];

// ========== UI 相关常量 ==========
export const DEBUG_TABS = {
  PREVIEW: 'preview',
  REQUEST: 'request',
  RESPONSE: 'response',
};

// ========== 消息发送模式 ==========
export const SEND_MESSAGE_MODE = {
  NORMAL: 'normal',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO_SPEECH: 'audio_speech',
  AUDIO_TRANSLATION: 'audio_translation',
};

// ========== 模型名称列表 ==========
export const IMAGE_GENERATION_MODELS = [
  'dall-e-2',
  'dall-e-3',
  'cogview-3',
  'cogview-3-plus',
  'cogview-4',
  'flux',
  'flux-schnell',
  'flux-pro',
  'flux-dev',
  'gpt-image-1',
  'doubao-seedream',
  'seedream',
  'wan2.6',
  'wan2.7',
  'qwen-image',
  'z-image',
];

export const VIDEO_GENERATIONS_MODELS = ['video-', 'sora-', 'doubao-seedance', 'seedance'];

export const AUDIO_SPEECH_MODELS = ['tts-1', 'tts-1-hd', 'doubao-tts', 'doubao-tts2.0'];

export const AUDIO_TRANSLATION_MODELS = ['whisper-1'];

// ========== API 相关常量 ==========
export const API_ENDPOINTS = {
  CHAT_COMPLETIONS: '/pg/chat/completions',
  IMAGES_GENERATIONS: '/pg/images/generations',
  VIDEO_GENERATIONS: '/pg/video/generations',
  THREE_D_GENERATIONS: '/pg/3d/generations',
  AUDIO_SPEECH: '/pg/audio/speech',
  TASKS: '/api/task/',
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
};

// ========== 配置默认值 ==========
export const DEFAULT_CONFIG = {
  inputs: {
    model: 'gpt-4o',
    group: '',
    voice: '',
    temperature: 0.7,
    top_p: 1,
    max_tokens: 4096,
    frequency_penalty: 0,
    presence_penalty: 0,
    seed: null,
    stream: true,
    imageEnabled: false,
    imageUrls: [''],
    imageBase64: [],
  },
  parameterEnabled: {
    temperature: true,
    top_p: true,
    max_tokens: false,
    frequency_penalty: true,
    presence_penalty: true,
    seed: false,
  },
  systemPrompt: '',
  showDebugPanel: false,
  customRequestMode: false,
  customRequestBody: '',
};

// ========== 正则表达式 ==========
export const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/g;

// ========== 错误消息 ==========
export const ERROR_MESSAGES = {
  NO_TEXT_CONTENT: '此消息没有可复制的文本内容',
  INVALID_MESSAGE_TYPE: '无法复制此类型的消息内容',
  COPY_FAILED: '复制失败，请手动选择文本复制',
  COPY_HTTPS_REQUIRED: '复制功能需要 HTTPS 环境，请手动复制',
  BROWSER_NOT_SUPPORTED: '浏览器不支持复制功能，请手动复制',
  JSON_PARSE_ERROR: '自定义请求体格式错误，请检查JSON格式',
  API_REQUEST_ERROR: '请求发生错误',
  NETWORK_ERROR: '网络连接失败或服务器无响应',
};

// ========== 存储键名 ==========
export const STORAGE_KEYS = {
  CONFIG: 'playground_config',
  MESSAGES: 'playground_messages',
};

// ========== TTS 音色列表 ==========
// 平台面向海外客户，列表覆盖多语种（中/英/西/法/德/阿）。
// 音色 ID 直接透传火山原生 voice_type，与后端 mapVoiceType 的 passthrough 路径一致。
//
// 重要：音色后缀决定所属模型版本，必须与 resource ID 匹配，否则上游报
// "resource ID is mismatched with speaker related resource"：
//   - uranus 后缀 → seed-tts-2.0（Doubao-tts2.0）
//   - mars 后缀 / M392 旧格式 → seed-tts-1.0（Doubao-tts）

// 2.0 音色（Doubao-tts2.0 / seed-tts-2.0，uranus 后缀）
export const DOUBAO_TTS2_VOICES = [
  { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi · 中文 女 · 温柔（多语种）' },
  { value: 'en_female_nadia_uranus_bigtts', label: 'Nadia · English Female' },
  { value: 'en_female_jane_uranus_bigtts', label: 'Jane · English Female' },
  { value: 'en_female_rachel_p1_uranus_bigtts', label: 'Rachel · English Female' },
  { value: 'en_male_david_uranus_bigtts', label: 'David · English Male' },
  { value: 'en_male_alex_uranus_bigtts', label: 'Alex · English Male' },
  { value: 'en_male_kevin_uranus_bigtts', label: 'Kevin · English Male' },
  { value: 'en_female_stokie_uranus_bigtts', label: 'Stokie · English (UK) Female' },
  { value: 'es_female_bv084_uranus_bigtts', label: 'Español · 西语 女' },
  { value: 'fr_female_fr_bv078_uranus_bigtts', label: 'Français · 法语 女' },
  { value: 'de_female_bv081_uranus_bigtts', label: 'Deutsch · 德语 女' },
  { value: 'ar_female_dina_uranus_bigtts', label: 'العربية · 阿语 女' },
];

// 1.0 音色（Doubao-tts / seed-tts-1.0，mars 后缀或 M392 旧格式）
export const DOUBAO_TTS_VOICES = [
  { value: 'zh_male_M392_conversation_wvae_bigtts', label: 'M392 · 中文 男 · 自然对话' },
  { value: 'zh_female_M392_conversation_wvae_bigtts', label: 'M392 · 中文 女 · 自然对话' },
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
];

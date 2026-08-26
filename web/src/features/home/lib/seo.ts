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
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * SEO metadata for the public marketing home page. The English copy is
 * pinned byte-for-byte against `router/web_metadata.go`'s entry for `/`
 * so server-rendered HTML and the SPA agree on the title, description,
 * og/twitter cards, and canonical. The other six interface languages
 * carry the same structure with translated copy.
 *
 * The canonical URL and og:url are fixed constants — they are never
 * derived from host headers or user input.
 */

export const HOME_CANONICAL = 'https://vancine.com'

interface HomeLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const HOME_METADATA: Record<InterfaceLanguageCode, HomeLanguageMetadata> = {
  // English: pinned to router/web_metadata.go (no rewrite, no translation).
  // The Twitter fields must remain byte-identical to the Go side so the
  // server-rendered HTML and the SPA agree for crawlers and link unfurls.
  en: {
    title: 'Chinese AI Models API for Global Developers | Vancine',
    description:
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.',
    ogTitle: 'Chinese AI Models API for Global Developers',
    ogDescription:
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.',
    twitterTitle: 'Chinese AI Models API for Global Developers',
    twitterDescription:
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.',
  },
  zhCN: {
    title: '面向全球开发者的中国 AI 模型 API | Vancine',
    description:
      '通过一个 OpenAI 兼容的 API，集中访问最新一代中国旗舰 AI 模型，覆盖文本、图片、视频、语音与 3D。',
    ogTitle: '面向全球开发者的中国 AI 模型 API',
    ogDescription:
      '通过一个 OpenAI 兼容的 API，集中访问最新一代中国旗舰 AI 模型，覆盖文本、图片、视频、语音与 3D。',
    twitterTitle: '面向全球开发者的中国 AI 模型 API',
    twitterDescription:
      '通过一个 OpenAI 兼容的 API，集中访问最新一代中国旗舰 AI 模型，覆盖文本、图片、视频、语音与 3D。',
  },
  zhTW: {
    title: '為全球開發者打造的中國 AI 模型 API | Vancine',
    description:
      '透過單一 OpenAI 相容 API，集中取用最新一代中國旗艦 AI 模型，涵蓋文字、圖片、影片、語音與 3D。',
    ogTitle: '為全球開發者打造的中國 AI 模型 API',
    ogDescription:
      '透過單一 OpenAI 相容 API，集中取用最新一代中國旗艦 AI 模型，涵蓋文字、圖片、影片、語音與 3D。',
    twitterTitle: '為全球開發者打造的中國 AI 模型 API',
    twitterDescription:
      '透過單一 OpenAI 相容 API，集中取用最新一代中國旗艦 AI 模型，涵蓋文字、圖片、影片、語音與 3D。',
  },
  fr: {
    title:
      "API de modèles d'IA chinois pour développeurs internationaux | Vancine",
    description:
      "Accédez aux derniers modèles d'IA chinois phares pour le texte, l'image, la vidéo, l'audio et la 3D via une seule API compatible OpenAI.",
    ogTitle: "API de modèles d'IA chinois pour développeurs internationaux",
    ogDescription:
      "Accédez aux derniers modèles d'IA chinois phares pour le texte, l'image, la vidéo, l'audio et la 3D via une seule API compatible OpenAI.",
    twitterTitle:
      "API de modèles d'IA chinois pour développeurs internationaux",
    twitterDescription:
      "Accédez aux derniers modèles d'IA chinois phares pour le texte, l'image, la vidéo, l'audio et la 3D via une seule API compatible OpenAI.",
  },
  ru: {
    title: 'API китайских моделей ИИ для разработчиков по всему миру | Vancine',
    description:
      'Получите доступ к новейшим флагманским китайским моделям ИИ для текста, изображений, видео, аудио и 3D через один OpenAI-совместимый API.',
    ogTitle: 'API китайских моделей ИИ для разработчиков по всему миру',
    ogDescription:
      'Получите доступ к новейшим флагманским китайским моделям ИИ для текста, изображений, видео, аудио и 3D через один OpenAI-совместимый API.',
    twitterTitle: 'API китайских моделей ИИ для разработчиков по всему миру',
    twitterDescription:
      'Получите доступ к новейшим флагманским китайским моделям ИИ для текста, изображений, видео, аудио и 3D через один OpenAI-совместимый API.',
  },
  ja: {
    title: 'グローバル開発者向け中国 AI モデル API | Vancine',
    description:
      'テキスト、画像、動画、音声、3D に対応する最新の中国製フラッグシップ AI モデルを、OpenAI 互換の単一 API で。',
    ogTitle: 'グローバル開発者向け中国 AI モデル API',
    ogDescription:
      'テキスト、画像、動画、音声、3D に対応する最新の中国製フラッグシップ AI モデルを、OpenAI 互換の単一 API で。',
    twitterTitle: 'グローバル開発者向け中国 AI モデル API',
    twitterDescription:
      'テキスト、画像、動画、音声、3D に対応する最新の中国製フラッグシップ AI モデルを、OpenAI 互換の単一 API で。',
  },
  vi: {
    title: 'API mô hình AI Trung Quốc cho nhà phát triển toàn cầu | Vancine',
    description:
      'Truy cập các mô hình AI hàng đầu Trung Quốc mới nhất cho văn bản, hình ảnh, video, âm thanh và 3D thông qua một API tương thích OpenAI.',
    ogTitle: 'API mô hình AI Trung Quốc cho nhà phát triển toàn cầu',
    ogDescription:
      'Truy cập các mô hình AI hàng đầu Trung Quốc mới nhất cho văn bản, hình ảnh, video, âm thanh và 3D thông qua một API tương thích OpenAI.',
    twitterTitle: 'API mô hình AI Trung Quốc cho nhà phát triển toàn cầu',
    twitterDescription:
      'Truy cập các mô hình AI hàng đầu Trung Quốc mới nhất cho văn bản, hình ảnh, video, âm thanh và 3D thông qua một API tương thích OpenAI.',
  },
}

/**
 * Resolve the complete page metadata for a language. The input is normalized
 * (zhCN / zhTW / BCP-47 variants), and any unknown language falls back to
 * English. The canonical URL and og:url are fixed constants — they are
 * never derived from host headers or user input.
 */
export function getHomePageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = HOME_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: HOME_CANONICAL,
    canonical: HOME_CANONICAL,
  }
}

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
    title: 'Chinese Frontier & Fast AI Models API | Vancine',
    description:
      'Access flagship and fast-inference Chinese AI models for reasoning, coding, multimodal workflows, AI agents, and high-throughput applications through one OpenAI-compatible API.',
    ogTitle: 'Chinese Frontier & Fast AI Models API',
    ogDescription:
      'Access flagship and fast-inference Chinese AI models for reasoning, coding, multimodal workflows, AI agents, and high-throughput applications through one OpenAI-compatible API.',
    twitterTitle: 'Chinese Frontier & Fast AI Models API',
    twitterDescription:
      'Access flagship and fast-inference Chinese AI models for reasoning, coding, multimodal workflows, AI agents, and high-throughput applications through one OpenAI-compatible API.',
  },
  zhCN: {
    title: '中国前沿 + 快速 AI 模型 API | Vancine',
    description:
      '通过一个 OpenAI 兼容的 API，访问旗舰与快速推理的中国 AI 模型，覆盖推理、编码、多模态工作流、AI agent 与高吞吐应用。',
    ogTitle: '中国前沿 + 快速 AI 模型 API',
    ogDescription:
      '通过一个 OpenAI 兼容的 API，访问旗舰与快速推理的中国 AI 模型，覆盖推理、编码、多模态工作流、AI agent 与高吞吐应用。',
    twitterTitle: '中国前沿 + 快速 AI 模型 API',
    twitterDescription:
      '通过一个 OpenAI 兼容的 API，访问旗舰与快速推理的中国 AI 模型，覆盖推理、编码、多模态工作流、AI agent 与高吞吐应用。',
  },
  zhTW: {
    title: '中國前沿 + 快速 AI 模型 API | Vancine',
    description:
      '透過單一 OpenAI 相容 API，存取旗艦與快速推論的中國 AI 模型，涵蓋推論、編碼、多模態工作流、AI agent 與高吞吐應用。',
    ogTitle: '中國前沿 + 快速 AI 模型 API',
    ogDescription:
      '透過單一 OpenAI 相容 API，存取旗艦與快速推論的中國 AI 模型，涵蓋推論、編碼、多模態工作流、AI agent 與高吞吐應用。',
    twitterTitle: '中國前沿 + 快速 AI 模型 API',
    twitterDescription:
      '透過單一 OpenAI 相容 API，存取旗艦與快速推論的中國 AI 模型，涵蓋推論、編碼、多模態工作流、AI agent 與高吞吐應用。',
  },
  fr: {
    title: 'API de modèles d’IA chinois phares et rapides | Vancine',
    description:
      'Accédez aux modèles d’IA chinois phares et à inférence rapide pour le raisonnement, le code, les workflows multimodaux, les agents d’IA et les applications à haut débit via une seule API compatible OpenAI.',
    ogTitle: 'API de modèles d’IA chinois phares et rapides',
    ogDescription:
      'Accédez aux modèles d’IA chinois phares et à inférence rapide pour le raisonnement, le code, les workflows multimodaux, les agents d’IA et les applications à haut débit via une seule API compatible OpenAI.',
    twitterTitle: 'API de modèles d’IA chinois phares et rapides',
    twitterDescription:
      'Accédez aux modèles d’IA chinois phares et à inférence rapide pour le raisonnement, le code, les workflows multimodaux, les agents d’IA et les applications à haut débit via une seule API compatible OpenAI.',
  },
  ru: {
    title: 'API передовых и быстрых китайских ИИ-моделей | Vancine',
    description:
      'Получите доступ к флагманским и быстрым китайским ИИ-моделям для рассуждений, кода, мультимодальных сценариев, ИИ-агентов и высоконагруженных приложений через один OpenAI-совместимый API.',
    ogTitle: 'API передовых и быстрых китайских ИИ-моделей',
    ogDescription:
      'Получите доступ к флагманским и быстрым китайским ИИ-моделям для рассуждений, кода, мультимодальных сценариев, ИИ-агентов и высоконагруженных приложений через один OpenAI-совместимый API.',
    twitterTitle: 'API передовых и быстрых китайских ИИ-моделей',
    twitterDescription:
      'Получите доступ к флагманским и быстрым китайским ИИ-моделям для рассуждений, кода, мультимодальных сценариев, ИИ-агентов и высоконагруженных приложений через один OpenAI-совместимый API.',
  },
  ja: {
    title: '中国発・最先端＆高速 AI モデル API | Vancine',
    description:
      '推論、コーディング、マルチモーダルワークフロー、AI エージェント、高スループットアプリ向けに、最先端と高速推論の中国製 AI モデルを 1 つの OpenAI 互換 API で。',
    ogTitle: '中国発・最先端＆高速 AI モデル API',
    ogDescription:
      '推論、コーディング、マルチモーダルワークフロー、AI エージェント、高スループットアプリ向けに、最先端と高速推論の中国製 AI モデルを 1 つの OpenAI 互換 API で。',
    twitterTitle: '中国発・最先端＆高速 AI モデル API',
    twitterDescription:
      '推論、コーディング、マルチモーダルワークフロー、AI エージェント、高スループットアプリ向けに、最先端と高速推論の中国製 AI モデルを 1 つの OpenAI 互換 API で。',
  },
  vi: {
    title: 'API mô hình AI Trung Quốc hàng đầu & tốc độ cao | Vancine',
    description:
      'Truy cập các mô hình AI Trung Quốc hàng đầu và suy luận nhanh cho lập luận, code, quy trình đa phương thức, AI agent và ứng dụng thông lượng lớn qua một API tương thích OpenAI.',
    ogTitle: 'API mô hình AI Trung Quốc hàng đầu & tốc độ cao',
    ogDescription:
      'Truy cập các mô hình AI Trung Quốc hàng đầu và suy luận nhanh cho lập luận, code, quy trình đa phương thức, AI agent và ứng dụng thông lượng lớn qua một API tương thích OpenAI.',
    twitterTitle: 'API mô hình AI Trung Quốc hàng đầu & tốc độ cao',
    twitterDescription:
      'Truy cập các mô hình AI Trung Quốc hàng đầu và suy luận nhanh cho lập luận, code, quy trình đa phương thức, AI agent và ứng dụng thông lượng lớn qua một API tương thích OpenAI.',
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

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
 * SEO metadata for the public marketing Pricing page. The English copy
 * is pinned byte-for-byte against `router/web_metadata.go`'s entry for
 * `/pricing` so server-rendered HTML and the SPA agree on the title,
 * description, og/twitter cards, and canonical. The other six interface
 * languages carry the same structure with translated copy.
 *
 * The canonical URL and og:url are fixed constants — they are never
 * derived from host headers or user input.
 */

export const PRICING_CANONICAL = 'https://vancine.com/pricing'

interface PricingLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const PRICING_METADATA: Record<InterfaceLanguageCode, PricingLanguageMetadata> =
  {
    // English: pinned to router/web_metadata.go (no rewrite, no translation).
    // The Twitter fields must remain byte-identical to the Go side so the
    // server-rendered HTML and the SPA agree for crawlers and link unfurls.
    en: {
      title: 'Chinese AI Model API Pricing | Vancine',
      description:
        "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
      ogTitle: 'Chinese AI Model API Pricing',
      ogDescription:
        "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
      twitterTitle: 'Chinese AI Model API Pricing',
      twitterDescription:
        "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
    },
    zhCN: {
      title: '中国 AI 模型 API 价格 | Vancine',
      description:
        '通过 Vancine 的 OpenAI 兼容 API，对比最新一代中国旗舰模型的透明美元定价。',
      ogTitle: '中国 AI 模型 API 价格',
      ogDescription:
        '通过 Vancine 的 OpenAI 兼容 API，对比最新一代中国旗舰模型的透明美元定价。',
      twitterTitle: '中国 AI 模型 API 价格',
      twitterDescription:
        '通过 Vancine 的 OpenAI 兼容 API，对比最新一代中国旗舰模型的透明美元定价。',
    },
    zhTW: {
      title: '中國 AI 模型 API 定價 | Vancine',
      description:
        '透過 Vancine 的 OpenAI 相容 API，比較最新一代中國旗艦模型的透明美元定價。',
      ogTitle: '中國 AI 模型 API 定價',
      ogDescription:
        '透過 Vancine 的 OpenAI 相容 API，比較最新一代中國旗艦模型的透明美元定價。',
      twitterTitle: '中國 AI 模型 API 定價',
      twitterDescription:
        '透過 Vancine 的 OpenAI 相容 API，比較最新一代中國旗艦模型的透明美元定價。',
    },
    fr: {
      title: "Tarification de l'API des modèles d'IA chinois | Vancine",
      description:
        "Comparez la tarification transparente en USD des derniers modèles phares chinois disponibles via l'API compatible OpenAI de Vancine.",
      ogTitle: "Tarification de l'API des modèles d'IA chinois",
      ogDescription:
        "Comparez la tarification transparente en USD des derniers modèles phares chinois disponibles via l'API compatible OpenAI de Vancine.",
      twitterTitle: "Tarification de l'API des modèles d'IA chinois",
      twitterDescription:
        "Comparez la tarification transparente en USD des derniers modèles phares chinois disponibles via l'API compatible OpenAI de Vancine.",
    },
    ru: {
      title: 'Цены API китайских моделей ИИ | Vancine',
      description:
        'Сравните прозрачные цены в долларах США на новейшие флагманские китайские модели, доступные через OpenAI-совместимый API Vancine.',
      ogTitle: 'Цены API китайских моделей ИИ',
      ogDescription:
        'Сравните прозрачные цены в долларах США на новейшие флагманские китайские модели, доступные через OpenAI-совместимый API Vancine.',
      twitterTitle: 'Цены API китайских моделей ИИ',
      twitterDescription:
        'Сравните прозрачные цены в долларах США на новейшие флагманские китайские модели, доступные через OpenAI-совместимый API Vancine.',
    },
    ja: {
      title: '中国 AI モデル API の価格 | Vancine',
      description:
        'Vancine の OpenAI 互換 API で利用可能な最新の中国製フラッグシップモデルの、透明性の高い USD 価格を比較。',
      ogTitle: '中国 AI モデル API の価格',
      ogDescription:
        'Vancine の OpenAI 互換 API で利用可能な最新の中国製フラッグシップモデルの、透明性の高い USD 価格を比較。',
      twitterTitle: '中国 AI モデル API の価格',
      twitterDescription:
        'Vancine の OpenAI 互換 API で利用可能な最新の中国製フラッグシップモデルの、透明性の高い USD 価格を比較。',
    },
    vi: {
      title: 'Bảng giá API mô hình AI Trung Quốc | Vancine',
      description:
        'So sánh giá USD minh bạch cho các mô hình hàng đầu Trung Quốc mới nhất có sẵn qua API tương thích OpenAI của Vancine.',
      ogTitle: 'Bảng giá API mô hình AI Trung Quốc',
      ogDescription:
        'So sánh giá USD minh bạch cho các mô hình hàng đầu Trung Quốc mới nhất có sẵn qua API tương thích OpenAI của Vancine.',
      twitterTitle: 'Bảng giá API mô hình AI Trung Quốc',
      twitterDescription:
        'So sánh giá USD minh bạch cho các mô hình hàng đầu Trung Quốc mới nhất có sẵn qua API tương thích OpenAI của Vancine.',
    },
  }

/**
 * Resolve the complete page metadata for a language. The input is normalized
 * (zhCN / zhTW / BCP-47 variants), and any unknown language falls back to
 * English. The canonical URL and og:url are fixed constants — they are
 * never derived from host headers or user input.
 */
export function getPricingPageMetadata(language: string): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = PRICING_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: PRICING_CANONICAL,
    canonical: PRICING_CANONICAL,
  }
}

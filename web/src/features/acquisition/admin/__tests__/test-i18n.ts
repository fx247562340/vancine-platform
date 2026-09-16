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
/**
 * Shared i18n bootstrap for the acquisition-admin tests. Registers the REAL
 * production locale bundles (src/i18n/locales/en.json and zh.json — the same
 * files the runtime loads), so tests verify the shipped copy, never a copied
 * fixture. Fallback chain mirrors production: zh → en.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import enProduction from '@/i18n/locales/en.json'
import zhProduction from '@/i18n/locales/zh.json'

export const testI18n = i18next

/** The production translation bundles, unwrapped from their `translation` envelope. */
export const PRODUCTION_BUNDLES = {
  en: enProduction.translation as Record<string, string>,
  zh: zhProduction.translation as Record<string, string>,
}

let ready = false

export async function initTestI18n(
  language: 'en' | 'zh' = 'en'
): Promise<void> {
  if (!ready) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      resources: {
        en: { translation: PRODUCTION_BUNDLES.en },
        zh: { translation: PRODUCTION_BUNDLES.zh },
      },
    })
    ready = true
  }
  await i18next.changeLanguage(language)
}

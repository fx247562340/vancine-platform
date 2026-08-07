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
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import {
  applyDocumentLanguage,
  convertDetectedLanguage,
  wireDocumentLanguageSync,
} from './languages'
import { createLazyResourceBackend } from './resource-loader'

/**
 * Keep `<html lang>` in sync with the active interface language so assistive
 * tech and the browser use the correct language. The event wiring lives in
 * `wireDocumentLanguageSync` (shared with the tests); the initial sync after
 * init is chained below. `applyDocumentLanguage` is idempotent, so the
 * languageChanged event fired during init and the safety-net sync below do not
 * produce duplicate writes.
 */
wireDocumentLanguageSync(i18n)

/**
 * Awaitable promise resolving once the production i18next instance has finished
 * initializing (and the initial `<html lang>` sync has run). Exported so
 * integration tests can wait for the real wiring instead of guessing a delay.
 */
export const i18nInitPromise: Promise<void> = i18n
  // Lazy-load locale bundles (one chunk per language) instead of bundling
  // every locale into the entry chunk; the active language (plus the `en`
  // fallback) is fetched during init before the promise resolves.
  .use(createLazyResourceBackend())
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    // Normalize to an exact supported code ourselves; keep it verbatim so
    // zhTW does NOT collapse into zh (which `languageOnly` would do).
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report BCP-47 tags (`zh-CN`/`zh-TW`/`zh`, `fr-FR`, ...);
      // normalizeInterfaceLanguage maps every one of them onto a supported
      // interface code — Chinese onto `zhCN`/`zhTW`, other languages onto
      // their base code, unknown tags onto `en`.
      convertDetectedLanguage,
    },
    react: {
      // Components must render immediately instead of suspending while a
      // locale chunk is in flight (avoids a blank first paint on switch).
      useSuspense: false,
    },
  })
  .then(() => {
    // Safety-net initial sync in case no languageChanged fired during init.
    // Idempotent with the event-driven sync above (no duplicate write).
    applyDocumentLanguage(i18n.language)
  })

export default i18n

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

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { createBackend, detectInitialLanguage } from './resource-loader.js';
import { supportedLanguages } from './language.js';

// Locale JSON is no longer statically imported here. Each
// language/namespace chunk is loaded on demand by the custom i18next
// backend (see resource-loader.js) so the main entry no longer carries
// all 50 locale files. The first paint waits on `initPromise` (see
// index.jsx), which resolves once the detected language's `translation`
// namespace has been loaded by the backend.
//
// Initial language is resolved SYNCHRONOUSLY via `detectInitialLanguage`
// (localStorage `i18nextLng` first, then navigator.languages /
// navigator.language, then `en`) and passed as an explicit `lng`. Combined
// with `fallbackLng: false` this guarantees the first paint loads exactly
// one translation language chunk — never the English fallback in parallel.
// Language switching still works via `i18n.changeLanguage`, which triggers
// a fresh backend.read for the new language.

/**
 * Map an internal i18n language code to a BCP 47 tag suitable for
 * `document.documentElement.lang`. Our internal codes already match
 * common BCP 47 forms (`en`, `zh-CN`, `zh-TW`, `fr`, `ru`, `ja`, `vi`);
 * this helper normalizes unknown / empty values and is the single place
 * to adjust tags if a future locale needs a different HTML form.
 *
 * @param {string|undefined|null} lng
 * @returns {string} BCP 47 language tag
 */
export function toBcp47(lng) {
  if (!lng || typeof lng !== 'string') return 'en';
  // Internal codes are already BCP 47-compatible. Strip any i18next
  // technical suffixes (e.g. "en-US-x-foo") by taking the primary +
  // region subtags when present.
  const trimmed = lng.trim();
  if (!trimmed) return 'en';
  // Preserve well-known multi-part tags explicitly.
  if (trimmed === 'zh-CN' || trimmed === 'zh-TW') return trimmed;
  // For everything else, keep the tag as-is when it looks like a simple
  // BCP 47 tag (primary, optional region). Fall back to the primary
  // subtag only if something exotic shows up.
  if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(trimmed)) return trimmed;
  const primary = trimmed.split(/[-_]/)[0];
  return primary || 'en';
}

/**
 * Synchronously write the active language onto <html lang="..."> so
 * assistive tech, browser translation hints, and font selection see the
 * correct language from the first paint and on every subsequent switch.
 *
 * @param {string|undefined|null} lng
 */
export function syncDocumentLang(lng) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  try {
    document.documentElement.lang = toBcp47(lng);
  } catch {
    // Non-fatal (e.g. frozen DOM in some test harnesses).
  }
}

/**
 * Pure init-options factory shared with the i18n test so the test can
 * assert against the ACTUAL production configuration (no copy).
 *
 * @param {string} [lng] explicit initial language. Defaults to the result
 *   of `detectInitialLanguage()` (production path). Tests inject a fixed
 *   value so they can assert without a DOM.
 * @returns {Record<string, any>} i18next init options
 */
export function getI18nInitOptions(lng = detectInitialLanguage()) {
  return {
    // Explicit initial language — resolved by resolveLanguage via
    // detectInitialLanguage. LanguageDetector is intentionally NOT used
    // at init time so we never race a second language load.
    lng,
    load: 'currentOnly',
    supportedLngs: supportedLanguages,
    // No static `resources`: namespaces are fetched lazily by the backend.
    ns: ['translation'],
    defaultNS: 'translation',
    // Disable i18next's automatic fallback-language preload. Unsupported
    // languages are already resolved to `en` by detectInitialLanguage;
    // real chunk failures fall back inside loadNamespace. With this set
    // to false, init loads exactly one translation language.
    fallbackLng: false,
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
    },
  };
}

// Wire the lazy backend so i18next calls `read(language, namespace)` for
// each namespace it needs instead of looking them up in a static bundle.
// Detect the language once at module evaluation so the same value is
// used for the init options and for any test that inspects it.
export const initialLanguage = detectInitialLanguage();

// Apply <html lang> immediately (before initPromise resolves) so the
// first paint already carries the correct BCP 47 tag.
syncDocumentLang(initialLanguage);

const initPromise = i18n
  .use(createBackend())
  .use(initReactI18next)
  .init(getI18nInitOptions(initialLanguage));

// Persist the resolved language so subsequent visits and language-switch
// handlers stay consistent with the previous LanguageDetector cache key.
try {
  if (typeof localStorage !== 'undefined' && localStorage) {
    localStorage.setItem('i18nextLng', initialLanguage);
  }
} catch {
  // Private mode / blocked storage — non-fatal.
}

if (typeof window !== 'undefined') {
  window.__i18n = i18n;
}

// Keep the chosen language in localStorage whenever the user switches,
// matching the previous LanguageDetector `caches: ['localStorage']`
// contract so reload restores the selection. Also re-sync <html lang>.
i18n.on('languageChanged', (lng) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage && lng) {
      localStorage.setItem('i18nextLng', lng);
    }
  } catch {
    // Non-fatal.
  }
  syncDocumentLang(lng);
});

export { initPromise };
export default i18n;

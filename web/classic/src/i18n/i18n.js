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
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en.json';
import frTranslation from './locales/fr.json';
import zhCNTranslation from './locales/zh-CN.json';
import zhTWTranslation from './locales/zh-TW.json';
import ruTranslation from './locales/ru.json';
import jaTranslation from './locales/ja.json';
import viTranslation from './locales/vi.json';

// Docs namespace translations
import enDocs from './locales/docs/en.json';
import zhCNDocs from './locales/docs/zh-CN.json';
import zhTWDocs from './locales/docs/zh-TW.json';
import frDocs from './locales/docs/fr.json';
import jaDocs from './locales/docs/ja.json';
import ruDocs from './locales/docs/ru.json';
import viDocs from './locales/docs/vi.json';

import { supportedLanguages, getDetectionConfig } from './language';

// Pure init-options factory shared with the i18n test so the test can
// assert against the ACTUAL production configuration (no copy).
// i18next calls this once at startup; the test imports the same object.
export function getI18nInitOptions() {
  return {
    load: 'currentOnly',
    supportedLngs: supportedLanguages,
    resources: {
      en: { translation: enTranslation, docs: enDocs },
      'zh-CN': { translation: zhCNTranslation, docs: zhCNDocs },
      'zh-TW': { translation: zhTWTranslation, docs: zhTWDocs },
      fr: { translation: frTranslation, docs: frDocs },
      ru: { translation: ruTranslation, docs: ruDocs },
      ja: { translation: jaTranslation, docs: jaDocs },
      vi: { translation: viTranslation, docs: viDocs },
    },
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
    },
    // Honor the visitor's saved language first (localStorage set by our
    // language switch handlers / LanguageDetector), then fall back to the
    // browser's reported language. Caches resolved language in
    // localStorage so it survives reloads.
    detection: getDetectionConfig(),
  };
}

i18n.use(LanguageDetector).use(initReactI18next).init(getI18nInitOptions());

window.__i18n = i18n;

export default i18n;

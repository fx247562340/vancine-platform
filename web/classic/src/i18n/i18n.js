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

// About namespace translations
import enAbout from './locales/about/en.json';
import zhCNAbout from './locales/about/zh-CN.json';
import zhTWAbout from './locales/about/zh-TW.json';
import frAbout from './locales/about/fr.json';
import jaAbout from './locales/about/ja.json';
import ruAbout from './locales/about/ru.json';
import viAbout from './locales/about/vi.json';

// Waitlist namespace translations
import enWaitlist from './locales/waitlist/en.json';
import zhCNWaitlist from './locales/waitlist/zh-CN.json';
import zhTWWaitlist from './locales/waitlist/zh-TW.json';
import frWaitlist from './locales/waitlist/fr.json';
import jaWaitlist from './locales/waitlist/ja.json';
import ruWaitlist from './locales/waitlist/ru.json';
import viWaitlist from './locales/waitlist/vi.json';

// Kimi namespace translations
import enKimi from './locales/kimi/en.json';
import zhCNKimi from './locales/kimi/zh-CN.json';
import zhTWKimi from './locales/kimi/zh-TW.json';
import frKimi from './locales/kimi/fr.json';
import jaKimi from './locales/kimi/ja.json';
import ruKimi from './locales/kimi/ru.json';
import viKimi from './locales/kimi/vi.json';

// Seedance namespace translations (footer + SEO meta)
import enSeedance from './locales/seedance/en.json';
import zhCNSeedance from './locales/seedance/zh-CN.json';
import zhTWSeedance from './locales/seedance/zh-TW.json';
import frSeedance from './locales/seedance/fr.json';
import jaSeedance from './locales/seedance/ja.json';
import ruSeedance from './locales/seedance/ru.json';
import viSeedance from './locales/seedance/vi.json';

// AiMedia namespace translations (footer + SEO meta)
import enAiMedia from './locales/aimedia/en.json';
import zhCNAiMedia from './locales/aimedia/zh-CN.json';
import zhTWAiMedia from './locales/aimedia/zh-TW.json';
import frAiMedia from './locales/aimedia/fr.json';
import jaAiMedia from './locales/aimedia/ja.json';
import ruAiMedia from './locales/aimedia/ru.json';
import viAiMedia from './locales/aimedia/vi.json';

import { supportedLanguages, getDetectionConfig } from './language';

// Pure init-options factory shared with the i18n test so the test can
// assert against the ACTUAL production configuration (no copy).
// i18next calls this once at startup; the test imports the same object.
export function getI18nInitOptions() {
  return {
    load: 'currentOnly',
    supportedLngs: supportedLanguages,
    resources: {
      en: { ...enTranslation, docs: enDocs, about: enAbout, waitlist: enWaitlist, kimi: enKimi, seedance: enSeedance, aimedia: enAiMedia },
      'zh-CN': { ...zhCNTranslation, docs: zhCNDocs, about: zhCNAbout, waitlist: zhCNWaitlist, kimi: zhCNKimi, seedance: zhCNSeedance, aimedia: zhCNAiMedia },
      'zh-TW': { ...zhTWTranslation, docs: zhTWDocs, about: zhTWAbout, waitlist: zhTWWaitlist, kimi: zhTWKimi, seedance: zhTWSeedance, aimedia: zhTWAiMedia },
      fr: { ...frTranslation, docs: frDocs, about: frAbout, waitlist: frWaitlist, kimi: frKimi, seedance: frSeedance, aimedia: frAiMedia },
      ru: { ...ruTranslation, docs: ruDocs, about: ruAbout, waitlist: ruWaitlist, kimi: ruKimi, seedance: ruSeedance, aimedia: ruAiMedia },
      ja: { ...jaTranslation, docs: jaDocs, about: jaAbout, waitlist: jaWaitlist, kimi: jaKimi, seedance: jaSeedance, aimedia: jaAiMedia },
      vi: { ...viTranslation, docs: viDocs, about: viAbout, waitlist: viWaitlist, kimi: viKimi, seedance: viSeedance, aimedia: viAiMedia },
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

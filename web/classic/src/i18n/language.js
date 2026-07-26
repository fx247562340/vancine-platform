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

export const supportedLanguages = [
  'en',
  'zh-CN',
  'zh-TW',
  'fr',
  'ru',
  'ja',
  'vi',
];

/**
 * Native-language display names for every entry in `supportedLanguages`.
 * Used by every language switcher (main header, landing pages) so the list
 * stays in one place.
 */
export const LANGUAGE_NAMES = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  fr: 'Français',
  ru: 'Русский',
  ja: '日本語',
  vi: 'Tiếng Việt',
};

/**
 * Render-ready language switcher options, derived from `LANGUAGE_NAMES`
 * in the order defined above. Order: en (default fallback) → Simplified
 * Chinese → Traditional Chinese → Japanese → French → Russian → Vietnamese.
 */
export const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_NAMES).map(
  ([code, label]) => ({ code, label }),
);

/**
 * Pure copy of the production LanguageDetector config used by i18n.js.
 * Shared with the i18n test so the test can assert against the real config
 * without copying it. Exported separately from i18n.js so the test does not
 * have to transitively import locale JSON files under Node.
 */
export function getDetectionConfig() {
  return {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
  };
}

/**
 * Safely parse a user's `setting` JSON string into an object. Returns an
 * empty object for missing / non-object / malformed input so callers never
 * crash on bad cached data.
 *
 * @param {string|undefined|null} settingString
 * @returns {Record<string, any>}
 */
export function parseUserSetting(settingString) {
  if (!settingString) return {};
  try {
    const parsed = JSON.parse(settingString);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * Merge a new language into a user's existing `setting` JSON string,
 * returning the serialized result. Only `language` is mutated; all other
 * setting fields are preserved. Malformed input is treated as empty.
 *
 * @param {string|undefined|null} settingString existing setting JSON
 * @param {string} language normalized language tag to store
 * @returns {string} serialized setting JSON with language merged in
 */
export function mergeLanguageIntoSetting(settingString, language) {
  const settings = parseUserSetting(settingString);
  return JSON.stringify({ ...settings, language });
}

export const normalizeLanguage = (language) => {
  if (!language) {
    return language;
  }

  const normalized = language.trim().replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (
    lower === 'zh' ||
    lower === 'zh-cn' ||
    lower === 'zh-sg' ||
    lower.startsWith('zh-hans')
  ) {
    return 'zh-CN';
  }

  if (
    lower === 'zh-tw' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }

  const matchedLanguage = supportedLanguages.find(
    (supportedLanguage) => supportedLanguage.toLowerCase() === lower,
  );

  return matchedLanguage || normalized;
};

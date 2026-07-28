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

/**
 * Lazy i18n resource loader for the Classic theme.
 *
 * Replaces the former static `import` of all 50 locale JSON files in
 * `i18n.js`. Each language/namespace pair is mapped to a dynamic
 * `import()` thunk so the bundler emits one chunk per locale file and a
 * page only pays for the namespaces it actually renders.
 *
 * The module is deliberately side-effect free (no top-level i18next
 * interaction, no static JSON imports) so it can be imported directly
 * under Node's native test runner.
 */

import { supportedLanguages, normalizeLanguage } from './language.js';

/** Language used when the requested one is unsupported or fails to load. */
export const FALLBACK_LANGUAGE = 'en';

/** localStorage key written by LanguageDetector and our language switchers. */
export const LANGUAGE_STORAGE_KEY = 'i18nextLng';

/**
 * Page-scoped namespaces loaded on demand. `translation` is the main app
 * namespace (always loaded for the first paint); the rest are tied to the
 * pages that use them.
 */
export const NAMESPACES = [
  'translation',
  'docs',
  'about',
  'waitlist',
  'kimi',
  'seedance',
  'aimedia',
];

/**
 * Explicit language -> namespace -> dynamic import() map. The bundler
 * needs statically analyzable, literal `import()` call sites to emit one
 * chunk per locale file, so the table is spelled out in full (7 langs x
 * 7 namespaces = 49 entries). The `with: { type: 'json' }` import
 * attribute is required for Node 22's native ESM loader and is supported
 * by Vite/Rollup for the production build.
 */
export const LAZY_LOADERS = {
  en: {
    translation: () => import('./locales/en.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/en.json', { with: { type: 'json' } }),
    about: () => import('./locales/about/en.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/en.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/en.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/en.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/en.json', { with: { type: 'json' } }),
  },
  'zh-CN': {
    translation: () =>
      import('./locales/zh-CN.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/zh-CN.json', { with: { type: 'json' } }),
    about: () =>
      import('./locales/about/zh-CN.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/zh-CN.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/zh-CN.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/zh-CN.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/zh-CN.json', { with: { type: 'json' } }),
  },
  'zh-TW': {
    translation: () =>
      import('./locales/zh-TW.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/zh-TW.json', { with: { type: 'json' } }),
    about: () =>
      import('./locales/about/zh-TW.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/zh-TW.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/zh-TW.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/zh-TW.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/zh-TW.json', { with: { type: 'json' } }),
  },
  fr: {
    translation: () => import('./locales/fr.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/fr.json', { with: { type: 'json' } }),
    about: () => import('./locales/about/fr.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/fr.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/fr.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/fr.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/fr.json', { with: { type: 'json' } }),
  },
  ru: {
    translation: () => import('./locales/ru.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/ru.json', { with: { type: 'json' } }),
    about: () => import('./locales/about/ru.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/ru.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/ru.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/ru.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/ru.json', { with: { type: 'json' } }),
  },
  ja: {
    translation: () => import('./locales/ja.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/ja.json', { with: { type: 'json' } }),
    about: () => import('./locales/about/ja.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/ja.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/ja.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/ja.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/ja.json', { with: { type: 'json' } }),
  },
  vi: {
    translation: () => import('./locales/vi.json', { with: { type: 'json' } }),
    docs: () => import('./locales/docs/vi.json', { with: { type: 'json' } }),
    about: () => import('./locales/about/vi.json', { with: { type: 'json' } }),
    waitlist: () =>
      import('./locales/waitlist/vi.json', { with: { type: 'json' } }),
    kimi: () => import('./locales/kimi/vi.json', { with: { type: 'json' } }),
    seedance: () =>
      import('./locales/seedance/vi.json', { with: { type: 'json' } }),
    aimedia: () =>
      import('./locales/aimedia/vi.json', { with: { type: 'json' } }),
  },
};

const isSupported = (lang) => supportedLanguages.includes(lang);

/**
 * Match a raw language tag (saved or browser-reported) to a supported
 * language code. Handles region suffixes (`en-US` -> `en`) and Chinese
 * variants (`zh-Hans` -> `zh-CN`, `zh-Hant`/`zh-HK`/`zh-MO` -> `zh-TW`)
 * via `normalizeLanguage`. Returns `null` if nothing supported can be
 * derived.
 *
 * @param {string|undefined|null} language raw tag
 * @returns {string|null} a supported language code, or null
 */
export function matchSupportedLanguage(language) {
  if (!language) return null;
  const normalized = normalizeLanguage(language);
  if (isSupported(normalized)) return normalized;
  // Try the base subtag, e.g. `en-US` -> `en`, `pt-BR` -> `pt` (unsupported).
  const base = String(normalized).toLowerCase().split('-')[0];
  const match = supportedLanguages.find(
    (supportedLanguage) => supportedLanguage.toLowerCase() === base,
  );
  return match || null;
}

/**
 * Synchronously resolve the initial target language using the same contract
 * as the i18next LanguageDetector (localStorage first, then navigator),
 * plus an explicit English fallback for unsupported tags. Pure and
 * side-effect free so it can be exercised under Node.
 *
 * @param {string|undefined|null} savedLanguage language persisted by the
 *   language switcher / a prior LanguageDetector cache.
 * @param {string[]|undefined|null} browserLanguages `navigator.languages`
 *   (or similar) in priority order.
 * @returns {string} a supported language code (never empty)
 */
export function resolveLanguage(savedLanguage, browserLanguages) {
  const fromSaved = matchSupportedLanguage(savedLanguage);
  if (fromSaved) return fromSaved;

  if (Array.isArray(browserLanguages)) {
    for (const candidate of browserLanguages) {
      const matched = matchSupportedLanguage(candidate);
      if (matched) return matched;
    }
  } else if (typeof browserLanguages === 'string') {
    const matched = matchSupportedLanguage(browserLanguages);
    if (matched) return matched;
  }

  return FALLBACK_LANGUAGE;
}

/**
 * Default environment adapters for reading the visitor's saved language
 * and browser-reported languages. Injected by tests to avoid needing a
 * real DOM / localStorage.
 *
 * @returns {{ getSavedLanguage: () => string|null, getBrowserLanguages: () => string[] }}
 */
export function getDefaultLanguageEnv() {
  return {
    getSavedLanguage() {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          return localStorage.getItem(LANGUAGE_STORAGE_KEY);
        }
      } catch {
        // Private mode / blocked storage — treat as unset.
      }
      return null;
    },
    getBrowserLanguages() {
      if (typeof navigator === 'undefined' || !navigator) return [];
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        return Array.from(navigator.languages);
      }
      if (navigator.language) return [navigator.language];
      if (navigator.userLanguage) return [navigator.userLanguage];
      return [];
    },
  };
}

/**
 * Production entry for initial language detection. Reads localStorage
 * (`i18nextLng`) first, then `navigator.languages` / `navigator.language`,
 * then falls back to English. Always returns a supported language code so
 * the i18next init can set an explicit `lng` and avoid preloading the
 * English fallback chunk.
 *
 * @param {{ getSavedLanguage?: Function, getBrowserLanguages?: Function }} [env]
 * @returns {string} a supported language code
 */
export function detectInitialLanguage(env = getDefaultLanguageEnv()) {
  const saved =
    typeof env.getSavedLanguage === 'function' ? env.getSavedLanguage() : null;
  const browser =
    typeof env.getBrowserLanguages === 'function'
      ? env.getBrowserLanguages()
      : [];
  return resolveLanguage(saved, browser);
}

/**
 * Extract the namespace resource object from a dynamically imported JSON
 * module. The main locale files wrap their keys under a `translation`
 * field; namespace locale files (docs/about/waitlist/kimi/seedance/aimedia)
 * store the keys at the top level. Both Vite and Node expose the JSON as
 * the module's `default` export.
 *
 * @param {Record<string, any>} mod the imported module namespace
 * @param {string} namespace namespace being loaded
 * @returns {Record<string, any>} the namespace's key-value map
 */
export function unwrapResource(mod, namespace) {
  const json =
    mod && Object.prototype.hasOwnProperty.call(mod, 'default')
      ? mod.default
      : mod;
  if (namespace === 'translation') {
    return (json && json.translation) || json || {};
  }
  return json || {};
}

/**
 * Load a single namespace for a language. Unsupported languages are
 * resolved to English first. A real loader reject (network / chunk fail)
 * is caught and falls back to English. If English itself rejects or is
 * missing, returns `{}` so i18next renders keys and the app never hangs.
 *
 * @param {string} language requested language code
 * @param {string} namespace namespace to load
 * @returns {Promise<Record<string, any>>} the namespace's key-value map
 */
export async function loadNamespace(language, namespace) {
  const targetLang = isSupported(language) ? language : FALLBACK_LANGUAGE;

  const tryLoad = async (lang) => {
    const loader = LAZY_LOADERS[lang]?.[namespace];
    if (typeof loader !== 'function') return null;
    try {
      return unwrapResource(await loader(), namespace);
    } catch {
      // Chunk failed to load (network, 404, parse error) — treat as miss
      // so the caller can fall back to English or return {}.
      return null;
    }
  };

  const result = await tryLoad(targetLang);
  if (result !== null) return result;

  // Target chunk missing or rejected -> fall back to English.
  if (targetLang !== FALLBACK_LANGUAGE) {
    const fallback = await tryLoad(FALLBACK_LANGUAGE);
    if (fallback !== null) return fallback;
  }

  // English itself missing/rejected -> empty map. i18next will render keys;
  // the app continues rendering instead of hanging on a white screen.
  return {};
}

/**
 * Build an i18next custom backend that loads namespaces on demand via
 * `loadNamespace`. i18next calls `read(language, namespace, callback)`
 * for each (language, namespace) it needs; we resolve it asynchronously
 * and always hand back a value (never `false`) so i18next does not spin
 * on repeated fallback attempts.
 *
 * @returns {{ type: 'backend', init: Function, read: Function }}
 */
export function createBackend() {
  return {
    type: 'backend',
    init() {
      // No backend-level options to configure.
    },
    read(language, namespace, callback) {
      loadNamespace(language, namespace).then(
        (data) => callback(null, data),
        // loadNamespace never rejects, but guard anyway so the app never hangs.
        () => callback(null, {}),
      );
    },
  };
}

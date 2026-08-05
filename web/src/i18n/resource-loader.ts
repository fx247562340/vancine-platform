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
import type { BackendModule, ReadCallback } from 'i18next'

/**
 * Lazy i18n resource loader.
 *
 * Replaces static `import` of all 7 locale JSON files in `config.ts`
 * (~2.3MB of translation data bundled into the entry chunk). Each language
 * is mapped to a dynamic `import()` thunk so the bundler emits one chunk
 * per locale file and the first paint only pays for the active language
 * (plus the `en` fallback preloaded by i18next).
 *
 * Internal language codes use camelCase (`zhCN` / `zhTW`) while locale
 * file names retain their original hyphenated form (`zh.json` / `zh-TW.json`).
 * The LOCALE_LOADERS table handles this mapping.
 */

/**
 * Explicit language -> dynamic import() map. The bundler needs statically
 * analyzable, literal `import()` call sites to emit one chunk per locale
 * file, so the table is spelled out in full. Both Vite/Vitest and
 * Rsbuild/Rspack expose the JSON as the module's `default` export.
 */
export const LOCALE_LOADERS = {
  en: () => import('./locales/en.json'),
  zhCN: () => import('./locales/zh.json'),
  zhTW: () => import('./locales/zh-TW.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
} as const

export type SupportedLocaleCode = keyof typeof LOCALE_LOADERS

/**
 * Extract the `translation` namespace bundle from a dynamically imported
 * locale JSON module. The locale files wrap their keys under a top-level
 * `translation` field (see locales/*.json); i18next backends must hand
 * back the namespace bundle itself, so unwrap it here.
 */
export function unwrapTranslationBundle(mod: unknown): Record<string, unknown> {
  const json = (
    mod && typeof mod === 'object' && 'default' in mod
      ? (mod as { default: unknown }).default
      : mod
  ) as Record<string, unknown> | null | undefined
  if (!json || typeof json !== 'object') return {}
  const wrapped = json.translation
  if (wrapped && typeof wrapped === 'object') {
    return wrapped as Record<string, unknown>
  }
  return json
}

/**
 * Load the translation bundle for a single language. Unsupported languages
 * resolve to an empty bundle, and a real loader rejection (chunk failed to
 * load) is caught and likewise yields `{}` — i18next then renders keys via
 * the `en` fallback instead of hanging on a white screen. Never rejects.
 */
export async function loadTranslationBundle(
  language: string
): Promise<Record<string, unknown>> {
  const loader = LOCALE_LOADERS[language as SupportedLocaleCode] as
    | (() => Promise<unknown>)
    | undefined
  if (typeof loader !== 'function') return {}
  try {
    return unwrapTranslationBundle(await loader())
  } catch {
    return {}
  }
}

/**
 * Factory for an i18next custom backend that loads locale bundles on
 * demand. i18next calls `read(language, namespace, callback)` for each
 * (language, namespace) it needs; we resolve it asynchronously and always
 * hand back a value (never `false`, never an error) so i18next does not
 * spin on repeated fallback attempts. A factory (rather than a shared
 * singleton object) keeps independent i18next instances — e.g. tests using
 * `createInstance()` — from interfering with each other.
 */
export function createLazyResourceBackend(): BackendModule {
  return {
    type: 'backend',
    init() {
      // No backend-level options to configure.
    },
    read(language: string, namespace: string, callback: ReadCallback): void {
      // The app uses a single `translation` namespace; any other namespace
      // is answered empty instead of triggering a locale chunk load.
      if (namespace !== 'translation') {
        callback(null, {})
        return
      }
      loadTranslationBundle(language).then(
        (data) => callback(null, data),
        // loadTranslationBundle never rejects, but guard anyway so the app
        // never hangs waiting on resources.
        () => callback(null, {})
      )
    },
  }
}

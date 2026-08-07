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
 *
 * Non-`translation` namespaces (e.g. `docs`) are rejected with an error so
 * i18next does NOT register an empty bundle — which would shadow the real
 * bundle loaded later by the namespace's own provider (DocsI18nProvider).
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
 * Injectable loader table for `loadTranslationBundle`. Defaults to the
 * production `LOCALE_LOADERS`; tests pass a local table (e.g. containing a
 * rejecting loader) so failure paths can be exercised without mutating the
 * shared module-level loaders.
 */
export type LocaleLoaderTable = Partial<
  Record<SupportedLocaleCode, () => Promise<unknown>>
>

/**
 * Extract the `translation` namespace bundle from a dynamically imported
 * locale JSON module. The locale files wrap their keys under a top-level
 * `translation` field (see locales/*.json); i18next backends must hand
 * back the namespace bundle itself, so unwrap it here.
 */
export function unwrapTranslationBundle(mod: unknown): Record<string, unknown> {
  // Unwrap a dynamic-import module's `default` export when present.
  const json: unknown =
    mod && typeof mod === 'object' && 'default' in mod
      ? (mod as { default: unknown }).default
      : mod

  // Only a non-null, non-array object can be a bundle.
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {}

  const bundle = json as Record<string, unknown>

  // When a `translation` wrapper exists it must itself be a non-array object;
  // any other shape (null, array, string, number, ...) is treated as invalid
  // and yields an empty bundle.
  if ('translation' in bundle) {
    const wrapped = bundle.translation
    if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
      return wrapped as Record<string, unknown>
    }
    return {}
  }

  // No `translation` wrapper: hand the plain object back unchanged.
  return bundle
}

/**
 * Load the translation bundle for a single language. Unsupported languages
 * resolve to an empty bundle, and a real loader rejection (chunk failed to
 * load) is caught and likewise yields `{}` — i18next then renders keys via
 * the `en` fallback instead of hanging on a white screen. Never rejects.
 */
export async function loadTranslationBundle(
  language: string,
  loaders: LocaleLoaderTable = LOCALE_LOADERS
): Promise<Record<string, unknown>> {
  const loader = loaders[language as SupportedLocaleCode]
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
 * (language, namespace) it needs. The `translation` namespace is loaded
 * asynchronously via dynamic import; other namespaces (e.g. `docs`)
 * receive an error callback so i18next does NOT register an empty bundle
 * that would shadow the real bundle loaded by the namespace's own provider.
 * A factory (rather than a shared singleton object) keeps independent
 * i18next instances — e.g. tests using `createInstance()` — from
 * interfering with each other.
 */
export function createLazyResourceBackend(
  loadBundle: (
    language: string
  ) => Promise<Record<string, unknown>> = loadTranslationBundle
): BackendModule {
  return {
    type: 'backend',
    init() {
      // No backend-level options to configure.
    },
    async read(
      language: string,
      namespace: string,
      callback: ReadCallback
    ): Promise<void> {
      // The app uses a single `translation` namespace managed by this
      // backend. Other namespaces (e.g. 'docs') are loaded independently
      // by their own providers. Returning an error tells i18next the load
      // failed so it does NOT register an empty bundle — which would
      // shadow the real bundle loaded later by the namespace's own provider.
      if (namespace !== 'translation') {
        callback(
          new Error(`Namespace "${namespace}" is loaded by its own provider`),
          null
        )
        return
      }
      // loadTranslationBundle never rejects (it catches internally), but guard
      // anyway so the callback is always invoked exactly once with a real
      // (possibly empty) bundle rather than left dangling.
      let data: Record<string, unknown> = {}
      try {
        data = await loadBundle(language)
      } catch {
        data = {}
      }
      callback(null, data)
    },
  }
}

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
import { normalizeInterfaceLanguage } from '@/i18n/languages'

export const DOCS_NS = 'docs'

export type DocsLocale = 'en' | 'zhCN' | 'zhTW' | 'fr' | 'ru' | 'ja' | 'vi'

/**
 * Maps the app's resolved language to a Docs locale code.
 *
 * Delegates to the shared BCP 47 normalizer so Traditional variants
 * (zh-Hant, zh-HK, zh-MO) and extension tags (zh-TW-u-ca-chinese) resolve
 * identically to the global interface, while unknown tags fall back to
 * English. The Docs locale set is identical to the interface language set,
 * so the normalized code is directly usable as a Docs locale.
 */
export function resolveDocsLocale(lang: string): DocsLocale {
  return normalizeInterfaceLanguage(lang) as DocsLocale
}

export type DocsBundleLoader = () => Promise<Record<string, unknown>>

const localeLoaders: Record<DocsLocale, DocsBundleLoader> = {
  en: () => import('./locales/en.json'),
  zhCN: () => import('./locales/zhCN.json'),
  zhTW: () => import('./locales/zhTW.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
}

const loadingPromises = new Map<string, Promise<void>>()

/**
 * Synchronous readiness check: is the Docs bundle for `locale` in the store?
 */
export function isDocsBundleReady(locale: DocsLocale): boolean {
  return i18n.hasResourceBundle(locale, DOCS_NS)
}

/**
 * Ensure the Docs namespace bundle for `locale` is present in the i18next store.
 *
 * Lifecycle guarantees:
 * - Concurrent calls for the same locale are deduplicated (single in-flight load).
 * - English is always ensured first so it is available as the i18next fallback.
 * - On load failure for a non-English locale, the English bundle is installed
 *   under that locale so rendering always resolves to real copy (never raw keys)
 *   and the promise still resolves (ready becomes true).
 * - If the English bundle itself cannot be loaded, the promise REJECTS so the
 *   caller can enter a deterministic error terminal state (no infinite retry).
 * - On resolve, `isDocsBundleReady(locale)` is guaranteed true.
 *
 * `loaders` is injectable for testing; production uses the bundled JSON imports.
 */
export async function ensureDocsBundle(
  locale: DocsLocale,
  loaders: Record<DocsLocale, DocsBundleLoader> = localeLoaders
): Promise<void> {
  if (i18n.hasResourceBundle(locale, DOCS_NS)) return

  const existing = loadingPromises.get(locale)
  if (existing) return existing

  const promise = (async () => {
    try {
      // Always guarantee the English fallback bundle first (may reject).
      if (locale !== 'en' && !i18n.hasResourceBundle('en', DOCS_NS)) {
        await ensureDocsBundle('en', loaders)
      }
      const mod = await loaders[locale]()
      const data = (mod.default ?? mod) as Record<string, unknown>
      i18n.addResourceBundle(locale, DOCS_NS, data, true, true)
    } catch (error) {
      if (locale !== 'en') {
        // Fall back to English content installed under this locale.
        if (i18n.hasResourceBundle('en', DOCS_NS)) {
          const enBundle = i18n.getResourceBundle('en', DOCS_NS) as
            | Record<string, unknown>
            | undefined
          if (enBundle) {
            i18n.addResourceBundle(locale, DOCS_NS, enBundle, true, true)
            return
          }
        }
      }
      // English (or the last-resort fallback) failed: surface a terminal error.
      throw error
    } finally {
      loadingPromises.delete(locale)
    }
  })()

  loadingPromises.set(locale, promise)
  return promise
}

/**
 * Read the currently stored Docs bundle for a locale (empty object if absent).
 */
export function getDocsBundle(locale: DocsLocale): Record<string, unknown> {
  return (
    (i18n.getResourceBundle(locale, DOCS_NS) as
      | Record<string, unknown>
      | undefined) ?? {}
  )
}

// Note: there is intentionally NO module-level eager preload here. The
// DocsI18nProvider is the single owner of the bundle loading lifecycle, so a
// failed load can reach one deterministic error terminal state instead of an
// unhandled fire-and-forget rejection.

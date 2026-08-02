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
 * Classic → Default local preference migration (non-destructive).
 *
 * P0 scope: copy the user's theme-mode preference to the Default cookie.
 * Everything else is preserved exactly as-is.
 *
 * Design principles:
 *   - NEVER delete or rewrite any localStorage key in P0. Classic
 *     preferences must survive so that switching back to Classic retains
 *     all state, and later migration batches may need source data.
 *   - Only perform additive operations: copy theme to cookie, stamp the
 *     version sentinel.
 *   - Tolerate blocked/corrupt storage and cookies silently.
 *
 * Locale transformation (i18nextLng normalization) is intentionally NOT part
 * of this migration: it stays purely additive. Language normalization is owned
 * by the i18n package (`normalizeInterfaceLanguage` in `@/i18n/languages`),
 * which now offers a lossless mapping (including zh-TW). This module continues
 * to preserve the stored `i18nextLng` value verbatim and never rewrites it.
 */

const FRONTEND_CACHE_VERSION = 'default-v2'
const FRONTEND_CACHE_VERSION_KEY = 'newapi:default:cache-version'

/** Theme cookie name used by Default's theme-provider. */
const THEME_COOKIE_NAME = 'vite-ui-theme'

/** Classic's localStorage key for theme preference. */
const CLASSIC_THEME_MODE_KEY = 'theme-mode'

/**
 * Minimal cookie interface for dependency injection.
 * The Default implementation uses `document.cookie`.
 */
interface CookieStore {
  get(name: string): string | undefined
  set(name: string, value: string, maxAge: number): void
}

/**
 * Minimal read/write storage interface for dependency injection.
 * The Default implementation wraps `window.localStorage`.
 *
 * P0 intentionally does NOT include a `remove` method. The migration
 * must not delete any source key.
 */
interface SafeStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

// ---------------------------------------------------------------------------
// Browser implementations (tolerate blocked/corrupt storage)
// ---------------------------------------------------------------------------

function browserCookies(): CookieStore {
  return {
    get(name: string): string | undefined {
      try {
        if (typeof document === 'undefined') return undefined
        const value = `; ${document.cookie}`
        const parts = value.split(`; ${name}=`)
        if (parts.length === 2) {
          return parts.pop()?.split(';').shift()
        }
        return undefined
      } catch {
        return undefined
      }
    },
    set(name: string, value: string, maxAge: number): void {
      try {
        if (typeof document === 'undefined') return
        document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`
      } catch {
        // Cookie unavailable; skip silently
      }
    },
  }
}

function browserStorage(): SafeStorage {
  return {
    get(key: string): string | null {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set(key: string, value: string): void {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Quota exceeded or storage unavailable; skip silently
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Core migration logic (testable with injected dependencies)
// ---------------------------------------------------------------------------

/**
 * Run the Classic → Default migration with the given storage and cookie
 * backends. Exported for testing with mock implementations.
 *
 * This function is purely additive: it may copy theme-mode to a cookie
 * and stamp the version sentinel. It never deletes or modifies any
 * existing localStorage key.
 */
export function runMigration(storage: SafeStorage, cookies: CookieStore): void {
  const currentVersion = storage.get(FRONTEND_CACHE_VERSION_KEY)
  if (currentVersion === FRONTEND_CACHE_VERSION) return

  migrateClassicThemeMode(storage, cookies)

  storage.set(FRONTEND_CACHE_VERSION_KEY, FRONTEND_CACHE_VERSION)
}

/**
 * Copy Classic `theme-mode` (dark|light|auto) to the Default cookie
 * `vite-ui-theme` (dark|light|system) ONLY when the cookie is absent.
 *
 * The Classic `theme-mode` key is intentionally preserved so that
 * switching back to Classic retains the user's preference.
 */
function migrateClassicThemeMode(
  storage: SafeStorage,
  cookies: CookieStore
): void {
  // If Default already has a theme cookie, never overwrite it.
  const existingCookie = cookies.get(THEME_COOKIE_NAME)
  if (existingCookie) return

  const classicTheme = storage.get(CLASSIC_THEME_MODE_KEY)
  if (!classicTheme) return

  const mapped = mapClassicThemeToDefault(classicTheme)
  if (mapped) {
    // 1 year max-age, matching Default's theme-provider
    cookies.set(THEME_COOKIE_NAME, mapped, 60 * 60 * 24 * 365)
  }
  // Do NOT remove the Classic key — preserve it for rollback.
}

/**
 * Map Classic theme-mode value to Default vite-ui-theme value.
 * Returns null for unrecognized values.
 */
export function mapClassicThemeToDefault(value: string): string | null {
  switch (value) {
    case 'dark':
      return 'dark'
    case 'light':
      return 'light'
    case 'auto':
      return 'system'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Browser entry point
// ---------------------------------------------------------------------------

export function initializeFrontendCache(): void {
  if (typeof window === 'undefined') return

  try {
    runMigration(browserStorage(), browserCookies())
  } catch {
    // Storage can be unavailable in private mode; the app should still boot.
  }
}

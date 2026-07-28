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
 * Shared theme-mode rules for the Classic theme.
 *
 * Used by:
 *   - ThemeProvider (src/context/Theme/index.jsx)
 *   - The synchronous boot-theme probe in index.html (must stay in lockstep)
 *   - Contract tests (import these helpers — do not re-copy the rules)
 *
 * Contract:
 *   localStorage key: 'theme-mode'
 *   valid modes: 'dark' | 'light' | 'auto'
 *   anything else (null / undefined / '' / garbage / blocked storage) → 'dark'
 *   actual theme for painting: dark | light (never 'auto')
 */

export const THEME_STORAGE_KEY = 'theme-mode';
export const THEME_DARK_BG = '#090909';
export const THEME_LIGHT_BG = '#ffffff';

/**
 * Normalize a raw theme-mode preference to a valid stored mode.
 *
 * @param {unknown} value raw value from localStorage or setTheme
 * @returns {'dark'|'light'|'auto'}
 */
export function normalizeThemeMode(value) {
  if (value === 'dark' || value === 'light' || value === 'auto') {
    return value;
  }
  return 'dark';
}

/**
 * Resolve the actual painted theme (never 'auto').
 *
 * @param {unknown} mode preference (may be dirty)
 * @param {'dark'|'light'|string} systemTheme from prefers-color-scheme
 * @returns {'dark'|'light'}
 */
export function resolveActualTheme(mode, systemTheme) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === 'auto') {
    return systemTheme === 'dark' ? 'dark' : 'light';
  }
  return normalized;
}

/**
 * Map an actual theme to the solid boot / chrome background color.
 *
 * @param {'dark'|'light'|string} actualTheme
 * @returns {string} CSS color
 */
export function themeBackground(actualTheme) {
  return actualTheme === 'light' ? THEME_LIGHT_BG : THEME_DARK_BG;
}

/**
 * Read + normalize the saved preference from a storage-like object.
 * Safe against missing storage and thrown getItem.
 *
 * @param {{ getItem?: (key: string) => string|null }} [storage]
 * @returns {'dark'|'light'|'auto'}
 */
export function readStoredThemeMode(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') {
      return 'dark';
    }
    return normalizeThemeMode(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

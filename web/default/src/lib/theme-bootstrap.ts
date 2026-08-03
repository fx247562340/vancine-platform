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

// Pre-paint theme resolution, shared in spirit with the inline bootstrap script
// in `index.html` (which must stay dependency-free and synchronous). Mirrors
// ThemeProvider's resolution order: cookie `dark` > `light` > system
// preference. ThemeProvider itself only applies the class in a post-mount
// useEffect, which causes a white first frame (FOUC) for dark-mode users; the
// inline script runs this same logic before the first paint.

export const THEME_BOOTSTRAP_COOKIE_NAME = 'vite-ui-theme'

export type ResolvedInitialTheme = 'dark' | 'light'

/** Read the theme cookie value from a raw `document.cookie` string. */
export function readStoredTheme(cookieString: string): string | null {
  const pattern = new RegExp(`(?:^|; )${THEME_BOOTSTRAP_COOKIE_NAME}=([^;]*)`)
  const match = cookieString.match(pattern)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Resolve the initial theme from the cookie string and the system preference.
 * Order matches ThemeProvider: explicit `dark` > explicit `light` > system.
 * Any unrecognized cookie value (including `system`) falls back to the OS
 * preference.
 */
export function resolveInitialTheme(
  cookieString: string,
  prefersDark: boolean
): ResolvedInitialTheme {
  const stored = readStoredTheme(cookieString)
  if (stored === 'dark') return 'dark'
  if (stored === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

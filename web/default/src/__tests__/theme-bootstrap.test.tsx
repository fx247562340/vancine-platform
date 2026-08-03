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
// Tests for the pre-paint theme bootstrap (B2):
// 1. Static check that index.html ships a synchronous (non-defer) inline
//    <script> reading the `vite-ui-theme` cookie and toggling the dark class.
// 2. Behavior checks that execute that exact inline script in jsdom under
//    dark / light / system scenarios.
// 3. Unit checks for the shared pure resolver in src/lib/theme-bootstrap.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { readStoredTheme, resolveInitialTheme } from '../lib/theme-bootstrap'

const INDEX_HTML_PATH = path.resolve(__dirname, '../../index.html')

function readIndexHtml(): string {
  return readFileSync(INDEX_HTML_PATH, 'utf8')
}

/** Extract the attribute-less (synchronous, inline) <script> body. */
function extractInlineBootstrapScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('inline bootstrap <script> not found')
  return match[1]
}

function setPrefersDark(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function clearThemeCookie() {
  document.cookie = 'vite-ui-theme=; Max-Age=0'
}

function resetDom() {
  clearThemeCookie()
  document.documentElement.classList.remove('dark', 'light')
  document.querySelector('meta[name="theme-color"]')?.remove()
  document.head.insertAdjacentHTML(
    'beforeend',
    '<meta name="theme-color" content="#090909" />'
  )
}

beforeEach(() => {
  resetDom()
})

describe('index.html inline theme bootstrap script (static)', () => {
  it('contains a non-defer inline <script> that reads vite-ui-theme and applies the dark class', () => {
    const html = readIndexHtml()
    const script = extractInlineBootstrapScript(html)

    // Reads the same cookie ThemeProvider persists to.
    expect(script).toContain('vite-ui-theme')
    // Applies the class synchronously (dark/light branches both present).
    expect(script).toContain('classList.add')
    expect(script).toMatch(/dark/)
    expect(script).toMatch(/light/)
    // Falls back to the OS preference.
    expect(script).toContain('prefers-color-scheme: dark')
    // Swallows errors so it can never block rendering.
    expect(script).toMatch(/catch\s*\(/)
  })

  it('runs before any defer/async script and syncs the theme-color meta', () => {
    const html = readIndexHtml()
    const inlineStart = html.search(/<script>/)
    const deferredStart = html.search(/<script[^>]*\sdefer[^>]*>/)

    expect(inlineStart).toBeGreaterThan(-1)
    expect(deferredStart).toBeGreaterThan(-1)
    expect(inlineStart).toBeLessThan(deferredStart)

    const script = extractInlineBootstrapScript(html)
    expect(script).toContain('theme-color')
  })

  it('defaults the static theme-color meta to dark', () => {
    const html = readIndexHtml()
    expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#090909"\s*\/>/)
  })
})

describe('index.html inline theme bootstrap script (jsdom behavior)', () => {
  function runInlineScript() {
    const script = extractInlineBootstrapScript(readIndexHtml())
    // Execute the exact shipped code in the jsdom globals.
    new Function(script)()
  }

  it('applies dark when cookie vite-ui-theme=dark', () => {
    document.cookie = 'vite-ui-theme=dark'
    setPrefersDark(false)

    runInlineScript()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content')
    ).toBe('#090909')
  })

  it('applies light when cookie vite-ui-theme=light', () => {
    document.cookie = 'vite-ui-theme=light'
    setPrefersDark(true)

    runInlineScript()

    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content')
    ).toBe('#ffffff')
  })

  it('falls back to system dark when no cookie is set', () => {
    clearThemeCookie()
    setPrefersDark(true)

    runInlineScript()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('falls back to system light when cookie is "system"', () => {
    document.cookie = 'vite-ui-theme=system'
    setPrefersDark(false)

    runInlineScript()

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })
})

describe('resolveInitialTheme / readStoredTheme (pure logic)', () => {
  it('reads the cookie from a document.cookie-style string', () => {
    expect(readStoredTheme('a=1; vite-ui-theme=dark; b=2')).toBe('dark')
    expect(readStoredTheme('vite-ui-theme=light')).toBe('light')
    expect(readStoredTheme('other=dark')).toBeNull()
    expect(readStoredTheme('')).toBeNull()
  })

  it('decodes URI-encoded cookie values', () => {
    expect(readStoredTheme('vite-ui-theme=dark%0A')).toBe('dark\n')
  })

  it('prefers explicit cookie values over the OS preference', () => {
    expect(resolveInitialTheme('vite-ui-theme=dark', false)).toBe('dark')
    expect(resolveInitialTheme('vite-ui-theme=light', true)).toBe('light')
  })

  it('falls back to the OS preference for missing or system cookies', () => {
    expect(resolveInitialTheme('', true)).toBe('dark')
    expect(resolveInitialTheme('', false)).toBe('light')
    expect(resolveInitialTheme('vite-ui-theme=system', true)).toBe('dark')
    expect(resolveInitialTheme('vite-ui-theme=bogus', false)).toBe('light')
  })
})

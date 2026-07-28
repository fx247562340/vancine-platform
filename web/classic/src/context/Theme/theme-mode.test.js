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
// Run with: node --test src/context/Theme/theme-mode.test.js
//
// Production pure-function + source-contract tests for theme-mode
// normalization (CC-WEBPERF-20260728-004-R1). Imports the REAL helpers
// from theme-mode.js — does not re-implement the rules.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInNewContext } from 'node:vm';

import {
  normalizeThemeMode,
  resolveActualTheme,
  themeBackground,
  readStoredThemeMode,
  THEME_STORAGE_KEY,
  THEME_DARK_BG,
  THEME_LIGHT_BG,
} from './theme-mode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const themeProviderSrc = readFileSync(join(__dirname, 'index.jsx'), 'utf8');
const htmlSrc = readFileSync(
  join(__dirname, '..', '..', '..', 'index.html'),
  'utf8',
);

describe('normalizeThemeMode (production helper)', () => {
  test('null / undefined / empty → dark', () => {
    assert.equal(normalizeThemeMode(null), 'dark');
    assert.equal(normalizeThemeMode(undefined), 'dark');
    assert.equal(normalizeThemeMode(''), 'dark');
  });

  test('garbage / legacy values → dark', () => {
    assert.equal(normalizeThemeMode('garbage'), 'dark');
    assert.equal(normalizeThemeMode('DARK'), 'dark');
    assert.equal(normalizeThemeMode('system'), 'dark');
    assert.equal(normalizeThemeMode(true), 'dark');
    assert.equal(normalizeThemeMode(0), 'dark');
  });

  test('valid dark / light / auto keep their identity', () => {
    assert.equal(normalizeThemeMode('dark'), 'dark');
    assert.equal(normalizeThemeMode('light'), 'light');
    assert.equal(normalizeThemeMode('auto'), 'auto');
  });
});

describe('resolveActualTheme (production helper)', () => {
  test('auto follows systemTheme', () => {
    assert.equal(resolveActualTheme('auto', 'dark'), 'dark');
    assert.equal(resolveActualTheme('auto', 'light'), 'light');
  });

  test('explicit dark/light ignore systemTheme', () => {
    assert.equal(resolveActualTheme('dark', 'light'), 'dark');
    assert.equal(resolveActualTheme('light', 'dark'), 'light');
  });

  test('garbage preference collapses to dark (not light)', () => {
    // The P2 bug: un-normalized garbage flowed into actualTheme and the
    // DOM effect treated anything !== 'dark' as light. Must stay dark.
    assert.equal(resolveActualTheme('garbage', 'light'), 'dark');
    assert.equal(resolveActualTheme('', 'light'), 'dark');
    assert.equal(resolveActualTheme(null, 'light'), 'dark');
  });
});

describe('themeBackground + readStoredThemeMode', () => {
  test('background colors match boot chrome', () => {
    assert.equal(themeBackground('dark'), THEME_DARK_BG);
    assert.equal(themeBackground('light'), THEME_LIGHT_BG);
    // Unknown actual → dark bg (safe).
    assert.equal(themeBackground('nope'), THEME_DARK_BG);
  });

  test('readStoredThemeMode normalizes storage + survives throws', () => {
    assert.equal(readStoredThemeMode(null), 'dark');
    assert.equal(readStoredThemeMode({ getItem: () => 'light' }), 'light');
    assert.equal(readStoredThemeMode({ getItem: () => 'garbage' }), 'dark');
    assert.equal(
      readStoredThemeMode({
        getItem() {
          throw new Error('blocked');
        },
      }),
      'dark',
    );
    assert.equal(THEME_STORAGE_KEY, 'theme-mode');
  });
});

describe('ThemeProvider wires the shared helpers (source contract)', () => {
  test('Theme/index.jsx imports normalizeThemeMode + resolveActualTheme', () => {
    assert.ok(
      /from\s+['"]\.\/theme-mode(\.js)?['"]/.test(themeProviderSrc),
      'ThemeProvider must import from ./theme-mode',
    );
    assert.ok(
      /normalizeThemeMode/.test(themeProviderSrc),
      'ThemeProvider must reference normalizeThemeMode',
    );
    assert.ok(
      /resolveActualTheme/.test(themeProviderSrc),
      'ThemeProvider must reference resolveActualTheme',
    );
  });

  test('initial state does not put raw localStorage into useState', () => {
    // Must not be: useState(() => localStorage.getItem('theme-mode') || 'dark')
    // Must normalize the getItem result.
    assert.ok(
      /normalizeThemeMode\s*\(/.test(themeProviderSrc),
      'initial state must pass storage value through normalizeThemeMode',
    );
    // The anti-pattern: direct getItem result as state without normalize.
    // Allow getItem only when its result is immediately normalized.
    const rawUseState =
      /useState\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?getItem\s*\(\s*['"]theme-mode['"]\s*\)\s*\|\|/.test(
        themeProviderSrc,
      ) && !/normalizeThemeMode\s*\([\s\S]*?getItem/.test(themeProviderSrc);
    assert.ok(
      !rawUseState,
      'useState initializer must not return raw getItem()||dark without normalizeThemeMode',
    );
  });

  test('actualTheme is not the bare ternary on un-normalized theme', () => {
    // Ban: const actualTheme = theme === 'auto' ? systemTheme : theme;
    // Require resolveActualTheme(...) instead.
    const bareTernary =
      /const\s+actualTheme\s*=\s*theme\s*===\s*['"]auto['"]\s*\?\s*systemTheme\s*:\s*theme/.test(
        themeProviderSrc,
      );
    assert.ok(
      !bareTernary,
      'actualTheme must not be `theme === "auto" ? systemTheme : theme`',
    );
    assert.ok(
      /resolveActualTheme\s*\(/.test(themeProviderSrc),
      'actualTheme must be produced by resolveActualTheme(...)',
    );
  });

  test('setTheme normalizes string input before state + storage', () => {
    assert.ok(
      /setTheme[\s\S]*normalizeThemeMode/.test(themeProviderSrc) ||
        /normalizeThemeMode[\s\S]*_setTheme/.test(themeProviderSrc),
      'setTheme must normalize string values so illegal modes are never persisted',
    );
  });
});

describe('index.html boot script executes the same illegal-value rule', () => {
  /**
   * Extract the first inline (no src=) script body from index.html — the
   * boot-theme probe — and run it under a fake DOM/localStorage to prove
   * illegal values paint dark, not light.
   */
  function runBootScript({ storedMode, prefersDark }) {
    const scripts = [
      ...htmlSrc.matchAll(
        /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    assert.ok(scripts.length > 0, 'index.html must have an inline boot script');
    // Prefer the script that mentions theme-mode.
    const body =
      scripts.map((m) => m[1]).find((s) => /theme-mode/.test(s)) ||
      scripts[0][1];

    const attrs = {};
    const classList = {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      contains(c) {
        return this._set.has(c);
      },
    };
    const documentElement = {
      style: { backgroundColor: '' },
      classList,
      setAttribute(k, v) {
        attrs[k] = v;
      },
      getAttribute(k) {
        return attrs[k];
      },
      removeAttribute(k) {
        delete attrs[k];
      },
    };
    const bodyAttrs = {};
    const bodyEl = {
      style: { backgroundColor: '' },
      setAttribute(k, v) {
        bodyAttrs[k] = v;
      },
      removeAttribute(k) {
        delete bodyAttrs[k];
      },
      getAttribute(k) {
        return bodyAttrs[k];
      },
    };
    let themeColor = '#090909';
    const meta = {
      setAttribute(k, v) {
        if (k === 'content') themeColor = v;
      },
      getAttribute(k) {
        return k === 'content' ? themeColor : null;
      },
    };

    const storage = {
      getItem(key) {
        if (key === 'theme-mode') {
          return storedMode;
        }
        return null;
      },
    };

    const sandbox = createContext({
      localStorage: storage,
      window: {
        matchMedia(query) {
          return {
            matches: /dark/.test(query) ? !!prefersDark : !prefersDark,
            addEventListener() {},
            removeEventListener() {},
          };
        },
      },
      document: {
        documentElement,
        body: bodyEl,
        querySelector(sel) {
          if (sel === 'meta[name="theme-color"]') return meta;
          return null;
        },
        addEventListener() {},
      },
    });

    runInNewContext(body, sandbox, { timeout: 1000 });

    return {
      htmlBg: documentElement.style.backgroundColor,
      bodyBg: bodyEl.style.backgroundColor,
      bootTheme: attrs['data-boot-theme'],
      htmlDark: classList.contains('dark'),
      bodyThemeMode: bodyAttrs['theme-mode'],
      themeColor,
    };
  }

  test('illegal stored mode paints dark (not light) via real boot script', () => {
    for (const garbage of ['garbage', '', 'DARK', 'system', null]) {
      const result = runBootScript({
        storedMode: garbage,
        prefersDark: false,
      });
      assert.equal(
        result.bootTheme,
        'dark',
        `data-boot-theme for ${JSON.stringify(garbage)}`,
      );
      assert.equal(
        result.htmlBg.toLowerCase(),
        THEME_DARK_BG,
        `html bg for ${JSON.stringify(garbage)}`,
      );
      assert.equal(
        result.themeColor.toLowerCase(),
        THEME_DARK_BG,
        `theme-color for ${JSON.stringify(garbage)}`,
      );
      assert.equal(
        result.htmlDark,
        true,
        `html.dark for ${JSON.stringify(garbage)}`,
      );
    }
  });

  test('light / dark / auto still resolve correctly via real boot script', () => {
    assert.equal(
      runBootScript({ storedMode: 'light', prefersDark: true }).bootTheme,
      'light',
    );
    assert.equal(
      runBootScript({ storedMode: 'dark', prefersDark: false }).bootTheme,
      'dark',
    );
    assert.equal(
      runBootScript({ storedMode: 'auto', prefersDark: true }).bootTheme,
      'dark',
    );
    assert.equal(
      runBootScript({ storedMode: 'auto', prefersDark: false }).bootTheme,
      'light',
    );
  });

  test('boot script + production helper agree on every fixture', () => {
    const fixtures = [
      [null, false],
      ['', true],
      ['garbage', false],
      ['dark', false],
      ['light', true],
      ['auto', true],
      ['auto', false],
    ];
    for (const [stored, prefersDark] of fixtures) {
      const expected = resolveActualTheme(
        stored,
        prefersDark ? 'dark' : 'light',
      );
      const result = runBootScript({
        storedMode: stored,
        prefersDark,
      });
      assert.equal(
        result.bootTheme,
        expected,
        `script vs helper for stored=${JSON.stringify(stored)} prefersDark=${prefersDark}`,
      );
      assert.equal(
        result.htmlBg.toLowerCase(),
        themeBackground(expected).toLowerCase(),
      );
    }
  });
});

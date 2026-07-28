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
// Run with: node --test src/App.route-split.test.js
//
// Static source-contract tests for Phase 2 route-level code splitting
// (CC-WEBPERF-20260727-002). Intentionally regex-based rather than
// whitespace-brittle so formatting/prettier churn does not flake them.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeThemeMode,
  resolveActualTheme,
  themeBackground,
  THEME_DARK_BG,
  THEME_LIGHT_BG,
} from './context/Theme/theme-mode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const appSrc = readFileSync(join(__dirname, 'App.jsx'), 'utf8');
const i18nSrc = readFileSync(join(__dirname, 'i18n', 'i18n.js'), 'utf8');
const indexSrc = readFileSync(join(__dirname, 'index.jsx'), 'utf8');
const themeProviderSrc = readFileSync(
  join(__dirname, 'context', 'Theme', 'index.jsx'),
  'utf8',
);
const htmlSrc = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

/**
 * Strip block + line comments so import/path assertions ignore docs.
 * Not a full JS parser — good enough for contract tests on our sources.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const appCode = stripComments(appSrc);
const i18nCode = stripComments(i18nSrc);
const indexCode = stripComments(indexSrc);
const htmlCode = stripComments(htmlSrc);
const themeProviderCode = stripComments(themeProviderSrc);

/**
 * Extract the #vancine-boot element markup (opening tag through its matching
 * close, non-greedy). Returns '' when the id is absent.
 */
function extractBootMarkup(html) {
  const match = html.match(
    /<div\b[^>]*\bid\s*=\s*["']vancine-boot["'][^>]*>[\s\S]*?<\/div>/i,
  );
  return match ? match[0] : '';
}

const BOOT_DARK_BG = THEME_DARK_BG;
const BOOT_LIGHT_BG = THEME_LIGHT_BG;

/** Match a static ES module import of `specifier` (default or named). */
function hasStaticImport(src, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    String.raw`(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]${escaped}['"]\s*;?`,
    'm',
  );
  return re.test(src);
}

/** Match a dynamic `import('specifier')` (used by React.lazy). */
function hasDynamicImport(src, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(String.raw`import\s*\(\s*['"]${escaped}['"]\s*\)`);
  return re.test(src);
}

/** Match `const X = lazy(() => import('...'))` (allowing whitespace). */
function hasLazyBinding(src, bindingName) {
  const re = new RegExp(
    String.raw`(?:const|let|var)\s+${bindingName}\s*=\s*lazy\s*\(`,
  );
  return re.test(src);
}

// Route-only modules that MUST be code-split out of the entry. Paths are
// the exact specifiers used (or expected) by App.jsx.
const ROUTE_ONLY_MODULES = [
  // Already lazy in Phase 1 — keep them lazy.
  { specifier: './pages/Home', binding: 'Home' },
  { specifier: './pages/Dashboard', binding: 'Dashboard' },
  { specifier: './pages/About', binding: 'About' },
  { specifier: './pages/UserAgreement', binding: 'UserAgreement' },
  { specifier: './pages/PrivacyPolicy', binding: 'PrivacyPolicy' },
  { specifier: './pages/Waitlist', binding: 'Waitlist' },
  { specifier: './pages/Docs', binding: 'Docs' },
  { specifier: './pages/AiMediaApi', binding: 'AiMediaApi' },
  { specifier: './pages/SeedanceApi', binding: 'SeedanceApi' },
  { specifier: './pages/KimiK3Api', binding: 'KimiK3Api' },
  // Phase 2 targets — still statically imported today.
  { specifier: './pages/User', binding: 'User' },
  { specifier: './pages/NotFound', binding: 'NotFound' },
  { specifier: './pages/Forbidden', binding: 'Forbidden' },
  { specifier: './pages/Setting', binding: 'Setting' },
  { specifier: './pages/Channel', binding: 'Channel' },
  { specifier: './pages/Token', binding: 'Token' },
  { specifier: './pages/Redemption', binding: 'Redemption' },
  { specifier: './pages/TopUp', binding: 'TopUp' },
  { specifier: './pages/Log', binding: 'Log' },
  { specifier: './pages/Chat', binding: 'Chat' },
  { specifier: './pages/Chat2Link', binding: 'Chat2Link' },
  { specifier: './pages/Midjourney', binding: 'Midjourney' },
  { specifier: './pages/Pricing', binding: 'Pricing' },
  { specifier: './pages/Task', binding: 'Task' },
  { specifier: './pages/Model', binding: 'ModelPage' },
  { specifier: './pages/ModelDeployment', binding: 'ModelDeploymentPage' },
  { specifier: './pages/Playground', binding: 'Playground' },
  { specifier: './pages/Subscription', binding: 'Subscription' },
  { specifier: './pages/Setup', binding: 'Setup' },
  { specifier: './components/auth/RegisterForm', binding: 'RegisterForm' },
  { specifier: './components/auth/LoginForm', binding: 'LoginForm' },
  {
    specifier: './components/auth/PasswordResetForm',
    binding: 'PasswordResetForm',
  },
  {
    specifier: './components/auth/PasswordResetConfirm',
    binding: 'PasswordResetConfirm',
  },
  {
    specifier: './components/auth/OAuth2Callback',
    binding: 'OAuth2Callback',
  },
  {
    specifier: './components/settings/PersonalSetting',
    binding: 'PersonalSetting',
  },
];

// Framework pieces that MUST remain statically imported so startup
// semantics (auth guards, setup gate, loading fallback) never race a
// chunk load.
const MUST_STAY_STATIC = [
  { specifier: './components/common/ui/Loading', label: 'Loading' },
  { specifier: './helpers', label: 'auth helpers barrel' },
  { specifier: './components/layout/SetupCheck', label: 'SetupCheck' },
  { specifier: './context/Status', label: 'StatusContext' },
];

// Critical route paths that must still appear in the router tree.
const REQUIRED_PATHS = [
  '/',
  '/setup',
  '/forbidden',
  '/console/models',
  '/console/deployment',
  '/console/subscription',
  '/console/channel',
  '/console/token',
  '/console/playground',
  '/console/redemption',
  '/console/user',
  '/user/reset',
  '/login',
  '/register',
  '/reset',
  '/oauth/github',
  '/oauth/discord',
  '/oauth/oidc',
  '/oauth/linuxdo',
  '/oauth/:provider',
  '/console/setting',
  '/console/personal',
  '/console/topup',
  '/console/log',
  '/console',
  '/console/midjourney',
  '/console/task',
  '/pricing',
  '/about',
  '/user-agreement',
  '/privacy-policy',
  '/console/chat/:id?',
  '/chat2link',
  '/waitlist',
  '/docs',
  '/docs/:slug',
  '/ai-media-api',
  '/seedance-api',
  '/kimi-k3-api',
  '*',
];

describe('App.jsx route-level code splitting contract', () => {
  test('route-only modules must NOT be statically imported', () => {
    const stillStatic = ROUTE_ONLY_MODULES.filter((m) =>
      hasStaticImport(appCode, m.specifier),
    );
    assert.deepEqual(
      stillStatic.map((m) => m.specifier),
      [],
      `these route-only modules are still static imports (must be React.lazy):\n` +
        stillStatic.map((m) => `  - ${m.specifier}`).join('\n'),
    );
  });

  test('route-only modules must use React.lazy + dynamic import()', () => {
    const missing = ROUTE_ONLY_MODULES.filter(
      (m) =>
        !hasDynamicImport(appCode, m.specifier) ||
        !hasLazyBinding(appCode, m.binding),
    );
    assert.deepEqual(
      missing.map((m) => `${m.binding} <= ${m.specifier}`),
      [],
      `these route-only modules lack lazy(() => import(...)):\n` +
        missing.map((m) => `  - ${m.binding} from ${m.specifier}`).join('\n'),
    );
  });

  test('framework pieces must remain static imports', () => {
    for (const item of MUST_STAY_STATIC) {
      assert.ok(
        hasStaticImport(appCode, item.specifier),
        `${item.label} (${item.specifier}) must stay a static import`,
      );
      assert.ok(
        !hasDynamicImport(appCode, item.specifier),
        `${item.label} (${item.specifier}) must NOT be dynamically imported`,
      );
    }
  });

  test('auth wrappers remain in the route tree', () => {
    // Named imports from the helpers barrel (or direct identifiers).
    for (const name of ['PrivateRoute', 'AdminRoute', 'AuthRedirect']) {
      assert.ok(
        new RegExp(`\\b${name}\\b`).test(appCode),
        `App.jsx must still reference ${name}`,
      );
    }
    // SetupCheck wraps the Routes tree.
    assert.ok(
      /<SetupCheck[\s>]/.test(appCode) && /<\/SetupCheck>/.test(appCode),
      'SetupCheck must still wrap the Routes tree',
    );
  });

  test('every existing route path is preserved', () => {
    const missing = REQUIRED_PATHS.filter((p) => {
      // Paths appear as path='...' or path="..."
      const re = new RegExp(
        String.raw`path\s*=\s*['"]${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
      );
      return !re.test(appCode);
    });
    assert.deepEqual(
      missing,
      [],
      `missing route paths:\n${missing.map((p) => `  - ${p}`).join('\n')}`,
    );
  });

  test('lazy routes are wrapped by Suspense with Loading fallback', () => {
    // At least one Suspense + Loading pair must exist; and the file must
    // import both React.lazy/Suspense and the Loading component.
    assert.ok(
      /\blazy\b/.test(appCode) && /\bSuspense\b/.test(appCode),
      'App.jsx must use React.lazy and Suspense',
    );
    assert.ok(
      /<Suspense[\s>]/.test(appCode),
      'App.jsx must render <Suspense> boundaries',
    );
    assert.ok(
      /fallback\s*=\s*\{\s*<Loading[\s/>]/.test(appCode),
      'Suspense fallback must use <Loading />',
    );
  });

  test('pricing auth gate (requireAuth) is preserved', () => {
    assert.ok(
      /\bpricingRequireAuth\b/.test(appCode),
      'pricingRequireAuth memo must remain',
    );
    assert.ok(
      /HeaderNavModules/.test(appCode),
      'HeaderNavModules config read must remain',
    );
  });
});

describe('document.documentElement.lang sync contract', () => {
  test('i18n.js sets documentElement.lang on init and languageChanged', () => {
    // Must touch document.documentElement.lang (or documentElement.setAttribute('lang', ...)).
    const setsLang =
      /document\.documentElement\.lang\s*=/.test(i18nCode) ||
      /document\.documentElement\.setAttribute\s*\(\s*['"]lang['"]/.test(
        i18nCode,
      );
    assert.ok(
      setsLang,
      'i18n.js must assign document.documentElement.lang (or setAttribute("lang", ...))',
    );
    assert.ok(
      /languageChanged/.test(i18nCode),
      'i18n.js must listen for languageChanged to keep <html lang> in sync',
    );
  });

  test('i18n.js maps internal codes to reasonable BCP 47 tags', () => {
    // Expect an explicit mapping helper or inline map covering zh-CN / zh-TW.
    // We accept either a dedicated function name or a map literal that
    // contains the BCP 47 forms.
    const hasBcp47 =
      /zh-CN/.test(i18nCode) ||
      /toBcp47|bcp47|htmlLang|documentLang|langToHtml/i.test(i18nCode);
    assert.ok(
      hasBcp47,
      'i18n.js should map internal language codes to BCP 47 (at least handle zh-CN / zh-TW)',
    );
  });
});

describe('noscript vs boot splash contract', () => {
  test('index.html keeps a noscript enable-JS message', () => {
    assert.ok(
      /<noscript[\s>]/i.test(htmlSrc),
      'index.html must include a <noscript> element',
    );
    assert.ok(
      /enable JavaScript|JavaScript/i.test(htmlSrc),
      'noscript content should tell the user to enable JavaScript',
    );
  });

  test('boot splash is hidden or non-covering when JS is disabled', () => {
    // Accept any of:
    //   1. CSS `noscript ~ #root #vancine-boot { display:none }` / similar
    //   2. boot splash moved inside a script-only path
    //   3. noscript styled above the overlay (higher z-index / fixed)
    //   4. `@media` / `noscript` sibling rule that hides #vancine-boot
    const hidesBootForNoscript =
      /noscript[\s\S]{0,200}#vancine-boot[\s\S]{0,200}display\s*:\s*none/i.test(
        htmlSrc,
      ) ||
      /#vancine-boot[\s\S]{0,200}noscript/i.test(htmlSrc) ||
      /noscript\s+#vancine-boot|noscript\s*~[\s\S]{0,80}#vancine-boot|#root:not\(:has/i.test(
        htmlSrc,
      ) ||
      // noscript itself is position:fixed with a high z-index so it sits
      // above the boot overlay.
      /<noscript[^>]*style\s*=\s*["'][^"']*(?:z-index\s*:\s*\d{4,}|position\s*:\s*fixed)[^"']*["']/i.test(
        htmlSrc,
      ) ||
      /noscript\s*\{[^}]*(?:z-index\s*:\s*\d{4,}|position\s*:\s*fixed)[^}]*\}/i.test(
        htmlSrc,
      );

    assert.ok(
      hidesBootForNoscript,
      'when JS is disabled, #vancine-boot must not cover the noscript message ' +
        '(hide the boot splash via noscript CSS, or raise noscript above it)',
    );
  });
});

describe('plain boot layer contract (CC-WEBPERF-20260728-004)', () => {
  const bootMarkup = extractBootMarkup(htmlSrc);

  test('#vancine-boot still exists inside #root', () => {
    assert.ok(bootMarkup, 'index.html must keep a #vancine-boot element');
    assert.ok(
      /id\s*=\s*["']root["'][\s\S]*id\s*=\s*["']vancine-boot["']/i.test(
        htmlSrc,
      ),
      '#vancine-boot must live inside #root so React createRoot replaces it',
    );
  });

  test('#vancine-boot is aria-hidden (no readable content)', () => {
    assert.ok(
      /aria-hidden\s*=\s*["']true["']/i.test(bootMarkup),
      '#vancine-boot must set aria-hidden="true" because it has no readable content',
    );
  });

  test('boot layer has no visible brand mark, spinner, or loading chrome', () => {
    // No Vancine wordmark text node inside the boot element.
    assert.ok(
      !/>\s*Vancine\s*</.test(bootMarkup),
      '#vancine-boot must not contain a visible "Vancine" wordmark',
    );
    // No <img> / logo asset.
    assert.ok(
      !/<img\b/i.test(bootMarkup),
      '#vancine-boot must not contain an <img>',
    );
    assert.ok(
      !/logo\.(svg|png|webp|jpg)/i.test(bootMarkup),
      '#vancine-boot must not reference a logo asset',
    );
    // No spinner / loading animation class or keyframes reference.
    assert.ok(
      !/vancine-boot-spin/i.test(htmlSrc),
      'index.html must not define or reference vancine-boot-spin',
    );
    assert.ok(
      !/@keyframes\s+vancine-boot/i.test(htmlSrc),
      'index.html must not define boot spinner keyframes',
    );
    assert.ok(
      !/animation\s*:/i.test(bootMarkup),
      '#vancine-boot must not use CSS animation',
    );
    // No loading copy.
    assert.ok(
      !/loading|正在加载|加载中|please wait|spinner/i.test(bootMarkup),
      '#vancine-boot must not contain loading copy',
    );
    // No nested content elements that would paint chrome (only empty shell).
    // Allow a single empty container; reject nested brand/spinner divs with text.
    const innerText = bootMarkup
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.equal(
      innerText,
      '',
      `#vancine-boot must be an empty pure-color shell, found text: ${JSON.stringify(innerText)}`,
    );
  });

  test('boot theme defaults to dark (#090909) matching ThemeProvider', () => {
    // Production helpers (not a re-copied resolveBootTheme) drive the contract.
    assert.equal(normalizeThemeMode(null), 'dark');
    assert.equal(normalizeThemeMode(''), 'dark');
    assert.equal(normalizeThemeMode('garbage'), 'dark');
    assert.equal(resolveActualTheme('garbage', 'light'), 'dark');
    assert.equal(themeBackground('dark'), BOOT_DARK_BG);

    // The production HTML must hard-code the dark bg as the default paint
    // (inline on #vancine-boot and/or on body/html before any script runs),
    // so the first frame is never white when the visitor has no saved theme.
    const hasDefaultDarkBg =
      new RegExp(
        `#vancine-boot[^>]*(?:style\\s*=\\s*["'][^"']*background(?:-color)?\\s*:\\s*${BOOT_DARK_BG.replace('#', '#?')}|class\\s*=)`,
        'i',
      ).test(htmlSrc) || /background(?:-color)?\s*:\s*#090909/i.test(htmlSrc);
    assert.ok(
      hasDefaultDarkBg,
      `index.html must default the boot background to ${BOOT_DARK_BG} (ThemeProvider default dark)`,
    );

    // theme-color meta should not stay locked on pure white once boot is dark-first.
    const themeColorMatch = htmlSrc.match(
      /<meta\b[^>]*name\s*=\s*["']theme-color["'][^>]*>/i,
    );
    assert.ok(themeColorMatch, 'theme-color meta must exist');
    // Either the meta content itself is the dark bg, or a head sync script
    // rewrites it before first paint. A hard-coded content="#ffffff" with no
    // sync script is the FOUC we are fixing.
    const metaTag = themeColorMatch[0];
    const metaIsWhite = /content\s*=\s*["']#ffffff["']/i.test(metaTag);
    const hasThemeSyncScript =
      /theme-mode|theme-color|prefers-color-scheme/i.test(htmlSrc) &&
      /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?(?:theme-mode|theme-color)[\s\S]*?<\/script>/i.test(
        htmlSrc,
      );
    assert.ok(
      !metaIsWhite || hasThemeSyncScript,
      'theme-color must not stay hard-coded #ffffff without a sync script that rewrites it pre-paint',
    );
  });

  test('saved light/dark/auto resolve like ThemeProvider (shared helpers)', () => {
    assert.equal(resolveActualTheme('dark', 'light'), 'dark');
    assert.equal(resolveActualTheme('dark', 'dark'), 'dark');
    assert.equal(resolveActualTheme('light', 'dark'), 'light');
    assert.equal(resolveActualTheme('light', 'light'), 'light');
    assert.equal(resolveActualTheme('auto', 'dark'), 'dark');
    assert.equal(resolveActualTheme('auto', 'light'), 'light');
    // Illegal value must NOT paint light after mount (the P2 flash).
    assert.equal(resolveActualTheme('garbage', 'light'), 'dark');
    assert.equal(themeBackground('light'), BOOT_LIGHT_BG);

    // ThemeProvider must actually call the shared helpers (not a private copy).
    assert.ok(
      /from\s+['"]\.\/theme-mode(\.js)?['"]/.test(themeProviderCode),
      'ThemeProvider must import from ./theme-mode',
    );
    assert.ok(
      /normalizeThemeMode/.test(themeProviderCode),
      'ThemeProvider must call normalizeThemeMode',
    );
    assert.ok(
      /resolveActualTheme/.test(themeProviderCode),
      'ThemeProvider must call resolveActualTheme',
    );
    assert.ok(
      !/const\s+actualTheme\s*=\s*theme\s*===\s*['"]auto['"]\s*\?\s*systemTheme\s*:\s*theme/.test(
        themeProviderCode,
      ),
      'ThemeProvider must not use the bare auto ternary on un-normalized theme',
    );

    // Production HTML must contain a synchronous head/body script that reads
    // localStorage['theme-mode'] and prefers-color-scheme, matching the rules
    // above. We assert the script exists and references the contract keys —
    // not by re-running the script here (see theme-mode.test.js for the
    // executable boot-script fixtures).
    const syncScriptMatch = htmlSrc.match(
      /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
    );
    assert.ok(
      syncScriptMatch && syncScriptMatch.length > 0,
      'index.html must include an inline sync script for boot theme',
    );
    const syncJoined = syncScriptMatch.join('\n');
    assert.ok(
      /theme-mode/.test(syncJoined),
      'boot theme script must read localStorage key theme-mode',
    );
    assert.ok(
      /prefers-color-scheme/.test(syncJoined),
      'boot theme script must consult prefers-color-scheme for auto',
    );
    assert.ok(
      /localStorage/.test(syncJoined),
      'boot theme script must touch localStorage',
    );
    // Must mention both concrete background colors so light/dark paint differ.
    assert.ok(
      /#090909/i.test(syncJoined) || /#090909/i.test(htmlSrc),
      'dark boot background #090909 must appear in the theme path',
    );
    assert.ok(
      /#ffffff/i.test(syncJoined) ||
        /#fff\b/i.test(syncJoined) ||
        /#ffffff/i.test(htmlSrc),
      'light boot background must appear in the theme path',
    );
    // auto branch must exist.
    assert.ok(
      /['"]auto['"]/.test(syncJoined),
      'boot theme script must handle the auto mode',
    );
  });

  test('index.jsx still awaits i18nInitPromise before createRoot/render', () => {
    assert.ok(
      /i18nInitPromise|initPromise/.test(indexCode),
      'index.jsx must reference the i18n init promise',
    );
    assert.ok(
      /await\s+i18nInitPromise/.test(indexCode) ||
        /await\s+initPromise/.test(indexCode),
      'index.jsx must await the i18n init promise before mounting',
    );
    // createRoot/render must appear AFTER the await in source order so the
    // first language resource is ready (no English flash).
    const awaitIdx = indexCode.search(
      /await\s+(?:i18nInitPromise|initPromise)/,
    );
    const renderIdx = indexCode.search(/createRoot\s*\(|\.render\s*\(/);
    assert.ok(awaitIdx !== -1, 'await i18nInitPromise not found');
    assert.ok(renderIdx !== -1, 'createRoot/render not found');
    assert.ok(
      awaitIdx < renderIdx,
      'await i18nInitPromise must precede createRoot/render to keep the no-English-flash guarantee',
    );
  });
});

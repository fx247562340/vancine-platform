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
// Run with: node --test src/i18n/i18n.test.js
// Uses Node's native test runner.
//
// RED → GREEN regression for Classic i18n initialization + lazy loading.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const {
  normalizeLanguage,
  parseUserSetting,
  mergeLanguageIntoSetting,
  getDetectionConfig,
} = require('./language.js');

import {
  resolveLanguage,
  matchSupportedLanguage,
  detectInitialLanguage,
  loadNamespace,
  unwrapResource,
  createBackend,
  LAZY_LOADERS,
  NAMESPACES,
  FALLBACK_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
} from './resource-loader.js';

// Import the production init-options factory so tests assert against the
// REAL configuration, not a hand-copied snapshot.
import { getI18nInitOptions, toBcp47, syncDocumentLang } from './i18n.js';

describe('classic i18n init contract (against real production config)', () => {
  test('detection config must NOT hard-code a language', () => {
    const cfg = getDetectionConfig();
    assert.ok(
      !('lng' in cfg),
      'detection config must not contain `lng`, or it will override LanguageDetector and revert saved languages on reload',
    );
  });

  test('detection order must prefer localStorage, then navigator', () => {
    const cfg = getDetectionConfig();
    assert.deepEqual(cfg.order, ['localStorage', 'navigator']);
  });

  test('localStorage must be in the detection cache', () => {
    const cfg = getDetectionConfig();
    assert.ok(Array.isArray(cfg.caches), 'detection.caches must be an array');
    assert.ok(
      cfg.caches.includes('localStorage'),
      'detection.caches must include localStorage so the chosen language survives reloads',
    );
  });

  test('production getI18nInitOptions uses resolveLanguage via detectInitialLanguage', () => {
    // Production factory must call detectInitialLanguage (which wraps
    // resolveLanguage) so the init `lng` is never a hard-coded constant
    // and never left to a racey LanguageDetector preload.
    const src = readFileSync(join(__dirname, 'i18n.js'), 'utf8');
    assert.ok(
      src.includes('detectInitialLanguage'),
      'i18n.js must import/call detectInitialLanguage',
    );
    assert.ok(
      /lng\s*[:=]/.test(src),
      'i18n.js must set an explicit `lng` from detectInitialLanguage',
    );
    // Calling the factory with an injected language proves the option is wired.
    const opts = getI18nInitOptions('zh-TW');
    assert.equal(opts.lng, 'zh-TW');
    assert.equal(opts.fallbackLng, false);
    assert.deepEqual(opts.ns, ['translation']);
    assert.equal(opts.defaultNS, 'translation');
    assert.ok(!('resources' in opts), 'no static resources map');
  });

  test('zh-Hant / zh-HK resolve to zh-TW through production init options', () => {
    // Simulate the production detection path: resolveLanguage feeds the
    // init options. zh-Hant and zh-HK must become zh-TW, never zh-CN.
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => null,
          getBrowserLanguages: () => ['zh-Hant'],
        }),
      ).lng,
      'zh-TW',
    );
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => null,
          getBrowserLanguages: () => ['zh-HK'],
        }),
      ).lng,
      'zh-TW',
    );
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => null,
          getBrowserLanguages: () => ['zh-MO'],
        }),
      ).lng,
      'zh-TW',
    );
  });

  test('zh-Hans / zh / zh-CN resolve to zh-CN through production init options', () => {
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => null,
          getBrowserLanguages: () => ['zh-Hans'],
        }),
      ).lng,
      'zh-CN',
    );
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => null,
          getBrowserLanguages: () => ['zh'],
        }),
      ).lng,
      'zh-CN',
    );
    assert.equal(
      getI18nInitOptions(
        detectInitialLanguage({
          getSavedLanguage: () => 'zh-CN',
          getBrowserLanguages: () => ['en'],
        }),
      ).lng,
      'zh-CN',
    );
  });

  test('init loads only one translation language (fallbackLng false)', () => {
    // With fallbackLng:false and an explicit lng, i18next will only ask
    // the backend for that one language's translation namespace on init.
    const opts = getI18nInitOptions('fr');
    assert.equal(opts.fallbackLng, false);
    assert.equal(opts.lng, 'fr');
    assert.equal(opts.load, 'currentOnly');
    // ns is only the main translation namespace; page namespaces load later.
    assert.deepEqual(opts.ns, ['translation']);
  });

  test('unsupported browser language becomes en (single language, not dual-load)', () => {
    const opts = getI18nInitOptions(
      detectInitialLanguage({
        getSavedLanguage: () => null,
        getBrowserLanguages: () => ['de-DE', 'ko'],
      }),
    );
    assert.equal(opts.lng, 'en');
    assert.equal(opts.fallbackLng, false);
  });
});

describe('lazy-loading contract (RED -> GREEN for CC-WEBPERF-20260727-001)', () => {
  const i18nSrc = readFileSync(join(__dirname, 'i18n.js'), 'utf8');

  test('i18n.js must NOT statically import any locale JSON', () => {
    const staticJsonImport =
      /^\s*import\s+[^;]*from\s+['"]\.\/locales\/[^'"]+\.json['"]\s*;?/m;
    assert.ok(
      !staticJsonImport.test(i18nSrc),
      'i18n.js must not statically import locale JSON; use dynamic import() in resource-loader.js',
    );
  });

  test('i18n.js init options must NOT embed a static resources object', () => {
    assert.ok(
      !/^\s*resources\s*:/m.test(i18nSrc),
      'getI18nInitOptions must not contain a static `resources:` key; use the lazy backend',
    );
  });

  test('i18n.js must wire the lazy backend from resource-loader', () => {
    assert.ok(
      /resource-loader/.test(i18nSrc),
      'i18n.js must import the lazy backend from resource-loader.js',
    );
  });
});

describe('normalizeparse/merge user setting helpers', () => {
  test('normalizeLanguage maps browser codes to supported tags', () => {
    assert.equal(normalizeLanguage('zh'), 'zh-CN');
    assert.equal(normalizeLanguage('zh-TW'), 'zh-TW');
    assert.equal(normalizeLanguage('zh-HK'), 'zh-TW');
    assert.equal(normalizeLanguage('EN'), 'en');
    assert.equal(normalizeLanguage(''), '');
    assert.equal(normalizeLanguage(undefined), undefined);
    assert.equal(normalizeLanguage('zh-hans-CN'), 'zh-CN');
    assert.equal(normalizeLanguage('zh-hant'), 'zh-TW');
  });

  test('mergeLanguageIntoSetting preserves existing fields', () => {
    const existing = JSON.stringify({ theme: 'dark', language: 'en' });
    const parsed = JSON.parse(mergeLanguageIntoSetting(existing, 'zh-CN'));
    assert.equal(parsed.language, 'zh-CN');
    assert.equal(parsed.theme, 'dark');
  });

  test('mergeLanguageIntoSetting handles malformed / empty / null', () => {
    assert.equal(
      mergeLanguageIntoSetting('', 'zh-CN'),
      JSON.stringify({ language: 'zh-CN' }),
    );
    assert.equal(
      mergeLanguageIntoSetting('{not json', 'zh-CN'),
      JSON.stringify({ language: 'zh-CN' }),
    );
    assert.equal(
      mergeLanguageIntoSetting(undefined, 'zh-CN'),
      JSON.stringify({ language: 'zh-CN' }),
    );
    assert.equal(
      mergeLanguageIntoSetting(null, 'zh-CN'),
      JSON.stringify({ language: 'zh-CN' }),
    );
  });

  test('parseUserSetting returns {} for bad input', () => {
    assert.deepEqual(parseUserSetting(''), {});
    assert.deepEqual(parseUserSetting(null), {});
    assert.deepEqual(parseUserSetting('{bad'), {});
    assert.deepEqual(parseUserSetting('"string"'), {});
    assert.deepEqual(parseUserSetting('null'), {});
    assert.deepEqual(parseUserSetting(JSON.stringify({ theme: 'dark' })), {
      theme: 'dark',
    });
  });
});

describe('resource-loader: language detection', () => {
  test('saved language wins over browser languages', () => {
    assert.equal(resolveLanguage('zh-CN', ['en-US', 'fr']), 'zh-CN');
    assert.equal(resolveLanguage('fr', ['en-US']), 'fr');
  });

  test('falls back to browser languages when nothing saved', () => {
    assert.equal(resolveLanguage(undefined, ['en-US', 'zh']), 'en');
    assert.equal(resolveLanguage(undefined, ['zh-Hant', 'en']), 'zh-TW');
    assert.equal(resolveLanguage(undefined, ['ja-JP', 'en']), 'ja');
    assert.equal(resolveLanguage(undefined, ['fr-FR']), 'fr');
  });

  test('unsupported saved and browser languages fall back to en', () => {
    assert.equal(resolveLanguage('de', ['ko', 'pt-BR']), 'en');
    assert.equal(resolveLanguage(undefined, ['de-DE', 'ko']), 'en');
    assert.equal(resolveLanguage(undefined, undefined), 'en');
    assert.equal(resolveLanguage(null, null), 'en');
  });

  test('matchSupportedLanguage handles region suffixes and zh variants', () => {
    assert.equal(matchSupportedLanguage('en-US'), 'en');
    assert.equal(matchSupportedLanguage('zh-Hans-CN'), 'zh-CN');
    assert.equal(matchSupportedLanguage('zh-HK'), 'zh-TW');
    assert.equal(matchSupportedLanguage('zh-MO'), 'zh-TW');
    assert.equal(matchSupportedLanguage('zh-Hant'), 'zh-TW');
    assert.equal(matchSupportedLanguage('fr-FR'), 'fr');
    assert.equal(matchSupportedLanguage('ja-JP'), 'ja');
    assert.equal(matchSupportedLanguage('de'), null);
    assert.equal(matchSupportedLanguage(''), null);
    assert.equal(matchSupportedLanguage(undefined), null);
  });

  test('detectInitialLanguage reads saved then browser via env adapters', () => {
    assert.equal(
      detectInitialLanguage({
        getSavedLanguage: () => 'ja',
        getBrowserLanguages: () => ['en-US'],
      }),
      'ja',
    );
    assert.equal(
      detectInitialLanguage({
        getSavedLanguage: () => null,
        getBrowserLanguages: () => ['zh-Hant-TW', 'en'],
      }),
      'zh-TW',
    );
    assert.equal(
      detectInitialLanguage({
        getSavedLanguage: () => '',
        getBrowserLanguages: () => ['pt-BR'],
      }),
      'en',
    );
    assert.equal(LANGUAGE_STORAGE_KEY, 'i18nextLng');
  });
});

describe('resource-loader: mapping completeness', () => {
  test('every supported language has a loader for every namespace', () => {
    const langs = Object.keys(LAZY_LOADERS);
    assert.deepEqual(langs.sort(), [
      'en',
      'fr',
      'ja',
      'ru',
      'vi',
      'zh-CN',
      'zh-TW',
    ]);
    for (const lang of langs) {
      for (const ns of NAMESPACES) {
        assert.equal(
          typeof LAZY_LOADERS[lang][ns],
          'function',
          `missing loader for ${lang}/${ns}`,
        );
      }
    }
  });
});

describe('resource-loader: translation unwrapping', () => {
  test('main translation namespace is unwrapped from the translation key', () => {
    const fakeModule = { default: { translation: { Hello: 'World' } } };
    assert.deepEqual(unwrapResource(fakeModule, 'translation'), {
      Hello: 'World',
    });
  });

  test('page namespaces pass through the top-level object', () => {
    const fakeModule = { default: { quickstart: { title: 'x' } } };
    assert.deepEqual(unwrapResource(fakeModule, 'docs'), {
      quickstart: { title: 'x' },
    });
  });

  test('unwrapResource tolerates a missing default export', () => {
    assert.deepEqual(
      unwrapResource({ translation: { a: 'b' } }, 'translation'),
      {
        a: 'b',
      },
    );
  });
});

describe('resource-loader: namespace loading and fallback', () => {
  test('main translation loads unwrapped keys for en', async () => {
    const bundle = await loadNamespace('en', 'translation');
    assert.ok(
      Object.keys(bundle).length > 1000,
      'en translation bundle is large',
    );
    assert.ok(
      !('translation' in bundle),
      'translation wrapper must not leak into the bundle',
    );
  });

  test('page namespace loads its top-level keys', async () => {
    const docs = await loadNamespace('en', 'docs');
    assert.ok(docs.quickstart, 'docs.quickstart present');
    const kimi = await loadNamespace('zh-CN', 'kimi');
    assert.match(kimi.meta.title, /编程智能体/);
  });

  test('unsupported language falls back to English', async () => {
    const bundle = await loadNamespace('de', 'translation');
    assert.ok(Object.keys(bundle).length > 1000, 'German falls back to en');
    const en = await loadNamespace('en', 'translation');
    // Same content; may or may not be the same object reference depending
    // on module cache, so compare key counts + a sample key.
    assert.equal(Object.keys(bundle).length, Object.keys(en).length);
    assert.equal(
      bundle['Is Vancine OpenAI compatible?'],
      en['Is Vancine OpenAI compatible?'],
    );
  });

  test('unknown namespace returns an empty map (no crash)', async () => {
    const empty = await loadNamespace('en', 'does-not-exist');
    assert.deepEqual(empty, {});
  });

  test('createBackend.read resolves with the namespace bundle', async () => {
    const backend = createBackend();
    assert.equal(backend.type, 'backend');
    const data = await new Promise((resolve, reject) => {
      backend.read('en', 'translation', (err, d) =>
        err ? reject(err) : resolve(d),
      );
    });
    assert.ok(Object.keys(data).length > 1000);
  });
});

describe('resource-loader: real loader exception handling', () => {
  // Save and restore the real loaders so these tests never leak into others.
  let originalFrTranslation;
  let originalEnTranslation;

  afterEach(() => {
    if (originalFrTranslation) {
      LAZY_LOADERS.fr.translation = originalFrTranslation;
      originalFrTranslation = undefined;
    }
    if (originalEnTranslation) {
      LAZY_LOADERS.en.translation = originalEnTranslation;
      originalEnTranslation = undefined;
    }
  });

  test('fr translation loader reject falls back to English bundle', async () => {
    originalFrTranslation = LAZY_LOADERS.fr.translation;
    LAZY_LOADERS.fr.translation = async () => {
      throw new Error('simulated fr chunk failure');
    };

    const bundle = await loadNamespace('fr', 'translation');
    const en = await loadNamespace('en', 'translation');
    assert.ok(Object.keys(bundle).length > 1000, 'falls back to en content');
    assert.equal(
      bundle['Is Vancine OpenAI compatible?'],
      en['Is Vancine OpenAI compatible?'],
    );
  });

  test('English loader reject returns empty object (no hang)', async () => {
    originalEnTranslation = LAZY_LOADERS.en.translation;
    LAZY_LOADERS.en.translation = async () => {
      throw new Error('simulated en chunk failure');
    };

    const bundle = await loadNamespace('en', 'translation');
    assert.deepEqual(bundle, {});
  });

  test('fr reject + en reject returns empty object (no hang)', async () => {
    originalFrTranslation = LAZY_LOADERS.fr.translation;
    originalEnTranslation = LAZY_LOADERS.en.translation;
    LAZY_LOADERS.fr.translation = async () => {
      throw new Error('simulated fr chunk failure');
    };
    LAZY_LOADERS.en.translation = async () => {
      throw new Error('simulated en chunk failure');
    };

    const bundle = await loadNamespace('fr', 'translation');
    assert.deepEqual(bundle, {});
  });
});

describe('resource-loader: constants', () => {
  test('FALLBACK_LANGUAGE is en', () => {
    assert.equal(FALLBACK_LANGUAGE, 'en');
  });

  test('NAMESPACES lists translation + 6 page namespaces', () => {
    assert.deepEqual(NAMESPACES, [
      'translation',
      'docs',
      'about',
      'waitlist',
      'kimi',
      'seedance',
      'aimedia',
    ]);
  });
});

describe('document.documentElement.lang helpers', () => {
  test('toBcp47 maps internal codes to BCP 47 tags', () => {
    assert.equal(toBcp47('en'), 'en');
    assert.equal(toBcp47('zh-CN'), 'zh-CN');
    assert.equal(toBcp47('zh-TW'), 'zh-TW');
    assert.equal(toBcp47('fr'), 'fr');
    assert.equal(toBcp47('ru'), 'ru');
    assert.equal(toBcp47('ja'), 'ja');
    assert.equal(toBcp47('vi'), 'vi');
    assert.equal(toBcp47(undefined), 'en');
    assert.equal(toBcp47(null), 'en');
    assert.equal(toBcp47(''), 'en');
    assert.equal(toBcp47('  '), 'en');
  });

  test('syncDocumentLang writes documentElement.lang when DOM exists', () => {
    // Node test runner has no real DOM; install a minimal stub.
    const previous = globalThis.document;
    const el = { lang: 'en' };
    globalThis.document = { documentElement: el };
    try {
      syncDocumentLang('zh-CN');
      assert.equal(el.lang, 'zh-CN');
      syncDocumentLang('ja');
      assert.equal(el.lang, 'ja');
      syncDocumentLang(undefined);
      assert.equal(el.lang, 'en');
    } finally {
      if (previous === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previous;
      }
    }
  });

  test('i18n.js wires syncDocumentLang on init and languageChanged', () => {
    const src = readFileSync(join(__dirname, 'i18n.js'), 'utf8');
    assert.ok(
      /syncDocumentLang\s*\(\s*initialLanguage\s*\)/.test(src),
      'must call syncDocumentLang(initialLanguage) at module init',
    );
    assert.ok(
      /languageChanged[\s\S]*syncDocumentLang/.test(src),
      'languageChanged handler must call syncDocumentLang',
    );
    assert.ok(
      /document\.documentElement\.lang\s*=/.test(src),
      'syncDocumentLang must assign document.documentElement.lang',
    );
  });
});

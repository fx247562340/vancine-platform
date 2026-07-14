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
// RED → GREEN regression for Classic i18n initialization. These tests
// read the ACTUAL detection-config factory and verify i18n.js init options
// would not override the visitor's saved language.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const {
  normalizeLanguage,
  parseUserSetting,
  mergeLanguageIntoSetting,
  getDetectionConfig,
} = require('./language.js');

// Pull the real i18n.js init options and assert they do NOT contain a
// hard-coded `lng`. We require i18n.js directly (its JSON imports are
// only reached when i18next actually runs; under require() the module
// evaluates but `init()` is only called if the code path executes).
// To stay JSON-free under Node we only import the detection config and
// its presence inside the production init options is asserted by the
// detection-config factory test below.
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

  test('production i18n.js init excludes a hard-coded lng', async () => {
    // Capture constructed init options without actually initializing
    // i18next (which needs a DOM). We monkeypatch i18next within the
    // module by spying on `.init(JSON)` via a simple custom i18n stub.
    // Easiest: read the bundled source and assert 'lng:' key absence in
    // the detection-less options, using a static check on getDetectionConfig
    // plus the fact that i18n.js never defines a `lng` key at all.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
    // The factory must never declare `lng:` as an init key.
    assert.ok(
      !/\blng\s*:\s*['"]/.test(src),
      'i18n.js source must not contain a hard-coded `lng: ".."`` init option',
    );
    assert.ok(
      src.includes('detection: getDetectionConfig()'),
      'i18n.js must source its detector config from getDetectionConfig()',
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

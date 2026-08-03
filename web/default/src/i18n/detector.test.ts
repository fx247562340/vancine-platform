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
// Run with: node --test src/i18n/detector.test.ts
//
// Real i18next-browser-languagedetector behavior tests, run under plain Node
// (test:unit). The browser globals the detector reads (window.localStorage,
// navigator) are stubbed per case and restored afterwards.
//
// These tests bind to the PRODUCTION detection wiring: they use the same
// I18N_DETECTION_OPTIONS (order / caches / convertDetectedLanguage),
// SUPPORTED_INTERFACE_LANGUAGES and I18N_LOAD_STRATEGY that config.ts uses, so
// a regression in the shared config fails here instead of passing silently.
//
// The point is the candidate-swallowing fix: an unknown detected language
// (e.g. localStorage=de) must NOT be collapsed to 'en' by
// convertDetectedLanguage, or i18next would stop there and never evaluate a
// later supported candidate (e.g. navigator=zh-TW).
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import {
  I18N_DETECTION_OPTIONS,
  I18N_LOAD_STRATEGY,
  SUPPORTED_INTERFACE_LANGUAGES,
} from './languages.ts'

// --- save/restore the browser globals we stub, to avoid leaking state -------
const savedDescriptors = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
}

afterEach(() => {
  for (const key of ['window', 'localStorage', 'navigator'] as const) {
    const desc = savedDescriptors[key]
    if (desc) Object.defineProperty(globalThis, key, desc)
    else delete (globalThis as Record<string, unknown>)[key]
  }
})

interface FakeStore {
  data: Record<string, string>
}

function installBrowserGlobals(store: FakeStore, navigatorLanguages: string[]) {
  const ls = {
    getItem: (k: string) => store.data[k] ?? null,
    setItem: (k: string, v: string) => {
      store.data[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store.data[k]
    },
  }
  globalThis.window = {
    localStorage: ls,
  } as unknown as Window & typeof globalThis
  globalThis.localStorage = ls as unknown as Storage
  Object.defineProperty(globalThis, 'navigator', {
    value: { languages: navigatorLanguages, language: navigatorLanguages[0] },
    configurable: true,
  })
}

const resources = {
  en: { translation: { greeting: 'Hello' } },
  zh: { translation: { greeting: '你好' } },
  'zh-TW': { translation: { greeting: '你好TW' } },
  fr: { translation: { greeting: 'Bonjour' } },
  ru: { translation: { greeting: 'Привет' } },
  ja: { translation: { greeting: 'こんにちは' } },
  vi: { translation: { greeting: 'Xin chào' } },
}

async function detectLanguage(opts: {
  localStorage?: string
  navigator: string[]
  store?: FakeStore
}) {
  const store: FakeStore = opts.store ?? { data: {} }
  if (opts.localStorage !== undefined) store.data.i18nextLng = opts.localStorage
  installBrowserGlobals(store, opts.navigator)

  const inst = i18next.createInstance()
  await inst.use(LanguageDetector).init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
    load: I18N_LOAD_STRATEGY,
    // The exact production detection wiring (order/caches/convertDetectedLanguage).
    detection: I18N_DETECTION_OPTIONS,
  })
  return { resolved: inst.resolvedLanguage, store, inst }
}

describe('LanguageDetector — unknown candidates are not swallowed', () => {
  test('localStorage=de + navigator=zh-TW => zh-TW (not en)', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'de',
      navigator: ['zh-TW'],
    })
    assert.equal(resolved, 'zh-TW')
  })

  test('localStorage=de + navigator=ja-JP => ja', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'de',
      navigator: ['ja-JP'],
    })
    assert.equal(resolved, 'ja')
  })

  test('only unknown languages => en (fallbackLng)', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'de',
      navigator: ['de-DE', 'de'],
    })
    assert.equal(resolved, 'en')
  })

  test('localStorage=zh-HK => zh-TW', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'zh-HK',
      navigator: ['en-US'],
    })
    assert.equal(resolved, 'zh-TW')
  })

  test('localStorage=zh-Hans => zh', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'zh-Hans',
      navigator: ['en-US'],
    })
    assert.equal(resolved, 'zh')
  })

  test('first candidate unknown, second a supported regional variant => base language', async () => {
    const { resolved } = await detectLanguage({
      localStorage: 'xx',
      navigator: ['fr-FR'],
    })
    assert.equal(resolved, 'fr')
  })
})

describe('LanguageDetector — cached zh-TW restores on re-initialization', () => {
  test('a switch to zh-TW is cached and recovered by a fresh init', async () => {
    const store: FakeStore = { data: {} }

    // First visit: navigator prefers zh-TW; nothing cached yet.
    const first = await detectLanguage({
      navigator: ['zh-TW', 'en'],
      store,
    })
    assert.equal(first.resolved, 'zh-TW')
    // The detector cached the resolution to localStorage.
    assert.equal(store.data.i18nextLng, 'zh-TW')

    // Re-init with the SAME storage but a different navigator preference.
    // The cached zh-TW must win (refresh restores Traditional Chinese).
    const second = await detectLanguage({
      navigator: ['en-US'],
      store,
    })
    assert.equal(second.resolved, 'zh-TW')
  })
})

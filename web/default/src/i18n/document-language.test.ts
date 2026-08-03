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
// Run with: node --test src/i18n/document-language.test.ts
//
// Behavior test for the <html lang> synchronization. It exercises the REAL
// production wiring — `wireDocumentLanguageSync` registers the languageChanged
// handler and `applyDocumentLanguage` performs the initial sync, exactly as
// config.ts does — against a real i18next instance, with a stubbed `document`.
// It is not a test of a copied pure function: the languageChanged event path is
// genuinely driven by i18next.changeLanguage.
import i18next from 'i18next'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
  I18N_LOAD_STRATEGY,
  SUPPORTED_INTERFACE_LANGUAGES,
  applyDocumentLanguage,
  getDocumentLanguage,
  wireDocumentLanguageSync,
} from './languages.ts'

// --- stub document.documentElement and restore it around each test ----------
const savedDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'document'
)
let documentElement: { lang: string }

beforeEach(() => {
  documentElement = { lang: 'en' }
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement },
    configurable: true,
  })
})

afterEach(() => {
  if (savedDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', savedDocumentDescriptor)
  } else {
    delete (globalThis as Record<string, unknown>).document
  }
})

const resources = {
  en: { translation: {} },
  zh: { translation: {} },
  'zh-TW': { translation: {} },
  fr: { translation: {} },
  ru: { translation: {} },
  ja: { translation: {} },
  vi: { translation: {} },
}

async function createWiredInstance(initialLng: string) {
  const inst = i18next.createInstance()
  // Production event wiring (shared with config.ts).
  wireDocumentLanguageSync(inst)
  await inst.init({
    resources,
    lng: initialLng,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
    load: I18N_LOAD_STRATEGY,
    interpolation: { escapeValue: false },
  })
  // Initial sync, mirroring config.ts's init().then(...) guarantee.
  applyDocumentLanguage(inst.language)
  return inst
}

/**
 * Install a `document` whose `documentElement.lang` counts writes, to observe
 * how many actual DOM writes occur (idempotent calls must not re-write).
 */
function installCountingDocument(): {
  writes: () => number
  value: () => string
} {
  let count = 0
  let value = ''
  Object.defineProperty(globalThis, 'document', {
    value: {
      documentElement: {
        get lang(): string {
          return value
        },
        set lang(v: string) {
          count++
          value = v
        },
      },
    },
    configurable: true,
  })
  return { writes: () => count, value: () => value }
}

async function initPlainInstance(lng: string) {
  const inst = i18next.createInstance()
  await inst.init({
    resources,
    lng,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
    load: I18N_LOAD_STRATEGY,
    interpolation: { escapeValue: false },
  })
  return inst
}

/**
 * A fake languageChanged emitter that records its active handler set, so tests
 * can observe registration/teardown directly (on/off) without poking at any
 * WeakMap internals. `emit` invokes every active handler.
 */
function createFakeEmitter() {
  const handlers = new Set<(lng: string) => void>()
  return {
    handlers,
    on(_event: 'languageChanged', cb: (lng: string) => void): void {
      handlers.add(cb)
    },
    off(_event: 'languageChanged', cb: (lng: string) => void): void {
      handlers.delete(cb)
    },
    emit(lng: string): void {
      for (const h of [...handlers]) h(lng)
    },
  }
}

describe('document.documentElement.lang synchronization', () => {
  test('initial active language is synced to <html lang>', async () => {
    await createWiredInstance('en')
    assert.equal(documentElement.lang, 'en')
  })

  test("changeLanguage('zh-TW') sets the precise BCP 47 tag zh-TW", async () => {
    const inst = await createWiredInstance('en')
    await inst.changeLanguage('zh-TW')
    assert.equal(documentElement.lang, 'zh-TW')
  })

  test('switching across supported languages keeps <html lang> in sync', async () => {
    const inst = await createWiredInstance('en')

    await inst.changeLanguage('zh-TW')
    assert.equal(documentElement.lang, 'zh-TW')

    // Simplified Chinese uses the unambiguous zh-CN tag.
    await inst.changeLanguage('zh')
    assert.equal(documentElement.lang, 'zh-CN')

    // Other supported languages use their code verbatim (no regression).
    await inst.changeLanguage('fr')
    assert.equal(documentElement.lang, 'fr')

    await inst.changeLanguage('ja')
    assert.equal(documentElement.lang, 'ja')

    await inst.changeLanguage('en')
    assert.equal(documentElement.lang, 'en')
  })

  test('a Traditional variant passed to applyDocumentLanguage maps to zh-TW', async () => {
    // Variant normalization (zh-HK -> zh-TW) happens before i18next in the real
    // app (detector / normalizeInterfaceLanguage); the document-language mapper
    // must agree. i18next.changeLanguage itself only accepts supported codes.
    await createWiredInstance('en')
    applyDocumentLanguage('zh-HK')
    assert.equal(documentElement.lang, 'zh-TW')
    applyDocumentLanguage('zh-Hant')
    assert.equal(documentElement.lang, 'zh-TW')
  })

  test('the languageChanged event (not a manual call) drives the update', async () => {
    const inst = i18next.createInstance()
    wireDocumentLanguageSync(inst)
    await inst.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
      load: I18N_LOAD_STRATEGY,
      interpolation: { escapeValue: false },
    })
    // Deliberately do NOT call applyDocumentLanguage here: the change below must
    // update <html lang> purely through the wired languageChanged event.
    await inst.changeLanguage('zh-TW')
    assert.equal(documentElement.lang, 'zh-TW')
  })

  test('getDocumentLanguage mapping matrix', () => {
    assert.equal(getDocumentLanguage('zh-TW'), 'zh-TW')
    assert.equal(getDocumentLanguage('zh-HK'), 'zh-TW')
    assert.equal(getDocumentLanguage('zh-Hant'), 'zh-TW')
    assert.equal(getDocumentLanguage('zh'), 'zh-CN')
    assert.equal(getDocumentLanguage('zh-CN'), 'zh-CN')
    assert.equal(getDocumentLanguage('en'), 'en')
    assert.equal(getDocumentLanguage('en-US'), 'en')
    assert.equal(getDocumentLanguage('fr'), 'fr')
    assert.equal(getDocumentLanguage('ru'), 'ru')
    assert.equal(getDocumentLanguage('ja'), 'ja')
    assert.equal(getDocumentLanguage('vi'), 'vi')
    // Unknown falls back to en.
    assert.equal(getDocumentLanguage('de'), 'en')
  })

  test('applyDocumentLanguage is a no-op when document is absent', () => {
    // Remove document and assert no throw.
    delete (globalThis as Record<string, unknown>).document
    assert.doesNotThrow(() => applyDocumentLanguage('zh-TW'))
  })

  test('repeated wire does not accumulate listeners (idempotent)', async () => {
    const inst = await initPlainInstance('en')
    const cleanup = wireDocumentLanguageSync(inst)
    wireDocumentLanguageSync(inst) // repeat: must be a no-op (no 2nd listener)
    applyDocumentLanguage(inst.language)
    assert.equal(documentElement.lang, 'en')

    // Removing the single registered listener must stop ALL syncing. If the
    // repeated wire had accumulated a second listener, syncing would continue.
    cleanup()
    await inst.changeLanguage('zh-TW')
    assert.equal(documentElement.lang, 'en') // unchanged => exactly one listener
  })

  test('one changeLanguage produces exactly one document write', async () => {
    const counter = installCountingDocument()
    const inst = await initPlainInstance('en')
    wireDocumentLanguageSync(inst)
    wireDocumentLanguageSync(inst) // repeat wire must not add a writer
    applyDocumentLanguage(inst.language) // safety-net (mirrors config.ts)
    const writesAfterInit = counter.writes()
    await inst.changeLanguage('zh-TW')
    // Exactly one additional write for the single language change.
    assert.equal(counter.writes() - writesAfterInit, 1)
    assert.equal(counter.value(), 'zh-TW')
  })

  test('init produces only the necessary sync (single write)', async () => {
    const counter = installCountingDocument()
    const inst = i18next.createInstance()
    wireDocumentLanguageSync(inst)
    await inst.init({
      resources,
      lng: 'zh-TW',
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
      load: I18N_LOAD_STRATEGY,
      interpolation: { escapeValue: false },
    })
    applyDocumentLanguage(inst.language) // safety-net (mirrors config.ts)
    // Whether or not languageChanged fired during init, the idempotent sync
    // writes the initial language exactly once.
    assert.equal(counter.value(), 'zh-TW')
    assert.equal(counter.writes(), 1)
  })

  test('applyDocumentLanguage is idempotent (no redundant writes)', () => {
    const counter = installCountingDocument()
    applyDocumentLanguage('zh-TW')
    applyDocumentLanguage('zh-TW') // redundant
    applyDocumentLanguage('zh-TW') // redundant
    assert.equal(counter.writes(), 1)
    assert.equal(counter.value(), 'zh-TW')
    applyDocumentLanguage('zh') // actual change
    assert.equal(counter.writes(), 2)
    assert.equal(counter.value(), 'zh-CN')
  })

  test('cleanup is idempotent across consecutive calls', () => {
    const emitter = createFakeEmitter()
    const c1 = wireDocumentLanguageSync(emitter)
    assert.equal(emitter.handlers.size, 1)
    c1()
    assert.equal(emitter.handlers.size, 0)
    c1() // repeat: strict no-op
    assert.equal(emitter.handlers.size, 0)
  })

  test('stale cleanup after re-wire cannot disturb the new generation', () => {
    const emitter = createFakeEmitter()
    const c1 = wireDocumentLanguageSync(emitter)
    c1()
    const c2 = wireDocumentLanguageSync(emitter)
    assert.equal(emitter.handlers.size, 1)
    c1() // stale cleanup (captured before the re-wire): must be a no-op
    assert.equal(emitter.handlers.size, 1) // c2's handler intact
    wireDocumentLanguageSync(emitter) // repeat wire while active: no duplicate
    assert.equal(emitter.handlers.size, 1)
    c2() // current cleanup removes the active handler
    assert.equal(emitter.handlers.size, 0)
  })

  test('one languageChanged triggers exactly one DOM sync after stale/repeat wiring', () => {
    const counter = installCountingDocument()
    const emitter = createFakeEmitter()
    const c1 = wireDocumentLanguageSync(emitter)
    c1()
    const c2 = wireDocumentLanguageSync(emitter)
    c1() // stale
    wireDocumentLanguageSync(emitter) // repeat (no-op)
    // Exactly one active handler must remain.
    assert.equal(emitter.handlers.size, 1)
    emitter.emit('zh-TW')
    assert.equal(counter.writes(), 1) // one DOM write
    assert.equal(counter.value(), 'zh-TW')
    c2()
    assert.equal(emitter.handlers.size, 0)
    emitter.emit('fr') // no listener left
    assert.equal(counter.writes(), 1) // no further write
  })

  test('cleanup allows re-wiring afterwards', () => {
    const emitter = createFakeEmitter()
    const c1 = wireDocumentLanguageSync(emitter)
    c1()
    assert.equal(emitter.handlers.size, 0)
    const c2 = wireDocumentLanguageSync(emitter) // re-wire after cleanup
    assert.equal(emitter.handlers.size, 1)
    c2()
    assert.equal(emitter.handlers.size, 0)
  })
})

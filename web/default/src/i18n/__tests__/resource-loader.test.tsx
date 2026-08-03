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
// Tests for the lazy i18n resource loader (backend for i18next).
//
// The Default theme used to statically import all 7 locale JSON files into
// the entry chunk (~2.3MB). The loader under test replaces that with one
// dynamic import() per language so the bundler emits one chunk per locale
// and the first paint only pays for the active language (+ the `en`
// fallback). These tests exercise the backend contract directly:
//
// - read() resolves a non-empty, UNWRAPPED bundle for a supported language
// - read() never throws/callbacks an error for an unsupported language
// - a fresh i18next instance wired with the backend only reads the current
//   language (never all 7)
// - changeLanguage() triggers a read() for the newly selected language
//
// A stable key that differs across locales (kept in sync by the i18n sync
// tooling) is used to prove which bundle actually got loaded.
import i18next, { type i18n as I18nInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import { I18N_LOAD_STRATEGY, SUPPORTED_INTERFACE_LANGUAGES } from '../languages'
import { createLazyResourceBackend } from '../resource-loader'

/** Key present in every locale whose value differs per language. */
const PROBE_KEY = 'Where can I see pricing?'

const EXPECTED: Record<string, string> = {
  en: 'Where can I see pricing?',
  zh: '在哪里查看价格？',
  'zh-TW': '在哪裡檢視價格？',
}

const SUPPORTED_LOCALES = ['en', 'zh', 'zh-TW', 'fr', 'ru', 'ja', 'vi'] as const

/**
 * Wrap the backend so every read() language is recorded while delegating to
 * the real implementation. Lets tests assert WHICH languages i18next pulled.
 */
function createSpyBackend() {
  const reads: string[] = []
  const backend = createLazyResourceBackend()
  const spied = {
    ...backend,
    read(
      language: string,
      namespace: string,
      callback: Parameters<typeof backend.read>[2]
    ) {
      reads.push(language)
      backend.read(language, namespace, callback)
    },
  }
  return { backend: spied, reads }
}

function readToPromise(
  backend: ReturnType<typeof createLazyResourceBackend>,
  language: string,
  namespace = 'translation'
): Promise<{ err: unknown; data: unknown }> {
  return new Promise((resolve) => {
    backend.read(language, namespace, (err, data) => resolve({ err, data }))
  })
}

async function createInstanceWith(
  backend: ReturnType<typeof createSpyBackend>['backend'],
  lng: string
): Promise<I18nInstance> {
  const instance = i18next.createInstance()
  await instance.use(backend).init({
    lng,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
    load: I18N_LOAD_STRATEGY,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    // Mirror config.ts: components must never suspend on first paint.
    react: { useSuspense: false },
  })
  return instance
}

describe('lazyResourceBackend.read', () => {
  it('returns the full unwrapped zh-TW bundle for a supported language', async () => {
    const backend = createLazyResourceBackend()
    const { err, data } = await readToPromise(backend, 'zh-TW')

    expect(err).toBeNull()
    expect(data).toBeTruthy()
    expect(typeof data).toBe('object')

    const bundle = data as Record<string, unknown>
    // The bundle must be the translation namespace itself (thousands of
    // keys), NOT the raw JSON module wrapped under a `translation` field.
    expect(Object.keys(bundle).length).toBeGreaterThan(1000)
    expect(bundle[PROBE_KEY]).toBe(EXPECTED['zh-TW'])
    expect(bundle.translation).toBeUndefined()
  })

  it('returns the en bundle for en', async () => {
    const backend = createLazyResourceBackend()
    const { err, data } = await readToPromise(backend, 'en')

    expect(err).toBeNull()
    const bundle = data as Record<string, unknown>
    expect(bundle[PROBE_KEY]).toBe(EXPECTED.en)
  })

  it('falls back to an empty bundle without throwing for an unsupported language', async () => {
    const backend = createLazyResourceBackend()
    const { err, data } = await readToPromise(backend, 'de')

    expect(err).toBeNull()
    expect(data).toEqual({})
  })
})

describe('first-paint loading scope', () => {
  it('only reads the current language (en) at init — never all 7 locales', async () => {
    const { backend, reads } = createSpyBackend()
    await createInstanceWith(backend, 'en')

    expect(reads).toEqual(['en'])
  })

  it('reads at most the current language plus the en fallback at init', async () => {
    const { backend, reads } = createSpyBackend()
    await createInstanceWith(backend, 'fr')

    // i18next may preload the `en` fallback alongside the active language,
    // but it must never load the whole locale set up-front.
    expect(new Set(reads)).toEqual(new Set(['fr', 'en']))
    expect(reads.length).toBeLessThanOrEqual(2)
  })
})

describe('language switching triggers lazy reads', () => {
  it('changeLanguage loads the new locale on demand and translates', async () => {
    const { backend, reads } = createSpyBackend()
    const instance = await createInstanceWith(backend, 'en')
    expect(instance.t(PROBE_KEY)).toBe(EXPECTED.en)

    await instance.changeLanguage('zh-TW')
    expect(reads).toContain('zh-TW')
    expect(instance.t(PROBE_KEY)).toBe(EXPECTED['zh-TW'])

    await instance.changeLanguage('zh')
    expect(reads).toContain('zh')
    expect(instance.t(PROBE_KEY)).toBe(EXPECTED.zh)

    // Switching back to an already-loaded language does not re-read.
    const readsBefore = reads.length
    await instance.changeLanguage('zh-TW')
    expect(reads.length).toBe(readsBefore)
    expect(instance.t(PROBE_KEY)).toBe(EXPECTED['zh-TW'])
  })

  it('every language i18next ever reads is one of the 7 supported locales', async () => {
    const { backend, reads } = createSpyBackend()
    const instance = await createInstanceWith(backend, 'en')
    await instance.changeLanguage('ja')
    await instance.changeLanguage('vi')

    for (const language of reads) {
      expect(SUPPORTED_LOCALES).toContain(language)
    }
  })
})

describe('loader table completeness', () => {
  it('maps exactly the 7 supported locales to dynamic imports', async () => {
    const { LOCALE_LOADERS } = await import('../resource-loader')
    expect(Object.keys(LOCALE_LOADERS).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort()
    )
    for (const loader of Object.values(LOCALE_LOADERS)) {
      expect(typeof loader).toBe('function')
    }
  })
})

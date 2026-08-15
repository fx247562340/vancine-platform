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
// Locale contract test for the PayPal cancel toast. The cancel toast key is
// registered in all 7 supported locales (en, zh, zh-TW, fr, ru, ja, vi) and
// the test guards against (a) any locale missing the key, (b) any locale
// carrying an empty/identical-to-source value, and (c) i18next silently
// falling back to the English source when the active locale is non-English.
//
// Pure node:test; the file is a `.test.ts` (not `.test.tsx`) so vitest's
// include glob skips it and `bun test` (node:test) runs it, matching the
// web/AGENTS.md convention for pure-logic suites.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import enLocale from '@/i18n/locales/en.json'
import frLocale from '@/i18n/locales/fr.json'
import jaLocale from '@/i18n/locales/ja.json'
import ruLocale from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTWLocale from '@/i18n/locales/zh-TW.json'
import zhLocale from '@/i18n/locales/zh.json'

const CANCEL_KEY =
  'PayPal checkout was cancelled. No payment was made and your balance is unchanged.'

const LOCALES = [
  { name: 'en', data: enLocale },
  { name: 'zh', data: zhLocale },
  { name: 'zh-TW', data: zhTWLocale },
  { name: 'fr', data: frLocale },
  { name: 'ru', data: ruLocale },
  { name: 'ja', data: jaLocale },
  { name: 'vi', data: viLocale },
] as const

describe('PayPal cancel i18n locale contract', () => {
  test('cancel key exists with a non-empty value in every supported locale', () => {
    const seen = new Set<string>()
    for (const locale of LOCALES) {
      const translation = locale.data.translation[CANCEL_KEY]
      assert.ok(
        typeof translation === 'string' && translation.length > 0,
        `${locale.name} must carry a non-empty string for the cancel key`
      )
      // Whitespace-only is treated as empty.
      assert.notStrictEqual(
        translation.trim(),
        '',
        `${locale.name} cancel key must not be whitespace-only`
      )
      seen.add(translation)
    }
    // Every locale ships a distinct translation; the suite must not be
    // accidentally collapsed to a single English copy.
    assert.strictEqual(
      seen.size,
      LOCALES.length,
      'each locale must ship its own distinct translation'
    )
  })

  test('at least one non-English locale renders its actual translation under i18next', async () => {
    // Use the production i18next runtime so the test exercises the same
    // fallback / namespace resolution the wallet component relies on.
    const i18next = (await import('i18next')).default
    const en = enLocale.translation
    const zh = zhLocale.translation
    const fr = frLocale.translation

    // Chinese: the rendered text must NOT equal the English source key.
    // It must contain at least one Chinese character to prove we are not
    // rendering the English fallback.
    const zhRendered = zh[CANCEL_KEY]
    assert.notStrictEqual(
      zhRendered,
      en[CANCEL_KEY],
      'zh must not be the English source'
    )
    assert.match(
      zhRendered,
      /[一-鿿]/,
      'zh must contain at least one CJK Unified Ideograph'
    )

    // French: must contain at least one accented Latin character to
    // prove we are not rendering the English fallback.
    const frRendered = fr[CANCEL_KEY]
    assert.notStrictEqual(
      frRendered,
      en[CANCEL_KEY],
      'fr must not be the English source'
    )
    assert.match(
      frRendered,
      /[àâçéèêëîïôûùüÿœæ]/i,
      'fr must contain at least one accented Latin character'
    )

    // Wire i18next up the same way the app does and verify a non-English
    // locale actually resolves to its translated value (not the English
    // fallback) when used as the active language.
    await i18next.init({
      lng: 'zh',
      fallbackLng: 'en',
      nsSeparator: false,
      resources: {
        en: { translation: en },
        zh: { translation: zh },
        fr: { translation: fr },
      },
    })
    const t = i18next.t.bind(i18next)
    assert.strictEqual(
      t(CANCEL_KEY),
      zh[CANCEL_KEY],
      'i18next active=zh must resolve the zh translation'
    )

    // English fallback must still work and produce the English string.
    await i18next.changeLanguage('en')
    assert.strictEqual(
      t(CANCEL_KEY),
      en[CANCEL_KEY],
      'i18next active=en must resolve the en translation'
    )
  })
})

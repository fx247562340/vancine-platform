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
// REAL production-wiring integration test for <html lang> synchronization.
//
// Unlike document-language.test.ts (which exercises the shared wiring helpers
// against a fresh instance), this test dynamically imports the ACTUAL
// src/i18n/config.ts module and drives its real singleton: it awaits the
// exported i18nInitPromise, then calls the production i18n.changeLanguage. If
// the wire registration (wireDocumentLanguageSync) were removed from config.ts,
// these assertions would fail — the test does not re-create the init wiring
// itself and does not inspect source strings.
import type i18nType from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

let i18n: typeof i18nType

beforeAll(async () => {
  // Seed the stored language so the real detector initializes to zh-TW.
  window.localStorage.clear()
  window.localStorage.setItem('i18nextLng', 'zh-TW')
  // Dynamically import the REAL production config (runs init + wiring once).
  const config = await import('@/i18n/config')
  await config.i18nInitPromise
  i18n = config.default
})

describe('real config.ts <html lang> production wiring', () => {
  it('initializes <html lang> to zh-TW from the cached language', () => {
    expect(i18n.resolvedLanguage).toBe('zh-TW')
    expect(document.documentElement.lang).toBe('zh-TW')
  })

  it("changeLanguage('zh') syncs <html lang> to zh-CN", async () => {
    await i18n.changeLanguage('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('keeps <html lang> in sync across further switches', async () => {
    await i18n.changeLanguage('zh-TW')
    expect(document.documentElement.lang).toBe('zh-TW')

    await i18n.changeLanguage('fr')
    expect(document.documentElement.lang).toBe('fr')

    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})

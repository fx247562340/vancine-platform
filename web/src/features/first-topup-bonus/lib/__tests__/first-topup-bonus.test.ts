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
// The first top-up bonus display contract: the configured quota and
// quota_per_unit are the ONLY inputs, an invalid/disabled configuration
// yields null (nothing rendered), and a valid configuration yields the
// thousands-separated credits plus the USD API-balance equivalent.

import { describe, expect, it } from 'vitest'

import { formatFirstTopUpBonus } from '../first-topup-bonus'

describe('formatFirstTopUpBonus', () => {
  it('formats the planned production configuration as 500,000 Credits and $1', () => {
    const display = formatFirstTopUpBonus(500000, 500000, 'en-US')
    expect(display).not.toBeNull()
    expect(display?.credits).toBe('500,000')
    expect(display?.usdText).toBe('$1')
    expect(display?.quota).toBe(500000)
    expect(display?.usd).toBe(1)
  })

  it('computes any other configuration from the raw inputs', () => {
    const display = formatFirstTopUpBonus(250000, 500000, 'en-US')
    expect(display?.credits).toBe('250,000')
    expect(display?.usdText).toBe('$0.5')
  })

  it('returns null when the promotion is disabled (quota 0)', () => {
    expect(formatFirstTopUpBonus(0, 500000, 'en-US')).toBeNull()
  })

  it('returns null when the quota is missing or invalid', () => {
    expect(formatFirstTopUpBonus(undefined, 500000, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(null, 500000, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus('not-a-number', 500000, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(Number.NaN, 500000, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(-5, 500000, 'en-US')).toBeNull()
  })

  it('returns null when quota_per_unit is missing or invalid', () => {
    expect(formatFirstTopUpBonus(500000, undefined, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(500000, 0, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(500000, -1, 'en-US')).toBeNull()
    expect(formatFirstTopUpBonus(500000, 'x', 'en-US')).toBeNull()
  })

  it('never produces a negative or non-finite USD equivalent', () => {
    const display = formatFirstTopUpBonus(1, 500000, 'en-US')
    expect(display).not.toBeNull()
    expect(display?.usd).toBeGreaterThan(0)
    expect(Number.isFinite(display?.usd ?? Number.NaN)).toBe(true)
  })

  // Regression for the live Layer 3 failure: when the project i18n
  // instance is on the internal `zhCN` / `zhTW` codes (the project's
  // supportedLngs, see src/i18n/config.ts), the locale passed in here
  // is NOT a valid BCP-47 tag. Before the fix, `new
  // Intl.NumberFormat('zhCN')` threw `RangeError: Invalid language
  // tag`, which propagated out of the hook and unmounted the entire
  // home page subtree (Hero, CTA, Footer). The formatter must
  // therefore normalize any project-internal language code to a valid
  // BCP-47 tag (via the shared toIntlLocale helper) before
  // constructing Intl primitives, so the public promotion renders
  // correctly for every supported language.
  //
  // Contract under test (locale-agnostic on purpose):
  //   - the call returns a display object (not null);
  //   - the credits are "500,000" (thousands separator, two halves);
  //   - the USD equivalent is exactly 1 (the math is locale-free);
  //   - the formatted USD text is non-empty and contains the digit
  //     "1" (Chinese Intl renders "US$1", not "$1", so we do not
  //     pin the currency glyph);
  //   - the call itself never throws.
  it.each(['zhCN', 'zhTW', 'zh-CN', 'zh-TW', 'zh_Hant', 'ZH-Hant'])(
    'accepts language code %s without throwing',
    (locale) => {
      const display = formatFirstTopUpBonus(500000, 500000, locale)
      expect(display).not.toBeNull()
      expect(display?.credits).toBe('500,000')
      expect(display?.usd).toBe(1)
      expect(display?.usdText ?? '').toBeTruthy()
      expect(display?.usdText ?? '').toContain('1')
    }
  )

  // Unknown / malformed non-empty locales must NOT crash the page.
  // toIntlLocale routes every non-empty, non-supported value through
  // the shared language normalization (which falls back to 'en'),
  // so a stray browser-reported or legacy value still yields a
  // valid display rather than throwing a RangeError.
  it.each(['xx', 'klingon', '!@#', '999'])(
    'falls back gracefully for unknown locale %s',
    (locale) => {
      const display = formatFirstTopUpBonus(500000, 500000, locale)
      expect(display).not.toBeNull()
      expect(display?.credits).toBe('500,000')
      expect(display?.usd).toBe(1)
      expect(display?.usdText ?? '').toContain('1')
    }
  )
})

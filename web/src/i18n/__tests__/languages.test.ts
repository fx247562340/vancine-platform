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
// Pure-function contract tests for the single language-normalization entry
// point and the shared BCP-47 conversion. These lock the behavior every
// consumer (browser detection, saved preference restore, <html lang>, Intl,
// Accept-Language) depends on.
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  normalizeInterfaceLanguage,
  toIntlLocale,
  toLanguageTag,
  type InterfaceLanguageCode,
} from '../languages'

describe('normalizeInterfaceLanguage', () => {
  const cases: Array<[string | null | undefined, InterfaceLanguageCode]> = [
    // Idempotent on the internal camelCase codes.
    ['zhCN', 'zhCN'],
    ['zhTW', 'zhTW'],
    // Case-insensitive (mixed case).
    ['ZHCN', 'zhCN'],
    ['ZHTW', 'zhTW'],
    ['ZhCn', 'zhCN'],
    ['ZH-hant', 'zhTW'],
    // `_` and `-` separators unify.
    ['zh_CN', 'zhCN'],
    ['zh_TW', 'zhTW'],
    ['zh-CN', 'zhCN'],
    ['zh-TW', 'zhTW'],
    // zh-MO / zh-HK are Traditional.
    ['zh-MO', 'zhTW'],
    ['zh-mo', 'zhTW'],
    ['zh-HK', 'zhTW'],
    // Script subtags.
    ['zh-Hant', 'zhTW'],
    ['zh-Hans', 'zhCN'],
    // Unicode extension tags keep the region/script decision.
    ['zh-TW-u-ca-chinese', 'zhTW'],
    ['zh-Hant-u-ca-chinese', 'zhTW'],
    ['zh-CN-u-ca-chinese', 'zhCN'],
    // Bare zh and Simplified regions default to zhCN.
    ['zh', 'zhCN'],
    ['zh-SG', 'zhCN'],
    // Non-Chinese regional variants reduce to the supported base code.
    ['en-US', 'en'],
    ['fr-FR', 'fr'],
    ['ja-JP', 'ja'],
    ['ru-RU', 'ru'],
    ['vi-VN', 'vi'],
    ['en', 'en'],
    ['fr', 'fr'],
    // Surrounding whitespace is trimmed.
    ['  zh-TW  ', 'zhTW'],
    ['   ', 'en'],
    // Empty / null / undefined fall back to en.
    ['', 'en'],
    [null, 'en'],
    [undefined, 'en'],
    // Unknown non-Chinese codes fall back to en.
    ['xx', 'en'],
    ['de', 'en'],
    ['es-ES', 'en'],
    // Prefix false-positive counterexamples: complete-subtag matching must NOT
    // read zh-twitch as TW or zh-hantasy as Hant; they stay Simplified.
    ['zh-twitch', 'zhCN'],
    ['zh-hantasy', 'zhCN'],
    ['zh-twfoo', 'zhCN'],
    ['zh-hansfoo', 'zhCN'],
    // Extension / private-use content after a singleton must NOT be read as
    // a script or region: only the CORE subtags decide the Chinese variant.
    ['zh-CN-x-tw', 'zhCN'],
    ['zh-Hans-x-hant', 'zhCN'],
    ['zh-CN-a-tw', 'zhCN'],
    ['zh-TW-x-cn', 'zhTW'],
    ['zh-x-tw', 'zhCN'],
  ]

  for (const [input, expected] of cases) {
    test(`normalizes ${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(normalizeInterfaceLanguage(input), expected)
    })
  }
})

describe('toLanguageTag (shared BCP-47 conversion)', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ['zhCN', 'zh-CN'],
    ['zhTW', 'zh-TW'],
    // Legacy variants normalize before conversion.
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    // Other supported languages pass through as their code.
    ['en', 'en'],
    ['fr', 'fr'],
    ['ja', 'ja'],
    ['ru', 'ru'],
    ['vi', 'vi'],
    ['en-US', 'en'],
    // Unknown / empty normalize to en -> en.
    [null, 'en'],
    ['de', 'en'],
  ]

  for (const [input, expected] of cases) {
    test(`maps ${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(toLanguageTag(input), expected)
    })
  }
})

describe('toIntlLocale', () => {
  const cases: Array<[string | null | undefined, string | undefined]> = [
    // Empty / null / undefined -> undefined (Intl uses the runtime default).
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    // Supported Chinese codes canonicalize to BCP-47 tags.
    ['zhCN', 'zh-CN'],
    ['zhTW', 'zh-TW'],
    // Legacy variants normalize before canonicalization.
    ['zh-Hant', 'zh-TW'],
    ['zh-TW', 'zh-TW'],
    ['zh', 'zh-CN'],
    // Non-Chinese regional variants reduce to the supported base code.
    ['fr-FR', 'fr'],
    ['en-US', 'en'],
    // Unknown non-empty values normalize to en, not undefined.
    ['de', 'en'],
    ['xx', 'en'],
  ]

  for (const [input, expected] of cases) {
    test(`converts ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(toIntlLocale(input), expected)
    })
  }
})

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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { getHomePageMetadata, HOME_CANONICAL } from '../seo'

describe('home page metadata', () => {
  const supportedLanguages = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

  test('pins canonical and og:url to the public site origin', () => {
    for (const language of supportedLanguages) {
      const metadata = getHomePageMetadata(language)
      assert.equal(metadata.canonical, HOME_CANONICAL)
      assert.equal(metadata.ogUrl, metadata.canonical)
      assert.ok(metadata.title.length > 0)
      assert.ok(metadata.description.length > 0)
      assert.ok(metadata.ogTitle.length > 0)
      assert.ok(metadata.ogDescription.length > 0)
      assert.ok(
        metadata.twitterTitle !== undefined && metadata.twitterTitle.length > 0,
        `${language} must publish a Twitter title`
      )
      assert.ok(
        metadata.twitterDescription !== undefined &&
          metadata.twitterDescription.length > 0,
        `${language} must publish a Twitter description`
      )
    }
  })

  test('English copy is byte-identical to the server-rendered publicPageMeta', () => {
    // The Go side (router/web_metadata.go) renders this exact string into
    // the server-rendered HTML. The SPA must match byte-for-byte so the
    // two views agree for crawlers and link unfurls. The Twitter pair is
    // asserted independently because a future drift in either side
    // (SPA or Go) is exactly the kind of bug Bing reports as "duplicate
    // title" or "short description".
    const metadata = getHomePageMetadata('en')
    assert.equal(
      metadata.title,
      'Chinese AI Models API for Global Developers | Vancine'
    )
    assert.equal(
      metadata.description,
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.'
    )
    assert.equal(
      metadata.ogTitle,
      'Chinese AI Models API for Global Developers'
    )
    assert.equal(
      metadata.ogDescription,
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.'
    )
    assert.equal(
      metadata.twitterTitle,
      'Chinese AI Models API for Global Developers'
    )
    assert.equal(
      metadata.twitterDescription,
      'Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.'
    )
  })

  test('covers all seven supported languages distinctly', () => {
    const titles = supportedLanguages.map(
      (language) => getHomePageMetadata(language).title
    )
    assert.equal(new Set(titles).size, titles.length)
    assert.ok(
      titles.slice(1).every((title) => title !== titles[0]),
      'non-English metadata must not be the English text'
    )
  })

  test('normalizes BCP-47 variants and falls back to English', () => {
    assert.equal(
      getHomePageMetadata('zh-CN').title,
      getHomePageMetadata('zhCN').title
    )
    assert.equal(
      getHomePageMetadata('zh-Hant').title,
      getHomePageMetadata('zhTW').title
    )
    assert.equal(
      getHomePageMetadata('de-DE').title,
      getHomePageMetadata('en').title
    )
  })

  test('exposes the canonical constant', () => {
    assert.equal(HOME_CANONICAL, 'https://vancine.com')
  })
})

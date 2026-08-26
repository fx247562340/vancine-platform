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

import {
  AI_MEDIA_API_BASE_URL,
  AI_MEDIA_API_EXAMPLES,
  AI_MEDIA_API_KEY_ENV_VAR,
  AI_MEDIA_BENEFITS,
  AI_MEDIA_CANONICAL,
  AI_MEDIA_CAPABILITIES,
  AI_MEDIA_CATEGORIES,
  AI_MEDIA_CTA_EVENT,
  AI_MEDIA_FAQ,
  AI_MEDIA_I18N_KEYS,
  AI_MEDIA_RESOURCE_EVENT,
  AI_MEDIA_USE_CASES,
  getAiMediaCtaDestination,
  getAiMediaCtaTarget,
  getAiMediaPageMetadata,
} from '../landing'

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getAiMediaCtaDestination(false), '/sign-up')
    assert.equal(getAiMediaCtaDestination(true), '/playground')
  })

  test('retains exactly the five UTM attribution parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    const destination = getAiMediaCtaDestination(false, search)
    const params = new URLSearchParams(destination.split('?')[1])
    assert.deepEqual([...params.keys()].sort(), [
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ])
  })

  test('drops sensitive, routing, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&username=u&user_id=7&token=t&api_key=k' +
      '&key=k&password=p&redirect=/evil&return_to=/evil&unknown=1&utm_source=ok'
    assert.equal(
      getAiMediaCtaDestination(true, search),
      '/playground?utm_source=ok'
    )
  })

  test('never produces an absolute or foreign target (no open redirect)', () => {
    for (const auth of [false, true]) {
      const destination = getAiMediaCtaDestination(
        auth,
        '?redirect=https://evil.example.com&return_to=//evil.example.com'
      )
      assert.ok(
        destination === '/sign-up' || destination === '/playground',
        `unexpected destination: ${destination}`
      )
    }
  })

  test('splits into a TanStack Link target with the same allowlist', () => {
    assert.deepEqual(
      getAiMediaCtaTarget(false, '?utm_source=x&email=a@b.com'),
      { to: '/sign-up', search: { utm_source: 'x' } }
    )
    assert.deepEqual(getAiMediaCtaTarget(true, '?email=a@b.com'), {
      to: '/playground',
      search: {},
    })
  })
})

describe('page metadata', () => {
  const supportedLanguages = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

  test('pins canonical and og:url for every language', () => {
    assert.equal(AI_MEDIA_CANONICAL, 'https://vancine.com/ai-media-api')
    for (const language of supportedLanguages) {
      const metadata = getAiMediaPageMetadata(language)
      assert.equal(metadata.canonical, AI_MEDIA_CANONICAL)
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

  test('English Twitter pair is byte-identical to router/web_metadata.go', () => {
    const metadata = getAiMediaPageMetadata('en')
    assert.equal(
      metadata.twitterTitle,
      'AI Media API: Image, Video, Speech & 3D'
    )
    assert.equal(
      metadata.twitterDescription,
      'Access Chinese AI media models through one API. Image, video, speech, and 3D generation with one API key and unified billing.'
    )
  })

  test('covers all seven supported languages distinctly', () => {
    const titles = supportedLanguages.map(
      (language) => getAiMediaPageMetadata(language).title
    )
    assert.equal(new Set(titles).size, titles.length)
  })

  test('normalizes BCP-47 variants and falls back to English', () => {
    assert.equal(
      getAiMediaPageMetadata('zh-CN').title,
      getAiMediaPageMetadata('zhCN').title
    )
    assert.equal(
      getAiMediaPageMetadata('zh-Hant').title,
      getAiMediaPageMetadata('zhTW').title
    )
    assert.equal(
      getAiMediaPageMetadata('de-DE').title,
      getAiMediaPageMetadata('en').title
    )
  })
})

describe('API example contract', () => {
  const exampleById = new Map(
    AI_MEDIA_API_EXAMPLES.map((example) => [example.id, example])
  )

  test('provides image, video, and speech examples', () => {
    assert.deepEqual(
      AI_MEDIA_API_EXAMPLES.map((example) => example.id),
      ['image', 'video', 'speech']
    )
  })

  test('endpoints match the current Docs', () => {
    assert.equal(AI_MEDIA_API_BASE_URL, 'https://vancine.com/v1')
    const image = exampleById.get('image')
    const video = exampleById.get('video')
    const speech = exampleById.get('speech')
    assert.ok(image && video && speech)
    assert.ok(
      image.code.includes('POST https://vancine.com/v1/images/generations')
    )
    assert.ok(
      video.code.includes('POST https://vancine.com/v1/video/generations')
    )
    assert.ok(
      video.code.includes(
        'GET https://vancine.com/v1/video/generations/$TASK_ID'
      )
    )
    assert.ok(speech.code.includes('POST https://vancine.com/v1/audio/speech'))
  })

  test('model IDs mirror documented models', () => {
    const image = exampleById.get('image')
    const video = exampleById.get('video')
    const speech = exampleById.get('speech')
    assert.ok(image && video && speech)
    assert.ok(image.code.includes('"qwen-image-2.0"'))
    assert.ok(video.code.includes('"Doubao-Seedance-2.5"'))
    assert.ok(speech.code.includes('"Doubao-tts2.0"'))
    assert.ok(!video.code.includes('Doubao-Seedance-1.5-pro'))
    assert.ok(!video.code.includes('Doubao-Seedance-2.0-fast'))
    assert.ok(!video.code.includes('Doubao-Seedance-2.0'))
    // The minimal safe Seedance 2.5 request carries only model + prompt.
    assert.ok(!video.code.includes('1280x720'))
    assert.ok(!video.code.includes('"size"'))
  })

  test('keys come only from the VANCINE_API_KEY environment variable', () => {
    assert.equal(AI_MEDIA_API_KEY_ENV_VAR, 'VANCINE_API_KEY')
    for (const example of AI_MEDIA_API_EXAMPLES) {
      assert.ok(
        example.code.includes(AI_MEDIA_API_KEY_ENV_VAR),
        `${example.id} must read the environment variable`
      )
    }
  })

  test('contains no legacy domains, hardcoded secrets, or fixed prices', () => {
    for (const example of AI_MEDIA_API_EXAMPLES) {
      assert.ok(!example.code.includes('api.vancine.com'))
      assert.ok(!example.code.includes('localhost'))
      assert.ok(!example.code.includes('127.0.0.1'))
      assert.ok(!example.code.includes('sk-'))
      assert.ok(!/\$\d/.test(example.code))
    }
  })
})

describe('page content contract', () => {
  test('uses the shared anonymous event names', () => {
    assert.equal(AI_MEDIA_CTA_EVENT, 'get_started_clicked')
    assert.equal(AI_MEDIA_RESOURCE_EVENT, 'developer_resource_clicked')
  })

  test('sections register i18n keys through the shared registry', () => {
    const registry = new Set<string>(AI_MEDIA_I18N_KEYS)
    const referenced = [
      ...AI_MEDIA_CAPABILITIES,
      ...AI_MEDIA_BENEFITS,
      ...AI_MEDIA_USE_CASES,
      ...AI_MEDIA_CATEGORIES,
    ]
    for (const entry of referenced) {
      assert.ok(registry.has(entry.titleKey), entry.titleKey)
      assert.ok(registry.has(entry.descriptionKey), entry.descriptionKey)
    }
    for (const entry of AI_MEDIA_FAQ) {
      assert.ok(registry.has(entry.questionKey), entry.questionKey)
      assert.ok(registry.has(entry.answerKey), entry.answerKey)
    }
  })

  test('categories cover the four documented media Docs pages', () => {
    assert.deepEqual(
      AI_MEDIA_CATEGORIES.map((category) => category.docsSlug).sort(),
      ['audio', 'image', 'td', 'video']
    )
  })

  test('copy contains none of the retired claims', () => {
    const copySources = [
      ...AI_MEDIA_I18N_KEYS,
      ...AI_MEDIA_API_EXAMPLES.map((example) => example.code),
    ]
    const joined = copySources.join('\n')
    assert.ok(!joined.includes('$1'))
    assert.ok(!/free credit/i.test(joined))
    assert.ok(!/no credit card/i.test(joined))
    assert.ok(!/credit card required/i.test(joined))
    assert.ok(!/leading|state of the art|latest/i.test(joined))
    assert.ok(!joined.includes('api.vancine.com'))
  })
})

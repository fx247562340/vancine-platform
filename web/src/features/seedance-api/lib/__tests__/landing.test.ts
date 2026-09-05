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

import { describe, test } from 'vitest'

import {
  getSeedanceCtaDestination,
  getSeedanceCtaTarget,
  getSeedancePageMetadata,
  SEEDANCE_API_BASE_URL,
  SEEDANCE_API_KEY_ENV_VAR,
  SEEDANCE_CANONICAL,
  SEEDANCE_CODE_EXAMPLES,
  SEEDANCE_CTA_EVENT,
  SEEDANCE_CTA_LOCATIONS,
  SEEDANCE_FAQ,
  SEEDANCE_MODEL_ID,
  SEEDANCE_SUBMIT_ENDPOINT,
} from '../landing'

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getSeedanceCtaDestination(false), '/sign-up')
    assert.equal(getSeedanceCtaDestination(true), '/playground')
  })

  test('retains exactly the five UTM attribution parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    assert.equal(
      getSeedanceCtaDestination(false, search),
      '/sign-up?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    )
  })

  test('accepts search strings without a leading question mark', () => {
    assert.equal(
      getSeedanceCtaDestination(false, 'utm_source=x'),
      '/sign-up?utm_source=x'
    )
  })

  test('drops sensitive, routing, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&username=u&user_id=7&token=t&api_key=k&key=k' +
      '&password=p&redirect=/evil&return_to=/evil&unknown=1&utm_source=ok'
    assert.equal(
      getSeedanceCtaDestination(true, search),
      '/playground?utm_source=ok'
    )
  })

  test('never produces an absolute or foreign target (no open redirect)', () => {
    for (const auth of [false, true]) {
      const destination = getSeedanceCtaDestination(
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
      getSeedanceCtaTarget(false, '?utm_source=x&email=a@b.com'),
      {
        to: '/sign-up',
        search: { utm_source: 'x' },
      }
    )
    assert.deepEqual(getSeedanceCtaTarget(true, '?email=a@b.com'), {
      to: '/playground',
      search: {},
    })
  })
})

describe('page metadata', () => {
  const supportedLanguages = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

  test('pins canonical and og:url for every language', () => {
    for (const language of supportedLanguages) {
      const metadata = getSeedancePageMetadata(language)
      assert.equal(metadata.canonical, 'https://vancine.com/seedance-api')
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
    const metadata = getSeedancePageMetadata('en')
    assert.equal(
      metadata.twitterTitle,
      'Seedance 2.5 API for Async Video Generation'
    )
    assert.equal(
      metadata.twitterDescription,
      'Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.'
    )
  })

  test('covers all seven supported languages distinctly', () => {
    const titles = supportedLanguages.map(
      (language) => getSeedancePageMetadata(language).title
    )
    assert.equal(new Set(titles).size, titles.length)
    assert.ok(
      titles.slice(1).every((title) => title !== titles[0]),
      'non-English metadata must not be the English text'
    )
  })

  test('normalizes BCP-47 variants and falls back to English', () => {
    assert.equal(
      getSeedancePageMetadata('zh-CN').title,
      getSeedancePageMetadata('zhCN').title
    )
    assert.equal(
      getSeedancePageMetadata('zh-Hant').title,
      getSeedancePageMetadata('zhTW').title
    )
    assert.equal(
      getSeedancePageMetadata('de-DE').title,
      getSeedancePageMetadata('en').title
    )
  })

  test('exposes the canonical constant', () => {
    assert.equal(SEEDANCE_CANONICAL, 'https://vancine.com/seedance-api')
  })
})

describe('code example contract', () => {
  const exampleById = new Map(
    SEEDANCE_CODE_EXAMPLES.map((example) => [example.id, example])
  )

  test('provides cURL, Python, and Node.js examples', () => {
    assert.deepEqual(
      SEEDANCE_CODE_EXAMPLES.map((example) => example.id),
      ['curl', 'python', 'node']
    )
  })

  test('every example targets the public endpoint and Seedance 2.5', () => {
    assert.equal(
      SEEDANCE_SUBMIT_ENDPOINT,
      'https://vancine.com/v1/video/generations'
    )
    assert.equal(SEEDANCE_API_BASE_URL, 'https://vancine.com/v1')
    assert.equal(SEEDANCE_MODEL_ID, 'Doubao-Seedance-2.5')
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        example.code.includes(SEEDANCE_SUBMIT_ENDPOINT),
        `${example.id} must target the public endpoint`
      )
      assert.ok(
        example.code.includes('"Doubao-Seedance-2.5"') ||
          example.code.includes("'Doubao-Seedance-2.5'"),
        `${example.id} must use the Seedance 2.5 model id`
      )
    }
  })

  test('keys come only from the VANCINE_API_KEY environment variable', () => {
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        example.code.includes(SEEDANCE_API_KEY_ENV_VAR),
        `${example.id} must reference the environment variable`
      )
      assert.ok(
        !example.code.includes('sk-'),
        `${example.id} must not contain a hardcoded secret`
      )
    }
  })

  test('contains no legacy domains or Seedance 1.5 / 2.0 ids', () => {
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(!example.code.includes('api.vancine.com'))
      assert.ok(!example.code.includes('localhost'))
      assert.ok(!example.code.includes('127.0.0.1'))
      assert.ok(!example.code.includes('Seedance-1.5'))
      assert.ok(!example.code.includes('Seedance-2.0'))
      assert.ok(!example.code.includes('Seedance-1.5-pro'))
    }
  })

  test('every example handles submit and poll non-2xx separately', () => {
    // Submit and each poll must independently check for a non-2xx response;
    // a poll must not assume the GET succeeded just because the submit did.
    const curl = exampleById.get('curl')
    assert.ok(curl)
    assert.ok(
      curl.code.includes('HTTP_CODE'),
      'curl must check submit HTTP code'
    )
    assert.ok(
      curl.code.includes('POLL_HTTP'),
      'curl must check a separate poll HTTP code'
    )
    assert.ok(
      /"\$POLL_HTTP"\s*-lt\s*200/.test(curl.code),
      'curl poll must gate on its own HTTP code'
    )

    const python = exampleById.get('python')
    assert.ok(python)
    assert.ok(
      python.code.includes('response.ok'),
      'python must check submit response.ok'
    )
    assert.ok(
      python.code.includes('poll_response.ok'),
      'python must check poll_response.ok'
    )

    const node = exampleById.get('node')
    assert.ok(node)
    assert.ok(
      node.code.includes('submitResponse.ok'),
      'node must check submitResponse.ok'
    )
    assert.ok(
      node.code.includes('taskResponse.ok'),
      'node must check taskResponse.ok'
    )

    // Task id validation: the examples must guard against an empty id.
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        example.code.includes('task_id') ||
          example.code.includes('taskId') ||
          example.code.includes('TASK_ID'),
        `${example.id} must use a task id variable`
      )
    }
  })

  test('every example polls with a bounded attempt count', () => {
    // cURL uses a MAX_ATTEMPTS constant; Python and Node use a fixed range.
    const curl = exampleById.get('curl')
    assert.ok(curl)
    assert.ok(curl.code.includes('MAX_ATTEMPTS'))
    const python = exampleById.get('python')
    assert.ok(python)
    assert.ok(python.code.includes('range(24)'))
    const node = exampleById.get('node')
    assert.ok(node)
    assert.ok(node.code.includes('attempt < 24'))
  })

  test('every example reads the real polling contract', () => {
    // Vancine returns {code, data: {status, result_url, fail_reason}}; the
    // examples must read data.status (SUCCESS/FAILURE), data.result_url, and
    // data.fail_reason — never the OpenAI-Video top-level fields.
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(example.code.includes('data'), `${example.id} must read data`)
      assert.ok(
        example.code.includes('SUCCESS'),
        `${example.id} must handle SUCCESS`
      )
      assert.ok(
        example.code.includes('FAILURE'),
        `${example.id} must handle FAILURE`
      )
      assert.ok(
        example.code.includes('result_url'),
        `${example.id} must read result_url`
      )
      assert.ok(
        example.code.includes('fail_reason'),
        `${example.id} must read fail_reason`
      )
    }
  })

  test('no example uses the stale OpenAI-Video polling fields', () => {
    for (const example of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        !example.code.includes('completed'),
        `${example.id} must not read a top-level completed`
      )
      assert.ok(
        !example.code.includes('failed'),
        `${example.id} must not read a top-level failed`
      )
      assert.ok(
        !example.code.includes('metadata'),
        `${example.id} must not read metadata.url`
      )
      assert.ok(
        !example.code.includes('error.message'),
        `${example.id} must not read a top-level error.message`
      )
    }
  })
})

describe('analytics event enumeration', () => {
  test('exposes only the approved anonymous events and fixed values', () => {
    assert.equal(SEEDANCE_CTA_EVENT, 'get_started_clicked')
    assert.deepEqual(
      [...SEEDANCE_CTA_LOCATIONS],
      ['seedance_hero', 'seedance_quickstart', 'seedance_final_cta']
    )
  })

  test('FAQ contract answers workflow, pricing, and getting-started', () => {
    assert.equal(SEEDANCE_FAQ.length, 3)
    const questions = SEEDANCE_FAQ.map((entry) => entry.questionKey).join(' ')
    assert.ok(questions.includes('async video generation work'))
    assert.ok(questions.includes('pricing work for video generation'))
    assert.ok(questions.includes('API key'))
  })
})

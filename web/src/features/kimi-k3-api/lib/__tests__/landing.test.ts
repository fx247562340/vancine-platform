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
  getKimiK3CtaDestination,
  getKimiK3CtaTarget,
  getKimiK3PageMetadata,
  KIMI_K3_API_COMPATIBILITY_EVIDENCE,
  KIMI_K3_API_BASE_URL,
  KIMI_K3_API_KEY_ENV_VAR,
  KIMI_K3_CANONICAL,
  KIMI_K3_CHAT_ENDPOINT,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_CTA_LOCATIONS,
  KIMI_K3_EVIDENCE_FILE_URL,
  KIMI_K3_EVIDENCE_LIMITATION_KEYS,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_FAQ,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
  KIMI_K3_MODEL_ID,
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_RESOURCE_EVENT,
} from '../landing'

describe('CTA destination resolution', () => {
  test('guests land on /sign-up, authenticated users on /playground', () => {
    assert.equal(getKimiK3CtaDestination(false), '/sign-up')
    assert.equal(getKimiK3CtaDestination(true), '/playground')
  })

  test('retains exactly the five UTM attribution parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    assert.equal(
      getKimiK3CtaDestination(false, search),
      '/sign-up?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    )
  })

  test('accepts search strings without a leading question mark', () => {
    assert.equal(
      getKimiK3CtaDestination(false, 'utm_source=x'),
      '/sign-up?utm_source=x'
    )
  })

  test('drops sensitive, routing, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&username=u&user_id=7&token=t&api_key=k&key=k' +
      '&password=p&redirect=/evil&return_to=/evil&unknown=1&utm_source=ok'
    assert.equal(
      getKimiK3CtaDestination(true, search),
      '/playground?utm_source=ok'
    )
  })

  test('never produces an absolute or foreign target (no open redirect)', () => {
    for (const auth of [false, true]) {
      const destination = getKimiK3CtaDestination(
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
    assert.deepEqual(getKimiK3CtaTarget(false, '?utm_source=x&email=a@b.com'), {
      to: '/sign-up',
      search: { utm_source: 'x' },
    })
    assert.deepEqual(getKimiK3CtaTarget(true, '?email=a@b.com'), {
      to: '/playground',
      search: {},
    })
  })
})

describe('page metadata', () => {
  const supportedLanguages = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

  test('pins canonical and og:url for every language', () => {
    for (const language of supportedLanguages) {
      const metadata = getKimiK3PageMetadata(language)
      assert.equal(metadata.canonical, 'https://vancine.com/kimi-k3-api')
      assert.equal(metadata.ogUrl, metadata.canonical)
      assert.ok(metadata.title.length > 0)
      assert.ok(metadata.description.length > 0)
      assert.ok(metadata.ogTitle.length > 0)
      assert.ok(metadata.ogDescription.length > 0)
    }
  })

  test('covers all seven supported languages distinctly', () => {
    const titles = supportedLanguages.map(
      (language) => getKimiK3PageMetadata(language).title
    )
    assert.equal(new Set(titles).size, titles.length)
    assert.ok(
      titles.slice(1).every((title) => title !== titles[0]),
      'non-English metadata must not be the English text'
    )
  })

  test('normalizes BCP-47 variants and falls back to English', () => {
    assert.equal(
      getKimiK3PageMetadata('zh-CN').title,
      getKimiK3PageMetadata('zhCN').title
    )
    assert.equal(
      getKimiK3PageMetadata('zh-Hant').title,
      getKimiK3PageMetadata('zhTW').title
    )
    assert.equal(
      getKimiK3PageMetadata('de-DE').title,
      getKimiK3PageMetadata('en').title
    )
  })

  test('exposes the canonical constant', () => {
    assert.equal(KIMI_K3_CANONICAL, 'https://vancine.com/kimi-k3-api')
  })
})

describe('code example contract', () => {
  const exampleById = new Map(
    KIMI_K3_CODE_EXAMPLES.map((example) => [example.id, example])
  )

  test('provides cURL, Python, Node.js, and OpenCode examples', () => {
    assert.deepEqual(
      KIMI_K3_CODE_EXAMPLES.map((example) => example.id),
      ['curl', 'python', 'node', 'opencode']
    )
  })

  test('every example targets the public endpoint and kimi-k3', () => {
    assert.equal(
      KIMI_K3_CHAT_ENDPOINT,
      'https://vancine.com/v1/chat/completions'
    )
    assert.equal(KIMI_K3_API_BASE_URL, 'https://vancine.com/v1')
    assert.equal(KIMI_K3_MODEL_ID, 'kimi-k3')
    for (const example of [
      exampleById.get('curl'),
      exampleById.get('python'),
      exampleById.get('node'),
    ]) {
      assert.ok(example, `missing example`)
      assert.ok(example.code.includes(KIMI_K3_CHAT_ENDPOINT))
      assert.ok(
        example.code.includes('"kimi-k3"') || example.code.includes("'kimi-k3'")
      )
    }
    const opencode = exampleById.get('opencode')
    assert.ok(opencode)
    assert.ok(opencode.code.includes(KIMI_K3_API_BASE_URL))
    assert.ok(opencode.code.includes('"kimi-k3"'))
  })

  test('keys come only from the VANCINE_API_KEY environment variable', () => {
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.ok(
        example.code.includes(KIMI_K3_API_KEY_ENV_VAR),
        `${example.id} must read the environment variable`
      )
      if (example.id === 'opencode') {
        assert.ok(example.code.includes('{env:VANCINE_API_KEY}'))
      }
    }
  })

  test('contains no legacy domains, hardcoded secrets, or fixed prices', () => {
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.ok(!example.code.includes('api.vancine.com'))
      assert.ok(!example.code.includes('localhost'))
      assert.ok(!example.code.includes('127.0.0.1'))
      assert.ok(!example.code.includes('sk-'))
    }
  })
})

describe('historical evidence semantics', () => {
  test('links only to the approved VancineAI GitHub artifacts', () => {
    const approved = [
      'https://github.com/VancineAI/kimi-k3-api-starter',
      'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json',
    ]
    assert.ok(
      approved.some((url) => KIMI_K3_EVIDENCE_STARTER_REPO.startsWith(url))
    )
    assert.ok(approved.some((url) => KIMI_K3_EVIDENCE_FILE_URL.startsWith(url)))
    assert.ok(KIMI_K3_EVIDENCE_FILE_URL.includes('utm_source=vancine'))
  })

  test('records the controlled run facts', () => {
    const agent = KIMI_K3_OPENCODE_AGENT_EVIDENCE
    assert.equal(agent.status, 'verified')
    assert.equal(agent.client, 'OpenCode')
    assert.equal(agent.clientVersion, 'v1.18.3')
    assert.equal(agent.modelStepsCompleted, 6)
    assert.equal(agent.testsPassed, true)
    assert.equal(agent.telemetryTokens.total, 28707)
    assert.deepEqual(
      [
        agent.toolCalls.read.completed,
        agent.toolCalls.edit.completed,
        agent.toolCalls.bash.completed,
      ],
      [5, 1, 1]
    )

    const probe = KIMI_K3_API_COMPATIBILITY_EVIDENCE
    assert.equal(probe.status, 'passed')
    assert.equal(probe.httpStatus, 200)
    assert.equal(probe.requestedModel, 'kimi-k3')
    assert.equal(probe.responseModel, 'kimi-k3')

    const usage = KIMI_K3_MEASURED_USAGE_EVIDENCE
    assert.equal(usage.scope, 'one_controlled_task')
    assert.equal(usage.amount, 0.19)
    assert.equal(usage.currency, 'USD')
  })

  test('publishes the limiting caveats for the historical run', () => {
    const limitations = [...KIMI_K3_EVIDENCE_LIMITATION_KEYS]
    assert.equal(limitations.length, 7)
    const joined = limitations.join(' ')
    assert.ok(joined.includes('single historical controlled run'))
    assert.ok(joined.includes('not a current price or credit commitment'))
    assert.ok(joined.includes('No free-tier or credit amount is guaranteed'))
    assert.ok(joined.includes('Upstream provider costs are not shown'))
    assert.ok(joined.includes('not an official Moonshot AI or Kimi service'))
    assert.ok(!joined.includes('$1 free credit'))
  })
})

describe('analytics event enumeration', () => {
  test('exposes only the approved anonymous events and fixed values', () => {
    assert.equal(KIMI_K3_CTA_EVENT, 'get_started_clicked')
    assert.equal(KIMI_K3_RESOURCE_EVENT, 'developer_resource_clicked')
    assert.deepEqual(
      [...KIMI_K3_CTA_LOCATIONS],
      [
        'kimi_k3_hero',
        'kimi_k3_quickstart',
        'kimi_k3_evidence',
        'kimi_k3_final_cta',
      ]
    )
  })

  test('FAQ contract answers availability, tools, officiality, and keys', () => {
    assert.equal(KIMI_K3_FAQ.length, 4)
    const questions = KIMI_K3_FAQ.map((entry) => entry.questionKey).join(' ')
    assert.ok(questions.includes('availability and pricing'))
    assert.ok(questions.includes('developer tools'))
    assert.ok(questions.includes('official Moonshot AI or Kimi service'))
    assert.ok(questions.includes('API key'))
  })
})

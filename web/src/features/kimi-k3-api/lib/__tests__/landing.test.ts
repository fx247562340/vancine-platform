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

import type { LandingModelPrice } from '@/features/landing-pricing'

import {
  getKimiK3CtaDestination,
  getKimiK3CtaLabelKey,
  getKimiK3CtaTarget,
  getKimiK3PageMetadata,
  KIMI_K3_API_COMPATIBILITY_EVIDENCE,
  KIMI_K3_API_BASE_URL,
  KIMI_K3_API_KEY_ENV_VAR,
  KIMI_K3_CANONICAL,
  KIMI_K3_CHAT_ENDPOINT,
  getKimiK31CodeExamples,
  getKimiK31InputOutputDiscountPercent,
  KIMI_K31_DEFAULT_MODEL_ID,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_CTA_LOCATIONS,
  KIMI_K3_EVIDENCE_FILE_URL,
  KIMI_K3_EVIDENCE_LIMITATION_KEYS,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_FAQ,
  KIMI_K3_I18N_KEYS,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_RESOURCE_EVENT,
  KIMI_K3_RESOURCE_LOCATIONS,
  KIMI_K3_RESOURCE_VALUES,
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

describe('CTA label / destination parity', () => {
  test('guest label is Create an API key and the destination is /sign-up', () => {
    assert.equal(getKimiK3CtaLabelKey(false), 'Create an API key')
    assert.equal(getKimiK3CtaDestination(false), '/sign-up')
  })

  test('authenticated label is Open Playground and the destination is /playground', () => {
    assert.equal(getKimiK3CtaLabelKey(true), 'Open Playground')
    assert.equal(getKimiK3CtaDestination(true), '/playground')
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

  test('English metadata is byte-identical to router/web_metadata.go', () => {
    const metadata = getKimiK3PageMetadata('en')
    assert.equal(
      metadata.title,
      'Kimi K3.1 Pro & Highspeed API for Coding Agents | Vancine'
    )
    assert.equal(
      metadata.description,
      'Choose Kimi K3.1 Pro or Highspeed on an OpenAI-compatible API. Compare live Vancine input and output prices with the October 24, 2026 Kimi official reference.'
    )
    assert.equal(
      metadata.ogTitle,
      'Kimi K3.1 Pro & Highspeed API for Coding Agents'
    )
    assert.equal(metadata.ogDescription, metadata.description)
    assert.equal(
      metadata.twitterTitle,
      'Kimi K3.1 Pro & Highspeed API for Coding Agents'
    )
    assert.equal(metadata.twitterDescription, metadata.description)
    assert.equal(metadata.description.includes('20%'), false)
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
  test('switches both model IDs through cURL, Python, Node.js, and OpenCode', () => {
    assert.equal(KIMI_K31_DEFAULT_MODEL_ID, 'kimi-k3.1-pro')
    for (const modelId of [
      'kimi-k3.1-pro',
      'kimi-k3.1-pro-highspeed',
    ] as const) {
      const examples = getKimiK31CodeExamples(modelId)
      assert.deepEqual(
        examples.map((example) => example.id),
        ['curl', 'python', 'node', 'opencode']
      )
      for (const example of examples) {
        assert.ok(example.code.includes(modelId), example.id)
        assert.equal(example.code.includes('"kimi-k3"'), false)
        assert.equal(example.code.includes("'kimi-k3'"), false)
        assert.ok(example.code.includes(KIMI_K3_API_KEY_ENV_VAR))
        assert.equal(example.code.includes('temperature'), false)
        assert.equal(example.code.includes('max_tokens'), false)
        assert.equal(example.code.includes('sk-'), false)
        assert.equal(example.code.includes('api.vancine.com'), false)
      }
      const otherId =
        modelId === 'kimi-k3.1-pro'
          ? 'kimi-k3.1-pro-highspeed'
          : 'kimi-k3.1-pro'
      for (const example of examples) {
        const hasModel =
          example.code.includes(`"${modelId}"`) ||
          example.code.includes(`'${modelId}'`)
        const hasOther =
          example.code.includes(`"${otherId}"`) ||
          example.code.includes(`'${otherId}'`)
        assert.equal(hasModel, true, example.id)
        assert.equal(hasOther, false, example.id)
      }
    }
  })

  test('keeps the public endpoint and environment-backed OpenCode key', () => {
    assert.equal(
      KIMI_K3_CHAT_ENDPOINT,
      'https://vancine.com/v1/chat/completions'
    )
    assert.equal(KIMI_K3_API_BASE_URL, 'https://vancine.com/v1')
    const opencode = getKimiK31CodeExamples('kimi-k3.1-pro').find(
      (example) => example.id === 'opencode'
    )
    assert.ok(opencode)
    assert.ok(opencode.code.includes('{env:VANCINE_API_KEY}'))
    assert.ok(opencode.code.includes(KIMI_K3_API_BASE_URL))
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
    assert.ok(joined.includes('retired model kimi-k3'))
    assert.ok(joined.includes('not a verification of kimi-k3.1-pro'))
    assert.ok(joined.includes('single historical controlled run'))
    assert.ok(joined.includes('not a current price or credit commitment'))
    assert.ok(joined.includes('No free-tier or credit amount is guaranteed'))
    assert.ok(joined.includes('Upstream provider costs are not shown'))
    // The remaining caveats are price, token, cost and verification scope.
    assert.ok(joined.includes('Token usage, latency, and cost vary'))
    assert.ok(joined.includes('independently live-verified'))
    assert.ok(!joined.includes('$1 free credit'))
    // No relationship-distancing caveat is published.
    assert.equal(
      /not an official|independent third-party/i.test(joined),
      false,
      'evidence caveats must not carry relationship-disclaimer copy'
    )
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
    assert.deepEqual(
      [...KIMI_K3_RESOURCE_VALUES],
      [
        'docs',
        'pricing',
        'starter_repo',
        'kimi_official_pricing',
        'openrouter_pricing',
      ]
    )
    assert.deepEqual(
      [...KIMI_K3_RESOURCE_LOCATIONS],
      ['quickstart', 'evidence', 'pricing']
    )
  })

  test('visible-page key contract carries no historical K3 or internal-process copy', () => {
    for (const needle of [
      'Historical',
      '$0.19',
      '84345',
      'e52f78b7',
      'retired model',
      'not Kimi K3.1 results',
      'temperature:0',
      'not live-verified on Vancine',
      'Discount not confirmed',
      'OpenRouter is not shown',
      'not published yet',
      'Kimi K3 live results',
      'published Kimi specification',
      'Not a Vancine measurement',
      'Kimi official guide',
      'Official guide:',
    ]) {
      assert.equal(
        KIMI_K3_I18N_KEYS.some((key) => key.includes(needle)),
        false,
        `visible-page contract must not include: ${needle}`
      )
    }
    // Evidence link constants stay internal (unrendered) and unchanged.
    assert.ok(KIMI_K3_EVIDENCE_FILE_URL.includes('kimi-k3-api-starter'))
    assert.ok(KIMI_K3_EVIDENCE_STARTER_REPO.includes('kimi-k3-api-starter'))
  })

  test('FAQ contract covers the five practical purchase and setup questions', () => {
    assert.equal(KIMI_K3_FAQ.length, 5)
    const questions = KIMI_K3_FAQ.map((entry) => entry.questionKey).join(' ')
    const answers = KIMI_K3_FAQ.map((entry) => entry.answerKey).join(' ')
    assert.ok(questions.includes('How do I choose between'))
    assert.ok(questions.includes('Which prices apply'))
    assert.ok(questions.includes('How do I send my first request'))
    assert.ok(questions.includes('How do I configure coding clients'))
    assert.ok(questions.includes('Which parameters are restricted'))
    // The speed claim stays plain (no attribution clause), the key stays in
    // the environment, and no answer references the retired K3 model.
    assert.ok(answers.includes('about 2–3× the speed of Kimi K3.1 Pro'))
    assert.equal(
      /official guide|Not a Vancine measurement/.test(answers),
      false,
      'FAQ must not carry attribution clauses'
    )
    assert.ok(answers.includes('VANCINE_API_KEY'))
    assert.equal(/retired model|not Kimi K3\.1 results/.test(answers), false)
  })
})

describe('input and output discount', () => {
  const ready = (inputUsd: number, outputUsd: number): LandingModelPrice => ({
    status: 'ready',
    amounts: { inputUsd, outputUsd, cacheReadUsd: 0.16 },
  })

  test('matches the dated official reference for both models', () => {
    assert.equal(
      getKimiK31InputOutputDiscountPercent(ready(1.6, 8), 'kimi-k3.1-pro'),
      20
    )
    assert.equal(
      getKimiK31InputOutputDiscountPercent(
        ready(3.2, 16),
        'kimi-k3.1-pro-highspeed'
      ),
      20
    )
  })

  test('hides the assertion when prices do not confirm one shared discount', () => {
    assert.equal(
      getKimiK31InputOutputDiscountPercent(ready(1.6, 9), 'kimi-k3.1-pro'),
      null
    )
    assert.equal(
      getKimiK31InputOutputDiscountPercent(ready(2, 10), 'kimi-k3.1-pro'),
      null
    )
    assert.equal(
      getKimiK31InputOutputDiscountPercent(
        { status: 'unsupported' },
        'kimi-k3.1-pro'
      ),
      null
    )
    assert.equal(
      getKimiK31InputOutputDiscountPercent(
        { status: 'missing' },
        'kimi-k3.1-pro-highspeed'
      ),
      null
    )
  })
})

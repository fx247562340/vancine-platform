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
// Run with: node --test src/features/kimi-k3-api/lib/landing.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'

const require = createRequire(import.meta.url)
const en = require('../../../i18n/locales/en.json')
const zh = require('../../../i18n/locales/zh.json')
const fr = require('../../../i18n/locales/fr.json')
const ja = require('../../../i18n/locales/ja.json')
const ru = require('../../../i18n/locales/ru.json')
const vi = require('../../../i18n/locales/vi.json')

const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8')

const NEW_HERO_KEY =
  'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'
const OLD_HERO_KEY =
  'Connect OpenCode, Cline, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'

const OPENCODE_ONLY_KEY =
  'Only OpenCode v1.18.3 has a live coding-agent verification so far. Cline and Roo Code configurations are provided in the starter repository but have not been independently live-verified.'
const THIRD_PARTY_PLATFORM_KEY =
  'Vancine is an independent third-party API aggregation platform, not an official Moonshot AI or Kimi service.'
const MEASURED_USAGE_DISCLAIMER_KEY =
  'This controlled OpenCode verification run incurred $0.19 in measured Vancine usage for one controlled task only. Pricing and token usage vary by task, and this result does not guarantee that $1 credit will complete another coding-agent run.'

const EVIDENCE_VERIFIED_KEYS = [
  'Live verification evidence',
  'Three recorded checks against the real kimi-k3 model through the Vancine endpoint: API compatibility, a completed OpenCode coding-agent run, and the measured usage of that run.',
  'Verified',
  'Measured',
  'OpenCode coding agent',
  'Agent client',
  'Execution environment',
  'Model steps completed',
  'Tool calls completed (read / edit / bash)',
  'Tool calls failed',
  'Tests',
  'Run duration',
  'Run ID',
  'View public evidence file',
  OPENCODE_ONLY_KEY,
  'API compatibility',
  'temperature:0 probe accepted',
  'Requested model',
  'Response model',
  'Usage (prompt / completion / total tokens)',
  'Reasoning tokens',
  'Completion stop reason',
  'The probe used a 16-token completion budget that was mostly consumed by reasoning, so its visible content is inconclusive. This small reasoning-heavy response is not a content-generation failure.',
  'Measured usage',
  'Agent telemetry tokens (total)',
  'Token breakdown (input / output / reasoning / cache read / cache write)',
  'Measured Vancine usage',
  MEASURED_USAGE_DISCLAIMER_KEY,
  THIRD_PARTY_PLATFORM_KEY,
]

// Sentence keys that must be genuinely translated (not left in English) in
// every non-English locale.
const EVIDENCE_TRANSLATED_SAMPLE_KEYS = [
  'Live verification evidence',
  'Verified',
  'Measured',
  'OpenCode coding agent',
  'API compatibility',
  'Measured usage',
  'View public evidence file',
  OPENCODE_ONLY_KEY,
  'The probe used a 16-token completion budget that was mostly consumed by reasoning, so its visible content is inconclusive. This small reasoning-heavy response is not a content-generation failure.',
  MEASURED_USAGE_DISCLAIMER_KEY,
  THIRD_PARTY_PLATFORM_KEY,
]

const STALE_PENDING_KEYS = [
  'Production verification pending',
  'Local fixture checks complete: request structure and agent configuration files validate offline. This does not verify the live Kimi K3 model or that a coding agent run succeeds.',
  'Live Kimi K3 and coding-agent results are not yet recorded.',
]

import {
  KIMI_K3_API_COMPATIBILITY_EVIDENCE,
  KIMI_K3_CANONICAL,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CREDIT_DISCLAIMER,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_CTA_LOCATIONS,
  KIMI_K3_EVIDENCE_FILE_URL,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_STATUS,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_RESOURCE_EVENT,
  KIMI_K3_RESOURCE_VALUES,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing.ts'

const EVIDENCE_CONSTANTS_BLOB = JSON.stringify([
  KIMI_K3_API_COMPATIBILITY_EVIDENCE,
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
])

describe('Kimi K3 API landing contract', () => {
  test('copy helper reports an error when the clipboard API is unavailable', async () => {
    assert.equal(await copyTextToClipboard('example', undefined), 'error')
  })

  test('copy helper contains clipboard permission rejection', async () => {
    const deniedClipboard = {
      async writeText() {
        throw new Error('clipboard permission denied')
      },
    }

    assert.equal(await copyTextToClipboard('example', deniedClipboard), 'error')
  })

  test('guest CTA preserves only the approved UTM parameters', () => {
    assert.equal(
      getKimiK3CtaDestination(
        false,
        '?utm_source=search&email=developer@example.com&utm_campaign=k3&token=nope&utm_term=agents'
      ),
      '/sign-up?utm_source=search&utm_campaign=k3&utm_term=agents'
    )
  })

  test('authenticated CTA points to playground and preserves allowed UTM parameters', () => {
    assert.equal(
      getKimiK3CtaDestination(true, 'utm_medium=cpc&ref=discard'),
      '/playground?utm_medium=cpc'
    )
  })

  test('metadata has the exact canonical and approved English title', () => {
    const metadata = getKimiK3Metadata('en')
    assert.equal(KIMI_K3_CANONICAL, 'https://vancine.com/kimi-k3-api')
    assert.equal(metadata.canonical, KIMI_K3_CANONICAL)
    assert.equal(metadata.title, 'Kimi K3 API for Coding Agents | Vancine')
    assert.match(metadata.description, /OpenCode/)
    assert.match(metadata.description, /Cline/)
    assert.match(metadata.description, /OpenAI-compatible/)
    assert.match(metadata.description, /one API key/i)
  })

  test('Chinese metadata is selected for zh variants and all other locales use English', () => {
    assert.notEqual(
      getKimiK3Metadata('zh-CN').title,
      getKimiK3Metadata('en').title
    )
    assert.equal(getKimiK3Metadata('zh').canonical, KIMI_K3_CANONICAL)
    assert.equal(getKimiK3Metadata('fr').title, getKimiK3Metadata('en').title)
    assert.equal(getKimiK3Metadata('ja').title, getKimiK3Metadata('en').title)
  })

  test('analytics contracts use only the approved event names and locations', () => {
    assert.equal(KIMI_K3_CTA_EVENT, 'get_started_clicked')
    assert.deepEqual(KIMI_K3_CTA_LOCATIONS, [
      'kimi_k3_hero',
      'kimi_k3_quickstart',
      'kimi_k3_evidence',
      'kimi_k3_final_cta',
    ])
    assert.equal(KIMI_K3_RESOURCE_EVENT, 'developer_resource_clicked')
    assert.deepEqual(KIMI_K3_RESOURCE_VALUES, ['docs', 'pricing', 'starter_repo'])
  })

  test('quickstart examples all use the public Vancine endpoint and Kimi K3', () => {
    assert.deepEqual(
      KIMI_K3_CODE_EXAMPLES.map((example) => example.id),
      ['curl', 'python', 'node']
    )
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.match(
        example.code,
        /POST https:\/\/vancine\.com\/v1\/chat\/completions/
      )
      assert.match(example.code, /kimi-k3/)
      assert.match(example.code, /VANCINE_API_KEY/)
    }
  })

  test('examples never contain legacy hosts, real-looking secrets, or fixed token prices', () => {
    const examples = [
      ...KIMI_K3_CODE_EXAMPLES.map((example) => example.code),
      KIMI_K3_OPENCODE_CONFIG,
    ].join('\n')
    assert.doesNotMatch(examples, /api\.vancine\.com/)
    assert.doesNotMatch(examples, /sk-[a-zA-Z0-9]{12,}/)
    assert.doesNotMatch(
      examples,
      /\$\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:million|1m|token)/i
    )
  })

  test('OpenCode configuration honors the exact Vancine provider contract', () => {
    assert.match(KIMI_K3_OPENCODE_CONFIG, /@ai-sdk\/openai-compatible/)
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"vancine"/)
    assert.match(
      KIMI_K3_OPENCODE_CONFIG,
      /"baseURL": "https:\/\/vancine\.com\/v1"/
    )
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"apiKey": "\{env:VANCINE_API_KEY\}"/)
    assert.match(KIMI_K3_OPENCODE_CONFIG, /"kimi-k3"/)
  })

  test('credit disclaimer uses the approved copy exactly', () => {
    assert.equal(
      KIMI_K3_CREDIT_DISCLAIMER,
      '$1 free credit. No credit card required. Usage varies by model and request.'
    )
  })

  test('all supported locales contain the new hero key and no old key', () => {
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      assert.ok(
        NEW_HERO_KEY in translations,
        `locale must contain the new hero key with Roo Code`
      )
      assert.ok(
        !(OLD_HERO_KEY in translations),
        `locale must not contain the old hero key without Roo Code`
      )
    }
  })

  test('API compatibility evidence is verified against live kimi-k3', () => {
    const probe = KIMI_K3_API_COMPATIBILITY_EVIDENCE
    assert.equal(KIMI_K3_EVIDENCE_STATUS, 'verified')
    assert.equal(probe.status, 'passed')
    assert.equal(probe.httpStatus, 200)
    assert.equal(probe.requestTemperature, 0)
    assert.equal(probe.requestMaxTokens, 16)
    assert.equal(probe.requestedModel, 'kimi-k3')
    assert.equal(probe.responseModel, 'kimi-k3')
    assert.equal(probe.usagePromptTokens, 92)
    assert.equal(probe.usageCompletionTokens, 16)
    assert.equal(probe.usageTotalTokens, 108)
    assert.equal(probe.usageReasoningTokens, 13)
    assert.equal(probe.finishReason, 'length')
    // The 16-token reasoning-heavy probe is inconclusive on visible content;
    // it must never be labeled as a content-generation failure.
    assert.equal(probe.visibleContentStatus, 'inconclusive')
  })

  test('OpenCode v1.18.3 agent run is verified with 6 completed steps, edit/bash tool calls, and passing tests', () => {
    const agent = KIMI_K3_OPENCODE_AGENT_EVIDENCE
    assert.equal(agent.status, 'verified')
    assert.equal(agent.client, 'OpenCode')
    assert.equal(agent.clientVersion, 'v1.18.3')
    assert.equal(agent.model, 'kimi-k3')
    assert.equal(agent.runStatus, 'completed')
    assert.equal(agent.durationMs, 84345)
    assert.equal(agent.modelStepsCompleted, 6)
    assert.equal(agent.toolCalls.read.completed, 5)
    assert.equal(agent.toolCalls.read.failed, 0)
    assert.equal(agent.toolCalls.edit.completed, 1)
    assert.equal(agent.toolCalls.edit.failed, 0)
    assert.equal(agent.toolCalls.bash.completed, 1)
    assert.equal(agent.toolCalls.bash.failed, 0)
    assert.equal(agent.testsPassed, true)
    assert.equal(agent.testFileModified, false)
    assert.equal(agent.unexpectedFiles, 0)
    assert.equal(agent.exitStatus, 0)
    assert.equal(agent.runId, 'e52f78b7-0bfa-430f-b8b0-1ad813ea0695')
    assert.equal(agent.telemetryTokens.total, 28707)
    assert.equal(agent.telemetryTokens.input, 3746)
    assert.equal(agent.telemetryTokens.output, 1019)
    assert.equal(agent.telemetryTokens.reasoning, 902)
    assert.equal(agent.telemetryTokens.cacheRead, 23040)
    assert.equal(agent.telemetryTokens.cacheWrite, 0)
  })

  test('measured usage is $0.19 USD for one controlled task, with pricing-varies and no-$1-guarantee qualifications', () => {
    assert.equal(KIMI_K3_MEASURED_USAGE_EVIDENCE.amount, 0.19)
    assert.equal(KIMI_K3_MEASURED_USAGE_EVIDENCE.currency, 'USD')
    assert.equal(KIMI_K3_MEASURED_USAGE_EVIDENCE.scope, 'one_controlled_task')

    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const disclaimer = locale.translation[MEASURED_USAGE_DISCLAIMER_KEY]
      assert.equal(typeof disclaimer, 'string')
      // The measured figure is a literal in every language.
      assert.match(disclaimer, /\$0\.19/)
    }

    const enDisclaimer = en.translation[MEASURED_USAGE_DISCLAIMER_KEY]
    assert.match(enDisclaimer, /one controlled task/)
    assert.match(enDisclaimer, /Pricing and token usage vary by task/)
    assert.match(
      enDisclaimer,
      /does not guarantee that \$1 credit will complete another coding-agent run/
    )
  })

  test('evidence copy exists in every supported locale, is non-empty, and is genuinely translated', () => {
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      for (const key of EVIDENCE_VERIFIED_KEYS) {
        assert.ok(key in translations, `locale must contain evidence key: ${key}`)
        const value = translations[key]
        assert.equal(typeof value, 'string', `evidence key must be a string: ${key}`)
        assert.ok(value.trim().length > 0, `evidence key must not be empty: ${key}`)
        assert.doesNotMatch(
          value,
          /^(?:TODO|TBD|FIXME|xxx|placeholder)/i,
          `evidence key must not be a placeholder: ${key}`
        )
      }
    }
    for (const locale of [zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      for (const key of EVIDENCE_TRANSLATED_SAMPLE_KEYS) {
        assert.notEqual(
          translations[key],
          en.translation[key],
          `evidence key must be translated, not copied from English: ${key}`
        )
      }
    }
  })

  test('only-OpenCode-live-verified and third-party-platform qualifications exist in every locale', () => {
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      assert.ok(
        OPENCODE_ONLY_KEY in translations,
        'locale must contain the only-OpenCode qualification'
      )
      assert.ok(
        THIRD_PARTY_PLATFORM_KEY in translations,
        'locale must contain the third-party platform disclosure'
      )
      // Brand names and versions stay untranslated in every language.
      assert.match(translations[OPENCODE_ONLY_KEY], /OpenCode v1\.18\.3/)
      assert.match(translations[OPENCODE_ONLY_KEY], /Cline/)
      assert.match(translations[OPENCODE_ONLY_KEY], /Roo Code/)
    }
  })

  test('stale pending evidence copy is gone from every locale and the page', () => {
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      for (const key of STALE_PENDING_KEYS) {
        assert.ok(
          !(key in translations),
          `locale must not contain stale pending key: ${key}`
        )
      }
      for (const value of Object.values(translations)) {
        if (typeof value !== 'string') continue
        assert.doesNotMatch(value, /verification pending|not yet recorded/i)
      }
    }
    assert.doesNotMatch(indexSource, /Production verification pending/)
    assert.doesNotMatch(indexSource, /not yet recorded/i)
  })

  test('no locale contains the retracted pass or verified evidence copy', () => {
    const retracted = [
      'Verified compatibility',
      'Every starter and coding agent below was checked against the fixed Kimi K3 evidence fixtures in dry-run mode.',
      'Starters',
      'Coding agents',
      'Dry-run verified',
      'Last verified',
      'View evidence kit',
    ]
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      for (const key of retracted) {
        assert.ok(
          !(key in translations),
          `locale must not contain retracted evidence copy: ${key}`
        )
      }
    }
  })

  test('evidence copy never claims a zero-cost or free agent run, and never shows upstream costs', () => {
    const values = []
    for (const locale of [en, zh, fr, ja, ru, vi]) {
      const translations = locale.translation
      for (const key of EVIDENCE_VERIFIED_KEYS) {
        values.push(translations[key])
      }
    }
    const blob = [...values, EVIDENCE_CONSTANTS_BLOB].join('\n')
    assert.doesNotMatch(blob, /cost[:= ]+0|free agent|zero cost/i)
    assert.doesNotMatch(blob, /1\.34621|CNY/i)
  })

  test('starter repository and public evidence file URLs are exact', () => {
    assert.equal(
      KIMI_K3_EVIDENCE_STARTER_REPO,
      'https://github.com/VancineAI/kimi-k3-api-starter'
    )
    assert.equal(
      KIMI_K3_EVIDENCE_FILE_URL,
      'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json?utm_source=vancine&utm_medium=developer_resource&utm_campaign=kimi_k3_launch&utm_content=opencode_verified_evidence'
    )
  })

  test('evidence never links the internal kit, the wrong owner, or a pending claim, and the page wires the verified sections', () => {
    const blob = [
      KIMI_K3_EVIDENCE_STARTER_REPO,
      KIMI_K3_EVIDENCE_FILE_URL,
      EVIDENCE_CONSTANTS_BLOB,
      indexSource,
    ].join('\n')
    assert.doesNotMatch(blob, /ops\/kimi-k3-evidence/)
    assert.doesNotMatch(blob, /fx247562340/)
    assert.doesNotMatch(blob, /pending/i)

    assert.match(indexSource, /KIMI_K3_API_COMPATIBILITY_EVIDENCE/)
    assert.match(indexSource, /KIMI_K3_OPENCODE_AGENT_EVIDENCE/)
    assert.match(indexSource, /KIMI_K3_MEASURED_USAGE_EVIDENCE/)
    assert.match(indexSource, /KIMI_K3_EVIDENCE_FILE_URL/)
    assert.match(indexSource, /Live verification evidence/)
  })
})

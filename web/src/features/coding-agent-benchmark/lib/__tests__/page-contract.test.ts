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
  BENCHMARK_CTA,
  BENCHMARK_JSON_PATH,
  BENCHMARK_LIMITATION_KEYS,
  BENCHMARK_METHODOLOGY_KEYS,
  CODING_AGENT_BENCHMARK_CANONICAL,
  CODING_AGENT_BENCHMARK_MODELS,
  CODING_AGENT_BENCHMARK_TOTALS,
  formatAgentRunTime,
  formatBilledUsd,
  BENCHMARK_PI_CLI_EXAMPLE,
  BENCHMARK_PI_CONFIG_EXAMPLE,
  getCodingAgentBenchmarkCtaTarget,
  getCodingAgentBenchmarkPageMetadata,
  getCodingAgentBenchmarkPublicJson,
} from '../coding-agent-benchmark'

/**
 * Pure business contract tests for /coding-agent-benchmark.
 * Locked values come from the audited Pi 8-model run on August 28, 2026.
 */

const GO_EN_METADATA = {
  title: '8 Chinese AI Models Tested in Pi Coding Agent | Vancine',
  description:
    'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
  ogTitle: '8 Chinese AI Models Tested in Pi Coding Agent',
  ogDescription:
    'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
  twitterTitle: '8 Chinese AI Models Tested in Pi Coding Agent',
  twitterDescription:
    'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
}

const EXPECTED_MODEL_ORDER = [
  'glm-5.3',
  'glm-5.3-flash',
  'kimi-k3',
  'qwen3.8-max',
  'qwen3.8-flash',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'MiniMax-M3',
] as const

const EXPECTED_ROWS = [
  {
    model: 'glm-5.3',
    result: 'Pass',
    agentRunTimeMs: 37868,
    modelRequests: 6,
    tokens: 10721,
    productionBilledUsd: 0.005178,
  },
  {
    model: 'glm-5.3-flash',
    result: 'Pass',
    agentRunTimeMs: 28164,
    modelRequests: 5,
    tokens: 9189,
    productionBilledUsd: 0.000276,
  },
  {
    model: 'kimi-k3',
    result: 'Pass',
    agentRunTimeMs: 48950,
    modelRequests: 6,
    tokens: 11856,
    productionBilledUsd: 0.01474,
  },
  {
    model: 'qwen3.8-max',
    result: 'Pass',
    agentRunTimeMs: 19802,
    modelRequests: 5,
    tokens: 10878,
    productionBilledUsd: 0.01052,
  },
  {
    model: 'qwen3.8-flash',
    result: 'Pass',
    agentRunTimeMs: 45012,
    modelRequests: 6,
    tokens: 13106,
    productionBilledUsd: 0.000848,
  },
  {
    model: 'deepseek-v4-flash',
    result: 'Pass',
    agentRunTimeMs: 9808,
    modelRequests: 5,
    tokens: 11570,
    productionBilledUsd: 0.000994,
  },
  {
    model: 'deepseek-v4-pro',
    result: 'Pass',
    agentRunTimeMs: 14693,
    modelRequests: 6,
    tokens: 13101,
    productionBilledUsd: 0.002848,
  },
  {
    model: 'MiniMax-M3',
    result: 'Pass',
    agentRunTimeMs: 14851,
    modelRequests: 6,
    tokens: 14081,
    productionBilledUsd: 0.002214,
  },
] as const

describe('result table contract', () => {
  test('contains exactly eight models in the audited order', () => {
    assert.equal(CODING_AGENT_BENCHMARK_MODELS.length, 8)
    assert.deepEqual(
      CODING_AGENT_BENCHMARK_MODELS.map((row) => row.model),
      [...EXPECTED_MODEL_ORDER]
    )
  })

  test('every model passed the single run', () => {
    for (const row of CODING_AGENT_BENCHMARK_MODELS) {
      assert.equal(row.result, 'Pass')
    }
  })

  test('pins the audited per-model numbers', () => {
    for (const expected of EXPECTED_ROWS) {
      const row = CODING_AGENT_BENCHMARK_MODELS.find(
        (item) => item.model === expected.model
      )
      assert.ok(row, `missing model ${expected.model}`)
      assert.equal(row.result, expected.result)
      assert.equal(row.agentRunTimeMs, expected.agentRunTimeMs)
      assert.equal(row.modelRequests, expected.modelRequests)
      assert.equal(row.tokens, expected.tokens)
      assert.equal(row.productionBilledUsd, expected.productionBilledUsd)
    }
  })

  test('qwen3.8-flash billed amount is the production-audited $0.000848', () => {
    const flash = CODING_AGENT_BENCHMARK_MODELS.find(
      (row) => row.model === 'qwen3.8-flash'
    )
    assert.ok(flash)
    assert.equal(flash.productionBilledUsd, 0.000848)
    assert.equal(formatBilledUsd(flash.productionBilledUsd), '$0.000848')
  })

  test('totals are 8 models, 8 passed, 45 requests, 94502 tokens, $0.037618', () => {
    assert.equal(CODING_AGENT_BENCHMARK_TOTALS.models, 8)
    assert.equal(CODING_AGENT_BENCHMARK_TOTALS.passed, 8)
    assert.equal(CODING_AGENT_BENCHMARK_TOTALS.modelRequests, 45)
    assert.equal(CODING_AGENT_BENCHMARK_TOTALS.tokens, 94502)
    assert.equal(CODING_AGENT_BENCHMARK_TOTALS.productionBilledUsd, 0.037618)
  })

  test('billed total is the exact six-decimal sum of the eight rows', () => {
    const sumMicros = CODING_AGENT_BENCHMARK_MODELS.reduce(
      (sum, row) => sum + Math.round(row.productionBilledUsd * 1_000_000),
      0
    )
    assert.equal(sumMicros, 37618)
    assert.equal(
      Math.round(CODING_AGENT_BENCHMARK_TOTALS.productionBilledUsd * 1_000_000),
      37618
    )
  })

  test('request and token totals match the eight rows', () => {
    const requests = CODING_AGENT_BENCHMARK_MODELS.reduce(
      (sum, row) => sum + row.modelRequests,
      0
    )
    const tokens = CODING_AGENT_BENCHMARK_MODELS.reduce(
      (sum, row) => sum + row.tokens,
      0
    )
    assert.equal(requests, 45)
    assert.equal(tokens, 94502)
  })
})

describe('display formatting', () => {
  test('formats agent run times to the approved one-decimal strings', () => {
    assert.equal(formatAgentRunTime(9808), '9.8s')
    assert.equal(formatAgentRunTime(14693), '14.7s')
    assert.equal(formatAgentRunTime(14851), '14.9s')
    assert.equal(formatAgentRunTime(19802), '19.8s')
    assert.equal(formatAgentRunTime(28164), '28.2s')
    assert.equal(formatAgentRunTime(37868), '37.9s')
    assert.equal(formatAgentRunTime(45012), '45.0s')
    assert.equal(formatAgentRunTime(48950), '49.0s')
  })

  test('formats billed USD with six decimal places', () => {
    assert.equal(formatBilledUsd(0.005178), '$0.005178')
    assert.equal(formatBilledUsd(0.000276), '$0.000276')
    assert.equal(formatBilledUsd(0.01474), '$0.014740')
    assert.equal(formatBilledUsd(0.037618), '$0.037618')
  })
})

describe('canonical and metadata', () => {
  test('canonical URL is the fixed public origin without query or UTM', () => {
    assert.equal(
      CODING_AGENT_BENCHMARK_CANONICAL,
      'https://vancine.com/coding-agent-benchmark'
    )
    assert.ok(!CODING_AGENT_BENCHMARK_CANONICAL.includes('?'))
  })

  test('English metadata is byte-identical to the Go server-rendered block', () => {
    const enMeta = getCodingAgentBenchmarkPageMetadata('en')
    assert.equal(enMeta.title, GO_EN_METADATA.title)
    assert.equal(enMeta.description, GO_EN_METADATA.description)
    assert.equal(enMeta.ogTitle, GO_EN_METADATA.ogTitle)
    assert.equal(enMeta.ogDescription, GO_EN_METADATA.ogDescription)
    assert.equal(enMeta.twitterTitle, GO_EN_METADATA.twitterTitle)
    assert.equal(enMeta.twitterDescription, GO_EN_METADATA.twitterDescription)
    assert.equal(enMeta.canonical, CODING_AGENT_BENCHMARK_CANONICAL)
    assert.equal(enMeta.ogUrl, CODING_AGENT_BENCHMARK_CANONICAL)
  })

  test('metadata falls back to English for unknown language', () => {
    assert.deepEqual(
      getCodingAgentBenchmarkPageMetadata('xx-YY'),
      getCodingAgentBenchmarkPageMetadata('en')
    )
  })

  test('all seven supported languages return the fixed canonical', () => {
    for (const lang of ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const meta = getCodingAgentBenchmarkPageMetadata(lang)
      assert.equal(meta.canonical, CODING_AGENT_BENCHMARK_CANONICAL, lang)
      assert.equal(meta.ogUrl, CODING_AGENT_BENCHMARK_CANONICAL, lang)
      assert.ok(!meta.canonical.includes('?'))
    }
  })
})

describe('CTA destinations', () => {
  test('primary, pricing, and docs CTAs use the approved campaign UTMs', () => {
    assert.deepEqual(getCodingAgentBenchmarkCtaTarget('primary'), {
      to: '/sign-up',
      search: {
        utm_source: 'vancine',
        utm_medium: 'owned',
        utm_campaign: 'pi_8_model_benchmark',
        utm_content: 'benchmark_page_primary_cta',
      },
    })
    assert.deepEqual(getCodingAgentBenchmarkCtaTarget('pricing'), {
      to: '/pricing',
      search: {
        utm_source: 'vancine',
        utm_medium: 'owned',
        utm_campaign: 'pi_8_model_benchmark',
        utm_content: 'benchmark_page_pricing_cta',
      },
    })
    assert.deepEqual(getCodingAgentBenchmarkCtaTarget('docs'), {
      to: '/docs',
      search: {
        utm_source: 'vancine',
        utm_medium: 'owned',
        utm_campaign: 'pi_8_model_benchmark',
        utm_content: 'benchmark_page_docs_cta',
      },
    })
  })

  test('CTA search params stay inside the UTM allowlist', () => {
    const allowed = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ])
    for (const cta of Object.values(BENCHMARK_CTA)) {
      for (const key of Object.keys(cta.search)) {
        assert.ok(allowed.has(key), `${key} must be an allowlisted UTM key`)
      }
    }
  })
})

describe('Pi models.json example', () => {
  test('parses as official models.json with a Vancine OpenAI-compatible provider', () => {
    const parsed = JSON.parse(BENCHMARK_PI_CONFIG_EXAMPLE) as {
      providers: {
        vancine: {
          baseUrl: string
          api: string
          apiKey: string
          authHeader: boolean
          compat: { supportsDeveloperRole: boolean }
          models: Array<{ id: string }>
        }
      }
    }
    const provider = parsed.providers.vancine
    assert.equal(provider.baseUrl, 'https://vancine.com/v1')
    assert.equal(provider.api, 'openai-completions')
    assert.equal(provider.apiKey, '$VANCINE_API_KEY')
    assert.equal(provider.authHeader, true)
    assert.equal(provider.compat.supportsDeveloperRole, false)
    assert.deepEqual(provider.models, [{ id: 'deepseek-v4-flash' }])
  })

  test('exposes the selectable CLI invocation', () => {
    assert.equal(
      BENCHMARK_PI_CLI_EXAMPLE,
      'pi --provider vancine --model deepseek-v4-flash'
    )
  })
})

describe('methodology copy', () => {
  test('states the workspace network and file evidence accurately', () => {
    assert.ok(
      BENCHMARK_METHODOLOGY_KEYS.includes(
        'The task made no network-tool attempts from its workspace. Pi model requests still used Vancine.'
      )
    )
    assert.ok(
      BENCHMARK_METHODOLOGY_KEYS.includes(
        'No unexpected files were created. The approved source file changed, and the test files remained unchanged.'
      )
    )
    const methodologyKeys: readonly string[] = BENCHMARK_METHODOLOGY_KEYS
    assert.ok(!methodologyKeys.includes('No network access.'))
    assert.ok(
      !methodologyKeys.includes('Each model finished with a clean workspace.')
    )
  })
})

describe('limitations and forbidden claims', () => {
  test('includes a single-run limitation', () => {
    const joined = BENCHMARK_LIMITATION_KEYS.join(' ').toLowerCase()
    assert.ok(joined.includes('single run'))
    assert.ok(joined.includes('not an overall capability ranking'))
  })

  test('agent run time is not described as API latency', () => {
    const joined = BENCHMARK_LIMITATION_KEYS.join(' ').toLowerCase()
    assert.ok(joined.includes('wall-clock'))
    assert.ok(joined.includes('not pure model api latency'))
  })

  test('public copy does not contain forbidden ranking or free claims', () => {
    const joined = [
      ...BENCHMARK_LIMITATION_KEYS,
      GO_EN_METADATA.title,
      GO_EN_METADATA.description,
    ]
      .join(' ')
      .toLowerCase()
    for (const forbidden of [
      'best model',
      'fastest model',
      'comprehensive ranking',
      'proves intelligence',
      'production latency benchmark',
      'all chinese models',
      'guaranteed future cost',
      'qwen3.8-flash is free',
    ]) {
      assert.ok(!joined.includes(forbidden), `must not contain "${forbidden}"`)
    }
    assert.equal(/\bfree\b/.test(joined), false)
  })
})

describe('public JSON contract', () => {
  test('download path is the approved static URL', () => {
    assert.equal(
      BENCHMARK_JSON_PATH,
      '/benchmarks/pi-coding-agent-2026-08-28.json'
    )
  })

  test('public JSON carries the audited totals and eight models', () => {
    const json = getCodingAgentBenchmarkPublicJson()
    assert.equal(json.benchmark_date, '2026-08-28')
    assert.equal(json.pi_version, '0.84.3')
    assert.equal(json.results.length, 8)
    assert.deepEqual(
      json.results.map((row) => row.model),
      [...EXPECTED_MODEL_ORDER]
    )
    assert.equal(json.totals.models, 8)
    assert.equal(json.totals.passed, 8)
    assert.equal(json.totals.model_requests, 45)
    assert.equal(json.totals.tokens, 94502)
    assert.equal(json.totals.production_billed_usd, 0.037618)
  })

  test('methodology fields describe workspace network and file evidence accurately', () => {
    const json = getCodingAgentBenchmarkPublicJson()
    assert.equal(json.methodology.no_task_workspace_network_tool_attempts, true)
    assert.equal(json.methodology.no_unexpected_files_after_each_model, true)
    assert.equal(json.methodology.tests_directory_immutable, true)
    assert.equal(Object.hasOwn(json.methodology, 'no_network'), false)
    assert.equal(
      Object.hasOwn(json.methodology, 'workspace_clean_after_each_model'),
      false
    )
    const serialized = JSON.stringify(json)
    assert.ok(!serialized.includes('no_network'))
    assert.ok(!serialized.includes('workspace_clean_after_each_model'))
  })

  test('public JSON omits account, path, credential, and request identifiers', () => {
    const serialized = JSON.stringify(getCodingAgentBenchmarkPublicJson())
    for (const forbidden of [
      'user_id',
      'userId',
      'username',
      'api_key',
      'apiKey',
      'token_name',
      'request_id',
      'requestId',
      'upstream_request_id',
      'quota',
      '/Users/',
      'sk-',
    ]) {
      assert.ok(
        !serialized.includes(forbidden),
        `public JSON must not contain ${forbidden}`
      )
    }
  })
})

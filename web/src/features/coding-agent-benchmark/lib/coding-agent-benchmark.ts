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
import type { PageMetadata } from '@/hooks/use-page-metadata'
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

/**
 * Pure business logic for the /coding-agent-benchmark evergreen page.
 *
 * The numbers are the audited Pi 8-model run of August 28, 2026: one
 * isolated bug-fix task, one run per model, no retries. This page is
 * display and copy only — it does not change pricing, billing, or
 * database state.
 */

export const CODING_AGENT_BENCHMARK_CANONICAL =
  'https://vancine.com/coding-agent-benchmark'

export const BENCHMARK_JSON_PATH = '/benchmarks/pi-coding-agent-2026-08-28.json'

export const BENCHMARK_PI_VERSION = '0.84.3'

export const BENCHMARK_H1 = '8 Chinese AI models, one Pi coding-agent task'

export const BENCHMARK_SUMMARY =
  'We ran the same isolated bug-fix task through eight Chinese AI models using Pi and one OpenAI-compatible endpoint. All eight completed the task and passed the test suite.'

export interface CodingAgentBenchmarkModelResult {
  model: string
  result: 'Pass'
  agentRunTimeMs: number
  modelRequests: number
  tokens: number
  productionBilledUsd: number
}

/**
 * Audited rows in the original run order. The page must not reorder
 * these into a ranking.
 */
export const CODING_AGENT_BENCHMARK_MODELS: readonly CodingAgentBenchmarkModelResult[] =
  [
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
  ]

export interface CodingAgentBenchmarkTotals {
  models: number
  passed: number
  modelRequests: number
  tokens: number
  productionBilledUsd: number
}

export const CODING_AGENT_BENCHMARK_TOTALS: CodingAgentBenchmarkTotals = {
  models: 8,
  passed: 8,
  modelRequests: 45,
  tokens: 94502,
  productionBilledUsd: 0.037618,
}

export function formatAgentRunTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatBilledUsd(amount: number): string {
  return `$${amount.toFixed(6)}`
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString('en-US')
}

// ---------------------------------------------------------------------------
// CTA destinations — fixed campaign UTMs, never inbound query passthrough
// ---------------------------------------------------------------------------

export const BENCHMARK_CTA = {
  primary: {
    to: '/sign-up',
    labelKey: 'Run your next coding task',
    search: {
      utm_source: 'vancine',
      utm_medium: 'owned',
      utm_campaign: 'pi_8_model_benchmark',
      utm_content: 'benchmark_page_primary_cta',
    },
  },
  pricing: {
    to: '/pricing',
    labelKey: 'Compare model pricing',
    search: {
      utm_source: 'vancine',
      utm_medium: 'owned',
      utm_campaign: 'pi_8_model_benchmark',
      utm_content: 'benchmark_page_pricing_cta',
    },
  },
  docs: {
    to: '/docs',
    labelKey: 'Read the API docs',
    search: {
      utm_source: 'vancine',
      utm_medium: 'owned',
      utm_campaign: 'pi_8_model_benchmark',
      utm_content: 'benchmark_page_docs_cta',
    },
  },
} as const

export type BenchmarkCtaKind = keyof typeof BENCHMARK_CTA

export interface BenchmarkCtaTarget {
  to: '/sign-up' | '/pricing' | '/docs'
  search: Record<string, string>
}

export function getCodingAgentBenchmarkCtaTarget(
  kind: BenchmarkCtaKind
): BenchmarkCtaTarget {
  const cta = BENCHMARK_CTA[kind]
  return {
    to: cta.to,
    search: { ...cta.search },
  }
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

interface BenchmarkLanguageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

const BENCHMARK_METADATA: Record<
  InterfaceLanguageCode,
  BenchmarkLanguageMetadata
> = {
  en: {
    title: '8 Chinese AI Models Tested in Pi Coding Agent | Vancine',
    description:
      'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
    ogTitle: '8 Chinese AI Models Tested in Pi Coding Agent',
    ogDescription:
      'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
    twitterTitle: '8 Chinese AI Models Tested in Pi Coding Agent',
    twitterDescription:
      'Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.',
  },
  zhCN: {
    title: 'Pi 编程智能体实测 8 个中国 AI 模型 | Vancine',
    description:
      '八个中国 AI 模型通过 Vancine，完成了同一项隔离的 Pi 编程智能体任务。查看方法、运行时间、Token 用量与生产核验费用。',
    ogTitle: 'Pi 编程智能体实测 8 个中国 AI 模型',
    ogDescription:
      '八个中国 AI 模型通过 Vancine，完成了同一项隔离的 Pi 编程智能体任务。查看方法、运行时间、Token 用量与生产核验费用。',
    twitterTitle: 'Pi 编程智能体实测 8 个中国 AI 模型',
    twitterDescription:
      '八个中国 AI 模型通过 Vancine，完成了同一项隔离的 Pi 编程智能体任务。查看方法、运行时间、Token 用量与生产核验费用。',
  },
  zhTW: {
    title: 'Pi 程式設計智能體實測 8 個中國 AI 模型 | Vancine',
    description:
      '八個中國 AI 模型透過 Vancine，完成了同一項隔離的 Pi 程式設計智能體任務。查看方法、執行時間、Token 用量與生產核驗費用。',
    ogTitle: 'Pi 程式設計智能體實測 8 個中國 AI 模型',
    ogDescription:
      '八個中國 AI 模型透過 Vancine，完成了同一項隔離的 Pi 程式設計智能體任務。查看方法、執行時間、Token 用量與生產核驗費用。',
    twitterTitle: 'Pi 程式設計智能體實測 8 個中國 AI 模型',
    twitterDescription:
      '八個中國 AI 模型透過 Vancine，完成了同一項隔離的 Pi 程式設計智能體任務。查看方法、執行時間、Token 用量與生產核驗費用。',
  },
  fr: {
    title: '8 modèles d’IA chinois testés dans Pi coding agent | Vancine',
    description:
      'Huit modèles d’IA chinois ont réalisé la même tâche isolée d’agent de code Pi via Vancine. Consultez la méthode, le temps d’exécution, l’usage de tokens et le coût audité en production.',
    ogTitle: '8 modèles d’IA chinois testés dans Pi coding agent',
    ogDescription:
      'Huit modèles d’IA chinois ont réalisé la même tâche isolée d’agent de code Pi via Vancine. Consultez la méthode, le temps d’exécution, l’usage de tokens et le coût audité en production.',
    twitterTitle: '8 modèles d’IA chinois testés dans Pi coding agent',
    twitterDescription:
      'Huit modèles d’IA chinois ont réalisé la même tâche isolée d’agent de code Pi via Vancine. Consultez la méthode, le temps d’exécution, l’usage de tokens et le coût audité en production.',
  },
  ru: {
    title: '8 китайских ИИ-моделей в тесте Pi coding agent | Vancine',
    description:
      'Восемь китайских ИИ-моделей выполнили одну и ту же изолированную задачу агента Pi через Vancine. Смотрите метод, время работы, расход токенов и проверенную производственную стоимость.',
    ogTitle: '8 китайских ИИ-моделей в тесте Pi coding agent',
    ogDescription:
      'Восемь китайских ИИ-моделей выполнили одну и ту же изолированную задачу агента Pi через Vancine. Смотрите метод, время работы, расход токенов и проверенную производственную стоимость.',
    twitterTitle: '8 китайских ИИ-моделей в тесте Pi coding agent',
    twitterDescription:
      'Восемь китайских ИИ-моделей выполнили одну и ту же изолированную задачу агента Pi через Vancine. Смотрите метод, время работы, расход токенов и проверенную производственную стоимость.',
  },
  ja: {
    title: 'Pi コーディングエージェントで検証した中国 AI モデル 8 種 | Vancine',
    description:
      '8 つの中国 AI モデルが、Vancine 経由で同じ隔離された Pi コーディングエージェント課題を完了しました。手法、実行時間、トークン使用量、本番で監査した費用をご覧ください。',
    ogTitle: 'Pi コーディングエージェントで検証した中国 AI モデル 8 種',
    ogDescription:
      '8 つの中国 AI モデルが、Vancine 経由で同じ隔離された Pi コーディングエージェント課題を完了しました。手法、実行時間、トークン使用量、本番で監査した費用をご覧ください。',
    twitterTitle: 'Pi コーディングエージェントで検証した中国 AI モデル 8 種',
    twitterDescription:
      '8 つの中国 AI モデルが、Vancine 経由で同じ隔離された Pi コーディングエージェント課題を完了しました。手法、実行時間、トークン使用量、本番で監査した費用をご覧ください。',
  },
  vi: {
    title: '8 mô hình AI Trung Quốc được thử trong Pi coding agent | Vancine',
    description:
      'Tám mô hình AI Trung Quốc đã hoàn thành cùng một tác vụ agent lập trình Pi biệt lập qua Vancine. Xem phương pháp, thời gian chạy, lượng token và chi phí đã đối chiếu trên production.',
    ogTitle: '8 mô hình AI Trung Quốc được thử trong Pi coding agent',
    ogDescription:
      'Tám mô hình AI Trung Quốc đã hoàn thành cùng một tác vụ agent lập trình Pi biệt lập qua Vancine. Xem phương pháp, thời gian chạy, lượng token và chi phí đã đối chiếu trên production.',
    twitterTitle: '8 mô hình AI Trung Quốc được thử trong Pi coding agent',
    twitterDescription:
      'Tám mô hình AI Trung Quốc đã hoàn thành cùng một tác vụ agent lập trình Pi biệt lập qua Vancine. Xem phương pháp, thời gian chạy, lượng token và chi phí đã đối chiếu trên production.',
  },
}

export function getCodingAgentBenchmarkPageMetadata(
  language: string
): PageMetadata {
  const normalized = normalizeInterfaceLanguage(language)
  const meta = BENCHMARK_METADATA[normalized]
  return {
    title: meta.title,
    description: meta.description,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    twitterTitle: meta.twitterTitle,
    twitterDescription: meta.twitterDescription,
    ogUrl: CODING_AGENT_BENCHMARK_CANONICAL,
    canonical: CODING_AGENT_BENCHMARK_CANONICAL,
  }
}

// ---------------------------------------------------------------------------
// Public JSON (desensitized)
// ---------------------------------------------------------------------------

export interface CodingAgentBenchmarkPublicJson {
  benchmark_date: string
  pi_version: string
  task: {
    description: string
    constraints: readonly string[]
  }
  methodology: {
    same_prompt: true
    same_isolated_fixture: true
    tests_directory_immutable: true
    no_task_workspace_network_tool_attempts: true
    one_run_per_model: true
    no_retry_on_failure: true
    no_unexpected_files_after_each_model: true
    task_pass: '8/8'
    timeouts: 0
    http_429: 0
    http_5xx: 0
    provider_errors: 0
  }
  results: ReadonlyArray<{
    model: string
    result: 'Pass'
    agent_run_time_ms: number
    model_requests: number
    tokens: number
    production_billed_usd: number
  }>
  totals: {
    models: number
    passed: number
    model_requests: number
    tokens: number
    production_billed_usd: number
  }
  limitations: readonly string[]
}

export const BENCHMARK_TASK_DESCRIPTION =
  'Fix a JavaScript leap-year check so three existing tests all pass.'

export const BENCHMARK_TASK_CONSTRAINTS = [
  'same prompt',
  'same isolated fixture',
  'test/ directory must not be modified',
  'no task workspace network-tool attempts',
  'one run per model',
  'no retry on failure',
] as const

export const BENCHMARK_LIMITATION_KEYS = [
  'This is a single run of one task in one environment, not an overall capability ranking or a long-term performance conclusion.',
  'Agent run time is the wall-clock duration of the whole Pi task, not pure model API latency.',
  'Model requests are the model rounds Pi produced inside one agent task, not repeated benchmarks.',
  'Production billed amounts come from a read-only check of Vancine production usage logs.',
  'qwen3.8-flash had missing local Pi price metadata; the production charge was verified as $0.000848.',
] as const

export function getCodingAgentBenchmarkPublicJson(): CodingAgentBenchmarkPublicJson {
  return {
    benchmark_date: '2026-08-28',
    pi_version: BENCHMARK_PI_VERSION,
    task: {
      description: BENCHMARK_TASK_DESCRIPTION,
      constraints: BENCHMARK_TASK_CONSTRAINTS,
    },
    methodology: {
      same_prompt: true,
      same_isolated_fixture: true,
      tests_directory_immutable: true,
      no_task_workspace_network_tool_attempts: true,
      one_run_per_model: true,
      no_retry_on_failure: true,
      no_unexpected_files_after_each_model: true,
      task_pass: '8/8',
      timeouts: 0,
      http_429: 0,
      http_5xx: 0,
      provider_errors: 0,
    },
    results: CODING_AGENT_BENCHMARK_MODELS.map((row) => ({
      model: row.model,
      result: row.result,
      agent_run_time_ms: row.agentRunTimeMs,
      model_requests: row.modelRequests,
      tokens: row.tokens,
      production_billed_usd: row.productionBilledUsd,
    })),
    totals: {
      models: CODING_AGENT_BENCHMARK_TOTALS.models,
      passed: CODING_AGENT_BENCHMARK_TOTALS.passed,
      model_requests: CODING_AGENT_BENCHMARK_TOTALS.modelRequests,
      tokens: CODING_AGENT_BENCHMARK_TOTALS.tokens,
      production_billed_usd: CODING_AGENT_BENCHMARK_TOTALS.productionBilledUsd,
    },
    limitations: BENCHMARK_LIMITATION_KEYS,
  }
}

export const BENCHMARK_PI_MODELS_JSON = {
  providers: {
    vancine: {
      baseUrl: 'https://vancine.com/v1',
      api: 'openai-completions',
      apiKey: '$VANCINE_API_KEY',
      authHeader: true,
      compat: {
        supportsDeveloperRole: false,
      },
      models: [{ id: 'deepseek-v4-flash' }],
    },
  },
} as const

export const BENCHMARK_PI_CONFIG_EXAMPLE = JSON.stringify(
  BENCHMARK_PI_MODELS_JSON,
  null,
  2
)

export const BENCHMARK_PI_CLI_EXAMPLE =
  'pi --provider vancine --model deepseek-v4-flash'

export const BENCHMARK_FACT_CARDS = [
  {
    id: 'passed',
    value: '8/8',
    labelKey: 'Models passed',
  },
  {
    id: 'requests',
    value: '45',
    labelKey: 'Model requests',
  },
  {
    id: 'tokens',
    value: '94,502',
    labelKey: 'Tokens',
  },
  {
    id: 'billed',
    value: '$0.037618',
    labelKey: 'Vancine billed',
  },
] as const

export const BENCHMARK_METHODOLOGY_KEYS = [
  'Same prompt for every model.',
  'Same isolated fixture for every model.',
  'The test/ directory could not be modified.',
  'The task made no network-tool attempts from its workspace. Pi model requests still used Vancine.',
  'One run per model. Failures were not retried.',
  'No unexpected files were created. The approved source file changed, and the test files remained unchanged.',
  '8/8 task pass. 0 timeout. 0 HTTP 429. 0 HTTP 5xx. 0 provider error.',
] as const

export const BENCHMARK_TASK_POINT_KEYS = [
  'Fix a JavaScript leap-year check so three existing tests all pass.',
  'The agent had to edit application code without changing the tests.',
  'Success meant all three existing tests passed in the same isolated fixture.',
] as const

/**
 * Every translation key this page passes to t(). Locale completeness
 * tests iterate this list. Model ids, numbers, and code are excluded.
 */
export const CODING_AGENT_BENCHMARK_I18N_KEYS = [
  BENCHMARK_H1,
  BENCHMARK_SUMMARY,
  'August 28, 2026',
  'Models passed',
  'Model requests',
  'Tokens',
  'Vancine billed',
  'Results',
  'Model',
  'Result',
  'Agent run time',
  'Pass',
  'What the task tested',
  'Methodology',
  'How to reproduce with Pi',
  'Then run:',
  'Limitations',
  'Download results JSON',
  'Run your next coding task',
  'Compare model pricing',
  'Read the API docs',
  'Point Pi at the Vancine OpenAI-compatible endpoint. Keep the API key in VANCINE_API_KEY — never paste a real key into this page.',
  'This page reports one run of one task. It is not a ranking of overall model quality.',
  'Code copied',
  'Unable to copy code',
  'Copy example code to clipboard',
  ...BENCHMARK_TASK_POINT_KEYS,
  ...BENCHMARK_METHODOLOGY_KEYS,
  ...BENCHMARK_LIMITATION_KEYS,
] as const

// Run with: node --test src/i18n/languages.test.ts
//
// Deterministic tests for the global interface-language contract:
//   - the language option list (#1)
//   - normalizeInterfaceLanguage for Chinese + other variants (#2, #3, #4, #7)
//   - the shared Accept-Language mapping (#5)
//   - a REAL i18next instance switching zh -> zh-TW -> en (#6, #7 runtime)
//   - the global zh-TW locale parity with en (#8)
//
// These tests intentionally do NOT import the side-effectful i18n singleton
// (config.ts). They bind to the real configuration through the exported
// SUPPORTED_INTERFACE_LANGUAGES / I18N_LOAD_STRATEGY constants.
import i18next from 'i18next'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  SUPPORTED_INTERFACE_LANGUAGES,
  I18N_LOAD_STRATEGY,
  normalizeInterfaceLanguage,
  normalizeDetectedLanguage,
  getAcceptLanguage,
} from './languages.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// #1 — language option list
// ---------------------------------------------------------------------------

describe('INTERFACE_LANGUAGE_OPTIONS', () => {
  test('contains zh-TW with the 繁體中文 label', () => {
    const tw = INTERFACE_LANGUAGE_OPTIONS.find((l) => l.code === 'zh-TW')
    assert.ok(tw, 'zh-TW option must exist')
    assert.equal(tw.label, '繁體中文')
  })

  test('has unique codes', () => {
    const codes = INTERFACE_LANGUAGE_OPTIONS.map((l) => l.code)
    assert.equal(new Set(codes).size, codes.length)
  })

  test('SUPPORTED_INTERFACE_LANGUAGES mirrors the option codes', () => {
    assert.deepEqual(
      [...SUPPORTED_INTERFACE_LANGUAGES],
      INTERFACE_LANGUAGE_OPTIONS.map((l) => l.code)
    )
    assert.ok(SUPPORTED_INTERFACE_LANGUAGES.includes('zh-TW'))
  })
})

// ---------------------------------------------------------------------------
// #2 — Chinese variant normalization
// ---------------------------------------------------------------------------

describe('normalizeInterfaceLanguage — Chinese variants', () => {
  const traditional = [
    'zh-TW',
    'zh_TW',
    'zh-HK',
    'zh-MO',
    'zh-Hant',
    'zh-Hant-TW',
    'zh-Hant-HK',
  ]
  for (const v of traditional) {
    test(`${v} -> zh-TW`, () => {
      assert.equal(normalizeInterfaceLanguage(v), 'zh-TW')
    })
  }

  const simplified = ['zh', 'zh-CN', 'zh_CN', 'zh-Hans', 'zh-Hans-CN']
  for (const v of simplified) {
    test(`${v} -> zh`, () => {
      assert.equal(normalizeInterfaceLanguage(v), 'zh')
    })
  }
})

// ---------------------------------------------------------------------------
// #3 — other supported variants keep working
// ---------------------------------------------------------------------------

describe('normalizeInterfaceLanguage — supported variants', () => {
  const cases: Array<[string, string]> = [
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['fr', 'fr'],
    ['fr-FR', 'fr'],
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['vi', 'vi'],
    ['vi-VN', 'vi'],
  ]
  for (const [input, expected] of cases) {
    test(`${input} -> ${expected}`, () => {
      assert.equal(normalizeInterfaceLanguage(input), expected)
    })
  }
})

// ---------------------------------------------------------------------------
// #4 — unknown / empty fallback
// ---------------------------------------------------------------------------

describe('normalizeInterfaceLanguage — fallback', () => {
  test('empty / null / undefined -> en', () => {
    assert.equal(normalizeInterfaceLanguage(''), 'en')
    assert.equal(normalizeInterfaceLanguage(null), 'en')
    assert.equal(normalizeInterfaceLanguage(undefined), 'en')
    assert.equal(normalizeInterfaceLanguage('   '), 'en')
  })

  test('unknown language -> en', () => {
    assert.equal(normalizeInterfaceLanguage('de'), 'en')
    assert.equal(normalizeInterfaceLanguage('xx-YY'), 'en')
    assert.equal(normalizeInterfaceLanguage('klingon'), 'en')
  })
})

// ---------------------------------------------------------------------------
// #5 — Accept-Language mapping (single shared helper)
// ---------------------------------------------------------------------------

describe('getAcceptLanguage', () => {
  test('zh -> zh-CN', () => {
    assert.equal(getAcceptLanguage('zh'), 'zh-CN')
    assert.equal(getAcceptLanguage('zh-CN'), 'zh-CN')
    assert.equal(getAcceptLanguage('zh-Hans'), 'zh-CN')
  })

  test('zh-TW variants -> zh-TW', () => {
    assert.equal(getAcceptLanguage('zh-TW'), 'zh-TW')
    assert.equal(getAcceptLanguage('zh-HK'), 'zh-TW')
    assert.equal(getAcceptLanguage('zh-Hant'), 'zh-TW')
  })

  test('other languages pass through verbatim', () => {
    assert.equal(getAcceptLanguage('en'), 'en')
    assert.equal(getAcceptLanguage('fr'), 'fr')
    assert.equal(getAcceptLanguage('ja'), 'ja')
  })

  test('unknown falls back to en', () => {
    assert.equal(getAcceptLanguage('de'), 'en')
    assert.equal(getAcceptLanguage(undefined), 'en')
  })
})

// ---------------------------------------------------------------------------
// #6 / #7 — REAL i18next instance resolution
// ---------------------------------------------------------------------------

const resources = {
  en: { translation: { greeting: 'Hello' } },
  zh: { translation: { greeting: '你好' } },
  'zh-TW': { translation: { greeting: '你好TW' } },
  fr: { translation: { greeting: 'Bonjour' } },
  ja: { translation: { greeting: 'こんにちは' } },
}

async function createTestInstance() {
  const inst = i18next.createInstance()
  await inst.init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_INTERFACE_LANGUAGES as readonly string[],
    load: I18N_LOAD_STRATEGY,
  })
  return inst
}

describe('i18next real instance — zh-TW is a first-class language', () => {
  test('switches zh -> zh-TW -> en without zh-TW collapsing to zh', async () => {
    const inst = await createTestInstance()

    await inst.changeLanguage('zh')
    assert.equal(inst.resolvedLanguage, 'zh')
    assert.equal(inst.t('greeting'), '你好')

    await inst.changeLanguage('zh-TW')
    // The crux: zh-TW must resolve to zh-TW, NOT fall back to zh.
    assert.equal(inst.resolvedLanguage, 'zh-TW')
    assert.equal(inst.t('greeting'), '你好TW')

    await inst.changeLanguage('en')
    assert.equal(inst.resolvedLanguage, 'en')
    assert.equal(inst.t('greeting'), 'Hello')
  })

  test('zh-Hant / zh-HK restore path resolves to zh-TW', async () => {
    const inst = await createTestInstance()

    for (const raw of ['zh-Hant', 'zh-HK', 'zh-Hant-TW', 'zh_TW']) {
      await inst.changeLanguage(normalizeInterfaceLanguage(raw))
      assert.equal(inst.resolvedLanguage, 'zh-TW', `from ${raw}`)
      assert.equal(inst.t('greeting'), '你好TW', `from ${raw}`)
    }
  })

  test('zh-CN / zh-Hans restore path resolves to zh (not zh-TW)', async () => {
    const inst = await createTestInstance()
    for (const raw of ['zh-CN', 'zh-Hans', 'zh']) {
      await inst.changeLanguage(normalizeInterfaceLanguage(raw))
      assert.equal(inst.resolvedLanguage, 'zh', `from ${raw}`)
    }
  })

  test('en-US resolves to en (regression: not everything falls back to en)', async () => {
    const inst = await createTestInstance()
    await inst.changeLanguage(normalizeInterfaceLanguage('en-US'))
    assert.equal(inst.resolvedLanguage, 'en')
    // And a non-English variant still resolves to its own language.
    await inst.changeLanguage(normalizeInterfaceLanguage('ja-JP'))
    assert.equal(inst.resolvedLanguage, 'ja')
  })
})

// ---------------------------------------------------------------------------
// #8 — global zh-TW locale parity with en
// ---------------------------------------------------------------------------

function placeholders(value: unknown): string {
  const matches = String(value).match(/\{\{?\s*[\w.]+\s*\}?\}/g) ?? []
  return matches
    .map((m) => m.replace(/\s/g, ''))
    .sort()
    .join(',')
}

describe('global zh-TW locale parity with en', () => {
  const en = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'locales/en.json'), 'utf8')
  ).translation
  const tw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'locales/zh-TW.json'), 'utf8')
  ).translation

  const enKeys = Object.keys(en)
  const twKeys = Object.keys(tw)

  test('missing keys: 0', () => {
    const missing = enKeys.filter((k) => !(k in tw))
    assert.deepEqual(missing, [])
  })

  test('extra keys: 0', () => {
    const extra = twKeys.filter((k) => !(k in en))
    assert.deepEqual(extra, [])
  })

  test('empty values: 0', () => {
    const empty = twKeys.filter(
      (k) => typeof tw[k] !== 'string' || tw[k].trim() === ''
    )
    assert.deepEqual(empty, [])
  })

  test('placeholder mismatches: 0', () => {
    const mismatch = enKeys.filter(
      (k) => k in tw && placeholders(en[k]) !== placeholders(tw[k])
    )
    assert.deepEqual(mismatch, [])
  })

  test('key order matches en (sync baseline order)', () => {
    assert.deepEqual(twKeys, enKeys)
  })
})

// ---------------------------------------------------------------------------
// BCP 47 extension/script tags + rejection of unrelated codes
// ---------------------------------------------------------------------------

describe('normalizeInterfaceLanguage — BCP 47 extensions & scripts', () => {
  const traditional = [
    'zh-TW-u-ca-chinese',
    'zh-HK-x-private',
    'zh-MO-u-nu-hanidec',
    'zh-Hant-TW',
    'zh-Hant',
  ]
  for (const v of traditional) {
    test(`${v} -> zh-TW`, () => {
      assert.equal(normalizeInterfaceLanguage(v), 'zh-TW')
    })
  }

  const simplified = ['zh-Hans-CN', 'zh-Hans', 'zh-CN-u-nu-hanidec', 'zh-CN']
  for (const v of simplified) {
    test(`${v} -> zh`, () => {
      assert.equal(normalizeInterfaceLanguage(v), 'zh')
    })
  }

  test('regional variants of other languages resolve to base', () => {
    assert.equal(normalizeInterfaceLanguage('en-US'), 'en')
    assert.equal(normalizeInterfaceLanguage('fr-FR'), 'fr')
    assert.equal(normalizeInterfaceLanguage('ru-RU'), 'ru')
    assert.equal(normalizeInterfaceLanguage('ja-JP'), 'ja')
    assert.equal(normalizeInterfaceLanguage('vi-VN'), 'vi')
  })

  test('does NOT accept unrelated codes that merely start with "zh"', () => {
    // zho (ISO 639-2) and zhx are not the `zh` language subtag.
    assert.equal(normalizeInterfaceLanguage('zho'), 'en')
    assert.equal(normalizeInterfaceLanguage('zhx'), 'en')
    assert.equal(normalizeInterfaceLanguage('zho-TW'), 'en')
  })
})

describe('normalizeDetectedLanguage — detector candidate handling', () => {
  test('known variants map to a supported code', () => {
    assert.equal(normalizeDetectedLanguage('zh-HK'), 'zh-TW')
    assert.equal(normalizeDetectedLanguage('zh-Hans'), 'zh')
    assert.equal(normalizeDetectedLanguage('zh-TW-u-ca-chinese'), 'zh-TW')
    assert.equal(normalizeDetectedLanguage('en-US'), 'en')
    assert.equal(normalizeDetectedLanguage('ja-JP'), 'ja')
  })

  test('UNKNOWN candidates are preserved (not collapsed to en)', () => {
    // Critical: an unknown candidate must survive so i18next can reject it
    // via supportedLngs and evaluate the next detected candidate.
    assert.equal(normalizeDetectedLanguage('de'), 'de')
    assert.equal(normalizeDetectedLanguage('de-DE'), 'de-DE')
    assert.equal(normalizeDetectedLanguage('klingon'), 'klingon')
  })

  test('empty input is returned unchanged', () => {
    assert.equal(normalizeDetectedLanguage(''), '')
  })

  test('contrast: business normalizer DOES fall back to en for unknown', () => {
    assert.equal(normalizeInterfaceLanguage('de'), 'en')
    assert.equal(normalizeInterfaceLanguage('de-DE'), 'en')
  })
})

// ---------------------------------------------------------------------------
// Taiwan terminology regression (key-aware, against the real locale file)
// ---------------------------------------------------------------------------

const enAll = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'locales/en.json'), 'utf8')
).translation as Record<string, string>
const twAll = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'locales/zh-TW.json'), 'utf8')
).translation as Record<string, string>
const enKeysAll = Object.keys(enAll)
const twStr = (k: string): string =>
  typeof twAll[k] === 'string' ? (twAll[k] as string) : ''
describe('zh-TW Taiwan terminology — banned mainland terms absent', () => {
  const banned = [
    '賬戶',
    '令牌',
    '郵箱',
    '平臺',
    '實時',
    '復製',
    '質量',
    '訪問',
    '配置',
    '渠道',
  ]
  for (const term of banned) {
    test(`no value contains "${term}"`, () => {
      const offenders = Object.keys(twAll).filter(
        (k) => typeof twAll[k] === 'string' && twAll[k].includes(term)
      )
      assert.deepEqual(offenders, [])
    })
  }

  test('no OpenCC defect terms (影象/限製/繫結/賬號/數字資產)', () => {
    for (const term of ['影象', '限製', '繫結', '賬號', '數字資產']) {
      const offenders = Object.keys(twAll).filter(
        (k) => typeof twAll[k] === 'string' && twAll[k].includes(term)
      )
      assert.deepEqual(offenders, [], `term ${term}`)
    }
  })
})

describe('zh-TW Documentation vs File — key-aware', () => {
  test('documentation keys (EN matches document/docs) never use 檔案', () => {
    const offenders = Object.keys(enAll).filter(
      (k) =>
        /document|docs/i.test(enAll[k]) &&
        typeof twAll[k] === 'string' &&
        twAll[k].includes('檔案')
    )
    assert.deepEqual(offenders, [])
  })

  test('representative documentation keys use 文件', () => {
    assert.equal(twAll['Read API Documentation'], '閱讀 API 文件')
    assert.equal(twAll['View Documentation'], '檢視文件')
    assert.ok(twAll['Documentation'].includes('文件'))
  })

  test('filesystem/upload keys keep 檔案 (not blindly converted)', () => {
    // These EN keys are real files on disk / uploads, so 檔案 is correct.
    assert.ok(twAll['Upload file'].includes('檔案'))
    assert.ok(twAll['Clean Up Log Files'].includes('檔案'))
    assert.ok(twAll['Failed to parse JSON file: {{name}}'].includes('檔案'))
    assert.ok(twAll['File Search'].includes('檔案'))
  })

  test('configuration file renders as 設定檔', () => {
    assert.equal(twAll['Configuration File'], '設定檔')
  })
})

describe('zh-TW manual semantic fixes', () => {
  test('incident copy uses 事件, not 異常桶', () => {
    assert.equal(
      twAll['{{count}} incidents in the last 24 hours'],
      '最近 24 小時 {{count}} 起事件'
    )
    assert.equal(
      twAll['No incidents in the last 24 hours'],
      '最近 24 小時無事件'
    )
    assert.ok(
      twAll[
        'Request success rate; {{incidents}} incident buckets in the last 24 hours'
      ].includes('事件時段')
    )
    assert.ok(!Object.values(twAll).some((v) => String(v).includes('異常桶')))
  })

  test('"Update the API key" has no baseless "New API" insertion', () => {
    const v = twAll['Update the API key by providing necessary info.']
    assert.ok(!v.includes('New API'))
    assert.ok(v.includes('API 金鑰'))
  })

  test('copy-to-clipboard copy uses 複製', () => {
    assert.equal(twAll['Code copied'], '程式碼已複製')
    assert.equal(twAll['Unable to copy code'], '無法複製程式碼')
    assert.ok(twAll['Copy example code to clipboard'].startsWith('複製'))
  })
})

// ---------------------------------------------------------------------------
// Token / 權杖 semantic classification — SINGLE SOURCE OF TRUTH.
//
// LLM metering units keep "Token"; authentication credentials use 權杖;
// token groups use 權杖群組; snake_case code identifiers stay verbatim;
// non-LLM comma-separated header tokens become 項目; cached tokens (a usage
// JSON field reference) is the single listed lowercase exception. Both the
// four-category test and the key-aware LLM-unit/exception tests share these
// constants so the rules cannot drift apart.
// ---------------------------------------------------------------------------

/** English keys about LLM token metering / pricing / usage / latency / telemetry / reasoning / input-output / cache billing. */
const LLM_UNIT_KEY_PATTERN =
  /input tokens?|output tokens?|max(imum)?( number of)? tokens?|completion tokens?|prompt tokens?|reasoning tokens?|hidden reasoning tokens?|1[KM] tokens?|per 1[KM] tokens?|tokens? per (second|minute)|per-token|per token|token usage|token counts?|token price|token-price|budget tokens?|token budget|tokens? per unit|total tokens?|monthly tokens?|billable (input|output) tokens?|telemetry tokens?|first-token|tokens? \/ mo|usage \(prompt|frequent tokens?/i

/** A standalone lowercase token/tokens word (not snake_case, not capitalized). */
const LOWERCASE_TOKEN_PATTERN = /(?<![a-zA-Z0-9_])tokens?(?![a-zA-Z0-9_])/

/** token group = API-credential group -> 權杖群組. */
const TOKEN_GROUP_KEY_PATTERN = /token group/i

function isTokenGroupKey(k: string): boolean {
  return TOKEN_GROUP_KEY_PATTERN.test(k)
}

/** The single listed lowercase-token exception (cached tokens = usage JSON field reference). */
const CACHED_TOKENS_KEY =
  'Hit criteria: If cached tokens exist in usage, it counts as a hit.'

/** Non-LLM comma-separated header tokens -> 項目 (key prefix). */
const HEADER_TOKENS_KEY_PREFIX = 'Set runtime request header'

/** snake_case code-identifier key (access_token / account_id stay verbatim). */
const CODE_ID_TOKEN_KEY =
  'Codex credential must be a JSON object with access_token and account_id'

/** Representative LLM-unit keys (category A). */
const LLM_UNIT_SAMPLE_KEYS = [
  'Budget Tokens Ratio',
  'Completion price ($/1M tokens)',
  'Multiplier for completion tokens.',
  'Multiplier for prompt tokens.',
  'Number of tokens per unit quota',
  'Input Tokens',
  'Default Max Tokens',
  'Show token usage statistics in the UI',
]

/** Authentication-credential keys (category B) -> 權杖. */
const AUTH_TOKEN_SAMPLE_KEYS = [
  'Access Token',
  'Bot Token',
  'Token Endpoint',
  'Copy token',
  'Create, revoke, and audit API tokens.',
  'Use this token for API authentication',
]

/** token-group keys (category D) -> 權杖群組. */
const TOKEN_GROUP_SAMPLE_KEYS = [
  'Token group',
  'this token group',
  'The token group that will have a custom ratio',
]

describe('zh-TW Token semantics (single source of truth)', () => {
  test('A. LLM metering units keep "Token" (never 權杖)', () => {
    for (const k of LLM_UNIT_SAMPLE_KEYS) {
      assert.ok(
        twAll[k].includes('Token'),
        `${k} should keep Token: ${twAll[k]}`
      )
      assert.ok(
        !twAll[k].includes('權杖'),
        `${k} must not use 權杖: ${twAll[k]}`
      )
    }
  })

  test('B. authentication credentials use 權杖', () => {
    for (const k of AUTH_TOKEN_SAMPLE_KEYS) {
      assert.ok(twAll[k].includes('權杖'), `${k} should use 權杖: ${twAll[k]}`)
    }
  })

  test('C. snake_case code identifiers preserved; header tokens -> 項目', () => {
    // snake_case API/JSON fields must not be translated.
    assert.ok(
      enKeysAll.includes(CODE_ID_TOKEN_KEY),
      'codex credential key exists'
    )
    assert.ok(twAll[CODE_ID_TOKEN_KEY].includes('access_token'))
    // Non-LLM comma-separated header tokens -> 項目 (not Token / 權杖).
    const headerKey = enKeysAll.find((k) =>
      k.startsWith(HEADER_TOKENS_KEY_PREFIX)
    )
    assert.ok(headerKey, 'runtime request header key exists')
    assert.ok(twAll[headerKey!].includes('項目'))
    assert.ok(!twAll[headerKey!].includes('權杖'))
  })

  test('D. API-credential token group uses 權杖群組', () => {
    for (const k of TOKEN_GROUP_SAMPLE_KEYS) {
      assert.ok(
        twAll[k].includes('權杖群組'),
        `${k} should use 權杖群組: ${twAll[k]}`
      )
    }
  })

  test('all LLM-unit keys use capitalized Token (not lowercase, not 權杖)', () => {
    const llmKeys = enKeysAll.filter((k) => LLM_UNIT_KEY_PATTERN.test(k))
    assert.ok(
      llmKeys.length >= 33,
      `expected >=33 LLM-unit keys, got ${llmKeys.length}`
    )
    for (const k of llmKeys) {
      const v = twStr(k)
      assert.ok(v.includes('Token'), `LLM key missing Token: ${k} => ${v}`)
      assert.ok(
        !LOWERCASE_TOKEN_PATTERN.test(v),
        `LLM key has lowercase token/tokens: ${k} => ${v}`
      )
      // token-group keys legitimately keep 權杖群組; only pure LLM keys are
      // asserted to be free of 權杖.
      if (!isTokenGroupKey(k)) {
        assert.ok(!v.includes('權杖'), `LLM key has 權杖: ${k} => ${v}`)
      }
    }
  })

  test('cached tokens is the ONLY standalone lowercase token/tokens in all values', () => {
    // Full scan of EVERY zh-TW value (not just LLM_UNIT_KEY_PATTERN hits).
    const hits = enKeysAll.filter(
      (k) =>
        typeof twAll[k] === 'string' && LOWERCASE_TOKEN_PATTERN.test(twAll[k])
    )
    assert.deepEqual(
      new Set(hits),
      new Set([CACHED_TOKENS_KEY]),
      `standalone lowercase token/tokens hits: ${hits.join(', ')}`
    )
    // The listed exception indeed keeps the lowercase usage-field form.
    assert.ok(twAll[CACHED_TOKENS_KEY].includes('cached tokens'))
  })
})

// ---------------------------------------------------------------------------
// same-English values must be technical literals (brand/code/number/URL/...),
// never an untranslated ordinary English UI string.
// ---------------------------------------------------------------------------

/**
 * Explicit allowlist of brand / product / provider / model / acronym literals
 * that legitimately render identically in English and zh-TW. Multi-word
 * technical labels live here; structural categories (URL, path, email, number,
 * JSON/code, HTML entity) are handled by rules in isTechnicalSameEnglish.
 */
const SAME_ENGLISH_ALLOWLIST = new Set([
  'AI Proxy',
  'AIGC2D',
  'AILS',
  'API',
  'API URL',
  'API2GPT',
  'AWS',
  'AZURE_OPENAI_ENDPOINT *',
  'AccessKey / SecretAccessKey',
  'Anthropic',
  'Azure',
  'Claude',
  'Claude Code',
  'Cline',
  'Cloudflare',
  'Codex',
  'Cohere',
  'Coze',
  'DeepSeek',
  'Dify',
  'Discord',
  'DoubaoVideo',
  'FastGPT',
  'Gemini',
  'GitHub',
  'Grok',
  'ID',
  'IP',
  'JSON',
  'Jimeng',
  'Jina',
  'JustSong',
  'K',
  'Kling',
  'LingYiWanWu',
  'LinuxDO',
  'Midjourney',
  'Midjourney-Proxy',
  'MidjourneyPlus',
  'MiniMax',
  'Mistral',
  'MokaAI',
  'Moonshot',
  'New API',
  'NewAPI',
  'Node.js',
  'OIDC',
  'OhMyGPT',
  'Ollama',
  'One API',
  'OpenAI',
  'OpenAI SDK',
  'OpenAIMax',
  'OpenCode',
  'OpenRouter',
  'PaLM',
  'Perplexity',
  'Pi Coding Agent',
  'Python',
  'QuantumNous',
  'RPM',
  'Replicate',
  'Roo Code',
  'SiliconFlow',
  'Sora',
  'Stripe',
  'Submodel',
  'SunoAPI',
  'TPM',
  'TTFT P50',
  'TTFT P95',
  'TTFT P99',
  'TTL',
  'Telegram',
  'URL',
  'USD',
  'Uptime Kuma',
  'Uptime Kuma URL',
  'Vancine',
  'Vertex AI',
  'Vidu',
  'Waffo Pancake MoR',
  'Webhook URL:',
  'Well-Known URL',
  'Worker URL',
  'Xinference',
  'cURL',
  'checkout.session.completed',
  'checkout.session.expired',
  'edit_this',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-4',
  'new-api-key-tool',
  'org-...',
  'price_xxx',
  'smtp.example.com',
  'vip',
  'whsec_xxx',
  'x',
  'xAI',
  // Structural literals that are NOT whole-parseable JSON / URL / email and so
  // must be allowlisted explicitly (HTML-entity lists and a JSON fragment).
  '"default": "us-central1", "claude-3-5-sonnet-20240620": "europe-west1"',
  '192.168.1.1&#10;10.0.0.0/8',
  'example.com&#10;blocked-site.com',
  'example.com&#10;company.com',
  'New API &lt;noreply@example.com&gt;',
])

function isTechnicalSameEnglish(value: string): boolean {
  const t = value.trim()
  if (t === '') return true
  // URL / URI with a scheme — the WHOLE string must be the URL.
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t)) return true
  // Path / endpoint — full match.
  if (/^\/[\w./-]*$/.test(t)) return true
  // A COMPLETE email address — full match (not merely "contains @").
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)) return true
  // Pure number.
  if (/^[\d.,\s]+$/.test(t)) return true
  // Strict JSON: the ENTIRE string must parse as a JSON object/array. A value
  // that merely starts with { or [ but is not valid JSON is rejected here.
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(t)
      return true
    } catch {
      return false
    }
  }
  // Brand / model / acronym / product / precise structural literal.
  return SAME_ENGLISH_ALLOWLIST.has(t)
}

describe('zh-TW same-English values are technical literals only', () => {
  const sameEnKeys = Object.keys(enAll).filter((k) => twAll[k] === enAll[k])

  test('every same-English value is a recognized technical literal', () => {
    assert.ok(sameEnKeys.length > 0, 'expected some technical literals')
    const offenders = sameEnKeys
      .filter((k) => !isTechnicalSameEnglish(enAll[k]))
      .map((k) => ({ key: k, value: enAll[k] }))
    // Ordinary untranslated English UI text must NOT slip through.
    assert.deepEqual(offenders, [], JSON.stringify(offenders, null, 2))
  })

  test('same-English values are pure ASCII', () => {
    const nonAscii = sameEnKeys.filter((k) => /[\u3400-\u9fff]/.test(enAll[k]))
    assert.deepEqual(nonAscii, [])
  })

  test('ordinary English UI sentences are rejected (negative cases)', () => {
    const ordinary = [
      'Save changes',
      'Please enter your email',
      'Settings',
      'Dashboard',
      'Are you sure you want to delete this?',
      'Create a new channel',
      'Loading',
      // Pass-4 required rejections (these previously slipped through the loose
      // placeholder / starts-with-[ / includes-entity / includes-@ rules):
      'Welcome {{name}}, save changes',
      '[Beta] Enable feature',
      'Save &amp; close',
      'Contact support@example.com now',
      '"note": save changes',
    ]
    for (const s of ordinary) {
      assert.equal(isTechnicalSameEnglish(s), false, `should reject: ${s}`)
    }
  })

  test('allowlist has no stale entries (all are current same-English values)', () => {
    const currentSameEn = new Set(sameEnKeys.map((k) => enAll[k]))
    const stale = [...SAME_ENGLISH_ALLOWLIST].filter(
      (v) => !currentSameEn.has(v)
    )
    assert.deepEqual(stale, [], `stale allowlist entries: ${stale.join(', ')}`)
  })

  test('same-English set is fully covered by rules/allowlist (no brittle hardcoded count)', () => {
    // Intentionally NOT asserting a fixed count: the set may grow/shrink as
    // keys are added or translated. The guarantees above (every same-English
    // value is a recognized technical literal; allowlist has no stale entries)
    // are the meaningful invariants.
    assert.ok(sameEnKeys.length > 0, 'expected some technical literals')
    const covered = sameEnKeys.filter((k) => isTechnicalSameEnglish(enAll[k]))
    assert.equal(covered.length, sameEnKeys.length)
  })
})

// ---------------------------------------------------------------------------
// Pass-3 key-aware terminology regressions
// ---------------------------------------------------------------------------

describe('zh-TW Pass-3 terminology — key-aware regressions', () => {
  test('app/application/apps NOUN keys are 應用程式, never 套用', () => {
    const nounKeys = enKeysAll.filter(
      (k) =>
        /\b(apps?|applications?)\b/i.test(enAll[k]) &&
        !/\b(apply|applying|applied|applies)\b/i.test(enAll[k])
    )
    const offenders = nounKeys.filter((k) => twStr(k).includes('套用'))
    assert.deepEqual(offenders, [], offenders.join(', '))
    // Spot-check the bare labels.
    assert.equal(twAll['App'], '應用程式')
    assert.equal(twAll['Application'], '應用程式')
    assert.equal(twAll['Apps'], '應用程式')
    assert.equal(twAll['AI video applications'], 'AI 影片應用程式')
  })

  test('apply/applied/applying VERB keys keep 套用', () => {
    for (const k of ['Apply Filters', 'Applying...', 'Apply Overwrite']) {
      assert.ok(twStr(k).includes('套用'), `${k}: ${twStr(k)}`)
    }
  })

  test('Channel system keys use 通道 (no 通路/頻道)', () => {
    const channelKeys = enKeysAll.filter((k) => /channel/i.test(enAll[k]))
    const offenders = channelKeys.filter(
      (k) => twStr(k).includes('通路') || twStr(k).includes('頻道')
    )
    assert.deepEqual(offenders, [], offenders.join(', '))
    assert.equal(twAll['Channel Affinity'], '通道親和性')
    assert.equal(twAll['Channel:'], '通道：')
    assert.equal(twAll['Channels'], '通道')
  })

  test('append/prepend keys never use 追加', () => {
    const appendKeys = enKeysAll.filter((k) => /append|prepend/i.test(enAll[k]))
    const offenders = appendKeys.filter((k) => twStr(k).includes('追加'))
    assert.deepEqual(offenders, [], offenders.join(', '))
    assert.equal(twAll['Append'], '附加')
    assert.equal(twAll['Append to channel'], '加入通道')
    assert.equal(twAll['Models appended successfully'], '已成功加入模型')
    assert.equal(twAll['Templates appended'], '已附加範本')
  })

  test('documented keys never use 文件化', () => {
    const documentedKeys = enKeysAll.filter((k) => /documented/i.test(enAll[k]))
    const offenders = documentedKeys.filter((k) => twStr(k).includes('文件化'))
    assert.deepEqual(offenders, [], offenders.join(', '))
  })

  test('five authentication-token keys use 權杖', () => {
    assert.equal(twAll['Filter by token name'], '按權杖名稱篩選')
    assert.equal(twAll['Server Token'], '伺服器權杖')
    assert.equal(twAll['Token Endpoint (Optional)'], '權杖端點（選填）')
    assert.equal(
      twAll[
        'Priority order for automatic group assignment. New tokens rotate through this list.'
      ],
      '自動群組分配的優先順序。新權杖將依此清單輪替。'
    )
    assert.equal(
      twAll['Token obtained from your Gotify application'],
      '從您的 Gotify 應用程式取得的權杖'
    )
  })

  test('explicit error fixes: Passed / Delete Header', () => {
    assert.equal(twAll['Passed'], '已通過')
    assert.equal(twAll['Delete Header'], '刪除標頭')
    assert.equal(twAll['Caution'], '注意')
    assert.equal(twAll['Centered'], '置中')
  })

  test('second-batch mainland terms are absent', () => {
    const banned = [
      '請求頭',
      '透傳',
      '審計',
      '例項',
      '回撥',
      '下拉框',
      '使用者組',
      '二維碼',
      '小部件',
      '套餐',
      '兜底',
      '登入檔',
      '重復',
      '文件化',
      '接入',
    ]
    // NOTE: 通路/頻道 are intentionally NOT globally banned here — they could
    // legitimately appear in a non-Channel context. Channel-system keys are
    // guarded key-aware by the "Channel system keys use 通道" test above.
    for (const term of banned) {
      const offenders = enKeysAll.filter((k) => twStr(k).includes(term))
      assert.deepEqual(offenders, [], `term ${term}: ${offenders.join(', ')}`)
    }
  })

  test('源模型 corrected to 來源模型 (no bare 源模型)', () => {
    // 來源模型 legitimately contains the substring 源模型, so use a negative
    // lookbehind to catch only bare/unconverted 源模型.
    const offenders = enKeysAll.filter((k) => /(?<!來)源模型/.test(twStr(k)))
    assert.deepEqual(offenders, [], offenders.join(', '))
    assert.ok(
      enKeysAll.some((k) => twStr(k).includes('來源模型')),
      'expected 來源模型 to be present'
    )
  })

  test('second-batch Taiwan terms are present', () => {
    assert.ok(twStr('Delete Header').includes('標頭')) // 請求標頭 family
    assert.ok(Object.values(twAll).some((v) => String(v).includes('稽核')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('執行個體')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('回呼')))
    assert.ok(
      Object.values(twAll).some((v) => String(v).includes('下拉式選單'))
    )
    assert.ok(Object.values(twAll).some((v) => String(v).includes('QR 碼')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('小工具')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('來源模型')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('備援')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('登錄檔')))
    assert.ok(Object.values(twAll).some((v) => String(v).includes('週')))
  })

  test('QR spacing / 頭部 / 對接 residuals are zero', () => {
    const re = /掃描QR|此QR|微信QR|微信登入QR|頭部|對接/
    const offenders = enKeysAll.filter((k) => re.test(twStr(k)))
    assert.deepEqual(offenders, [], offenders.join(', '))
    // Positive: spaced QR is present.
    assert.ok(
      Object.values(twAll).some((v) => String(v).includes('掃描 QR')),
      'expected spaced 掃描 QR to be present'
    )
  })
})

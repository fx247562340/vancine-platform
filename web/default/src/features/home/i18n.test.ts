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
// Run with: node --test src/features/home/i18n.test.ts
//
// i18n regression for the Default acquisition homepage. Locks the nested
// {translation:{...}} structure (root must be exactly ['translation']),
// homepage-key presence + non-empty values, placeholder preservation, real
// (non-English) translations, and Classic<->Default consistency.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_LOCALES = join(__dirname, '../../i18n/locales')
const CLASSIC_LOCALES = join(__dirname, '../../../../classic/src/i18n/locales')
const DEFAULT_LOCS = ['en', 'zh', 'fr', 'ja', 'ru', 'vi']

// English-source homepage keys (shared with Classic; excludes the
// Classic-only Chinese mobile-menu keys, which Default does not use).
const HOMEPAGE_KEYS = [
  'OpenAI-compatible access to China’s frontier AI',
  'China’s frontier AI models.',
  'One API.',
  'Build with leading Chinese models through one OpenAI-compatible endpoint. Use the SDKs and agent tools you already know.',
  'Start building free',
  'Explore live models',
  'Available now',
  '{{count}} models available',
  'Explore all available models',
  'Works with your stack',
  'Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.',
  'OpenCode',
  'Cline',
  'Roo Code',
  'Claude Code',
  'OpenAI SDK',
  'Live-verified with Kimi K3 in a controlled coding-agent run. View the evidence section below.',
  'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
  'Compatible via OpenAI-compatible / documented gateway usage patterns. No Vancine-owned end-to-end coding-agent benchmark is claimed on the homepage.',
  'First-class: standard OpenAI SDK against https://vancine.com/v1.',
  'Verified in real agent workflows',
  'One controlled historical run — not a promise that every request will match these numbers.',
  'OpenCode version',
  'Model under test',
  'Model steps',
  'Tool calls',
  'Tests',
  'Duration',
  'Agent telemetry tokens',
  'Vancine measured usage',
  'Passed',
  'Failed',
  'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.',
  'View Kimi K3 page',
  'View starter & verified evidence',
  'Verified evidence JSON',
  'Why developers use Vancine',
  'Fast access to new Chinese models',
  'New Chinese model releases can be added to one endpoint instead of a new vendor integration each time.',
  'One compatible API',
  'OpenAI-compatible requests, streaming, and tooling patterns you already use.',
  'Unified balance and billing',
  'One account, one balance, and one usage log across supported models.',
  'Tested integration examples',
  'Public starters and measured agent evidence for supported workflows.',
  'Live model marketplace',
  'Browse the full public catalog with live endpoint types and pricing metadata. What you see is served from the same public pricing API developers can query.',
  'Connected providers',
  'Start building with China’s frontier models',
  'Get $1 in free API credit',
  'New accounts may receive $1 in promotional API credit when the current signup bonus is enabled. Credit, eligibility, and availability can change; usage depends on model and workload.',
  'Independent API infrastructure for China’s frontier AI models.',
  'Custom Home Page',
  'AI Models',
  'Compatible',
  'API Endpoint',
  'Featured models live on the public catalog. Open a model or browse the full marketplace.',
  'Pi Coding Agent',
  "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.",
  'Configuration-ready',
  'Live-verified',
]

// Minimal whitelist of labels legitimately identical to English: pure
// brand/technical product names plus 'Tests' (genuine French cognate).
// Deliberately NOT expanded to mask untranslated sentences.
const WHITELIST = new Set([
  'OpenCode',
  'Cline',
  'Roo Code',
  'Claude Code',
  'OpenAI SDK',
  'Pi Coding Agent',
  'Tests',
])

const load = (dir: string, loc: string) =>
  JSON.parse(readFileSync(join(dir, `${loc}.json`), 'utf8')) as {
    translation: Record<string, string>
  }
const placeholders = (s: string) =>
  (s.match(/\{\{[^}]+\}\}/g) || []).slice().sort()

describe('Default locale files — nested structure (root === ["translation"])', () => {
  for (const loc of DEFAULT_LOCS) {
    test(`${loc}.json parses and root keys are exactly ['translation']`, () => {
      const d = load(DEFAULT_LOCALES, loc)
      assert.deepEqual(Object.keys(d), ['translation'])
      assert.ok(Object.keys(d.translation).length > 0)
    })
  }
})

describe('Default homepage keys — presence + non-empty strings', () => {
  for (const loc of DEFAULT_LOCS) {
    test(`${loc}: every homepage key present with a non-empty string value`, () => {
      const tr = load(DEFAULT_LOCALES, loc).translation
      const problems: string[] = []
      for (const k of HOMEPAGE_KEYS) {
        if (!(k in tr)) problems.push(`missing:${k}`)
        else if (typeof tr[k] !== 'string') problems.push(`not-string:${k}`)
        else if (tr[k].length === 0) problems.push(`empty:${k}`)
      }
      assert.deepEqual(problems, [], problems.join(' | '))
    })
  }
})

describe('Default homepage keys — placeholders preserved', () => {
  const EN = load(DEFAULT_LOCALES, 'en').translation
  const phKeys = HOMEPAGE_KEYS.filter((k) => placeholders(EN[k]).length > 0)

  test('at least one placeholder-bearing homepage key exists ({{count}})', () => {
    assert.ok(phKeys.includes('{{count}} models available'))
  })

  for (const loc of DEFAULT_LOCS) {
    test(`${loc}: interpolation placeholders match the English baseline`, () => {
      const tr = load(DEFAULT_LOCALES, loc).translation
      for (const k of phKeys) {
        assert.deepEqual(
          placeholders(tr[k]),
          placeholders(EN[k]),
          `placeholder mismatch for ${k}`
        )
      }
    })
  }
})

describe('Default homepage keys — non-English copy is really translated', () => {
  const EN = load(DEFAULT_LOCALES, 'en').translation
  for (const loc of DEFAULT_LOCS.filter((l) => l !== 'en')) {
    test(`${loc}: no human-visible homepage copy equals the English value (whitelist excluded)`, () => {
      const tr = load(DEFAULT_LOCALES, loc).translation
      const untranslated = HOMEPAGE_KEYS.filter(
        (k) => !WHITELIST.has(k) && tr[k] === EN[k]
      )
      assert.deepEqual(
        untranslated,
        [],
        `${loc} still has English-fallback homepage copy: ${untranslated.join(' | ')}`
      )
    })
  }
})

describe('Default ↔ Classic — shared keys consistent per language', () => {
  for (const loc of DEFAULT_LOCS) {
    test(`${loc}: shared homepage keys have identical values across themes`, () => {
      const d = load(DEFAULT_LOCALES, loc).translation
      const c = load(CLASSIC_LOCALES, loc).translation
      const diffs = HOMEPAGE_KEYS.filter((k) => c[k] !== d[k])
      assert.deepEqual(diffs, [], `${loc} drift: ${diffs.join(' | ')}`)
    })
  }
})

describe('Default homepage keys - no stray English words (frontier / Featured)', () => {
  // Translated copy must not leak the English words "frontier" or "Featured"
  // as standalone tokens. The whitelist is NOT expanded for this.
  for (const loc of DEFAULT_LOCS.filter((l) => l !== 'en')) {
    test(`${loc}: no standalone "frontier" or "Featured" in translated homepage copy`, () => {
      const tr = load(DEFAULT_LOCALES, loc).translation
      const offenders: string[] = []
      for (const k of HOMEPAGE_KEYS) {
        const v = tr[k] || ''
        if (/\bfrontier\b/.test(v)) offenders.push(`frontier:${k}`)
        if (/\bFeatured\b/.test(v)) offenders.push(`Featured:${k}`)
      }
      assert.deepEqual(
        offenders,
        [],
        `${loc} has stray English words: ${offenders.join(' | ')}`
      )
    })
  }
})

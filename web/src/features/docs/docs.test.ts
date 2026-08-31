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
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import i18n from 'i18next'

// Initialize the shared i18next singleton so the resource-bundle APIs used by
// the Docs loader exist (in the app this happens in src/i18n/config.ts).
await i18n.init({
  resources: {},
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
})

const DOCS_DIR = path.resolve(import.meta.dirname)
const LOCALES_DIR = path.resolve(import.meta.dirname, './i18n/locales')
const LOCALE_CODES = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

// ─── Generic helpers ──────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
    string,
    unknown
  >
}

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...collectKeys(v, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function collectPlaceholders(value: string): Set<string> {
  return new Set(value.match(/\{\{[^}]+\}\}/g) ?? [])
}

function flattenToMap(obj: unknown, prefix = ''): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof obj !== 'object' || obj === null) return map
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const [subK, subV] of flattenToMap(v, fullKey)) map.set(subK, subV)
    } else {
      map.set(fullKey, String(v))
    }
  }
  return map
}

function getAllTsFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...getAllTsFiles(fullPath))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

function clearDocsBundles() {
  for (const code of LOCALE_CODES) {
    i18n.removeResourceBundle(code, 'docs')
  }
}

// ─── 1. Registry ──────────────────────────────────────────────────────────────

describe('Docs registry', () => {
  it('has exactly 14 registered slugs in Classic order', async () => {
    const { ALL_DOCS_SLUGS } = await import('./nav.ts')
    assert.deepEqual(
      [...ALL_DOCS_SLUGS],
      [
        'quickstart',
        'migrate',
        'models',
        'chat',
        'image',
        'video',
        'td',
        'audio',
        'sdks',
        'agents',
        'auth',
        'capabilities',
        'errors',
        'faq',
      ]
    )
  })

  it('every registered slug has a lazy page loader', async () => {
    const { ALL_DOCS_SLUGS } = await import('./nav.ts')
    const { PAGE_REGISTRY } = await import('./registry.ts')
    for (const slug of ALL_DOCS_SLUGS) {
      const comp = PAGE_REGISTRY[slug]
      assert.ok(comp, `Missing page for slug: ${slug}`)
      assert.ok(
        (comp as unknown as Record<string, unknown>)._payload !== undefined,
        `Page ${slug} is not lazy-loaded`
      )
    }
  })
})

// ─── 2. Navigation grouping ───────────────────────────────────────────────────

describe('Docs navigation', () => {
  it('has 4 groups matching Classic structure and order', async () => {
    const { DOCS_NAV_GROUPS } = await import('./nav.ts')
    assert.deepEqual(
      DOCS_NAV_GROUPS.map((g) => g.groupKey),
      ['gettingStarted', 'apiCapabilities', 'integrationGuide', 'reference']
    )
    assert.deepEqual(
      DOCS_NAV_GROUPS[0].items.map((i) => i.slug),
      ['quickstart', 'migrate', 'models']
    )
    assert.deepEqual(
      DOCS_NAV_GROUPS[1].items.map((i) => i.slug),
      ['chat', 'image', 'video', 'td', 'audio']
    )
    assert.deepEqual(
      DOCS_NAV_GROUPS[2].items.map((i) => i.slug),
      ['sdks', 'agents']
    )
    assert.deepEqual(
      DOCS_NAV_GROUPS[3].items.map((i) => i.slug),
      ['auth', 'capabilities', 'errors', 'faq']
    )
  })
})

// ─── 3. Redirect contract ─────────────────────────────────────────────────────

describe('Docs redirect', () => {
  it('default slug is quickstart', async () => {
    const { DOCS_DEFAULT_SLUG } = await import('./nav.ts')
    assert.equal(DOCS_DEFAULT_SLUG, 'quickstart')
  })
})

// ─── 4. Unknown slug behavior ─────────────────────────────────────────────────

describe('Unknown slug', () => {
  it('isDocsSlug rejects unknown and accepts known', async () => {
    const { isDocsSlug } = await import('./nav.ts')
    assert.equal(isDocsSlug('quickstart'), true)
    assert.equal(isDocsSlug('nonexistent'), false)
    assert.equal(isDocsSlug(''), false)
  })

  it('resolveDocsRouteSlug returns valid slug', async () => {
    const { resolveDocsRouteSlug } = await import('./lib/route-guard.ts')
    assert.equal(resolveDocsRouteSlug('chat'), 'chat')
  })

  it('resolveDocsRouteSlug throws DocsNotFoundError for unknown', async () => {
    const { resolveDocsRouteSlug, DocsNotFoundError } =
      await import('./lib/route-guard.ts')
    assert.throws(() => resolveDocsRouteSlug('bogus'), DocsNotFoundError)
  })
})

// ─── 5. Prev/next boundaries ──────────────────────────────────────────────────

describe('Prev/next navigation', () => {
  it('first has no prev, last has no next, middle has both', async () => {
    const { getPrevSlug, getNextSlug } = await import('./nav.ts')
    assert.equal(getPrevSlug('quickstart'), null)
    assert.equal(getNextSlug('faq'), null)
    assert.equal(getPrevSlug('chat'), 'models')
    assert.equal(getNextSlug('chat'), 'image')
  })

  it('ordering is sequential across all slugs', async () => {
    const { ALL_DOCS_SLUGS, getPrevSlug, getNextSlug } =
      await import('./nav.ts')
    for (let i = 1; i < ALL_DOCS_SLUGS.length; i++) {
      assert.equal(getPrevSlug(ALL_DOCS_SLUGS[i]), ALL_DOCS_SLUGS[i - 1])
    }
    for (let i = 0; i < ALL_DOCS_SLUGS.length - 1; i++) {
      assert.equal(getNextSlug(ALL_DOCS_SLUGS[i]), ALL_DOCS_SLUGS[i + 1])
    }
  })
})

// ─── 6. Search ────────────────────────────────────────────────────────────────

describe('Docs search', () => {
  it('title hit ranks before body hit', async () => {
    const { buildSearchIndex, searchDocs } = await import('./lib/search.ts')
    const bundle = {
      nav: { chat: 'Chat Completions', image: 'Image Generation' },
      chat: { desc: 'Send messages' },
      image: { desc: 'Generate images with chat in the prompt' },
    }
    const results = searchDocs(buildSearchIndex(bundle), 'chat')
    assert.ok(results.length >= 1)
    const first = results[0]
    assert.ok('slug' in first, 'chat hit must be a top-level slug result')
    assert.equal(first.slug, 'chat')
    assert.equal(first.score, 0)
  })

  it('body snippets are generated', async () => {
    const { buildSearchIndex, searchDocs } = await import('./lib/search.ts')
    const bundle = {
      nav: { chat: 'Chat' },
      chat: { desc: 'A long description about streaming responses here' },
    }
    const results = searchDocs(buildSearchIndex(bundle), 'streaming')
    assert.ok(results.length >= 1)
    assert.ok(results[0].snippet.length > 0)
  })

  it('result limit is eight', async () => {
    const { buildSearchIndex, searchDocs, MAX_SEARCH_RESULTS } =
      await import('./lib/search.ts')
    assert.equal(MAX_SEARCH_RESULTS, 8)
    const bundle: Record<string, unknown> = { nav: {} }
    for (const s of [
      'quickstart',
      'migrate',
      'models',
      'chat',
      'image',
      'video',
      'td',
      'audio',
      'sdks',
      'agents',
    ]) {
      ;(bundle.nav as Record<string, string>)[s] = `test ${s}`
      bundle[s] = { content: 'test content' }
    }
    assert.ok(searchDocs(buildSearchIndex(bundle), 'test').length <= 8)
  })

  it('no-result returns empty array', async () => {
    const { buildSearchIndex, searchDocs } = await import('./lib/search.ts')
    const bundle = { nav: { chat: 'Chat' }, chat: { desc: 'hello' } }
    assert.equal(searchDocs(buildSearchIndex(bundle), 'zzzz').length, 0)
  })

  it('index rebuilds across locales', async () => {
    const { buildSearchIndex, searchDocs } = await import('./lib/search.ts')
    const en = {
      nav: { chat: 'Chat Completions' },
      chat: { desc: 'Send messages' },
    }
    const zh = { nav: { chat: '对话补全' }, chat: { desc: '发送消息' } }
    assert.equal(searchDocs(buildSearchIndex(en), 'Chat').length, 1)
    assert.equal(searchDocs(buildSearchIndex(zh), '对话').length, 1)
    assert.equal(searchDocs(buildSearchIndex(en), '对话').length, 0)
  })

  it('first-load: empty bundle yields no results, populated bundle yields results (revision rebuild)', async () => {
    const { buildSearchIndex, searchDocs } = await import('./lib/search.ts')
    assert.equal(searchDocs(buildSearchIndex({}), '视频').length, 0)
    const zhBundle = { nav: { video: '视频生成' }, video: { desc: '生成视频' } }
    assert.equal(searchDocs(buildSearchIndex(zhBundle), '视频').length, 1)
  })
})

// ─── 7. Search keyboard navigation ────────────────────────────────────────────

describe('Search keyboard navigation', () => {
  it('ArrowDown advances and wraps from last to first', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('./lib/search-keyboard.ts')
    let s = createSearchKeyboardState(3)
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    assert.equal(s.activeIndex, 0)
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    assert.equal(s.activeIndex, 2)
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    assert.equal(s.activeIndex, 0)
  })

  it('ArrowUp wraps from first to last', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('./lib/search-keyboard.ts')
    const s = searchKeyboardReducer(createSearchKeyboardState(3), {
      type: 'movePrev',
    })
    assert.equal(s.activeIndex, 2)
  })

  it('Home/End jump to first/last', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('./lib/search-keyboard.ts')
    let s = createSearchKeyboardState(5)
    s = searchKeyboardReducer(s, { type: 'moveLast' })
    assert.equal(s.activeIndex, 4)
    s = searchKeyboardReducer(s, { type: 'moveFirst' })
    assert.equal(s.activeIndex, 0)
  })

  it('Escape closes and resets active index', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('./lib/search-keyboard.ts')
    let s = createSearchKeyboardState(3)
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    s = searchKeyboardReducer(s, { type: 'close' })
    assert.equal(s.open, false)
    assert.equal(s.activeIndex, -1)
  })

  it('empty results keep activeIndex at -1', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('./lib/search-keyboard.ts')
    const s = searchKeyboardReducer(createSearchKeyboardState(0), {
      type: 'moveNext',
    })
    assert.equal(s.activeIndex, -1)
  })

  it('searchKeyToAction maps keys and ignores Escape when closed', async () => {
    const { searchKeyToAction } = await import('./lib/search-keyboard.ts')
    assert.deepEqual(searchKeyToAction('ArrowDown', true), { type: 'moveNext' })
    assert.deepEqual(searchKeyToAction('ArrowUp', true), { type: 'movePrev' })
    assert.deepEqual(searchKeyToAction('Home', true), { type: 'moveFirst' })
    assert.deepEqual(searchKeyToAction('End', true), { type: 'moveLast' })
    assert.deepEqual(searchKeyToAction('Escape', true), { type: 'close' })
    assert.equal(searchKeyToAction('Escape', false), null)
    assert.equal(searchKeyToAction('a', true), null)
  })

  it('searchOptionId is stable per index', async () => {
    const { searchOptionId } = await import('./lib/search-keyboard.ts')
    assert.equal(searchOptionId('lb', 2), 'lb-option-2')
  })
})

// ─── 8. Base URL normalization ────────────────────────────────────────────────

describe('Base URL normalization', () => {
  it('fallback for empty/null/undefined', async () => {
    const { normalizeApiBaseUrl } = await import('./lib/base-url.ts')
    assert.equal(normalizeApiBaseUrl(''), 'https://vancine.com/v1')
    assert.equal(normalizeApiBaseUrl(null), 'https://vancine.com/v1')
    assert.equal(normalizeApiBaseUrl(undefined), 'https://vancine.com/v1')
  })

  it('strips trailing slash and terminal /v1', async () => {
    const { normalizeApiBaseUrl } = await import('./lib/base-url.ts')
    assert.equal(
      normalizeApiBaseUrl('https://example.com/'),
      'https://example.com/v1'
    )
    assert.equal(
      normalizeApiBaseUrl('https://example.com/v1'),
      'https://example.com/v1'
    )
    assert.equal(
      normalizeApiBaseUrl('https://example.com/v1/'),
      'https://example.com/v1'
    )
    assert.equal(
      normalizeApiBaseUrl('https://vancine.com'),
      'https://vancine.com/v1'
    )
  })

  it('pricing URL derives from base URL', async () => {
    const { getPricingUrl } = await import('./lib/base-url.ts')
    assert.equal(
      getPricingUrl('https://vancine.com/v1'),
      'https://vancine.com/api/pricing'
    )
  })
})

// ─── 9. Anchor mapping ────────────────────────────────────────────────────────

describe('Docs anchor mapping', () => {
  it('maps landing anchors to slugs', async () => {
    const { resolveDocsAnchor } = await import('./lib/anchor-map.ts')
    assert.equal(resolveDocsAnchor('#image'), 'image')
    assert.equal(resolveDocsAnchor('#video'), 'video')
    assert.equal(resolveDocsAnchor('#audio'), 'audio')
    assert.equal(resolveDocsAnchor('#nonexistent'), null)
    assert.equal(resolveDocsAnchor(''), null)
  })
})

// ─── 10. i18n loader lifecycle ────────────────────────────────────────────────

describe('Docs i18n loader lifecycle', () => {
  beforeEach(() => clearDocsBundles())

  it('loads a bundle and marks it ready', async () => {
    const { ensureDocsBundle, isDocsBundleReady, getDocsBundle } =
      await import('./i18n/loader.ts')
    const loaders = {
      en: async () => ({ common: { loading: 'Loading…' } }),
      fr: async () => ({ common: { loading: 'Chargement…' } }),
    } as never
    await ensureDocsBundle('fr', loaders)
    assert.equal(isDocsBundleReady('fr'), true)
    assert.deepEqual(getDocsBundle('fr'), {
      common: { loading: 'Chargement…' },
    })
  })

  it('deduplicates concurrent loads for the same locale', async () => {
    const { ensureDocsBundle } = await import('./i18n/loader.ts')
    let frCalls = 0
    const loaders = {
      en: async () => ({ common: {} }),
      fr: async () => {
        frCalls++
        await new Promise((r) => setTimeout(r, 10))
        return { common: { x: 'y' } }
      },
    } as never
    await Promise.all([
      ensureDocsBundle('fr', loaders),
      ensureDocsBundle('fr', loaders),
    ])
    assert.equal(frCalls, 1)
  })

  it('non-English failure falls back to English content and resolves ready', async () => {
    const { ensureDocsBundle, isDocsBundleReady, getDocsBundle } =
      await import('./i18n/loader.ts')
    const enContent = { common: { loading: 'Loading…' } }
    const loaders = {
      en: async () => enContent,
      ru: async () => {
        throw new Error('network down')
      },
    } as never
    await ensureDocsBundle('ru', loaders)
    assert.equal(isDocsBundleReady('ru'), true)
    assert.deepEqual(getDocsBundle('ru'), enContent)
  })

  it('English failure REJECTS (deterministic terminal error, no silent resolve)', async () => {
    const { ensureDocsBundle, isDocsBundleReady } =
      await import('./i18n/loader.ts')
    const loaders = {
      en: async () => {
        throw new Error('english bundle unreachable')
      },
    } as never
    await assert.rejects(
      () => ensureDocsBundle('en', loaders),
      /english bundle unreachable/
    )
    assert.equal(isDocsBundleReady('en'), false)
  })

  it('resolveDocsLocale maps interface languages', async () => {
    const { resolveDocsLocale } = await import('./i18n/loader.ts')
    assert.equal(resolveDocsLocale('zh'), 'zhCN')
    assert.equal(resolveDocsLocale('zh-CN'), 'zhCN')
    assert.equal(resolveDocsLocale('zh-TW'), 'zhTW')
    assert.equal(resolveDocsLocale('zh-Hant'), 'zhTW')
    assert.equal(resolveDocsLocale('fr'), 'fr')
    assert.equal(resolveDocsLocale('xx'), 'en')
  })
})

// ─── 11. Locale parity ────────────────────────────────────────────────────────

describe('Docs locale parity', () => {
  it('all seven locale files exist', () => {
    for (const code of LOCALE_CODES) {
      assert.ok(
        fs.existsSync(path.join(LOCALES_DIR, `${code}.json`)),
        `Missing: ${code}.json`
      )
    }
  })

  it('no missing keys', () => {
    const enKeys = collectKeys(readJson(path.join(LOCALES_DIR, 'en.json')))
    for (const code of LOCALE_CODES) {
      if (code === 'en') continue
      const have = new Set(
        collectKeys(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      )
      const missing = enKeys.filter((k) => !have.has(k))
      assert.deepEqual(missing, [], `${code} missing: ${missing.join(', ')}`)
    }
  })

  it('no extra keys', () => {
    const enSet = new Set(
      collectKeys(readJson(path.join(LOCALES_DIR, 'en.json')))
    )
    for (const code of LOCALE_CODES) {
      if (code === 'en') continue
      const extra = collectKeys(
        readJson(path.join(LOCALES_DIR, `${code}.json`))
      ).filter((k) => !enSet.has(k))
      assert.deepEqual(extra, [], `${code} extra: ${extra.join(', ')}`)
    }
  })

  it('no empty values', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      const empty = [...map.entries()]
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k)
      assert.deepEqual(empty, [], `${code} empty: ${empty.join(', ')}`)
    }
  })

  it('identical placeholder sets', () => {
    const enMap = flattenToMap(readJson(path.join(LOCALES_DIR, 'en.json')))
    for (const code of LOCALE_CODES) {
      if (code === 'en') continue
      const locMap = flattenToMap(
        readJson(path.join(LOCALES_DIR, `${code}.json`))
      )
      const mismatches: string[] = []
      for (const [key, enVal] of enMap) {
        const enPh = collectPlaceholders(enVal)
        const locPh = collectPlaceholders(locMap.get(key) ?? '')
        if (enPh.size !== locPh.size || ![...enPh].every((p) => locPh.has(p))) {
          mismatches.push(key)
        }
      }
      assert.deepEqual(
        mismatches,
        [],
        `${code} placeholders: ${mismatches.join(', ')}`
      )
    }
  })

  it('common.loading/notFound/notFoundDesc present and translated', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const key of [
        'common.loading',
        'common.notFound',
        'common.notFoundDesc',
      ]) {
        assert.ok(map.get(key)?.trim(), `${code} missing/empty ${key}`)
      }
    }
  })
})

// ─── 12. Same-English: real zero-violation assertion ──────────────────────────

// The 18 proper voice names that are kept identical across locales.
const VOICE_KEYS = [
  'vivi',
  'nadia',
  'jane',
  'rachel',
  'david',
  'alex',
  'kevin',
  'stokie',
  'cancan',
  'wenhao',
  'amanda',
  'emily',
  'adam',
  'jackson',
  'sarah',
  'smith',
  'anna',
  'dryw',
]

/**
 * Narrow, per-key allowlist of values legitimately identical to English:
 * brand/product names, proper voice names, URLs, model identifiers, acronyms,
 * and language-neutral technical labels (including valid French cognates such
 * as "Description", "Navigation", "Type"). Anything same-English that is NOT
 * in this set is treated as an untranslated-copy violation.
 */
const SAME_ENGLISH_ALLOWLIST = new Set<string>([
  // Brands / product names
  'agents.gui.cursor.title',
  'agents.gui.cherryStudio.title',
  'migrate.comparison.colOpenai',
  'migrate.comparison.colVancine',
  // URLs / model identifiers
  'migrate.comparison.baseUrlOpenai',
  'migrate.comparison.modelOpenai',
  // Language-neutral technical labels / acronyms / valid cognates
  'agentGuides.common.baseUrlTitle',
  'quickstart.infoTable.baseUrl',
  'audio.title',
  'nav.audio',
  'faq.title',
  'nav.faq',
  'capabilities.rows.chat',
  'models.colType',
  'common.type',
  'common.action',
  'common.description',
  'common.navigation',
  'common.notes',
  'common.endpoint',
  // Proper voice names (do not translate)
  ...VOICE_KEYS.map((k) => `audio.voices.${k}`),
  // Voice language/use-case autonyms (language names in their own language)
  'audio.voices.espanol',
  'audio.voices.francais',
  'audio.voices.deutsch',
  'audio.voices.arabic',
])

describe('OpenCode /connect primary path copy', () => {
  it('keeps /connect and /models in all seven locales and never names glm-5.1', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      const step3 = map.get('agentGuides.opencode.step3') ?? ''
      const step6 = map.get('agentGuides.opencode.step6') ?? ''
      const step7 = map.get('agentGuides.opencode.step7') ?? ''
      assert.ok(
        step3.includes('/connect'),
        `${code} step3 must include /connect`
      )
      assert.ok(step6.includes('/models'), `${code} step6 must include /models`)
      assert.ok(
        step7.includes('vancine/glm-5.3-flash'),
        `${code} step7 must include vancine/glm-5.3-flash`
      )
      assert.ok(
        (map.get('agentGuides.opencode.noJsonNote') ?? '').trim(),
        `${code} missing noJsonNote`
      )
      assert.ok(
        (map.get('agentGuides.opencode.advancedTitle') ?? '').trim(),
        `${code} missing advancedTitle`
      )
      assert.ok(
        (map.get('agentGuides.opencode.notOfficial') ?? '').includes(
          'Models.dev'
        ),
        `${code} OpenCode disclaimer must name Models.dev`
      )
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.opencode.')) continue
        assert.equal(
          value.includes('glm-5.1'),
          false,
          `${code} ${key} must not name glm-5.1`
        )
      }
    }
  })
})

describe('OpenCode Models.dev catalog copy', () => {
  const catalogKeys = [
    'agents.hub.cards.opencode.catalogProof',
    'agentGuides.opencode.catalogProof',
    'agentGuides.opencode.catalogNote',
    'agentGuides.opencode.catalogLink',
  ]

  it('keeps catalog keys in all seven locales with Models.dev and no partnership claims', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const key of catalogKeys) {
        const value = map.get(key) ?? ''
        assert.ok(value.trim(), `${code} missing/empty ${key}`)
        assert.ok(
          value.includes('Models.dev'),
          `${code} ${key} must name Models.dev`
        )
        assert.equal(
          value.includes('official partner'),
          false,
          `${code} ${key}`
        )
        assert.equal(
          value.includes('official supplier'),
          false,
          `${code} ${key}`
        )
      }
      const note = map.get('agentGuides.opencode.catalogNote') ?? ''
      assert.ok(
        note.includes('Provider'),
        `${code} catalogNote must keep Provider`
      )
      assert.ok(
        note.includes('API Key'),
        `${code} catalogNote must keep API Key`
      )
      assert.ok(
        note.includes('OpenCode'),
        `${code} catalogNote must keep OpenCode`
      )
    }
  })
})

describe('Same-English values', () => {
  it('asserts zero un-allowlisted same-English values (and no stale allowlist)', () => {
    const enMap = flattenToMap(readJson(path.join(LOCALES_DIR, 'en.json')))
    // Union of keys that are identical to English in at least one locale.
    const sameEnglish = new Set<string>()
    for (const code of ['zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']) {
      const locMap = flattenToMap(
        readJson(path.join(LOCALES_DIR, `${code}.json`))
      )
      for (const [key, enVal] of enMap) {
        if (locMap.get(key) === enVal) sameEnglish.add(key)
      }
    }

    // 1) No untranslated copy: every same-English key must be allowlisted.
    const violations = [...sameEnglish].filter(
      (k) => !SAME_ENGLISH_ALLOWLIST.has(k)
    )
    assert.deepEqual(
      violations,
      [],
      `Untranslated same-English copy: ${violations.join(', ')}`
    )

    // 2) Allowlist is accurate: every allowlisted key is genuinely same-English
    //    in at least one locale (no stale exemptions hiding real translations).
    const stale = [...SAME_ENGLISH_ALLOWLIST].filter((k) => !sameEnglish.has(k))
    assert.deepEqual(stale, [], `Stale allowlist entries: ${stale.join(', ')}`)
  })
})

// ─── 13. No Classic-only dependencies ─────────────────────────────────────────

describe('No Classic-only dependencies', () => {
  it('no Semi Design or highlight.js imports in docs feature', () => {
    const files = getAllTsFiles(DOCS_DIR).filter(
      (f) => !f.endsWith('.test.ts') && !f.includes('__tests__')
    )
    const bad: string[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      if (
        content.includes('@douyinfe/semi') ||
        content.includes('semi-ui') ||
        content.includes('highlight.js')
      ) {
        bad.push(path.relative(DOCS_DIR, file))
      }
    }
    assert.deepEqual(bad, [], `Classic deps in: ${bad.join(', ')}`)
  })
})

// ─── 14. Production storage/clipboard helpers ─────────────────────────────────

describe('Production feedback helper', () => {
  it('success path reads and writes via injected storage', async () => {
    const { readFeedback, saveFeedback, getFeedbackStorageKey } =
      await import('./lib/feedback.ts')
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    assert.equal(readFeedback('quickstart', storage), null)
    assert.equal(saveFeedback('quickstart', 'yes', storage), true)
    assert.equal(readFeedback('quickstart', storage), 'yes')
    assert.equal(
      getFeedbackStorageKey('quickstart'),
      'docs-feedback:quickstart'
    )
  })

  it('blocked storage returns null/false without throwing', async () => {
    const { readFeedback, saveFeedback } = await import('./lib/feedback.ts')
    const blocked = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    assert.equal(readFeedback('x', blocked), null)
    assert.equal(saveFeedback('x', 'yes', blocked), false)
    assert.equal(readFeedback('x', null), null)
    assert.equal(saveFeedback('x', 'yes', null), false)
  })
})

describe('Production clipboard helper', () => {
  it('success path resolves true', async () => {
    const { copyToClipboard } = await import('./lib/clipboard.ts')
    let written = ''
    const clipboard = { writeText: async (t: string) => void (written = t) }
    assert.equal(await copyToClipboard('hello', clipboard), true)
    assert.equal(written, 'hello')
  })

  it('blocked clipboard resolves false without throwing', async () => {
    const { copyToClipboard } = await import('./lib/clipboard.ts')
    const rejecting = {
      writeText: async () => {
        throw new Error('denied')
      },
    }
    assert.equal(await copyToClipboard('x', rejecting), false)
    assert.equal(await copyToClipboard('x', null), false)
  })
})

// ─── 15. TOC scroll spy (pure selection logic) ────────────────────────────────

describe('TOC scroll spy', () => {
  it('selects the last heading at/above the offset', async () => {
    const { activeHeadingForScroll } = await import('./lib/toc-spy.ts')
    const tops: Record<string, number> = { a: -100, b: 50, c: 400 }
    assert.equal(
      activeHeadingForScroll(['a', 'b', 'c'], (id) => tops[id], 120),
      'b'
    )
  })

  it('returns null when nothing reached the offset', async () => {
    const { activeHeadingForScroll } = await import('./lib/toc-spy.ts')
    assert.equal(
      activeHeadingForScroll(['a', 'b'], () => 500, 120),
      null
    )
  })

  it('selects the final heading when all are above offset', async () => {
    const { activeHeadingForScroll } = await import('./lib/toc-spy.ts')
    assert.equal(
      activeHeadingForScroll(['a', 'b', 'c'], () => -10, 120),
      'c'
    )
  })

  it('empty heading list yields null (cleanup state)', async () => {
    const { activeHeadingForScroll } = await import('./lib/toc-spy.ts')
    assert.equal(
      activeHeadingForScroll([], () => 0, 120),
      null
    )
  })
})

// ─── 16. Responsive layout class contract ─────────────────────────────────────

describe('Responsive layout contract', () => {
  it('container stacks on mobile and rows at lg (1024px)', async () => {
    const { DOCS_LAYOUT_CONTAINER_CLASS } =
      await import('./lib/layout-classes.ts')
    assert.ok(DOCS_LAYOUT_CONTAINER_CLASS.includes('flex-col'), 'mobile stacks')
    assert.ok(
      DOCS_LAYOUT_CONTAINER_CLASS.includes('lg:flex-row'),
      'desktop rows'
    )
  })

  it('main column cannot collapse to zero width', async () => {
    const { DOCS_MAIN_CLASS } = await import('./lib/layout-classes.ts')
    assert.ok(DOCS_MAIN_CLASS.includes('min-w-0'), 'min-w-0 prevents collapse')
    assert.ok(DOCS_MAIN_CLASS.includes('w-full'), 'full width on mobile')
  })

  it('TOC shows from lg (1024px) to match Classic three-column layout', async () => {
    const { DOCS_TOC_CLASS } = await import('./lib/layout-classes.ts')
    assert.ok(DOCS_TOC_CLASS.includes('lg:block'), 'TOC visible at lg')
    assert.ok(!DOCS_TOC_CLASS.includes('xl:block'), 'TOC not gated at xl')
  })
})

// ─── 17. Code tabs builder ────────────────────────────────────────────────────

describe('Code tabs builder', () => {
  it('maps samples to ordered items with languages; each tab has a panel', async () => {
    const { buildCodeTabItems, defaultCodeTabValue } =
      await import('./lib/code-tabs.ts')
    const samples = {
      curl: { label: 'cURL', code: 'curl ...' },
      python: { label: 'Python', code: 'print()' },
    }
    const langs = { curl: 'bash', python: 'python' } as const
    const items = buildCodeTabItems(samples, ['curl', 'python'], langs)
    assert.equal(items.length, 2)
    assert.deepEqual(
      items.map((i) => i.key),
      ['curl', 'python']
    )
    assert.equal(items[0].language, 'bash')
    assert.equal(items[1].code, 'print()')
    for (const item of items) {
      assert.ok(item.label && item.code)
    }
    assert.equal(defaultCodeTabValue(items), 'curl')
    assert.equal(defaultCodeTabValue([]), '')
  })
})

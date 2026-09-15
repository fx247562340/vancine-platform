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

import i18n from 'i18next'
import { beforeEach, describe, it } from 'vitest'

// Initialize the shared i18next singleton so the resource-bundle APIs used by
// the Docs loader exist (in the app this happens in src/i18n/config.ts).
await i18n.init({
  resources: {},
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
})

const DOCS_DIR = path.resolve(import.meta.dirname, '..')
const LOCALES_DIR = path.resolve(import.meta.dirname, '../i18n/locales')
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
  it('has exactly 12 registered slugs in Classic order', async () => {
    const { ALL_DOCS_SLUGS } = await import('../nav.ts')
    assert.deepEqual(
      [...ALL_DOCS_SLUGS],
      [
        'quickstart',
        'migrate',
        'models',
        'chat',
        'image',
        'video',
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
    const { ALL_DOCS_SLUGS } = await import('../nav.ts')
    const { PAGE_REGISTRY } = await import('../registry.ts')
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
    const { DOCS_NAV_GROUPS } = await import('../nav.ts')
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
      ['chat', 'image', 'video']
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
    const { DOCS_DEFAULT_SLUG } = await import('../nav.ts')
    assert.equal(DOCS_DEFAULT_SLUG, 'quickstart')
  })
})

// ─── 4. Unknown slug behavior ─────────────────────────────────────────────────

describe('Unknown slug', () => {
  it('isDocsSlug rejects unknown and accepts known', async () => {
    const { isDocsSlug } = await import('../nav.ts')
    assert.equal(isDocsSlug('quickstart'), true)
    assert.equal(isDocsSlug('nonexistent'), false)
    assert.equal(isDocsSlug(''), false)
  })

  it('resolveDocsRouteSlug returns valid slug', async () => {
    const { resolveDocsRouteSlug } = await import('../lib/route-guard.ts')
    assert.equal(resolveDocsRouteSlug('chat'), 'chat')
  })

  it('resolveDocsRouteSlug throws DocsNotFoundError for unknown', async () => {
    const { resolveDocsRouteSlug, DocsNotFoundError } =
      await import('../lib/route-guard.ts')
    assert.throws(() => resolveDocsRouteSlug('bogus'), DocsNotFoundError)
  })
})

// ─── 5. Prev/next boundaries ──────────────────────────────────────────────────

describe('Prev/next navigation', () => {
  it('first has no prev, last has no next, middle has both', async () => {
    const { getPrevSlug, getNextSlug } = await import('../nav.ts')
    assert.equal(getPrevSlug('quickstart'), null)
    assert.equal(getNextSlug('faq'), null)
    assert.equal(getPrevSlug('chat'), 'models')
    assert.equal(getNextSlug('chat'), 'image')
  })

  it('ordering is sequential across all slugs', async () => {
    const { ALL_DOCS_SLUGS, getPrevSlug, getNextSlug } =
      await import('../nav.ts')
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
    const { buildSearchIndex, searchDocs } = await import('../lib/search.ts')
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
    const { buildSearchIndex, searchDocs } = await import('../lib/search.ts')
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
      await import('../lib/search.ts')
    assert.equal(MAX_SEARCH_RESULTS, 8)
    const bundle: Record<string, unknown> = { nav: {} }
    for (const s of [
      'quickstart',
      'migrate',
      'models',
      'chat',
      'image',
      'video',
      'sdks',
      'agents',
    ]) {
      ;(bundle.nav as Record<string, string>)[s] = `test ${s}`
      bundle[s] = { content: 'test content' }
    }
    assert.ok(searchDocs(buildSearchIndex(bundle), 'test').length <= 8)
  })

  it('no-result returns empty array', async () => {
    const { buildSearchIndex, searchDocs } = await import('../lib/search.ts')
    const bundle = { nav: { chat: 'Chat' }, chat: { desc: 'hello' } }
    assert.equal(searchDocs(buildSearchIndex(bundle), 'zzzz').length, 0)
  })

  it('index rebuilds across locales', async () => {
    const { buildSearchIndex, searchDocs } = await import('../lib/search.ts')
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
    const { buildSearchIndex, searchDocs } = await import('../lib/search.ts')
    assert.equal(searchDocs(buildSearchIndex({}), '视频').length, 0)
    const zhBundle = { nav: { video: '视频生成' }, video: { desc: '生成视频' } }
    assert.equal(searchDocs(buildSearchIndex(zhBundle), '视频').length, 1)
  })
})

// ─── 7. Search keyboard navigation ────────────────────────────────────────────

describe('Search keyboard navigation', () => {
  it('ArrowDown advances and wraps from last to first', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('../lib/search-keyboard.ts')
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
      await import('../lib/search-keyboard.ts')
    const s = searchKeyboardReducer(createSearchKeyboardState(3), {
      type: 'movePrev',
    })
    assert.equal(s.activeIndex, 2)
  })

  it('Home/End jump to first/last', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('../lib/search-keyboard.ts')
    let s = createSearchKeyboardState(5)
    s = searchKeyboardReducer(s, { type: 'moveLast' })
    assert.equal(s.activeIndex, 4)
    s = searchKeyboardReducer(s, { type: 'moveFirst' })
    assert.equal(s.activeIndex, 0)
  })

  it('Escape closes and resets active index', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('../lib/search-keyboard.ts')
    let s = createSearchKeyboardState(3)
    s = searchKeyboardReducer(s, { type: 'moveNext' })
    s = searchKeyboardReducer(s, { type: 'close' })
    assert.equal(s.open, false)
    assert.equal(s.activeIndex, -1)
  })

  it('empty results keep activeIndex at -1', async () => {
    const { searchKeyboardReducer, createSearchKeyboardState } =
      await import('../lib/search-keyboard.ts')
    const s = searchKeyboardReducer(createSearchKeyboardState(0), {
      type: 'moveNext',
    })
    assert.equal(s.activeIndex, -1)
  })

  it('searchKeyToAction maps keys and ignores Escape when closed', async () => {
    const { searchKeyToAction } = await import('../lib/search-keyboard.ts')
    assert.deepEqual(searchKeyToAction('ArrowDown', true), { type: 'moveNext' })
    assert.deepEqual(searchKeyToAction('ArrowUp', true), { type: 'movePrev' })
    assert.deepEqual(searchKeyToAction('Home', true), { type: 'moveFirst' })
    assert.deepEqual(searchKeyToAction('End', true), { type: 'moveLast' })
    assert.deepEqual(searchKeyToAction('Escape', true), { type: 'close' })
    assert.equal(searchKeyToAction('Escape', false), null)
    assert.equal(searchKeyToAction('a', true), null)
  })

  it('searchOptionId is stable per index', async () => {
    const { searchOptionId } = await import('../lib/search-keyboard.ts')
    assert.equal(searchOptionId('lb', 2), 'lb-option-2')
  })
})

// ─── 8. Base URL normalization ────────────────────────────────────────────────

describe('Base URL normalization', () => {
  it('fallback for empty/null/undefined', async () => {
    const { normalizeApiBaseUrl } = await import('../lib/base-url.ts')
    assert.equal(normalizeApiBaseUrl(''), 'https://vancine.com/v1')
    assert.equal(normalizeApiBaseUrl(null), 'https://vancine.com/v1')
    assert.equal(normalizeApiBaseUrl(undefined), 'https://vancine.com/v1')
  })

  it('strips trailing slash and terminal /v1', async () => {
    const { normalizeApiBaseUrl } = await import('../lib/base-url.ts')
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
    const { getPricingUrl } = await import('../lib/base-url.ts')
    assert.equal(
      getPricingUrl('https://vancine.com/v1'),
      'https://vancine.com/api/pricing'
    )
  })
})

// ─── 9. Anchor mapping ────────────────────────────────────────────────────────

describe('Docs anchor mapping', () => {
  it('maps landing anchors to slugs', async () => {
    const { resolveDocsAnchor } = await import('../lib/anchor-map.ts')
    assert.equal(resolveDocsAnchor('#image'), 'image')
    assert.equal(resolveDocsAnchor('#video'), 'video')
    assert.equal(resolveDocsAnchor('#nonexistent'), null)
    assert.equal(resolveDocsAnchor(''), null)
  })
})

// ─── 10. i18n loader lifecycle ────────────────────────────────────────────────

describe('Docs i18n loader lifecycle', () => {
  beforeEach(() => clearDocsBundles())

  it('loads a bundle and marks it ready', async () => {
    const { ensureDocsBundle, isDocsBundleReady, getDocsBundle } =
      await import('../i18n/loader.ts')
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
    const { ensureDocsBundle } = await import('../i18n/loader.ts')
    let frCalls = 0
    // A deferred loader keeps the first load pending while the second call
    // arrives; no fixed-duration timer is involved.
    let releaseFrLoad: () => void = () => {}
    const frPending = new Promise<void>((resolve) => {
      releaseFrLoad = resolve
    })
    const loaders = {
      en: async () => ({ common: {} }),
      fr: async () => {
        frCalls++
        await frPending
        return { common: { x: 'y' } }
      },
    } as never
    const both = Promise.all([
      ensureDocsBundle('fr', loaders),
      ensureDocsBundle('fr', loaders),
    ])
    releaseFrLoad()
    await both
    assert.equal(frCalls, 1)
  })

  it('non-English failure falls back to English content and resolves ready', async () => {
    const { ensureDocsBundle, isDocsBundleReady, getDocsBundle } =
      await import('../i18n/loader.ts')
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
      await import('../i18n/loader.ts')
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
    const { resolveDocsLocale } = await import('../i18n/loader.ts')
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

/**
 * Narrow, per-key allowlist of values legitimately identical to English:
 * brand/product names, URLs, model identifiers, acronyms, and
 * language-neutral technical labels (including valid French cognates such
 * as "Description", "Navigation", "Type"). Anything same-English that is NOT
 * in this set is treated as an untranslated-copy violation.
 */
const SAME_ENGLISH_ALLOWLIST = new Set<string>([
  // Brands / product names
  'agents.gui.cursor.title',
  'agents.gui.cherryStudio.title',
  'agents.pi.title',
  'agents.pi.githubLabel',
  'migrate.comparison.colOpenai',
  'migrate.comparison.colVancine',
  // URLs / model identifiers
  'migrate.comparison.baseUrlOpenai',
  'migrate.comparison.modelOpenai',
  // Language-neutral technical labels / acronyms / valid cognates
  'agentGuides.common.baseUrlTitle',
  'quickstart.infoTable.baseUrl',
  'faq.title',
  'nav.faq',
  'capabilities.rows.chat',
  'models.colType',
  'models.imageEndpoint',
  'common.type',
  'common.action',
  'common.description',
  'common.navigation',
  'common.notes',
  'common.endpoint',
  // Technical terms that several languages keep as English borrowings
  // (Image / Video / Endpoint are valid in fr, ru, ja, vi without
  // obscuring meaning; forcing a translation here would harm clarity
  // for the technical audience reading the docs).
  'modelDetail.kind.image',
  'modelDetail.kind.video',
  'modelDetail.sections.endpoint',
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
        step7.includes('vancine/'),
        `${code} step7 must include the vancine Provider prefix`
      )
      assert.ok(
        step7.includes('{{modelId}}'),
        `${code} step7 must reference the model id via the {{modelId}} placeholder (not a hardcoded model)`
      )
      assert.ok(
        (map.get('agentGuides.opencode.noJsonNote') ?? '').trim(),
        `${code} missing noJsonNote`
      )
      assert.ok(
        (map.get('agentGuides.opencode.advancedTitle') ?? '').trim(),
        `${code} missing advancedTitle`
      )
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.opencode.')) continue
        assert.equal(
          value.includes('glm-5.1'),
          false,
          `${code} ${key} must not name glm-5.1`
        )
        assert.equal(
          value.includes('glm-5.3-flash'),
          false,
          `${code} ${key} must not name glm-5.3-flash`
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

describe('Pi Provider guide copy', () => {
  it('keeps npm install semantics and dynamic catalog wording in all seven locales', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const key of [
        'agentGuides.pi.pageTitle',
        'agentGuides.pi.valueProp',
        'agentGuides.pi.catalogLabel',
        'agentGuides.pi.npmLabel',
        'agentGuides.pi.githubLabel',
        'agentGuides.pi.step1',
        'agentGuides.pi.step2',
        'agentGuides.pi.step3',
        'agentGuides.pi.step4',
        'agentGuides.pi.step5',
        'agentGuides.pi.step6',
        'agentGuides.pi.step7',
        'agentGuides.pi.catalogNote',
      ]) {
        assert.ok(map.get(key)?.trim(), `${code} missing/empty ${key}`)
      }
      const catalogNote = map.get('agentGuides.pi.catalogNote') ?? ''
      assert.ok(
        /4\s*(hours|小时|小時|heures|時間|часа|giờ)/.test(catalogNote),
        `${code} catalogNote must state the at-most-4-hour refresh interval`
      )
      assert.ok(
        /fallback|回退|离线|離線|フォールバック|резерв|автономн|dự phòng|hors ligne/i.test(
          catalogNote
        ),
        `${code} catalogNote must describe the offline fallback condition`
      )
      // No over-promise: the catalog is not realtime and models are not
      // always the currently-available set.
      for (const banned of [
        'always choose from',
        '始终从当前可用',
        '實時同步',
        '实时同步',
        '永远最新',
        'real-time sync',
      ]) {
        assert.equal(
          catalogNote.toLowerCase().includes(banned.toLowerCase()),
          false,
          `${code} catalogNote must not contain over-promise "${banned}"`
        )
      }
      const valueProp = map.get('agentGuides.pi.valueProp') ?? ''
      const npmLabel = map.get('agentGuides.pi.npmLabel') ?? ''
      assert.ok(
        valueProp.toLowerCase().includes('npm') ||
          npmLabel.toLowerCase().includes('npm'),
        `${code} must mention npm in the Pi copy`
      )
      // The catalog entry is a third, distinct source label: it may not
      // duplicate the npm or GitHub source labels.
      const catalogLabel = map.get('agentGuides.pi.catalogLabel') ?? ''
      assert.ok(catalogLabel.trim(), `${code} catalogLabel must be non-empty`)
      assert.notEqual(
        catalogLabel,
        map.get('agentGuides.pi.npmLabel'),
        `${code} catalogLabel must differ from the npm source label`
      )
      assert.notEqual(
        catalogLabel,
        map.get('agentGuides.pi.githubLabel'),
        `${code} catalogLabel must differ from the GitHub source label`
      )
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.pi.')) continue
        assert.equal(
          /pi-provider-vancine@|\b0\.1\.\d/.test(value),
          false,
          `${code} ${key} must not pin a package version`
        )
        // Ban only positive real-time claims: first strip the required
        // negated statements ("not guaranteed…"), then look for over-promises.
        const negationStripped = value.replaceAll(
          /not guaranteed|不保证|不保證|保証されず|не гарантируется|n’est pas garanti|không được đảm bảo/gi,
          'negated'
        )
        assert.equal(
          /guaranteed (?:to be )?real[- ]?time|real[- ]?time sync|absolutely live|always live|永远最新|实时同步/i.test(
            negationStripped
          ),
          false,
          `${code} ${key} must not claim guaranteed real-time catalog fetches`
        )
      }
    }
  })
})

describe('OpenClaw provider guide copy', () => {
  it('keeps both install sources and dynamic verification wording in all seven locales', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const key of [
        'agentGuides.openclaw.pageTitle',
        'agentGuides.openclaw.valueProp',
        'agentGuides.openclaw.npmLabel',
        'agentGuides.openclaw.clawhubLabel',
        'agentGuides.openclaw.githubLabel',
        'agentGuides.openclaw.compatNote',
        'agentGuides.openclaw.installChoice',
        'agentGuides.openclaw.step1',
        'agentGuides.openclaw.step2',
        'agentGuides.openclaw.step3',
        'agentGuides.openclaw.step4',
        'agentGuides.openclaw.step5',
        'agentGuides.openclaw.catalogNote',
        'agentGuides.openclaw.zeroCredentialNote',
        'agentGuides.openclaw.limitationsNote',
        'agents.cli.openclaw',
        'agents.cli.openclawGuideLink',
        'agents.hub.cards.pi.protocol',
        'agents.hub.cards.openclaw.protocol',
      ]) {
        assert.ok(map.get(key)?.trim(), `${code} missing/empty ${key}`)
      }
      const installChoice = map.get('agentGuides.openclaw.installChoice') ?? ''
      assert.ok(
        installChoice.includes('ClawHub'),
        `${code} installChoice must name ClawHub`
      )
      // The compatibility note must pin the exact required OpenClaw version
      // in every locale.
      const compatNote = map.get('agentGuides.openclaw.compatNote') ?? ''
      assert.ok(
        compatNote.includes('2026.9.4'),
        `${code} compatNote must name OpenClaw 2026.9.4`
      )
      // Onboarding: the key is entered at the interactive secret prompt, not
      // through a CLI flag or the command line.
      const step3 = map.get('agentGuides.openclaw.step3') ?? ''
      // The command name is language-neutral in the English source; other
      // locales translate the sentence while the code block carries the
      // literal `openclaw onboard` command.
      if (code === 'en') {
        assert.ok(
          step3.toLowerCase().includes('onboard'),
          `en step3 must reference the onboard command`
        )
      }
      assert.ok(
        step3.includes('vancine-api-key'),
        `${code} step3 must name the vancine-api-key auth choice`
      )
      assert.equal(
        step3.includes('--vancine-api-key'),
        false,
        `${code} step3 must not instruct placing the key on the command line`
      )
      const authFix =
        map.get('agentGuides.openclaw.errors.authFailed.fix') ?? ''
      if (code === 'en') {
        assert.ok(
          authFix.toLowerCase().includes('onboard'),
          'en auth fix must rerun onboard'
        )
      }
      assert.equal(
        authFix.includes('--vancine-api-key'),
        false,
        `${code} auth fix must not instruct placing the key on the command line`
      )
      // Provider model selection is scoped to each provider's own list, and
      // the legacy manual env config must never reappear.
      for (const key of [
        'agentGuides.pi.modelsNote',
        'agentGuides.openclaw.modelsNote',
      ]) {
        assert.ok(map.get(key)?.trim(), `${code} missing/empty ${key}`)
      }
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.openclaw.')) continue
        assert.equal(
          /openclaw-provider@|\b0\.1\.\d/.test(value),
          false,
          `${code} ${key} must not pin a package version`
        )
        assert.equal(
          value.includes('VANCINE_MODEL') || value.includes('VANCINE_BASE_URL'),
          false,
          `${code} ${key} must not carry the legacy manual env config`
        )
        for (const banned of [
          'official OpenClaw provider',
          'official Pi provider',
          'permanently free',
          'guaranteed cheapest',
        ]) {
          assert.equal(
            value.toLowerCase().includes(banned),
            false,
            `${code} ${key} must not claim "${banned}"`
          )
        }
      }
    }
  })
})

describe('Hermes provider guide copy', () => {
  const hermesKeys = [
    'agents.hub.cards.hermes.protocol',
    'agents.cli.hermes',
    'agents.cli.hermesGuideLink',
    'agentGuides.hermes.pageTitle',
    'agentGuides.hermes.valueProp',
    'agentGuides.hermes.githubLabel',
    'agentGuides.hermes.step1',
    'agentGuides.hermes.step2',
    'agentGuides.hermes.step3',
    'agentGuides.hermes.step4',
    'agentGuides.hermes.step5',
    'agentGuides.hermes.step6',
    'agentGuides.hermes.installNote',
    'agentGuides.hermes.surfacesTitle',
    'agentGuides.hermes.surfaces.cli',
    'agentGuides.hermes.surfaces.gateway',
    'agentGuides.hermes.surfaces.desktopLocal',
    'agentGuides.hermes.surfaces.desktopRemote',
    'agentGuides.hermes.catalogNote',
    'agentGuides.hermes.modelsNote',
    'agentGuides.hermes.errors.pluginMissing.symptom',
    'agentGuides.hermes.errors.pluginMissing.fix',
    'agentGuides.hermes.errors.apiKey.symptom',
    'agentGuides.hermes.errors.apiKey.fix',
    'agentGuides.hermes.errors.modelMissing.symptom',
    'agentGuides.hermes.errors.modelMissing.fix',
    'agentGuides.hermes.errors.wrongHost.symptom',
    'agentGuides.hermes.errors.wrongHost.fix',
    'agentGuides.hermes.errors.modelRetired.symptom',
    'agentGuides.hermes.errors.modelRetired.fix',
  ]

  it('has every Hermes key translated in all seven locales', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const key of hermesKeys) {
        assert.ok(map.get(key)?.trim(), `${code} missing/empty ${key}`)
      }
    }
  })

  it('keeps the real provider id, commands, env vars and GitHub source in every locale', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      const step1 = map.get('agentGuides.hermes.step1') ?? ''
      const valueProp = map.get('agentGuides.hermes.valueProp') ?? ''
      const step2 = map.get('agentGuides.hermes.step2') ?? ''
      const step3 = map.get('agentGuides.hermes.step3') ?? ''
      const step6 = map.get('agentGuides.hermes.step6') ?? ''
      const installNote = map.get('agentGuides.hermes.installNote') ?? ''

      // Provider id and the plugin package name stay verbatim.
      assert.ok(
        valueProp.includes('vancine-hermes-provider'),
        `${code} valueProp must name vancine-hermes-provider`
      )
      assert.ok(
        step1.includes('fx247562340/vancine-hermes-provider'),
        `${code} step1 must name the published GitHub source`
      )
      // The install-time enable prompt is the literal upstream string.
      assert.ok(
        step2.includes("Enable 'vancine-provider' now?"),
        `${code} step2 must carry the literal enable prompt`
      )
      assert.ok(
        step2.includes('vancine-provider'),
        `${code} step2 must name vancine-provider`
      )
      assert.ok(
        installNote.includes('vancine-provider'),
        `${code} installNote must name vancine-provider`
      )
      // The credential is always the environment variable, never a flag.
      assert.ok(
        step3.includes('VANCINE_API_KEY'),
        `${code} step3 must name VANCINE_API_KEY`
      )
      assert.ok(
        map.get('agentGuides.hermes.modelsNote')?.includes('hermes model'),
        `${code} modelsNote must name the hermes model command`
      )
      assert.ok(
        step6.includes('provider/model'),
        `${code} step6 must name the provider/model call form`
      )
      // Every locale keeps the surface-specific install locations.
      for (const key of [
        'agentGuides.hermes.surfaces.cli',
        'agentGuides.hermes.surfaces.gateway',
        'agentGuides.hermes.surfaces.desktopLocal',
        'agentGuides.hermes.surfaces.desktopRemote',
      ]) {
        assert.ok(
          (map.get(key) ?? '').includes('HERMES_HOME'),
          `${code} ${key} must name HERMES_HOME`
        )
      }
    }
  })

  it('advertises no install source other than the public GitHub repository', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.hermes.')) continue
        for (const banned of [
          'npmjs.com',
          'pypi.org',
          'clawhub.ai',
          'pi.dev',
          'models.dev',
        ]) {
          assert.equal(
            value.includes(banned),
            false,
            `${code} ${key} must not advertise ${banned}`
          )
        }
        // The plugin is not published to a registry or a Hermes catalog.
        assert.equal(
          value.includes('official plugin catalog'),
          false,
          `${code} ${key} must not claim a Hermes plugin-catalog listing`
        )
      }
    }
  })

  it('pins no package version and names no retired model id', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.hermes.')) continue
        assert.equal(
          /vancine-hermes-provider@|\b0\.1\.\d/.test(value),
          false,
          `${code} ${key} must not pin a package version`
        )
        for (const model of [
          'deepseek-flash',
          'hy4-preview',
          'glm-5.3-flash',
          'qwen3.8-flash',
        ]) {
          assert.equal(
            value.includes(model),
            false,
            `${code} ${key} must not hardcode the model id ${model}`
          )
        }
      }
    }
  })

  it('claims no official relationship, certification or guaranteed real-time catalog', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      for (const [key, value] of map) {
        if (!key.startsWith('agentGuides.hermes.')) continue
        for (const banned of [
          'official Hermes provider',
          'official Nous Research',
          'official plugin catalog',
          'permanently free',
          'guaranteed cheapest',
          'all models',
        ]) {
          assert.equal(
            value.toLowerCase().includes(banned.toLowerCase()),
            false,
            `${code} ${key} must not claim "${banned}"`
          )
        }
        const negationStripped = value.replaceAll(
          /not guaranteed|不保证|不保證|保証されず|не гарантируется|n’est pas garanti|không được đảm bảo/gi,
          'negated'
        )
        assert.equal(
          /guaranteed (?:to be )?real[- ]?time|real[- ]?time sync|always live|永远最新|实时同步/i.test(
            negationStripped
          ),
          false,
          `${code} ${key} must not claim a guaranteed real-time catalog`
        )
      }
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
      await import('../lib/feedback.ts')
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
    const { readFeedback, saveFeedback } = await import('../lib/feedback.ts')
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
    const { copyToClipboard } = await import('../lib/clipboard.ts')
    let written = ''
    const clipboard = { writeText: async (t: string) => void (written = t) }
    assert.equal(await copyToClipboard('hello', clipboard), true)
    assert.equal(written, 'hello')
  })

  it('blocked clipboard resolves false without throwing', async () => {
    const { copyToClipboard } = await import('../lib/clipboard.ts')
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
    const { activeHeadingForScroll } = await import('../lib/toc-spy.ts')
    const tops: Record<string, number> = { a: -100, b: 50, c: 400 }
    assert.equal(
      activeHeadingForScroll(['a', 'b', 'c'], (id) => tops[id], 120),
      'b'
    )
  })

  it('returns null when nothing reached the offset', async () => {
    const { activeHeadingForScroll } = await import('../lib/toc-spy.ts')
    assert.equal(
      activeHeadingForScroll(['a', 'b'], () => 500, 120),
      null
    )
  })

  it('selects the final heading when all are above offset', async () => {
    const { activeHeadingForScroll } = await import('../lib/toc-spy.ts')
    assert.equal(
      activeHeadingForScroll(['a', 'b', 'c'], () => -10, 120),
      'c'
    )
  })

  it('empty heading list yields null (cleanup state)', async () => {
    const { activeHeadingForScroll } = await import('../lib/toc-spy.ts')
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
      await import('../lib/layout-classes.ts')
    assert.ok(DOCS_LAYOUT_CONTAINER_CLASS.includes('flex-col'), 'mobile stacks')
    assert.ok(
      DOCS_LAYOUT_CONTAINER_CLASS.includes('lg:flex-row'),
      'desktop rows'
    )
  })

  it('main column cannot collapse to zero width', async () => {
    const { DOCS_MAIN_CLASS } = await import('../lib/layout-classes.ts')
    assert.ok(DOCS_MAIN_CLASS.includes('min-w-0'), 'min-w-0 prevents collapse')
    assert.ok(DOCS_MAIN_CLASS.includes('w-full'), 'full width on mobile')
  })

  it('TOC shows from lg (1024px) to match Classic three-column layout', async () => {
    const { DOCS_TOC_CLASS } = await import('../lib/layout-classes.ts')
    assert.ok(DOCS_TOC_CLASS.includes('lg:block'), 'TOC visible at lg')
    assert.ok(!DOCS_TOC_CLASS.includes('xl:block'), 'TOC not gated at xl')
  })
})

// ─── 17. Code tabs builder ────────────────────────────────────────────────────

describe('Code tabs builder', () => {
  it('maps samples to ordered items with languages; each tab has a panel', async () => {
    const { buildCodeTabItems, defaultCodeTabValue } =
      await import('../lib/code-tabs.ts')
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

describe('Retired docs fallback model id migration', () => {
  // deepseek-v4.1-flash replaced the retired deepseek-v4-flash in the
  // live Vancine Pi catalog. The two are distinct catalog entries, so the
  // old id must not resurface anywhere in the user-visible Docs runtime:
  // locale copy, page sources, or the shared fallback constant.
  const PAGES_DIR = path.resolve(import.meta.dirname, '../pages')

  it('pins the shared fallback text model to deepseek-v4.1-flash', async () => {
    const { DOCS_FALLBACK_TEXT_MODEL } =
      await import('../lib/example-generation')
    assert.equal(DOCS_FALLBACK_TEXT_MODEL, 'deepseek-v4.1-flash')
  })

  it('keeps the retired deepseek-v4-flash out of every docs locale', () => {
    for (const code of LOCALE_CODES) {
      const raw = fs.readFileSync(
        path.join(LOCALES_DIR, `${code}.json`),
        'utf8'
      )
      assert.equal(
        raw.includes('deepseek-v4-flash'),
        false,
        `${code} docs locale still references the retired deepseek-v4-flash`
      )
    }
  })

  it('keeps the retired deepseek-v4-flash out of the docs page sources', () => {
    const sources = [
      ...fs
        .readdirSync(PAGES_DIR)
        .map((name) => fs.readFileSync(path.join(PAGES_DIR, name), 'utf8')),
      fs.readFileSync(
        path.resolve(import.meta.dirname, '../lib/example-generation.ts'),
        'utf8'
      ),
    ]
    for (const source of sources) {
      assert.equal(
        source.includes('deepseek-v4-flash'),
        false,
        'a docs page still hardcodes the retired deepseek-v4-flash'
      )
    }
  })

  it('recommends deepseek-v4.1-flash by name in quickstart and migrate copy', () => {
    for (const code of LOCALE_CODES) {
      const map = flattenToMap(readJson(path.join(LOCALES_DIR, `${code}.json`)))
      assert.ok(
        (map.get('quickstart.step2.desc') ?? '').includes(
          'deepseek-v4.1-flash'
        ),
        `${code} quickstart.step2.desc must name the current fallback id`
      )
      assert.ok(
        (map.get('migrate.comparison.modelNote') ?? '').includes(
          'deepseek-v4.1-flash'
        ),
        `${code} migrate.comparison.modelNote must name the current fallback id`
      )
    }
  })
})

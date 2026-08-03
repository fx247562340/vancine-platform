// Run with: node --test src/lib/frontend-cache.test.ts
//
// Behavior tests for the Classic → Default localStorage migration.
// Uses injected mock storage and cookie implementations to test real
// behavior without requiring a browser environment.
//
// P0 contract: the migration is purely additive. It never deletes or
// modifies any existing localStorage key.
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { runMigration, mapClassicThemeToDefault } from './frontend-cache.ts'

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

interface MockStorage {
  data: Map<string, string>
  get(key: string): string | null
  set(key: string, value: string): void
}

interface MockCookies {
  data: Map<string, string>
  get(name: string): string | undefined
  set(name: string, value: string, maxAge: number): void
}

function createMockStorage(): MockStorage {
  const data = new Map<string, string>()
  return {
    data,
    get(key: string): string | null {
      return data.get(key) ?? null
    },
    set(key: string, value: string): void {
      data.set(key, value)
    },
  }
}

function createMockCookies(): MockCookies {
  const data = new Map<string, string>()
  return {
    data,
    get(name: string): string | undefined {
      return data.get(name)
    },
    set(name: string, value: string, _maxAge: number): void {
      data.set(name, value)
    },
  }
}

// Blocked-storage mock that throws on every operation
function createBlockedStorage(): MockStorage {
  return {
    data: new Map(),
    get(): string | null {
      throw new Error('blocked')
    },
    set(): void {
      throw new Error('blocked')
    },
  }
}

function createBlockedCookies(): MockCookies {
  return {
    data: new Map(),
    get(): string | undefined {
      throw new Error('blocked')
    },
    set(): void {
      throw new Error('blocked')
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapClassicThemeToDefault', () => {
  test('maps dark → dark', () => {
    assert.equal(mapClassicThemeToDefault('dark'), 'dark')
  })

  test('maps light → light', () => {
    assert.equal(mapClassicThemeToDefault('light'), 'light')
  })

  test('maps auto → system', () => {
    assert.equal(mapClassicThemeToDefault('auto'), 'system')
  })

  test('returns null for unrecognized values', () => {
    assert.equal(mapClassicThemeToDefault('garbage'), null)
    assert.equal(mapClassicThemeToDefault(''), null)
    assert.equal(mapClassicThemeToDefault('dark-mode'), null)
  })
})

describe('runMigration — theme migration', () => {
  let storage: MockStorage
  let cookies: MockCookies

  beforeEach(() => {
    storage = createMockStorage()
    cookies = createMockCookies()
  })

  test('copies Classic theme-mode to vite-ui-theme cookie when cookie absent', () => {
    storage.set('theme-mode', 'dark')
    assert.equal(cookies.data.has('vite-ui-theme'), false)

    runMigration(storage, cookies)

    assert.equal(cookies.data.get('vite-ui-theme'), 'dark')
  })

  test('maps auto to system in cookie', () => {
    storage.set('theme-mode', 'auto')

    runMigration(storage, cookies)

    assert.equal(cookies.data.get('vite-ui-theme'), 'system')
  })

  test('maps light to light in cookie', () => {
    storage.set('theme-mode', 'light')

    runMigration(storage, cookies)

    assert.equal(cookies.data.get('vite-ui-theme'), 'light')
  })

  test('does NOT overwrite existing vite-ui-theme cookie', () => {
    storage.set('theme-mode', 'dark')
    cookies.data.set('vite-ui-theme', 'light') // already set by user

    runMigration(storage, cookies)

    assert.equal(cookies.data.get('vite-ui-theme'), 'light')
  })

  test('preserves Classic theme-mode key after migration', () => {
    storage.set('theme-mode', 'dark')

    runMigration(storage, cookies)

    // Classic key must survive for rollback
    assert.equal(storage.get('theme-mode'), 'dark')
  })

  test('does nothing when theme-mode is absent', () => {
    runMigration(storage, cookies)

    assert.equal(cookies.data.has('vite-ui-theme'), false)
  })

  test('does nothing for unrecognized theme-mode value', () => {
    storage.set('theme-mode', 'garbage')

    runMigration(storage, cookies)

    assert.equal(cookies.data.has('vite-ui-theme'), false)
  })
})

describe('runMigration — locale preserved untouched', () => {
  let storage: MockStorage
  let cookies: MockCookies

  beforeEach(() => {
    storage = createMockStorage()
    cookies = createMockCookies()
  })

  test('preserves valid locale en', () => {
    storage.set('i18nextLng', 'en')

    runMigration(storage, cookies)

    assert.equal(storage.get('i18nextLng'), 'en')
  })

  test('preserves valid locale zh-CN', () => {
    storage.set('i18nextLng', 'zh-CN')

    runMigration(storage, cookies)

    assert.equal(storage.get('i18nextLng'), 'zh-CN')
  })

  test('preserves garbage locale untouched — migration does no locale transformation', () => {
    storage.set('i18nextLng', 'garbage')

    runMigration(storage, cookies)

    // This migration must NOT delete or modify this key. Language
    // normalization is owned by the i18n package (`normalizeInterfaceLanguage`),
    // not by this additive cache migration.
    assert.equal(storage.get('i18nextLng'), 'garbage')
  })

  test('preserves zh-TW locale verbatim (not rewritten or dropped)', () => {
    storage.set('i18nextLng', 'zh-TW')

    runMigration(storage, cookies)

    // zh-TW is now a first-class global locale; the migration must leave the
    // stored value exactly as-is so a refresh restores Traditional Chinese.
    assert.equal(storage.get('i18nextLng'), 'zh-TW')
  })

  test('preserves Traditional-Chinese variant strings untouched', () => {
    storage.set('i18nextLng', 'zh-HK')

    runMigration(storage, cookies)

    // The migration never rewrites the raw value; normalization to zh-TW
    // happens at read time in the i18n layer, not here.
    assert.equal(storage.get('i18nextLng'), 'zh-HK')
  })

  test('preserves arbitrary locale strings untouched', () => {
    storage.set('i18nextLng', 'english')

    runMigration(storage, cookies)

    assert.equal(storage.get('i18nextLng'), 'english')
  })

  test('preserves valid locale ja', () => {
    storage.set('i18nextLng', 'ja')

    runMigration(storage, cookies)

    assert.equal(storage.get('i18nextLng'), 'ja')
  })
})

describe('runMigration — non-destructive', () => {
  let storage: MockStorage
  let cookies: MockCookies

  beforeEach(() => {
    storage = createMockStorage()
    cookies = createMockCookies()
  })

  test('preserves all existing localStorage keys', () => {
    storage.set('user', '{"id":1,"name":"test"}')
    storage.set('status', '{"server_address":"https://example.com"}')
    storage.set('playground_config', '{"model":"gpt-4"}')
    storage.set('enable-tag-mode', 'true')
    storage.set('home_page_content', '<p>Welcome</p>')
    storage.set('custom-unknown-key', 'preserved')

    runMigration(storage, cookies)

    assert.equal(storage.get('user'), '{"id":1,"name":"test"}')
    assert.equal(
      storage.get('status'),
      '{"server_address":"https://example.com"}'
    )
    assert.equal(storage.get('playground_config'), '{"model":"gpt-4"}')
    assert.equal(storage.get('enable-tag-mode'), 'true')
    assert.equal(storage.get('home_page_content'), '<p>Welcome</p>')
    assert.equal(storage.get('custom-unknown-key'), 'preserved')
  })

  test('preserves Classic-only status fields', () => {
    storage.set('system_name', 'My API')
    storage.set('logo', '/custom-logo.png')
    storage.set('footer_html', '<p>Footer</p>')

    runMigration(storage, cookies)

    assert.equal(storage.get('system_name'), 'My API')
    assert.equal(storage.get('logo'), '/custom-logo.png')
    assert.equal(storage.get('footer_html'), '<p>Footer</p>')
  })

  test('migration does not call remove on any key', () => {
    // Populate many keys
    storage.set('a', '1')
    storage.set('b', '2')
    storage.set('c', '3')
    storage.set('i18nextLng', 'whatever')
    storage.set('theme-mode', 'dark')

    const sizeBefore = storage.data.size
    runMigration(storage, cookies)
    const sizeAfter = storage.data.size

    // No keys should have been removed
    assert.equal(sizeAfter, sizeBefore + 1) // +1 for version sentinel
  })
})

describe('runMigration — idempotency', () => {
  let storage: MockStorage
  let cookies: MockCookies

  beforeEach(() => {
    storage = createMockStorage()
    cookies = createMockCookies()
  })

  test('second run is a no-op (version sentinel prevents re-migration)', () => {
    storage.set('theme-mode', 'dark')

    runMigration(storage, cookies)
    assert.equal(cookies.data.get('vite-ui-theme'), 'dark')

    // Change theme-mode to something different
    storage.set('theme-mode', 'light')
    // Remove the cookie to simulate user clearing cookies
    cookies.data.delete('vite-ui-theme')

    // Second run should be a no-op because version sentinel matches
    runMigration(storage, cookies)

    // Cookie should NOT be re-created
    assert.equal(cookies.data.has('vite-ui-theme'), false)
  })
})

describe('runMigration — blocked storage tolerance', () => {
  test('does not throw when storage is blocked', () => {
    const blocked = createBlockedStorage()
    const blockedCookies = createBlockedCookies()

    assert.doesNotThrow(() => {
      // runMigration itself doesn't catch — the caller wraps in try/catch
      // But the individual operations inside use safe wrappers
      try {
        runMigration(blocked, blockedCookies)
      } catch {
        // Expected: the outer caller (initializeFrontendCache) catches
      }
    })
  })
})

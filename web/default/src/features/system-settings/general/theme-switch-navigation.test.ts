// Run with: node --test src/features/system-settings/general/theme-switch-navigation.test.ts
//
// Tests for theme-switch navigation decision, option-success assertion,
// and the full submit orchestration including the ordering contract:
//   save → successful return → (caller resets form) → navigate
//   save → failure → no action returned → no navigate
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  themeNavigationFromChangedFields,
  assertOptionSuccess,
  executeSettingsSubmit,
} from './theme-switch-navigation.ts'

describe('themeNavigationFromChangedFields', () => {
  test('theme.frontend = classic → navigate to /console/setting', () => {
    const result = themeNavigationFromChangedFields({
      'theme.frontend': 'classic',
    })
    assert.deepEqual(result, {
      type: 'navigate',
      url: '/console/setting',
    })
  })

  test('theme.frontend = default → reload', () => {
    const result = themeNavigationFromChangedFields({
      'theme.frontend': 'default',
    })
    assert.deepEqual(result, { type: 'reload' })
  })

  test('theme.frontend absent → no navigation', () => {
    const result = themeNavigationFromChangedFields({
      SystemName: 'New Name',
    })
    assert.deepEqual(result, { type: 'none' })
  })

  test('empty changedFields → no navigation', () => {
    const result = themeNavigationFromChangedFields({})
    assert.deepEqual(result, { type: 'none' })
  })

  test('theme.frontend with unexpected value → no navigation', () => {
    const result = themeNavigationFromChangedFields({
      'theme.frontend': 'unknown',
    })
    assert.deepEqual(result, { type: 'none' })
  })

  test('theme.frontend = classic alongside other fields → still navigates', () => {
    const result = themeNavigationFromChangedFields({
      SystemName: 'My API',
      'theme.frontend': 'classic',
      ServerAddress: 'https://example.com',
    })
    assert.deepEqual(result, {
      type: 'navigate',
      url: '/console/setting',
    })
  })
})

describe('assertOptionSuccess', () => {
  test('does not throw when success is true', () => {
    assert.doesNotThrow(() => {
      assertOptionSuccess({ success: true, message: '' })
    })
  })

  test('throws with server message when success is false', () => {
    assert.throws(
      () => {
        assertOptionSuccess({
          success: false,
          message: 'Server rejected the update',
        })
      },
      (error: Error) => {
        assert.equal(error.message, 'Server rejected the update')
        return true
      }
    )
  })

  test('throws with default message when success is false and message empty', () => {
    assert.throws(
      () => {
        assertOptionSuccess({ success: false, message: '' })
      },
      (error: Error) => {
        assert.equal(error.message, 'Setting update failed')
        return true
      }
    )
  })

  test('thrown error prevents caller from reaching return value', () => {
    let reachedReturn = false
    try {
      assertOptionSuccess({ success: false, message: 'fail' })
      reachedReturn = true
    } catch {
      // expected
    }
    assert.equal(reachedReturn, false)
  })
})

// ---------------------------------------------------------------------------
// Integration tests for executeSettingsSubmit
//
// The ordering contract:
//   1. executeSettingsSubmit saves all fields and returns an action.
//   2. On failure, it throws — no action is returned.
//   3. The caller stores the action, lets form.reset() run, then
//      executes the action in a useEffect when isDirty becomes false.
// ---------------------------------------------------------------------------

const normalizeValue = (v: unknown): string =>
  v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v)

const normalizeServerAddress = (v: string): string => v.replace(/\/+$/, '')

describe('executeSettingsSubmit', () => {
  test('saves theme.frontend=classic → returns navigate action', async () => {
    const calls: string[] = []
    const updateOption = async (req: { key: string; value: string }) => {
      calls.push(`update:${req.key}=${req.value}`)
      return { success: true, message: '' }
    }

    const action = await executeSettingsSubmit(
      { 'theme.frontend': 'classic' },
      updateOption,
      normalizeValue,
      normalizeServerAddress
    )

    assert.deepEqual(calls, ['update:theme.frontend=classic'])
    assert.deepEqual(action, {
      type: 'navigate',
      url: '/console/setting',
    })
  })

  test('saves theme.frontend=default → returns reload action', async () => {
    const action = await executeSettingsSubmit(
      { 'theme.frontend': 'default' },
      async () => ({ success: true, message: '' }),
      normalizeValue,
      normalizeServerAddress
    )

    assert.deepEqual(action, { type: 'reload' })
  })

  test('no theme.frontend in changedFields → returns none action', async () => {
    const action = await executeSettingsSubmit(
      { SystemName: 'New Name' },
      async () => ({ success: true, message: '' }),
      normalizeValue,
      normalizeServerAddress
    )

    assert.deepEqual(action, { type: 'none' })
  })

  test('business failure: throws, does NOT return an action', async () => {
    await assert.rejects(
      () =>
        executeSettingsSubmit(
          { 'theme.frontend': 'classic' },
          async () => ({
            success: false,
            message: 'Invalid theme value',
          }),
          normalizeValue,
          normalizeServerAddress
        ),
      (error: Error) => {
        assert.equal(error.message, 'Invalid theme value')
        return true
      }
    )
  })

  test('transport failure: throws, does NOT return an action', async () => {
    await assert.rejects(
      () =>
        executeSettingsSubmit(
          { 'theme.frontend': 'classic' },
          async () => {
            throw new Error('Network error')
          },
          normalizeValue,
          normalizeServerAddress
        ),
      (error: Error) => {
        assert.equal(error.message, 'Network error')
        return true
      }
    )
  })

  test('multiple changed fields: all saved, returns correct action', async () => {
    const calls: string[] = []
    const updateOption = async (req: { key: string; value: string }) => {
      calls.push(`update:${req.key}=${req.value}`)
      return { success: true, message: '' }
    }

    const action = await executeSettingsSubmit(
      {
        SystemName: 'My API',
        'theme.frontend': 'classic',
        ServerAddress: 'https://example.com/',
      },
      updateOption,
      normalizeValue,
      normalizeServerAddress
    )

    assert.equal(calls.length, 3)
    assert.ok(calls.includes('update:SystemName=My API'))
    assert.ok(calls.includes('update:theme.frontend=classic'))
    assert.ok(
      calls.includes('update:ServerAddress=https://example.com'),
      'ServerAddress trailing slashes must be stripped'
    )
    assert.deepEqual(action, {
      type: 'navigate',
      url: '/console/setting',
    })
  })

  test('failure midway: stops saving, throws, no action returned', async () => {
    const calls: string[] = []
    const updateOption = async (req: { key: string; value: string }) => {
      calls.push(`update:${req.key}=${req.value}`)
      if (req.key === 'SystemName') {
        return { success: false, message: 'Name too long' }
      }
      return { success: true, message: '' }
    }

    await assert.rejects(
      () =>
        executeSettingsSubmit(
          {
            SystemName: 'VeryLongName',
            'theme.frontend': 'classic',
          },
          updateOption,
          normalizeValue,
          normalizeServerAddress
        ),
      (error: Error) => {
        assert.equal(error.message, 'Name too long')
        return true
      }
    )

    // SystemName was attempted, but theme.frontend was NOT
    assert.deepEqual(calls, ['update:SystemName=VeryLongName'])
  })

  // -----------------------------------------------------------------------
  // Ordering contract: action is returned only after ALL saves succeed.
  // The caller must then wait for form.reset() (isDirty → false) before
  // executing the navigation.
  // -----------------------------------------------------------------------

  test('ordering contract: action returned AFTER all saves complete', async () => {
    const events: string[] = []

    const updateOption = async (req: { key: string; value: string }) => {
      events.push(`save:${req.key}`)
      return { success: true, message: '' }
    }

    events.push('start')
    const action = await executeSettingsSubmit(
      { SystemName: 'Test', 'theme.frontend': 'classic' },
      updateOption,
      normalizeValue,
      normalizeServerAddress
    )
    events.push('returned')

    assert.deepEqual(events, [
      'start',
      'save:SystemName',
      'save:theme.frontend',
      'returned',
    ])
    assert.deepEqual(action, {
      type: 'navigate',
      url: '/console/setting',
    })
  })

  test('ordering contract: failure prevents action return', async () => {
    const events: string[] = []

    const updateOption = async (req: { key: string; value: string }) => {
      events.push(`save:${req.key}`)
      if (req.key === 'SystemName') {
        return { success: false, message: 'fail' }
      }
      return { success: true, message: '' }
    }

    events.push('start')
    try {
      await executeSettingsSubmit(
        { SystemName: 'Test', 'theme.frontend': 'classic' },
        updateOption,
        normalizeValue,
        normalizeServerAddress
      )
      events.push('returned-action')
    } catch {
      events.push('threw')
    }

    // theme.frontend save was never reached because SystemName failed
    assert.deepEqual(events, ['start', 'save:SystemName', 'threw'])
  })

  test('the exact runtime regression: default→classic', async () => {
    const action = await executeSettingsSubmit(
      { 'theme.frontend': 'classic' },
      async () => ({ success: true, message: '' }),
      normalizeValue,
      normalizeServerAddress
    )

    // Must return the navigate action — the caller then defers execution
    // until after form.reset() clears isDirty.
    assert.deepEqual(action, {
      type: 'navigate',
      url: '/console/setting',
    })
  })
})

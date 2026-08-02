// Run with: node --test src/lib/classic-route-compat.test.ts
//
// Per-route source contract tests for Classic → Default compatibility.
// Inspects each route file's source code to verify it declares
// validateSearch: legacySearchSchema, uses buildLegacyRedirect with the
// correct target, and spreads the result into redirect().
// These tests do NOT execute TSX beforeLoad at runtime; they read and
// assert against the source text of each route file.
// Executable behavioral tests for the redirect construction helper live
// in legacy-redirect.test.ts.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const routesDir = join(__dirname, '..', 'routes')
const manifestFile = join(__dirname, 'classic-route-compat.ts')
const manifestSrc = readFileSync(manifestFile, 'utf8')

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface RouteSpec {
  classicPath: string
  routeFile: string
  targetPath: string
  hasParams?: boolean
}

const ROUTES: RouteSpec[] = [
  {
    classicPath: '/console',
    routeFile: 'console/index.tsx',
    targetPath: '/dashboard/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/channel',
    routeFile: 'console/channel.tsx',
    targetPath: '/channels',
  },
  {
    classicPath: '/console/token',
    routeFile: 'console/token.tsx',
    targetPath: '/keys',
  },
  {
    classicPath: '/console/models',
    routeFile: 'console/models.tsx',
    targetPath: '/models/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/deployment',
    routeFile: 'console/deployment.tsx',
    targetPath: '/models/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/subscription',
    routeFile: 'console/subscription.tsx',
    targetPath: '/subscriptions',
  },
  {
    classicPath: '/console/redemption',
    routeFile: 'console/redemption.tsx',
    targetPath: '/redemption-codes',
  },
  {
    classicPath: '/console/user',
    routeFile: 'console/user.tsx',
    targetPath: '/users',
  },
  {
    classicPath: '/console/setting',
    routeFile: 'console/setting.tsx',
    targetPath: '/system-settings/site',
  },
  {
    classicPath: '/console/personal',
    routeFile: 'console/personal.tsx',
    targetPath: '/profile',
  },
  {
    classicPath: '/console/playground',
    routeFile: 'console/playground.tsx',
    targetPath: '/playground',
  },
  {
    classicPath: '/console/log',
    routeFile: 'console/log.tsx',
    targetPath: '/usage-logs/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/midjourney',
    routeFile: 'console/midjourney.tsx',
    targetPath: '/usage-logs/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/task',
    routeFile: 'console/task.tsx',
    targetPath: '/usage-logs/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/chat/:id',
    routeFile: 'console/chat/$id.tsx',
    targetPath: '/chat/$chatId',
    hasParams: true,
  },
  {
    classicPath: '/console/chat',
    routeFile: 'console/chat/index.tsx',
    targetPath: '/dashboard/$section',
    hasParams: true,
  },
  {
    classicPath: '/console/topup',
    routeFile: 'console/topup.tsx',
    targetPath: '/wallet',
  },
  {
    classicPath: '/forbidden',
    routeFile: '(auth)/forbidden.tsx',
    targetPath: '/403',
  },
  {
    classicPath: '/login',
    routeFile: '(auth)/login.tsx',
    targetPath: '/sign-in',
  },
  {
    classicPath: '/register',
    routeFile: '(auth)/register.tsx',
    targetPath: '/sign-up',
  },
]

// ---------------------------------------------------------------------------
// Manifest tests
// ---------------------------------------------------------------------------

describe('Classic → Default compatibility manifest', () => {
  test('manifest contains all required classic paths', () => {
    for (const route of ROUTES) {
      assert.ok(
        manifestSrc.includes(`classicPath: '${route.classicPath}'`),
        `Missing in manifest: ${route.classicPath}`
      )
    }
  })

  test('manifest contains all required default target paths', () => {
    for (const route of ROUTES) {
      assert.ok(
        manifestSrc.includes(`classicPath: '${route.classicPath}'`),
        `Missing in manifest: ${route.classicPath}`
      )
    }
  })

  test('/docs is intentionally NOT in the manifest (deferred)', () => {
    assert.ok(
      !manifestSrc.includes("classicPath: '/docs'"),
      '/docs must not be in the manifest — deferred to a later package'
    )
  })
})

// ---------------------------------------------------------------------------
// Route file existence
// ---------------------------------------------------------------------------

describe('redirect route files exist', () => {
  for (const route of ROUTES) {
    test(`file exists: ${route.routeFile}`, () => {
      const filePath = join(routesDir, route.routeFile)
      assert.ok(existsSync(filePath), `Missing: ${route.routeFile}`)
    })
  }
})

// ---------------------------------------------------------------------------
// Per-route source contract verification
// ---------------------------------------------------------------------------

describe('each redirect route declares correct source contract', () => {
  for (const route of ROUTES) {
    describe(route.classicPath, () => {
      const filePath = join(routesDir, route.routeFile)
      let src: string
      try {
        src = readFileSync(filePath, 'utf8')
      } catch {
        test('file readable', () => {
          assert.fail(`Cannot read ${route.routeFile}`)
        })
        return
      }

      test('imports buildLegacyRedirect and legacySearchSchema', () => {
        assert.ok(
          src.includes('buildLegacyRedirect') &&
            src.includes('legacySearchSchema'),
          `${route.routeFile} must import from @/lib/legacy-redirect`
        )
      })

      test('declares validateSearch: legacySearchSchema', () => {
        assert.ok(
          src.includes('validateSearch: legacySearchSchema'),
          `${route.routeFile} must capture incoming query params with legacySearchSchema`
        )
      })

      test('uses beforeLoad', () => {
        assert.ok(
          src.includes('beforeLoad'),
          `${route.routeFile} must use beforeLoad for redirect`
        )
      })

      test('throws redirect() with spread buildLegacyRedirect', () => {
        assert.ok(
          src.includes('throw redirect(') &&
            src.includes('...buildLegacyRedirect('),
          `${route.routeFile} must throw redirect({ ...buildLegacyRedirect(...) })`
        )
      })

      test(`targets ${route.targetPath}`, () => {
        assert.ok(
          src.includes(`to: '${route.targetPath}'`),
          `${route.routeFile} must target '${route.targetPath}'`
        )
      })

      test('receives location from beforeLoad context', () => {
        // The beforeLoad callback must destructure or reference location
        assert.ok(
          src.includes('location') &&
            (src.includes('{ location') || src.includes('({ location')),
          `${route.routeFile} must access location from beforeLoad context`
        )
      })

      if (route.hasParams) {
        test('passes typed params to buildLegacyRedirect', () => {
          assert.ok(
            src.includes('params:'),
            `${route.routeFile} must pass typed params`
          )
        })
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Specific behavior tests
// ---------------------------------------------------------------------------

describe('specific redirect behaviors', () => {
  test('/console/topup does not invent show_history', () => {
    const src = readFileSync(join(routesDir, 'console/topup.tsx'), 'utf8')
    // Check that the buildLegacyRedirect call does not include show_history
    const redirectCall = src.slice(src.indexOf('buildLegacyRedirect'))
    const redirectBlock = redirectCall.slice(0, redirectCall.indexOf('})') + 2)
    assert.ok(
      !redirectBlock.includes('show_history'),
      'topup buildLegacyRedirect call must not invent show_history'
    )
  })

  test('/console/log targets section=common', () => {
    const src = readFileSync(join(routesDir, 'console/log.tsx'), 'utf8')
    assert.ok(src.includes("'common'"), 'Must set section to common')
  })

  test('/console/chat/$id maps Classic :id to Default $chatId', () => {
    const src = readFileSync(join(routesDir, 'console/chat/$id.tsx'), 'utf8')
    assert.ok(
      src.includes('chatId') && src.includes('params.id'),
      'Must map Classic :id to Default $chatId'
    )
  })

  test('/console/chat (no id) goes to dashboard as safe recovery', () => {
    const src = readFileSync(join(routesDir, 'console/chat/index.tsx'), 'utf8')
    assert.ok(
      src.includes('/dashboard/$section'),
      'Must redirect to dashboard as safe recovery target'
    )
  })
})

// ---------------------------------------------------------------------------
// /reset and /user/reset behavior
// ---------------------------------------------------------------------------

describe('/reset and /user/reset contract', () => {
  test('/reset always redirects to /forgot-password', () => {
    const src = readFileSync(join(routesDir, '(auth)/reset.tsx'), 'utf8')
    assert.ok(
      src.includes("to: '/forgot-password'"),
      '/reset must always redirect to /forgot-password'
    )
    assert.ok(
      src.includes('buildLegacyRedirect'),
      '/reset must use buildLegacyRedirect to preserve query and hash'
    )
    // Must NOT contain conditional logic
    assert.ok(
      !src.includes('hasEmail') && !src.includes('hasToken'),
      '/reset must not have conditional logic — it always redirects'
    )
    // Must NOT render a component
    assert.ok(
      !src.includes('ResetPasswordConfirm'),
      '/reset must not render a confirmation component'
    )
  })

  test('/user/reset renders confirmation form (backend emails use this path)', () => {
    const src = readFileSync(join(routesDir, '(auth)/user/reset.tsx'), 'utf8')
    assert.ok(
      src.includes('ResetPasswordConfirm'),
      '/user/reset must render ResetPasswordConfirm'
    )
    assert.ok(
      src.includes('validateSearch'),
      '/user/reset must validate search params (email, token)'
    )
  })

  test('/reset documentation correctly states backend uses /user/reset', () => {
    const src = readFileSync(join(routesDir, '(auth)/reset.tsx'), 'utf8')
    assert.ok(
      src.includes('/user/reset'),
      '/reset route docs must mention /user/reset as the backend confirmation path'
    )
    assert.ok(
      src.includes(
        'Backend password-reset confirmation emails use /user/reset'
      ),
      'Docs must correctly state that backend uses /user/reset, not /reset'
    )
  })
})

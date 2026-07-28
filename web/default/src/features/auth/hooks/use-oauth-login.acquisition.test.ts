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
// Source-level contract tests for OAuth signup_started injection scope.
// Run with: node --test --experimental-strip-types src/features/auth/hooks/use-oauth-login.acquisition.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf8')
}

describe('OAuth signup_started injection scope (default)', () => {
  test('useOAuthLogin does not hardcode reportSignupStarted', () => {
    const src = read('./use-oauth-login.ts')
    assert.equal(
      src.includes("from '@/lib/acquisition'"),
      false,
      'hook must not import acquisition helper'
    )
    assert.equal(
      src.includes('reportSignupStarted'),
      false,
      'hook must not call reportSignupStarted directly'
    )
    assert.match(
      src,
      /onBeforeOAuthRedirect\?:/,
      'hook must accept optional onBeforeOAuthRedirect'
    )
    assert.match(
      src,
      /await runBeforeOAuthRedirect\(\)/,
      'redirect providers must await optional callback'
    )
    // Telegram must not invoke the callback (no OAuth redirect path).
    const telegramBlock = src.slice(
      src.indexOf('const handleTelegramLogin'),
      src.indexOf('const handleCustomOAuthLogin')
    )
    assert.equal(
      telegramBlock.includes('runBeforeOAuthRedirect'),
      false,
      'Telegram path must not fire signup_started callback'
    )
  })

  test('OAuthProviders only forwards optional callback; sign-in omits it', () => {
    const providers = read('../components/oauth-providers.tsx')
    assert.match(providers, /onBeforeOAuthRedirect\?:/)
    assert.match(
      providers,
      /useOAuthLogin\(status, \{\s*onBeforeOAuthRedirect\s*\}/
    )

    const signIn = read('../sign-in/components/user-auth-form.tsx')
    assert.equal(
      signIn.includes('onBeforeOAuthRedirect'),
      false,
      'sign-in must not inject signup_started callback'
    )
    assert.equal(
      signIn.includes('reportSignupStarted'),
      false,
      'sign-in must not import reportSignupStarted'
    )
    assert.equal(signIn.includes('acquisition'), false)

    const signUp = read('../sign-up/components/sign-up-form.tsx')
    assert.match(
      signUp,
      /onBeforeOAuthRedirect=\{reportSignupStarted\}/,
      'sign-up must inject reportSignupStarted into OAuthProviders'
    )
    // WeChat: signup_started only after legal consent gate; fire-and-forget (void)
    const wechatFn = signUp.slice(
      signUp.indexOf('const handleOpenWeChatDialog'),
      signUp.indexOf('const handleWeChatDialogChange')
    )
    const consentIdx = wechatFn.indexOf('requiresLegalConsent')
    const reportIdx = wechatFn.indexOf('reportSignupStarted')
    assert.ok(consentIdx >= 0 && reportIdx > consentIdx)
    assert.match(
      wechatFn,
      /void reportSignupStarted\(\)/,
      'WeChat path must remain fire-and-forget (void), not await'
    )
  })

  test('password register awaits reportSignupStarted before register API', () => {
    const signUp = read('../sign-up/components/sign-up-form.tsx')
    // Slice the password submit handler only — not the whole file.
    const onSubmitStart = signUp.indexOf('async function onSubmit(')
    assert.ok(onSubmitStart >= 0, 'onSubmit handler must exist')
    const nextFn = signUp.indexOf(
      '\n  async function handleSendVerificationCode',
      onSubmitStart
    )
    assert.ok(nextFn > onSubmitStart, 'must locate end of onSubmit')
    const onSubmit = signUp.slice(onSubmitStart, nextFn)

    const awaitIdx = onSubmit.search(/await reportSignupStarted\(\s*\)/)
    assert.ok(
      awaitIdx >= 0,
      'password onSubmit must await reportSignupStarted()'
    )
    // Must not use fire-and-forget on the password path.
    assert.equal(
      onSubmit.includes('void reportSignupStarted()'),
      false,
      'password onSubmit must not void reportSignupStarted'
    )

    const registerIdx = onSubmit.search(/\bawait register\s*\(/)
    assert.ok(registerIdx >= 0, 'password onSubmit must call register()')
    assert.ok(
      awaitIdx < registerIdx,
      'await reportSignupStarted must precede register API call'
    )

    // Umami still fires on the password path (order relative to await is free).
    assert.match(onSubmit, /trackEvent\(\s*['"]signup_started['"]\s*\)/)
  })
})

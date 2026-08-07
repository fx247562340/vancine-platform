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
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

// Install DOM globals for modules that read window.location, and remember
// every overwritten globalThis descriptor so the suite restores it.
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>()

function defineGlobal(key: string, value: unknown): void {
  if (!originalDescriptors.has(key)) {
    originalDescriptors.set(
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    )
  }
  Object.defineProperty(globalThis, key, { configurable: true, value })
}

const domWindow = new Window({ url: 'https://app.example.com/dashboard' })
for (const key of ['window', 'document', 'location'] as const) {
  defineGlobal(key, domWindow[key])
}

const {
  buildGitHubOAuthUrl,
  buildDiscordOAuthUrl,
  buildOIDCOAuthUrl,
  buildLinuxDOOAuthUrl,
  buildGoogleOAuthUrl,
  resolveGoogleBindingConfiguration,
} = await import('../oauth')

// Restore every overwritten globalThis descriptor once this file finishes,
// regardless of test order.
after(() => {
  domWindow.close()
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor)
    } else {
      Reflect.deleteProperty(globalThis, key)
    }
  }
})

const appOrigin = 'https://app.example.com'
const clientId = 'google-client-id'
const redirectUri = 'https://app.example.com/oauth/google'
const state = 'bind-state-token'

describe('buildGoogleOAuthUrl', () => {
  test('targets the Google authorize endpoint with the full bind parameter set', () => {
    const url = new URL(buildGoogleOAuthUrl(clientId, redirectUri, state))

    assert.equal(
      url.origin + url.pathname,
      'https://accounts.google.com/o/oauth2/v2/auth'
    )
    assert.equal(url.searchParams.get('client_id'), clientId)
    assert.equal(url.searchParams.get('redirect_uri'), redirectUri)
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('scope'), 'openid email profile')
    assert.equal(url.searchParams.get('state'), state)
    assert.equal(url.searchParams.get('prompt'), 'select_account')
  })

  test('encodes reserved characters through URLSearchParams, not string concatenation', () => {
    const url = new URL(
      buildGoogleOAuthUrl(clientId, redirectUri, 'state+with &special=chars')
    )
    assert.equal(url.searchParams.get('state'), 'state+with &special=chars')
    assert.ok(
      url.href.includes('state=state%2Bwith+%26special%3Dchars') ||
        url.href.includes('state=state%2Bwith%20%26special%3Dchars'),
      `state must be percent-encoded, got: ${url.href}`
    )
  })

  test('refuses to build an authorize URL from incomplete configuration', () => {
    assert.throws(() => buildGoogleOAuthUrl('', redirectUri, state))
    assert.throws(() => buildGoogleOAuthUrl('   ', redirectUri, state))
    assert.throws(() => buildGoogleOAuthUrl(clientId, redirectUri, ''))
    assert.throws(() => buildGoogleOAuthUrl(clientId, redirectUri, '  \t '))
  })

  test('refuses redirect URIs that are not absolute http(s) URLs', () => {
    // Relative paths cannot be authorized redirect URIs.
    assert.throws(() => buildGoogleOAuthUrl(clientId, '/oauth/google', state))
    assert.throws(() => buildGoogleOAuthUrl(clientId, '', state))
    // Executable or opaque schemes must never reach Google.
    assert.throws(() =>
      buildGoogleOAuthUrl(clientId, 'javascript:alert(1)', state)
    )
    assert.throws(() =>
      buildGoogleOAuthUrl(clientId, 'data:text/html,x', state)
    )
  })

  test('accepts http and https redirect URIs', () => {
    assert.doesNotThrow(() =>
      buildGoogleOAuthUrl(clientId, 'http://localhost:3000/oauth/google', state)
    )
    assert.doesNotThrow(() => buildGoogleOAuthUrl(clientId, redirectUri, state))
  })
})

describe('resolveGoogleBindingConfiguration', () => {
  test('accepts a same-origin absolute https callback URL', () => {
    const config = resolveGoogleBindingConfiguration(
      clientId,
      redirectUri,
      appOrigin
    )
    assert.deepEqual(config, { clientId, redirectUri })
  })

  test('accepts the legacy backend shim path on the same origin', () => {
    const config = resolveGoogleBindingConfiguration(
      clientId,
      'https://app.example.com/api/oauth/google/callback',
      appOrigin
    )
    assert.deepEqual(config, {
      clientId,
      redirectUri: 'https://app.example.com/api/oauth/google/callback',
    })
  })

  test('rejects a cross-origin redirect URI', () => {
    assert.equal(
      resolveGoogleBindingConfiguration(
        clientId,
        'https://api.example.com/oauth/google',
        appOrigin
      ),
      null
    )
  })

  test('rejects relative redirect URIs', () => {
    assert.equal(
      resolveGoogleBindingConfiguration(clientId, '/oauth/google', appOrigin),
      null
    )
  })

  test('rejects non-http(s) redirect URIs', () => {
    assert.equal(
      resolveGoogleBindingConfiguration(
        clientId,
        'javascript:alert(1)',
        appOrigin
      ),
      null
    )
    assert.equal(
      resolveGoogleBindingConfiguration(
        clientId,
        'data:text/html,<script>alert(1)</script>',
        appOrigin
      ),
      null
    )
  })

  test('rejects unsupported callback paths on the same origin', () => {
    assert.equal(
      resolveGoogleBindingConfiguration(
        clientId,
        'https://app.example.com/some/other/route',
        appOrigin
      ),
      null
    )
  })

  test('rejects empty or whitespace-only configuration', () => {
    assert.equal(
      resolveGoogleBindingConfiguration(undefined, redirectUri, appOrigin),
      null
    )
    assert.equal(
      resolveGoogleBindingConfiguration(clientId, undefined, appOrigin),
      null
    )
    assert.equal(
      resolveGoogleBindingConfiguration(clientId, redirectUri, ''),
      null
    )
    assert.equal(
      resolveGoogleBindingConfiguration('   ', redirectUri, appOrigin),
      null
    )
  })
})

describe('existing OAuth URL builders stay unchanged', () => {
  test('GitHub builder keeps endpoint, client id, state and scope', () => {
    const url = new URL(buildGitHubOAuthUrl('gh-client', 'gh-state'))
    assert.equal(
      url.origin + url.pathname,
      'https://github.com/login/oauth/authorize'
    )
    assert.equal(url.searchParams.get('client_id'), 'gh-client')
    assert.equal(url.searchParams.get('state'), 'gh-state')
    assert.equal(url.searchParams.get('scope'), 'user:email')
  })

  test('Discord builder keeps endpoint and derives the redirect from the app origin', () => {
    const url = new URL(buildDiscordOAuthUrl('dc-client', 'dc-state'))
    assert.equal(
      url.origin + url.pathname,
      'https://discord.com/oauth2/authorize'
    )
    assert.equal(url.searchParams.get('client_id'), 'dc-client')
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://app.example.com/oauth/discord'
    )
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('scope'), 'identify+openid')
    assert.equal(url.searchParams.get('state'), 'dc-state')
  })

  test('OIDC builder keeps the configured authorization endpoint and parameters', () => {
    const url = new URL(
      buildOIDCOAuthUrl(
        'https://sso.example.com/authorize',
        'oidc-client',
        'oidc-state'
      )
    )
    assert.equal(url.origin + url.pathname, 'https://sso.example.com/authorize')
    assert.equal(url.searchParams.get('client_id'), 'oidc-client')
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://app.example.com/oauth/oidc'
    )
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('scope'), 'openid profile email')
    assert.equal(url.searchParams.get('state'), 'oidc-state')
  })

  test('LinuxDO builder keeps endpoint, response type, client id and state', () => {
    const url = new URL(buildLinuxDOOAuthUrl('ld-client', 'ld-state'))
    assert.equal(
      url.origin + url.pathname,
      'https://connect.linux.do/oauth2/authorize'
    )
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('client_id'), 'ld-client')
    assert.equal(url.searchParams.get('state'), 'ld-state')
  })
})

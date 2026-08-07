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
// ============================================================================
// OAuth URL Builders
// ============================================================================

/**
 * Build GitHub OAuth URL
 */
export function buildGitHubOAuthUrl(clientId: string, state: string): string {
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=user:email`
}

/**
 * Build Discord OAuth URL
 */
export function buildDiscordOAuthUrl(clientId: string, state: string): string {
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set(
    'redirect_uri',
    `${window.location.origin}/oauth/discord`
  )
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify+openid')
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Build Google OAuth URL
 *
 * The redirect URI must be the one served by /api/status
 * (oauth.GoogleRedirectUri() on the backend), never a frontend guess,
 * because Google only accepts the exact authorized redirect URI.
 * All parameters go through URLSearchParams; missing configuration must
 * never start an invalid bind flow, so a whitespace client ID or state,
 * and any redirect URI that is not an absolute http(s) URL, throw.
 */
export function buildGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const trimmedClientId = clientId?.trim() ?? ''
  const trimmedState = state?.trim() ?? ''
  if (!trimmedClientId || !trimmedState) {
    throw new Error('Google OAuth configuration is incomplete')
  }
  let redirect: URL
  try {
    redirect = new URL(redirectUri)
  } catch {
    throw new Error('Google OAuth redirect URI is invalid')
  }
  if (redirect.protocol !== 'http:' && redirect.protocol !== 'https:') {
    throw new Error('Google OAuth redirect URI must be an absolute http(s) URL')
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', trimmedClientId)
  url.searchParams.set('redirect_uri', redirect.href)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', trimmedState)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/**
 * Validate the Google account-binding configuration served by /api/status.
 *
 * The popup bind protocol depends on the popup and the OAuth callback page
 * sharing the *frontend* origin: the popup stamps its own sessionStorage
 * before leaving for Google, and the callback page reads that same storage
 * and posts its result back with a strict same-origin postMessage. The
 * redirect URI therefore must be an absolute http(s) URL whose origin equals
 * the running app origin and whose path is a supported callback route; any
 * relative path, cross-origin URL, or non-http(s) scheme (javascript:,
 * data:, ...) is unusable and must hide the binding entry rather than be
 * "fixed up" client-side.
 *
 * Validity is judged against the caller-provided appOrigin
 * (window.location.origin), never against a hard-coded production domain: if
 * the API moves to a different host, GoogleRedirectUri must still point at
 * the frontend callback origin for binding to remain available.
 *
 * Returns the usable configuration, or null when the binding entry must not
 * be offered.
 */
export interface GoogleBindingConfiguration {
  clientId: string
  redirectUri: string
}

export function resolveGoogleBindingConfiguration(
  clientId: string | undefined,
  redirectUri: string | undefined,
  appOrigin: string
): GoogleBindingConfiguration | null {
  if (!clientId || !redirectUri || !appOrigin) {
    return null
  }
  const trimmedClientId = clientId.trim()
  if (!trimmedClientId) {
    return null
  }
  let redirect: URL
  try {
    redirect = new URL(redirectUri)
  } catch {
    // Relative URLs throw without a base: exactly the signal we want.
    return null
  }
  if (redirect.protocol !== 'http:' && redirect.protocol !== 'https:') {
    return null
  }
  if (redirect.origin !== appOrigin) {
    return null
  }
  // The live SPA callback route, plus the backend legacy shim which forwards
  // to it. Both land on the same frontend origin.
  if (
    redirect.pathname !== '/oauth/google' &&
    redirect.pathname !== '/api/oauth/google/callback'
  ) {
    return null
  }
  return { clientId: trimmedClientId, redirectUri: redirect.href }
}

/**
 * Build OIDC OAuth URL
 */
export function buildOIDCOAuthUrl(
  authUrl: string,
  clientId: string,
  state: string
): string {
  const url = new URL(authUrl)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${window.location.origin}/oauth/oidc`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Build LinuxDO OAuth URL
 */
export function buildLinuxDOOAuthUrl(clientId: string, state: string): string {
  return `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${clientId}&state=${state}`
}

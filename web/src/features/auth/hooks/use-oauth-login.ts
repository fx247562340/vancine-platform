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
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { clearAuthentication } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import { createOAuthAuthorization, createOAuthFlow, logout } from '../api'
import {
  buildGitHubOAuthUrl,
  buildDiscordOAuthUrl,
  buildOIDCOAuthUrl,
  buildLinuxDOOAuthUrl,
  buildGoogleOAuthLoginUrl,
} from '../lib/oauth'
import { rememberOAuthLoginRedirect } from '../lib/oauth-callback-mode'
import type { SystemStatus, CustomOAuthProviderInfo } from '../types'

export type UseOAuthLoginOptions = {
  /**
   * Optional register-page-only callback, invoked (and awaited) after the
   * OAuth prerequisites succeed and before the browser leaves the page, so
   * first-party signup_started can settle. The shared hook never hardcodes
   * acquisition: the sign-in page simply does not pass this.
   */
  onBeforeOAuthRedirect?: () => void | Promise<void>
}

/**
 * Hook for managing OAuth login
 */
export function useOAuthLogin(
  status: SystemStatus | null,
  redirectTo?: string,
  options?: UseOAuthLoginOptions
) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [githubButtonText, setGithubButtonText] = useState('')
  const [githubButtonDisabled, setGithubButtonDisabled] = useState(false)
  const githubTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setGithubButtonText(t('Continue with GitHub'))

    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
    }
  }, [t])

  const resetSession = async () => {
    const response = await logout()
    if (!response.success) {
      throw createServerError(response, t('Failed to sign out session'))
    }
    clearAuthentication()
  }

  const runBeforeOAuthRedirect = async (): Promise<void> => {
    if (!options?.onBeforeOAuthRedirect) return
    try {
      await options.onBeforeOAuthRedirect()
    } catch {
      // soft-fail: attribution must never block the OAuth redirect
    }
  }

  const handleGitHubLogin = async () => {
    if (!status?.github_client_id) return
    if (githubButtonDisabled) return

    setIsLoading(true)
    setGithubButtonDisabled(true)
    setGithubButtonText(t('Redirecting to GitHub...'))

    if (githubTimeoutRef.current) {
      clearTimeout(githubTimeoutRef.current)
    }

    githubTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setGithubButtonText(
        t('Request timed out, please refresh and restart GitHub login')
      )
      setGithubButtonDisabled(true)
    }, 20000)

    try {
      await resetSession()
      const state = await createOAuthFlow('github', 'login')
      rememberOAuthLoginRedirect(state, redirectTo)

      await runBeforeOAuthRedirect()
      const url = buildGitHubOAuthUrl(status.github_client_id, state)
      window.open(url, '_self')
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to start GitHub login'))
      )
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
      setIsLoading(false)
      setGithubButtonText(t('Continue with GitHub'))
      setGithubButtonDisabled(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      await resetSession()
      // Google uses a backend-driven authorization-code flow: the server
      // generates the CSRF state itself (an auth_flows token) and redirects
      // the browser to Google, so there is no client-side state or authorize
      // URL to build here.
      await runBeforeOAuthRedirect()
      window.location.href = buildGoogleOAuthLoginUrl('/dashboard')
    } catch {
      toast.error(t('Failed to start Google login'))
      setIsLoading(false)
    }
  }

  const handleDiscordLogin = async () => {
    if (!status?.discord_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow('discord', 'login')
      rememberOAuthLoginRedirect(state, redirectTo)

      await runBeforeOAuthRedirect()
      const url = buildDiscordOAuthUrl(status.discord_client_id, state)
      window.open(url, '_self')
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to start Discord login'))
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleOIDCLogin = async () => {
    if (!status?.oidc_authorization_endpoint || !status?.oidc_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow('oidc', 'login')
      rememberOAuthLoginRedirect(state, redirectTo)

      await runBeforeOAuthRedirect()
      const url = buildOIDCOAuthUrl(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        state
      )
      window.open(url, '_self')
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to start OIDC login'))
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinuxDOLogin = async () => {
    if (!status?.linuxdo_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow('linuxdo', 'login')
      rememberOAuthLoginRedirect(state, redirectTo)

      await runBeforeOAuthRedirect()
      const url = buildLinuxDOOAuthUrl(status.linuxdo_client_id, state)
      window.open(url, '_self')
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to start LinuxDO login'))
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleTelegramLogin = async () => {
    if (!status?.telegram_oauth_configured) {
      toast.error(
        t(
          'Telegram OAuth is not configured or enabled. Please contact your administrator.'
        )
      )
      return
    }
    setIsLoading(true)
    try {
      const authorization = await createOAuthAuthorization('telegram', 'login')
      if (!authorization.authorizationUrl) {
        throw new AuthOperationError('Failed to initialize OAuth')
      }
      await resetSession()
      rememberOAuthLoginRedirect(authorization.state, redirectTo)
      // Vancine acquisition parity: every outbound OAuth redirect settles the
      // first-party signup_started touch first. Soft-fails, never blocks.
      await runBeforeOAuthRedirect()
      window.open(authorization.authorizationUrl, '_self')
    } catch (error) {
      handleServerError(AuthOperationError.from(error))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCustomOAuthLogin = async (provider: CustomOAuthProviderInfo) => {
    if (!provider.authorization_endpoint || !provider.client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow(provider.slug, 'login')
      rememberOAuthLoginRedirect(state, redirectTo)

      await runBeforeOAuthRedirect()
      const redirectUri = `${window.location.origin}/oauth/${provider.slug}`
      const url = new URL(provider.authorization_endpoint)
      url.searchParams.set('client_id', provider.client_id)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', state)
      if (provider.scopes) {
        url.searchParams.set('scope', provider.scopes)
      }

      window.open(url.toString(), '_self')
    } catch (error) {
      handleServerError(
        AuthOperationError.from(
          error,
          t('Failed to start {{provider}} login', { provider: provider.name })
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    githubButtonText,
    githubButtonDisabled,
    handleGitHubLogin,
    handleGoogleLogin,
    handleDiscordLogin,
    handleOIDCLogin,
    handleLinuxDOLogin,
    handleTelegramLogin,
    handleCustomOAuthLogin,
  }
}

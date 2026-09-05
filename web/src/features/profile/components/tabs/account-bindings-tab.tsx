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
import GoogleColor from '@lobehub/icons/es/Google/components/Color'
import { Mail, Shield, Send, Link2, Unlink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SiGithub, SiWechat, SiLinux } from 'react-icons/si'
import { toast } from 'sonner'

import { IconDiscord } from '@/assets/brand-icons'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createOAuthFlow } from '@/features/auth/api'
import {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESULT_MESSAGE,
} from '@/features/auth/constants'
import { watchOAuthPopupClosed } from '@/features/auth/lib/oauth-bind-window'
import {
  getOAuthSessionStorage,
  markOAuthBindPopup,
} from '@/features/auth/lib/oauth-callback-mode'
import type { CustomOAuthProviderInfo } from '@/features/auth/types'
import { useDialogs } from '@/hooks/use-dialog'
import { useStatus } from '@/hooks/use-status'
import { api } from '@/lib/api'
import {
  buildDiscordOAuthUrl,
  buildGitHubOAuthUrl,
  buildGoogleOAuthUrl,
  buildLinuxDOOAuthUrl,
  buildOIDCOAuthUrl,
  resolveGoogleBindingConfiguration,
  type CustomOAuthBinding,
} from '@/lib/oauth'

import {
  getSelfOAuthBindings,
  unbindCustomOAuth,
  unbindGoogleSelf,
} from '../../api'
import type { UserProfile, BindingItem } from '../../types'
import { EmailBindDialog } from '../dialogs/email-bind-dialog'
import { TelegramBindDialog } from '../dialogs/telegram-bind-dialog'
import { WeChatBindDialog } from '../dialogs/wechat-bind-dialog'

// ============================================================================
// Account Bindings Tab Component
// ============================================================================

interface AccountBindingsTabProps {
  profile: UserProfile | null
  onUpdate: () => void | Promise<void>
}

type DialogKey = 'email' | 'wechat' | 'telegram'

interface PendingOAuthBinding {
  provider: string
  state: string
  popup: Window
  stopCloseWatcher: () => void
}

interface OAuthBindingCallback {
  type: typeof OAUTH_BIND_CALLBACK_MESSAGE
  provider: string
  state: string
  code?: string
  error?: string
  errorDescription?: string
}

export function AccountBindingsTab({
  profile,
  onUpdate,
}: AccountBindingsTabProps) {
  const { t } = useTranslation()
  const dialogs = useDialogs<DialogKey>()
  const { status, loading } = useStatus()
  const [customBindings, setCustomBindings] = useState<CustomOAuthBinding[]>([])
  const [unbindTarget, setUnbindTarget] = useState<CustomOAuthBinding | null>(
    null
  )
  const [unbinding, setUnbinding] = useState(false)
  const [googleUnbindOpen, setGoogleUnbindOpen] = useState(false)
  const [unbindingGoogle, setUnbindingGoogle] = useState(false)
  const pendingOAuthBinding = useRef<PendingOAuthBinding | null>(null)

  const clearPendingOAuthBinding = useCallback(
    (expected?: PendingOAuthBinding) => {
      const pending = pendingOAuthBinding.current
      if (!pending || (expected && pending !== expected)) return
      pending.stopCloseWatcher()
      pendingOAuthBinding.current = null
    },
    []
  )

  const customProviders = status?.custom_oauth_providers as
    | CustomOAuthProviderInfo[]
    | undefined

  const fetchCustomBindings = useCallback(async () => {
    if (!customProviders || customProviders.length === 0) return
    try {
      const res = await getSelfOAuthBindings()
      if (res.success && res.data) {
        setCustomBindings(res.data)
      }
    } catch {
      // ignore
    }
  }, [customProviders])

  useEffect(() => {
    fetchCustomBindings()
  }, [fetchCustomBindings])

  const handleUnbindCustom = async () => {
    if (!unbindTarget) return
    setUnbinding(true)
    try {
      const res = await unbindCustomOAuth(unbindTarget.provider_id)
      if (res.success) {
        toast.success(
          t('Unbound {{provider}}', {
            provider: unbindTarget.provider_name,
          })
        )
        await fetchCustomBindings()
        onUpdate()
      } else {
        toast.error(res.message || t('Unbind failed'))
      }
    } catch {
      toast.error(t('Unbind failed'))
    } finally {
      setUnbinding(false)
      setUnbindTarget(null)
    }
  }

  // Google self-unbind runs the mutation directly in the confirm handler.
  // Business failures surface the backend message as-is (the request skips the
  // global duplicate toast); on failure the binding is left untouched and no
  // refresh happens. On success the profile refresh is awaited before the
  // dialog closes and the success toast shows.
  const handleUnbindGoogle = async () => {
    if (unbindingGoogle) return
    setUnbindingGoogle(true)
    try {
      const res = await unbindGoogleSelf()
      if (res.success) {
        await onUpdate()
        setGoogleUnbindOpen(false)
        toast.success(t('Unbound {{provider}}', { provider: t('Google') }))
      } else {
        toast.error(res.message || t('Unbind failed'))
      }
    } catch (error) {
      const backendMessage = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message
      toast.error(backendMessage || t('Unbind failed'))
    } finally {
      setUnbindingGoogle(false)
    }
  }

  const startOAuthBinding = useCallback(
    async (provider: string, buildUrl: (state: string) => string) => {
      const previous = pendingOAuthBinding.current
      if (previous) {
        clearPendingOAuthBinding(previous)
        if (!previous.popup.closed) previous.popup.close()
      }

      const popup = window.open('', '_blank')
      if (!popup) {
        toast.error(t('OAuth pop-up was blocked'))
        return
      }
      const pending: PendingOAuthBinding = {
        provider,
        state: '',
        popup,
        stopCloseWatcher: () => undefined,
      }
      pending.stopCloseWatcher = watchOAuthPopupClosed(popup, () =>
        clearPendingOAuthBinding(pending)
      )
      pendingOAuthBinding.current = pending
      try {
        const state = await createOAuthFlow(provider, 'bind')
        if (pendingOAuthBinding.current !== pending || popup.closed) return
        // Stamp the popup while it is still same-origin (about:blank). Tying
        // the mark to this state prevents a stale popup from claiming a later
        // login callback. If storage is blocked, do not navigate into a
        // callback that cannot safely identify the bind flow.
        if (
          !markOAuthBindPopup(getOAuthSessionStorage(popup), provider, state)
        ) {
          throw new Error('OAuth bind popup storage is unavailable')
        }
        pending.state = state
        popup.location.replace(buildUrl(state))
      } catch {
        const isCurrent = pendingOAuthBinding.current === pending
        clearPendingOAuthBinding(pending)
        popup.close()
        if (isCurrent) toast.error(t('Failed to initialize OAuth'))
      }
    },
    [clearPendingOAuthBinding, t]
  )

  const handleBindCustomOAuth = async (provider: CustomOAuthProviderInfo) => {
    await startOAuthBinding(provider.slug, (state) => {
      const redirectUri = `${window.location.origin}/oauth/${provider.slug}`
      const url = new URL(provider.authorization_endpoint)
      url.searchParams.set('client_id', provider.client_id)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', state)
      if (provider.scopes) url.searchParams.set('scope', provider.scopes)
      return url.toString()
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleMessage = async (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as Partial<OAuthBindingCallback> | null
      const pending = pendingOAuthBinding.current
      if (
        !message ||
        message.type !== OAUTH_BIND_CALLBACK_MESSAGE ||
        !pending ||
        message.provider !== pending.provider ||
        message.state !== pending.state ||
        event.source !== pending.popup
      ) {
        return
      }

      clearPendingOAuthBinding(pending)
      let success = false
      let resultMessage = t('OAuth failed')
      try {
        if (!message.code && !message.error) {
          throw new Error(t('Missing code'))
        }
        const params: Record<string, string> = { state: message.state }
        if (message.code) params.code = message.code
        if (message.error) params.error = message.error
        if (message.errorDescription) {
          params.error_description = message.errorDescription
        }
        const response = await api.get(`/api/oauth/${message.provider}`, {
          params,
          skipBusinessError: true,
        })
        success = Boolean(response.data?.success)
        resultMessage = response.data?.message || resultMessage
        if (success) {
          toast.success(t('Binding successful!'))
          onUpdate()
          await fetchCustomBindings()
        } else {
          toast.error(resultMessage)
        }
      } catch (error: unknown) {
        resultMessage =
          (error as { response?: { data?: { message?: string } } }).response
            ?.data?.message ||
          (error instanceof Error ? error.message : resultMessage)
        toast.error(resultMessage)
      }

      pending.popup.postMessage(
        {
          type: OAUTH_BIND_RESULT_MESSAGE,
          provider: message.provider,
          state: message.state,
          success,
          message: resultMessage,
        },
        window.location.origin
      )
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [clearPendingOAuthBinding, fetchCustomBindings, onUpdate, t])

  useEffect(
    () => () => {
      const pending = pendingOAuthBinding.current
      clearPendingOAuthBinding(pending ?? undefined)
      if (pending && !pending.popup.closed) pending.popup.close()
    },
    [clearPendingOAuthBinding]
  )

  // Memoize bindings to prevent unnecessary recalculations
  const bindings: BindingItem[] = useMemo(() => {
    if (!profile || !status) return []

    // The Google bind popup and the /oauth/google callback must share this
    // window's origin (sessionStorage stamp + same-origin postMessage), so
    // the entry only exists when Google OAuth is switched on AND the
    // status-served redirect URI is a same-origin absolute http(s) callback
    // URL with a supported path.
    const googleBinding =
      status.google_oauth === true
        ? resolveGoogleBindingConfiguration(
            status.google_client_id,
            status.google_redirect_uri,
            window.location.origin
          )
        : null

    return [
      {
        id: 'email',
        label: t('Email'),
        icon: Mail,
        value: profile.email,
        isBound: Boolean(profile.email),
        isEnabled: true,
        onBind: () => dialogs.open('email'),
      },
      {
        id: 'wechat',
        label: t('WeChat'),
        icon: SiWechat as React.ComponentType<{ className?: string }>,
        value: undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).wechat_id
        ),
        isEnabled: status?.wechat_login || false,
        onBind: () => dialogs.open('wechat'),
      },
      {
        id: 'github',
        label: t('GitHub'),
        icon: SiGithub,
        value: (profile as unknown as Record<string, unknown>).github_id as
          | string
          | undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).github_id
        ),
        isEnabled: status?.github_oauth || false,
        onBind: () => {
          const clientId = status?.github_client_id
          if (clientId) {
            void startOAuthBinding('github', (state) =>
              buildGitHubOAuthUrl(clientId, state)
            )
          }
        },
      },
      {
        id: 'google',
        label: t('Google'),
        icon: (props: { className?: string }) => (
          <GoogleColor size={16} className={props.className} />
        ),
        // google_sub is a sensitive identifier: it only determines the bound
        // state and is never exposed as a displayable value (same semantic as
        // the admin user-binding dialog's hideValue binding). The raw value
        // must not reach textContent, innerHTML, aria-label or title.
        value: undefined,
        isBound: Boolean(profile.google_sub),
        isEnabled: googleBinding !== null,
        onBind: () => {
          if (googleBinding) {
            void startOAuthBinding('google', (state) =>
              buildGoogleOAuthUrl(
                googleBinding.clientId,
                googleBinding.redirectUri,
                state
              )
            )
          }
        },
      },
      {
        id: 'discord',
        label: t('Discord'),
        icon: IconDiscord,
        value: (profile as unknown as Record<string, unknown>).discord_id as
          | string
          | undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).discord_id
        ),
        isEnabled: status?.discord_oauth || false,
        onBind: () => {
          const clientId = status?.discord_client_id
          if (clientId) {
            void startOAuthBinding('discord', (state) =>
              buildDiscordOAuthUrl(clientId, state)
            )
          }
        },
      },
      {
        id: 'oidc',
        label: t('OIDC'),
        icon: Shield,
        value: (profile as unknown as Record<string, unknown>).oidc_id as
          | string
          | undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).oidc_id
        ),
        isEnabled: status?.oidc_enabled || false,
        onBind: () => {
          const authorizationEndpoint = status?.oidc_authorization_endpoint
          const clientId = status?.oidc_client_id
          if (authorizationEndpoint && clientId) {
            void startOAuthBinding('oidc', (state) =>
              buildOIDCOAuthUrl(authorizationEndpoint, clientId, state)
            )
          }
        },
      },
      {
        id: 'telegram',
        label: t('Telegram'),
        icon: Send,
        value: (profile as unknown as Record<string, unknown>).telegram_id as
          | string
          | undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).telegram_id
        ),
        isEnabled: status?.telegram_oauth || false,
        onBind: () => dialogs.open('telegram'),
      },
      {
        id: 'linuxdo',
        label: t('LinuxDO'),
        icon: SiLinux as React.ComponentType<{ className?: string }>,
        value: (profile as unknown as Record<string, unknown>).linux_do_id as
          | string
          | undefined,
        isBound: Boolean(
          (profile as unknown as Record<string, unknown>).linux_do_id
        ),
        isEnabled: status?.linuxdo_oauth || false,
        onBind: () => {
          const clientId = status?.linuxdo_client_id
          if (clientId) {
            void startOAuthBinding('linuxdo', (state) =>
              buildLinuxDOOAuthUrl(clientId, state)
            )
          }
        },
      },
    ].filter(
      (binding) =>
        binding.isEnabled || (binding.id === 'google' && binding.isBound)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, status, t])

  if (!profile || loading) return null

  return (
    <>
      <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3'>
        {bindings.map((binding) => {
          const isGoogleBound = binding.id === 'google' && binding.isBound
          let actionLabel = t('Bind')
          let isActionDisabled = binding.isBound && binding.id !== 'email'
          let handleAction = binding.onBind
          if (binding.isBound && binding.id === 'email') {
            actionLabel = t('Change')
            isActionDisabled = false
          } else if (isGoogleBound) {
            // A bound Google account always exposes an unbind action, even
            // when Google OAuth is currently switched off or misconfigured:
            // the durable binding can still be managed.
            actionLabel = t('Unbind')
            isActionDisabled = false
            handleAction = () => setGoogleUnbindOpen(true)
          } else if (binding.isBound) {
            actionLabel = t('Bound')
          }

          return (
            <div
              key={binding.id}
              className='flex items-center justify-between gap-2.5 rounded-lg border p-2.5 sm:gap-3 sm:p-3'
            >
              <div className='flex min-w-0 items-center gap-2.5 sm:gap-3'>
                <div className='bg-muted shrink-0 rounded-md p-1.5 sm:p-2'>
                  <binding.icon className='h-4 w-4' />
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-1.5'>
                    <p className='text-sm font-medium'>{binding.label}</p>
                    {binding.isBound && (
                      <StatusBadge
                        label={t('Bound')}
                        variant='success'
                        copyable={false}
                      />
                    )}
                  </div>
                  <p className='text-muted-foreground truncate text-xs'>
                    {binding.isBound
                      ? binding.value || t('Bound')
                      : t('Not bound')}
                  </p>
                </div>
              </div>
              <Button
                variant={isGoogleBound ? 'ghost' : 'outline'}
                size='sm'
                className={
                  isGoogleBound
                    ? 'text-destructive h-7 shrink-0 px-2.5 text-xs'
                    : 'h-7 shrink-0 px-2.5 text-xs'
                }
                onClick={handleAction}
                disabled={isActionDisabled}
                aria-label={`${actionLabel} ${binding.label}`}
              >
                {actionLabel}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Custom OAuth Bindings */}
      {customProviders && customProviders.length > 0 && (
        <>
          <Separator className='my-4' />
          <p className='text-muted-foreground mb-3 text-sm font-medium'>
            {t('Custom OAuth')}
          </p>
          <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3'>
            {customProviders.map((provider) => {
              const binding = customBindings.find(
                (b) => b.provider_id === provider.id
              )
              const isBound = !!binding
              return (
                <div
                  key={provider.id}
                  className='flex items-center justify-between gap-2.5 rounded-lg border p-2.5 sm:gap-3 sm:p-3'
                >
                  <div className='flex min-w-0 items-center gap-2.5 sm:gap-3'>
                    <div className='bg-muted shrink-0 rounded-md p-1.5 sm:p-2'>
                      <Link2 className='h-4 w-4' />
                    </div>
                    <div className='min-w-0'>
                      <div className='flex items-center gap-1.5'>
                        <p className='text-sm font-medium'>{provider.name}</p>
                        {isBound && (
                          <StatusBadge
                            label={t('Bound')}
                            variant='success'
                            copyable={false}
                          />
                        )}
                      </div>
                      <p className='text-muted-foreground truncate text-xs'>
                        {isBound
                          ? binding?.provider_user_id || t('Bound')
                          : t('Not bound')}
                      </p>
                    </div>
                  </div>
                  {isBound ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive h-7 shrink-0 px-2.5 text-xs'
                      onClick={() => setUnbindTarget(binding)}
                    >
                      <Unlink className='mr-1 h-3 w-3' />
                      {t('Unbind')}
                    </Button>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-7 shrink-0 px-2.5 text-xs'
                      onClick={() => handleBindCustomOAuth(provider)}
                    >
                      {t('Bind')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Custom OAuth Unbind Confirmation */}
      <ConfirmDialog
        open={!!unbindTarget}
        onOpenChange={(open) => !open && setUnbindTarget(null)}
        title={t('Confirm Unbind')}
        desc={t(
          'Are you sure you want to unbind {{provider}}? You will no longer be able to log in via this method.',
          {
            provider: unbindTarget?.provider_name || '',
          }
        )}
        confirmText={t('Confirm Unbind')}
        destructive
        handleConfirm={handleUnbindCustom}
        isLoading={unbinding}
      />

      {/* Google Self-Unbind Confirmation */}
      <ConfirmDialog
        open={googleUnbindOpen}
        onOpenChange={(open) => !open && setGoogleUnbindOpen(false)}
        title={t('Confirm Unbind')}
        desc={t(
          'Are you sure you want to unbind Google? After unbinding, you will no longer be able to sign in with Google. The system only allows unbinding when you still have another usable sign-in method.'
        )}
        confirmText={t('Confirm Unbind')}
        destructive
        handleConfirm={handleUnbindGoogle}
        isLoading={unbindingGoogle}
      />

      {/* Email Bind Dialog */}
      <EmailBindDialog
        open={dialogs.isOpen('email')}
        onOpenChange={(open) =>
          open ? dialogs.open('email') : dialogs.close('email')
        }
        currentEmail={profile.email}
        onSuccess={onUpdate}
      />

      {/* WeChat Bind Dialog */}
      <WeChatBindDialog
        open={dialogs.isOpen('wechat')}
        qrCodeUrl={
          typeof status?.wechat_qrcode === 'string' ? status.wechat_qrcode : ''
        }
        onOpenChange={(open) =>
          open ? dialogs.open('wechat') : dialogs.close('wechat')
        }
        onSuccess={onUpdate}
      />

      {/* Telegram Bind Dialog */}
      {status?.telegram_bot_name && (
        <TelegramBindDialog
          open={dialogs.isOpen('telegram')}
          onOpenChange={(open) =>
            open ? dialogs.open('telegram') : dialogs.close('telegram')
          }
          botName={status.telegram_bot_name as string}
          onSuccess={onUpdate}
        />
      )}
    </>
  )
}

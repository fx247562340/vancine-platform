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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Behavior tests: OAuthProviders renders the Telegram widget only when
// telegram_oauth + bot name + a handler are present, wires the widget callback
// to onTelegramAuth, and no longer surfaces the "coming soon" stub — while the
// existing GitHub/Discord paths stay intact.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemStatus } from '../types'
import { OAuthProviders } from './oauth-providers'

type WindowWithCallback = Window & Record<string, unknown>

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

afterEach(() => cleanup())

function statusWith(overrides: Record<string, unknown>): SystemStatus {
  return { ...overrides } as SystemStatus
}

function telegramScript(container: HTMLElement): HTMLScriptElement | null {
  return container.querySelector('script[data-telegram-login]')
}

describe('OAuthProviders — Telegram widget', () => {
  it('renders nothing when no providers are enabled', () => {
    const { container } = render(
      <OAuthProviders status={statusWith({})} onTelegramAuth={vi.fn()} />
    )
    expect(container.textContent).toBe('')
    expect(telegramScript(container)).toBeNull()
  })

  it('does not render Telegram when telegram_oauth is false', () => {
    const { container } = render(
      <OAuthProviders
        status={statusWith({
          telegram_oauth: false,
          telegram_bot_name: 'vancine_bot',
        })}
        onTelegramAuth={vi.fn()}
      />
    )
    expect(telegramScript(container)).toBeNull()
  })

  it('does not render Telegram when the bot name is missing', () => {
    const { container } = render(
      <OAuthProviders
        status={statusWith({ telegram_oauth: true })}
        onTelegramAuth={vi.fn()}
      />
    )
    expect(telegramScript(container)).toBeNull()
  })

  it('renders the widget when telegram_oauth + bot name + handler are present', () => {
    const { container } = render(
      <OAuthProviders
        status={statusWith({
          telegram_oauth: true,
          telegram_bot_name: 'vancine_bot',
        })}
        onTelegramAuth={vi.fn()}
      />
    )
    const script = telegramScript(container)
    expect(script).not.toBeNull()
    expect(script!.getAttribute('data-telegram-login')).toBe('vancine_bot')
  })

  it('wires the widget callback to onTelegramAuth with the payload', () => {
    const onTelegramAuth = vi.fn()
    const { container } = render(
      <OAuthProviders
        status={statusWith({
          telegram_oauth: true,
          telegram_bot_name: 'vancine_bot',
        })}
        onTelegramAuth={onTelegramAuth}
      />
    )
    const script = telegramScript(container)!
    const callbackName = script
      .getAttribute('data-onauth')!
      .replace('(user)', '')
    const handler = (window as unknown as WindowWithCallback)[callbackName] as (
      u: unknown
    ) => void
    handler({ id: 7, hash: 'h' })
    expect(onTelegramAuth).toHaveBeenCalledWith({ id: 7, hash: 'h' })
  })

  it('no longer renders the "coming soon" Telegram stub', () => {
    const { container } = render(
      <OAuthProviders
        status={statusWith({
          telegram_oauth: true,
          telegram_bot_name: 'vancine_bot',
        })}
        onTelegramAuth={vi.fn()}
      />
    )
    expect(container.textContent).not.toContain('coming soon')
    expect(container.textContent).not.toContain('Continue with Telegram')
  })

  it('still renders the GitHub button (no regression)', () => {
    const { container } = render(
      <OAuthProviders
        status={statusWith({ github_oauth: true, github_client_id: 'cid' })}
        onTelegramAuth={vi.fn()}
      />
    )
    expect(container.textContent).toContain('Continue with GitHub')
    expect(telegramScript(container)).toBeNull()
  })
})

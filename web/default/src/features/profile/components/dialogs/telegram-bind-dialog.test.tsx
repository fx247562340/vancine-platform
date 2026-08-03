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
// Behavior test for the Telegram bind dialog. Binding uses the widget in
// redirect mode (data-auth-url), matching the Classic theme's
// dataAuthUrl='/api/oauth/telegram/bind'. Authorizing navigates the browser to
// that endpoint; the backend binds the account and 302-redirects to /profile,
// which is a full page load — so the refreshed binding is picked up there.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramBindDialog } from './telegram-bind-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => cleanup())

function renderDialog(open = true) {
  return render(
    <TelegramBindDialog
      open={open}
      onOpenChange={vi.fn()}
      botName='vancine_bot'
      onSuccess={vi.fn()}
    />
  )
}

function bindScript(baseElement: HTMLElement): HTMLScriptElement | null {
  return baseElement.querySelector('script[data-telegram-login]')
}

describe('TelegramBindDialog', () => {
  it('renders the widget in redirect mode pointing at the bind endpoint', () => {
    const { baseElement } = renderDialog()
    const script = bindScript(baseElement)
    expect(script).not.toBeNull()
    expect(script!.getAttribute('data-telegram-login')).toBe('vancine_bot')
    expect(script!.getAttribute('data-auth-url')).toBe(
      '/api/oauth/telegram/bind'
    )
    // Redirect mode must not register a JS callback.
    expect(script!.hasAttribute('data-onauth')).toBe(false)
  })

  it('shows the configured bot name', () => {
    const { baseElement } = renderDialog()
    expect(baseElement.textContent).toContain('@vancine_bot')
  })

  it('renders no widget while closed', () => {
    const { baseElement } = renderDialog(false)
    expect(bindScript(baseElement)).toBeNull()
  })
})

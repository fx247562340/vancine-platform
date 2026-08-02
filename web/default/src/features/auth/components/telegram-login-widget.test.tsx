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
// Behavior tests for the Telegram Login Widget wrapper. jsdom does not execute
// the injected telegram.org script, so we assert on the script tag contract
// (data-* attributes) and drive the registered global callback directly — the
// same surface Telegram's widget uses.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TelegramAuthPayload } from '../lib/telegram'
import { TelegramLoginWidget } from './telegram-login-widget'

type WindowWithCallback = Window & Record<string, unknown>

afterEach(() => cleanup())

function getScript(container: HTMLElement): HTMLScriptElement {
  const script = container.querySelector('script')
  expect(script).not.toBeNull()
  return script as HTMLScriptElement
}

function callbackNameOf(script: HTMLScriptElement): string {
  const attr = script.getAttribute('data-onauth')
  expect(attr).toBeTruthy()
  return attr!.replace('(user)', '')
}

describe('TelegramLoginWidget', () => {
  it('injects the telegram.org script with the bot name', () => {
    const { container } = render(<TelegramLoginWidget botName='mybot' />)
    const script = getScript(container)
    expect(script.src).toContain('telegram.org/js/telegram-widget.js')
    expect(script.getAttribute('data-telegram-login')).toBe('mybot')
    expect(script.getAttribute('data-request-access')).toBe('write')
  })

  it('callback mode registers a global handler and forwards the payload to onAuth', () => {
    const onAuth = vi.fn()
    const { container } = render(
      <TelegramLoginWidget botName='mybot' onAuth={onAuth} />
    )
    const script = getScript(container)
    expect(script.hasAttribute('data-auth-url')).toBe(false)

    const callbackName = callbackNameOf(script)
    const handler = (window as unknown as WindowWithCallback)[callbackName]
    expect(typeof handler).toBe('function')

    const payload: TelegramAuthPayload = { id: 42, username: 'neo', hash: 'h' }
    ;(handler as (u: TelegramAuthPayload) => void)(payload)
    expect(onAuth).toHaveBeenCalledTimes(1)
    expect(onAuth).toHaveBeenCalledWith(payload)
  })

  it('gives each mounted widget a distinct callback (no singleton clobber)', () => {
    const onAuthA = vi.fn()
    const onAuthB = vi.fn()
    const first = render(
      <TelegramLoginWidget botName='botA' onAuth={onAuthA} />
    )
    const second = render(
      <TelegramLoginWidget botName='botB' onAuth={onAuthB} />
    )

    const nameA = callbackNameOf(getScript(first.container))
    const nameB = callbackNameOf(getScript(second.container))
    expect(nameA).not.toBe(nameB)

    const handlerB = (window as unknown as WindowWithCallback)[nameB] as (
      u: TelegramAuthPayload
    ) => void
    handlerB({ id: 2 })
    expect(onAuthB).toHaveBeenCalled()
    expect(onAuthA).not.toHaveBeenCalled()
  })

  it('redirect (bind) mode sets data-auth-url and registers no callback', () => {
    const { container } = render(
      <TelegramLoginWidget botName='mybot' authUrl='/api/oauth/telegram/bind' />
    )
    const script = getScript(container)
    expect(script.getAttribute('data-auth-url')).toBe(
      '/api/oauth/telegram/bind'
    )
    expect(script.hasAttribute('data-onauth')).toBe(false)
  })

  it('cleans up the injected script and global callback on unmount', () => {
    const onAuth = vi.fn()
    const { container, unmount } = render(
      <TelegramLoginWidget botName='mybot' onAuth={onAuth} />
    )
    const callbackName = callbackNameOf(getScript(container))
    expect(
      (window as unknown as WindowWithCallback)[callbackName]
    ).toBeDefined()

    unmount()

    expect(container.querySelector('script')).toBeNull()
    expect(
      (window as unknown as WindowWithCallback)[callbackName]
    ).toBeUndefined()
  })

  it('renders nothing without a bot name', () => {
    const { container } = render(<TelegramLoginWidget botName='' />)
    expect(container.querySelector('script')).toBeNull()
  })
})

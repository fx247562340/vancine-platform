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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { renderToString } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatWebFrame } from '../chat-web-frame'

// Distinctive translation for the Chat key proves the title goes through t().
const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: { translation: { Chat: 'Talk', 'Open in new tab': 'Open in new tab' } },
  },
})

// The page origin comes from the live jsdom environment instead of a
// hardcoded URL literal.
const PAGE_ORIGIN = window.location.origin

const EXPECTED_SANDBOX_TOKENS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-downloads',
  'allow-presentation',
].sort()

function renderFrame(url: string, presetName = 'Web Chat') {
  return render(
    <I18nextProvider i18n={i18n}>
      <ChatWebFrame url={url} presetName={presetName} />
    </I18nextProvider>
  )
}

function iframe() {
  return document.querySelector('iframe') as HTMLIFrameElement | null
}

function sandboxTokens(): string[] {
  const sandbox = iframe()?.getAttribute('sandbox') ?? ''
  return sandbox.split(/\s+/).filter((token) => token !== '')
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('ChatWebFrame security matrix', () => {
  it('embeds a cross-origin chat URL in an iframe with exactly the approved sandbox policy', () => {
    renderFrame('https://chat.example.com/?model=gpt-4o')

    const frame = iframe()
    expect(frame).not.toBeNull()
    expect(frame).toHaveAttribute(
      'src',
      'https://chat.example.com/?model=gpt-4o'
    )
    // Precise policy: exactly the approved eight tokens, no duplicates, no
    // extra capabilities (e.g. top-navigation) sneaking in.
    const tokens = sandboxTokens()
    expect(tokens).toHaveLength(8)
    expect(new Set(tokens).size).toBe(8)
    expect(tokens.sort()).toEqual(EXPECTED_SANDBOX_TOKENS)
    expect(tokens).not.toContain('allow-top-navigation')
    expect(tokens).not.toContain('allow-top-navigation-by-user-activation')

    expect(frame).toHaveAttribute('allow', 'camera; microphone')
    // The iframe title is built from the translated Chat key.
    expect(frame).toHaveAttribute('title', 'Talk: Web Chat')
  })

  it('never embeds a same-origin URL and offers a real link with safe attributes', async () => {
    const url = `${PAGE_ORIGIN}/docs`
    renderFrame(url)

    expect(iframe()).toBeNull()
    const openLink = screen.getByRole('link', { name: 'Open in new tab' })
    expect(openLink.tagName).toBe('A')
    expect(openLink).toHaveAttribute('href', url)
    expect(openLink).toHaveAttribute('target', '_blank')
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer')
    // Real anchor semantics: reachable through genuine Tab navigation.
    expect(openLink.tabIndex).toBe(0)
    const user = userEvent.setup()
    await user.tab()
    expect(openLink).toHaveFocus()
  })

  it('judges lookalike hostnames and protocol differences by real origin', () => {
    const { unmount: unmountEvil } = renderFrame(
      'https://localhost.evil.example/chat'
    )
    expect(iframe()).not.toBeNull()
    unmountEvil()

    const { unmount: unmountHttps } = renderFrame('https://localhost:3000/chat')
    expect(iframe()).not.toBeNull()
    unmountHttps()

    renderFrame(`${PAGE_ORIGIN}/chat`)
    expect(iframe()).toBeNull()
  })

  it('fails closed for non-http URLs without rendering an iframe or link', () => {
    const { unmount } = renderFrame('ftp://example.com/chat')
    expect(iframe()).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Unable to open chat')).toBeInTheDocument()
    unmount()

    renderFrame('not-a-url')
    expect(iframe()).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Unable to open chat')).toBeInTheDocument()
  })

  it('fails closed when the browser origin cannot be determined', () => {
    // Simulate SSR / no-window: with the global unavailable the component
    // cannot verify a cross-origin relationship and must not embed anything.
    vi.stubGlobal('window', undefined)
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <ChatWebFrame url='https://chat.example.com/' presetName='Web Chat' />
      </I18nextProvider>
    )

    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<a ')
    expect(html).toContain('Unable to open chat')
  })

  it('fails closed when the parent page has an opaque origin', () => {
    // file:/data: and other opaque-origin pages report a "null" origin; a
    // cross-origin relationship cannot be proven there, so nothing may be
    // embedded and no clickable link may be produced.
    vi.stubGlobal('window', {
      location: { protocol: 'file:', origin: 'null' },
    } as unknown as Window & typeof globalThis)
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <ChatWebFrame url='https://chat.example.com/' presetName='Web Chat' />
      </I18nextProvider>
    )

    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<a ')
    expect(html).toContain('Unable to open chat')
  })
})

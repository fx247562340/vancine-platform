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
import { cleanup, render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import { Stack } from '../stack'

// ---------------------------------------------------------------------------
// IntersectionObserver stub — save/restore original
// ---------------------------------------------------------------------------

class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

let originalIO: PropertyDescriptor | undefined

// ---------------------------------------------------------------------------
// i18n — independent instance, awaited init
// ---------------------------------------------------------------------------

const testI18n = i18n.createInstance()

let i18nReady: Promise<unknown> | null = null

function ensureI18n(): Promise<unknown> {
  if (!i18nReady) {
    i18nReady = testI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: enLocale.translation },
      },
      interpolation: { escapeValue: false },
    })
  }
  return i18nReady
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Save and replace IntersectionObserver
  originalIO = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver'
  )
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  })
  await ensureI18n()
})

afterEach(() => {
  cleanup()
  // Restore IntersectionObserver
  if (originalIO === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    Object.defineProperty(globalThis, 'IntersectionObserver', originalIO)
  }
})

// ---------------------------------------------------------------------------
// Expected card data (frozen product contract)
// ---------------------------------------------------------------------------

const EXPECTED_CARDS = [
  { title: 'OpenCode', qualification: 'Live-verified' },
  { title: 'Cline', qualification: 'Configuration-ready' },
  { title: 'Roo Code', qualification: 'Configuration-ready' },
  { title: 'Claude Code', qualification: 'Configuration-ready' },
  { title: 'OpenAI SDK', qualification: 'Configuration-ready' },
  { title: 'Pi Coding Agent', qualification: 'Configuration-ready' },
] as const

const SECTION_TITLE = 'Works with your stack'
const SECTION_INTRO =
  'Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stack section', () => {
  it('renders the section title and intro', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    expect(
      screen.getByRole('heading', { level: 2, name: SECTION_TITLE })
    ).toBeTruthy()
    expect(screen.getByText(SECTION_INTRO)).toBeTruthy()
  })

  it('renders exactly six cards', async () => {
    const { I18nextProvider } = await import('react-i18next')
    const { container } = render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    const articles = section?.querySelectorAll('article') ?? []
    expect(articles.length).toBe(6)
  })

  it('renders cards in the correct fixed order with correct titles', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.length).toBe(6)
    for (let i = 0; i < EXPECTED_CARDS.length; i++) {
      expect(headings[i].textContent).toBe(EXPECTED_CARDS[i].title)
    }
  })

  it('marks OpenCode as the only Live-verified card', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const liveChips = screen.getAllByText('Live-verified')
    expect(liveChips.length).toBe(1)
    const opencodeHeading = screen.getByRole('heading', {
      level: 3,
      name: 'OpenCode',
    })
    const opencodeCard = opencodeHeading.closest('article')
    expect(opencodeCard).not.toBeNull()
    expect(
      within(opencodeCard as HTMLElement).getByText('Live-verified')
    ).toBeTruthy()
  })

  it('marks all non-OpenCode cards as Configuration-ready', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const configChips = screen.getAllByText('Configuration-ready')
    expect(configChips.length).toBe(5)
  })

  it('never claims Pi is Live-verified', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const piHeading = screen.getByRole('heading', {
      level: 3,
      name: 'Pi Coding Agent',
    })
    const piCard = piHeading.closest('article')
    expect(piCard).not.toBeNull()
    expect(
      within(piCard as HTMLElement).queryByText('Live-verified')
    ).toBeNull()
    expect(
      within(piCard as HTMLElement).getByText('Configuration-ready')
    ).toBeTruthy()
  })

  it('renders Pi body with frozen boundary copy', async () => {
    const { I18nextProvider } = await import('react-i18next')
    render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const piBody =
      "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage."
    expect(screen.getByText(piBody)).toBeTruthy()
  })

  it('does not contain any links inside the section', async () => {
    const { I18nextProvider } = await import('react-i18next')
    const { container } = render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const links = container.querySelectorAll('a, [role="link"]')
    expect(links.length).toBe(0)
  })

  it('static cards have no role=link, tabIndex, or click navigation', async () => {
    const { I18nextProvider } = await import('react-i18next')
    const { container } = render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    const articles = section?.querySelectorAll('article') ?? []
    for (const article of articles) {
      expect(article.getAttribute('role')).not.toBe('link')
      expect(article.getAttribute('tabindex')).toBeNull()
    }
  })

  it('uses responsive grid layout classes', async () => {
    const { I18nextProvider } = await import('react-i18next')
    const { container } = render(
      <I18nextProvider i18n={testI18n}>
        <Stack />
      </I18nextProvider>
    )
    const grid = container.querySelector('.grid')
    expect(grid).not.toBeNull()
    const classes = (grid as HTMLElement).className
    expect(classes).toContain('grid-cols-1')
    expect(classes).toContain('sm:grid-cols-2')
    expect(classes).toContain('lg:grid-cols-3')
  })
})

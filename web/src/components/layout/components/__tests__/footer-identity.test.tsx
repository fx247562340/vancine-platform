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
import { render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Footer } from '@/components/layout/components/footer'
import enLocale from '@/i18n/locales/en.json'

// The NOTICE attribution moved to /about; the footer must never show it.
const UPSTREAM_ATTRIBUTION_TEXT =
  'Frontend design and development by New API contributors.'

// Mutable system-config fixture so each test can pick its render branch.
const systemConfigFixture = {
  systemName: 'Vancine',
  logo: '',
  footerHtml: '',
  demoSiteEnabled: true,
  loading: false,
  logoLoaded: true,
}

// Footer collaborators that would otherwise hit the network: controlled
// boundary mocks; the footer itself (module under test) stays real.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      user_agreement_enabled: false,
      privacy_policy_enabled: false,
    },
    loading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfigFixture,
}))

// The footer only uses Link for the brand row (to='/'). Mock the boundary as
// a plain anchor so the real Footer renders without the router's async mount
// lifecycle; children/to/className are preserved and the anchor is
// user-queryable.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string
    className?: string
    children?: ReactNode
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

// Isolated fixture instance — never touches the shared i18next singleton.
const i18n = i18next.createInstance()

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: enLocale.translation } },
    lng: 'en',
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
})

beforeEach(() => {
  systemConfigFixture.logo = ''
  systemConfigFixture.footerHtml = ''
})

function renderFooter() {
  return render(
    <I18nextProvider i18n={i18n}>
      <Footer />
    </I18nextProvider>
  )
}

describe('Footer fallback columns', () => {
  it('renders the three fallback columns with their links', () => {
    renderFooter()

    // About Us column
    const aboutColumn = screen
      .getByText('About Us')
      .closest('div') as HTMLElement
    const aboutLinks = within(aboutColumn).getAllByRole('link')
    expect(aboutLinks.map((link) => link.textContent)).toEqual([
      'About Project',
      'Contact Us',
      'Features',
    ])

    // Documentation column
    const docsColumn = screen
      .getByText('Documentation')
      .closest('div') as HTMLElement
    const docsLinks = within(docsColumn).getAllByRole('link')
    expect(docsLinks.map((link) => link.textContent)).toEqual([
      'Quick Start',
      'Installation Guide',
      'API Documentation',
    ])

    // Related Projects column
    const relatedColumn = screen
      .getByText('Related Projects')
      .closest('div') as HTMLElement
    const relatedLinks = within(relatedColumn).getAllByRole('link')
    expect(relatedLinks.map((link) => link.textContent)).toEqual([
      'One API',
      'MjProxy',
      'new-api-key-tool',
    ])

    // one-api upstream attribution link target unchanged
    expect(
      relatedColumn.querySelector(
        'a[href="https://github.com/songquanpeng/one-api"]'
      )
    ).not.toBeNull()
  })
})

describe('Footer attribution removal', () => {
  it('does not render the New API attribution in the default branch', () => {
    const { container } = renderFooter()

    expect(
      screen.queryByText(UPSTREAM_ATTRIBUTION_TEXT)
    ).toBeNull()
    expect(container.textContent).not.toContain('New API contributors')
    // No link to the upstream repo anywhere in the footer.
    expect(
      container.querySelector(
        'a[href="https://github.com/QuantumNous/new-api"]'
      )
    ).toBeNull()
  })

  it('does not render the New API attribution in the custom HTML branch', () => {
    systemConfigFixture.footerHtml = '<span>Custom footer content</span>'
    const { container } = renderFooter()

    expect(screen.getByText('Custom footer content')).toBeDefined()
    expect(
      screen.queryByText(UPSTREAM_ATTRIBUTION_TEXT)
    ).toBeNull()
    expect(container.textContent).not.toContain('New API contributors')
    expect(
      container.querySelector(
        'a[href="https://github.com/QuantumNous/new-api"]'
      )
    ).toBeNull()
  })
})

describe('Footer brand logo', () => {
  it('falls back to the Vancine /logo.png when no dynamic logo is set', () => {
    renderFooter()
    const logo = screen.getByRole('img', { name: 'Vancine' })
    expect(logo).toHaveAttribute('src', '/logo.png')
  })

  it('keeps the dynamic System Logo priority when configured', () => {
    systemConfigFixture.logo = 'https://cdn.example.com/custom.png'
    renderFooter()
    const logo = screen.getByRole('img', { name: 'Vancine' })
    expect(logo).toHaveAttribute('src', 'https://cdn.example.com/custom.png')
  })
})

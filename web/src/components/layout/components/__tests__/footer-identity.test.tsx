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
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Footer } from '@/components/layout/components/footer'
import enLocale from '@/i18n/locales/en.json'

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
  useSystemConfig: () => ({
    systemName: 'Vancine',
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
    footerHtml: '',
    demoSiteEnabled: true,
  }),
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

function renderFooter() {
  render(
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

  it('shows the complete upstream attribution text as the link to the upstream repo', () => {
    renderFooter()

    // The full NOTICE-mandated sentence is visible verbatim and is the
    // accessible name of the link to the upstream repository.
    const attributionLink = screen.getByRole('link', {
      name: 'Frontend design and development by New API contributors.',
    })
    expect(attributionLink).toHaveAttribute(
      'href',
      'https://github.com/QuantumNous/new-api'
    )
    expect(attributionLink.textContent).toBe(
      'Frontend design and development by New API contributors.'
    )
  })
})

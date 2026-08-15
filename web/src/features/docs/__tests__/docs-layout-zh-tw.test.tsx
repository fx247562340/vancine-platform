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
import { act, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
// REAL Docs component i18n test: renders the actual DocsLayout + DocsSidebar +
// the real PAGE_REGISTRY quickstart page (no Probe / self-built spans), starts
// in Simplified Chinese, switches to zh-TW, and asserts the real navigation
// link, real page title and real body paragraph all become Traditional — and
// never Simplified / English / raw key / fallback.
//
// Queries use findByRole / waitFor against real roles (heading, link) — no
// fixed timers and no DOM-id coupling.
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsLayout } from '../index'
import { initTestI18n } from './test-i18n'
import { renderWithProviders } from './test-utils'

// Isolate the Docs layout from the full site header/footer (same as
// layout.test.tsx).
vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

// Avoid the real /api/status network request in jsdom.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

beforeEach(async () => {
  await initTestI18n('zhCN')
})

describe('DocsLayout real rendering — zh -> zh-TW switch', () => {
  it('real sidebar + quickstart page switch from Simplified to Traditional', async () => {
    renderWithProviders(<DocsLayout slugParam='quickstart' />)

    // ── Simplified Chinese first ──────────────────────────────────────────
    // Real page title (heading) and real active navigation link.
    const titleZh = await screen.findAllByRole(
      'heading',
      { name: '快速开始' },
      { timeout: 3000 }
    )
    expect(titleZh.length).toBeGreaterThan(0)

    const navLinksZh = await screen.findAllByRole('link', { name: '快速开始' })
    expect(navLinksZh.length).toBeGreaterThan(0)
    expect(
      navLinksZh.some((a) => a.getAttribute('aria-current') === 'page')
    ).toBe(true)

    // Real sidebar group label (Simplified) and real page body (subtitle).
    expect((await screen.findAllByText('开始使用')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/从零/)).toBeInTheDocument()
    // Sanity: not Traditional yet.
    expect(screen.queryByText(/從零/)).toBeNull()

    // ── Switch to Traditional Chinese ─────────────────────────────────────
    await act(async () => {
      await i18n.changeLanguage('zhTW')
    })

    // Real page title and nav link are now Traditional.
    const titleTw = await screen.findAllByRole(
      'heading',
      { name: '快速開始' },
      { timeout: 3000 }
    )
    expect(titleTw.length).toBeGreaterThan(0)

    const navLinksTw = await screen.findAllByRole('link', { name: '快速開始' })
    expect(navLinksTw.length).toBeGreaterThan(0)
    expect(
      navLinksTw.some((a) => a.getAttribute('aria-current') === 'page')
    ).toBe(true)

    // Real sidebar group label (Traditional) and real page body (subtitle).
    expect((await screen.findAllByText('開始使用')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/從零/)).toBeInTheDocument()

    // ── Negative assertions: no Simplified / English / raw key / fallback ─
    await waitFor(() => expect(screen.queryByText(/从零/)).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Quick Start' })).toBeNull()
    expect(screen.queryByText('开始使用')).toBeNull()
    expect(screen.queryByText(/Getting Started/)).toBeNull()
    expect(screen.queryByText(/From zero/)).toBeNull()
    expect(screen.queryByText('__FALLBACK__')).toBeNull()
    expect(screen.queryByText(/quickstart\.title/)).toBeNull()
    expect(screen.queryByText(/nav\.quickstart/)).toBeNull()
  })
})

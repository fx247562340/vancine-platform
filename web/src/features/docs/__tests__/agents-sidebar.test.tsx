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
along with the Free Software Foundation, Inc., 51 Franklin Street,
Fifth Floor, Boston, MA 02110-1301 USA.
*/
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as DocsSlugRouteImport } from '@/routes/docs/$slug'
import { Route as DocsAgentsSplatRouteImport } from '@/routes/docs/agents/$'
import { Route as DocsAgentsClineRouteImport } from '@/routes/docs/agents/cline'
import { Route as DocsAgentsIndexRouteImport } from '@/routes/docs/agents/index'
import { Route as DocsAgentsOpencodeRouteImport } from '@/routes/docs/agents/opencode'
import { Route as DocsAgentsRooCodeRouteImport } from '@/routes/docs/agents/roo-code'
import { Route as DocsIndexRouteImport } from '@/routes/docs/index'

import { DOCS_AGENT_TOOLS } from '../lib/agents'
import { initTestI18n } from './test-i18n'

// Isolate the Docs layout from the full site header/footer.
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

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const TestDocsIndexRoute = DocsIndexRouteImport.update({
  id: '/docs/',
  path: '/docs/',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsSlugRoute = DocsSlugRouteImport.update({
  id: '/docs/$slug',
  path: '/docs/$slug',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsAgentsIndexRoute = DocsAgentsIndexRouteImport.update({
  id: '/docs/agents/',
  path: '/docs/agents/',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsAgentsOpencodeRoute = DocsAgentsOpencodeRouteImport.update({
  id: '/docs/agents/opencode',
  path: '/docs/agents/opencode',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsAgentsClineRoute = DocsAgentsClineRouteImport.update({
  id: '/docs/agents/cline',
  path: '/docs/agents/cline',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsAgentsRooCodeRoute = DocsAgentsRooCodeRouteImport.update({
  id: '/docs/agents/roo-code',
  path: '/docs/agents/roo-code',
  getParentRoute: () => testRootRoute,
} as never)
const TestDocsAgentsSplatRoute = DocsAgentsSplatRouteImport.update({
  id: '/docs/agents/$',
  path: '/docs/agents/$',
  getParentRoute: () => testRootRoute,
} as never)
const testRouteTree = testRootRoute.addChildren([
  TestDocsIndexRoute,
  TestDocsSlugRoute,
  TestDocsAgentsIndexRoute,
  TestDocsAgentsOpencodeRoute,
  TestDocsAgentsClineRoute,
  TestDocsAgentsRooCodeRoute,
  TestDocsAgentsSplatRoute,
])

function renderDocsRouter(initialPath: string) {
  const router = createRouter({
    routeTree: testRouteTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}

/** Desktop sidebar container (the sticky block, always in the DOM). */
function desktopSidebar(): HTMLElement {
  const el = document.querySelector<HTMLElement>('div.sticky')
  expect(el).not.toBeNull()
  return el as HTMLElement
}

async function waitForSidebarReady() {
  // The parent item label comes from the lazily loaded Docs bundle.
  await screen.findByRole(
    'link',
    { name: 'Agent Integration' },
    { timeout: 3000 }
  )
}

beforeEach(async () => {
  await initTestI18n('en')
})

describe('Docs sidebar Agent submenu (desktop)', () => {
  it('hub: parent is current page and the three tool children are listed without aria-current', async () => {
    renderDocsRouter('/docs/agents')
    await waitForSidebarReady()

    const sidebar = desktopSidebar()
    const parent = within(sidebar).getByRole('link', {
      name: 'Agent Integration',
    })
    expect(parent).toHaveAttribute('aria-current', 'page')

    // Children reuse the DOCS_AGENT_TOOLS registry: same names, same
    // order, same canonical paths — never a hand-written second list.
    const childNames = DOCS_AGENT_TOOLS.map((tool) => tool.displayName)
    for (const tool of DOCS_AGENT_TOOLS) {
      const child = within(sidebar).getByRole('link', {
        name: tool.displayName,
      })
      expect(child).toHaveAttribute('href', tool.path)
      expect(child).not.toHaveAttribute('aria-current')
    }
    const childLinks = childNames.map((name) =>
      within(sidebar).getByRole('link', { name })
    )
    expect(childLinks.map((link) => link.getAttribute('href'))).toEqual(
      DOCS_AGENT_TOOLS.map((tool) => tool.path)
    )
  })

  it.each([
    ['/docs/agents/opencode', 'OpenCode'],
    ['/docs/agents/cline', 'Cline'],
    ['/docs/agents/roo-code', 'Roo Code'],
  ] as const)(
    '%s: only the matching child is current page; parent keeps group highlight only',
    async (path, activeChild) => {
      renderDocsRouter(path)
      await waitForSidebarReady()

      const sidebar = desktopSidebar()
      const parent = within(sidebar).getByRole('link', {
        name: 'Agent Integration',
      })
      // Parent stays the /docs/agents overview entry: group-active style,
      // but it must NOT compete with the child for aria-current.
      expect(parent).not.toHaveAttribute('aria-current')
      expect(parent.className).toContain('font-semibold')

      for (const tool of DOCS_AGENT_TOOLS) {
        const child = within(sidebar).getByRole('link', {
          name: tool.displayName,
        })
        if (tool.displayName === activeChild) {
          expect(child).toHaveAttribute('aria-current', 'page')
        } else {
          expect(child).not.toHaveAttribute('aria-current')
        }
      }
    }
  )

  it('unknown agent path: no child and no parent is marked current', async () => {
    renderDocsRouter('/docs/agents/some-unknown-tool')

    await waitFor(
      () => expect(screen.getByText('Page not found')).toBeInTheDocument(),
      { timeout: 3000 }
    )
    const sidebar = desktopSidebar()
    const current = sidebar.querySelectorAll('[aria-current="page"]')
    expect(current.length).toBe(0)
  })

  it('non-agent docs pages show no agent children', async () => {
    renderDocsRouter('/docs/quickstart')
    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: 'Quick Start' })
        ).toBeInTheDocument(),
      { timeout: 3000 }
    )
    const sidebar = desktopSidebar()
    for (const tool of DOCS_AGENT_TOOLS) {
      expect(
        within(sidebar).queryByRole('link', { name: tool.displayName })
      ).not.toBeInTheDocument()
    }
  })
})

describe('Docs sidebar Agent submenu (mobile shares the same data source)', () => {
  it('mobile dropdown lists the same registry children and closes after activation', async () => {
    const user = userEvent.setup()
    renderDocsRouter('/docs/agents')
    await waitForSidebarReady()

    const toggle = document.querySelector<HTMLButtonElement>(
      'button[aria-controls="docs-mobile-nav"]'
    )
    expect(toggle).not.toBeNull()
    await user.click(toggle as HTMLButtonElement)

    const mobileNav = await waitFor(() => {
      const el = document.querySelector('#docs-mobile-nav')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })

    // Same data source: identical names/order/paths as the desktop items.
    const mobileChildHrefs = DOCS_AGENT_TOOLS.map((tool) => {
      const link = within(mobileNav).getByRole('link', {
        name: tool.displayName,
      })
      return link.getAttribute('href')
    })
    expect(mobileChildHrefs).toEqual(DOCS_AGENT_TOOLS.map((tool) => tool.path))

    // Activating a mobile child navigates and closes the mobile nav.
    const clineLink = within(mobileNav).getByRole('link', {
      name: 'Cline',
    })
    await user.click(clineLink)
    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: /Cline setup guide/ })
        ).toBeInTheDocument(),
      { timeout: 3000 }
    )
    await waitFor(() => {
      expect(document.querySelector('#docs-mobile-nav')).toBeNull()
    })
  })
})

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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as DocsSlugRouteImport } from '@/routes/docs/$slug'
import { Route as DocsAgentsSplatRouteImport } from '@/routes/docs/agents/$'
import { Route as DocsAgentsClineRouteImport } from '@/routes/docs/agents/cline'
import { Route as DocsAgentsIndexRouteImport } from '@/routes/docs/agents/index'
import { Route as DocsAgentsOpencodeRouteImport } from '@/routes/docs/agents/opencode'
import { Route as DocsAgentsRooCodeRouteImport } from '@/routes/docs/agents/roo-code'
import { Route as DocsIndexRouteImport } from '@/routes/docs/index'

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

// Build a real router from the actual docs route modules (wired exactly like
// routeTree.gen.ts) so routing, beforeLoad and the splat 404 are genuinely
// exercised.
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
  const rendered = render(<RouterProvider router={router} />)
  return { router, ...rendered }
}

/**
 * Wait until a guide page is fully rendered: its title heading plus the
 * final "Get started" section, which only exists after the lazy guide
 * chunk, the i18n bundle and every section above it have resolved.
 * Replaces any fixed-delay suspense flush.
 */
async function expectGuideFullyRendered(title: RegExp) {
  await waitFor(
    () =>
      expect(
        screen.getByRole('heading', { name: title, level: 2 })
      ).toBeInTheDocument(),
    { timeout: 3000 }
  )
  await waitFor(
    () =>
      expect(
        screen.getByRole('heading', { name: 'Get started' })
      ).toBeInTheDocument(),
    { timeout: 3000 }
  )
}

beforeEach(async () => {
  await initTestI18n('en')
})

describe('Agent guide nested routes', () => {
  // Route-rendering responsibility only. Sidebar parent/child aria-current,
  // unknown-path highlighting and mobile behavior are covered by
  // agents-sidebar.test.tsx.
  it.each([
    ['/docs/agents/opencode', /OpenCode setup guide/],
    ['/docs/agents/cline', /Cline setup guide/],
    ['/docs/agents/roo-code', /Roo Code setup guide/],
  ] as const)('%s renders its own guide page', async (path, title) => {
    renderDocsRouter(path)
    await expectGuideFullyRendered(title)
  })

  it('/docs/agents renders the hub via its static index route', async () => {
    renderDocsRouter('/docs/agents')

    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', {
            name: 'Agent Integration',
            level: 2,
          })
        ).toBeInTheDocument(),
      { timeout: 3000 }
    )
    await waitFor(
      () =>
        expect(
          screen.getAllByRole('link', { name: 'View setup guide' })
        ).toHaveLength(3),
      { timeout: 3000 }
    )
  })

  it.each([
    '/docs/agents/unknown-tool',
    '/docs/agents/roo',
    '/docs/agents/roo-code-v2',
    '/docs/agents/opencode/v1',
  ])('unknown nested path %s reaches the localized Docs 404', async (path) => {
    renderDocsRouter(path)

    await waitFor(
      () => expect(screen.getByText('Page not found')).toBeInTheDocument(),
      { timeout: 3000 }
    )
    // No fallback to the hub content or Quick Start (nav-state assertions
    // for unknown paths live in agents-sidebar.test.tsx).
    expect(
      screen.queryByText('Guided setup by coding agent')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Quick Start' })
    ).not.toBeInTheDocument()
  })

  it('SPA navigation from a guide to an unknown subpath cleans up the tool metadata', async () => {
    const { router } = renderDocsRouter('/docs/agents/opencode')
    await expectGuideFullyRendered(/OpenCode setup guide/)

    // Precondition: the guide owned its tool-specific metadata.
    await waitFor(() =>
      expect(document.title).toBe(
        'OpenCode Setup Guide for the Vancine API | Vancine'
      )
    )
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://vancine.com/docs/agents/opencode')

    await act(async () => {
      await router.navigate({
        to: '/docs/agents/$',
        params: { _splat: 'unknown-tool' },
      })
    })

    await waitFor(
      () => expect(screen.getByText('Page not found')).toBeInTheDocument(),
      { timeout: 3000 }
    )

    // The unknown path takes over with the neutral /docs metadata.
    await waitFor(() =>
      expect(document.title).toBe(
        'Vancine API Documentation | OpenAI-Compatible Chinese Models'
      )
    )
    const canonical = document.head.querySelector('link[rel="canonical"]')
    expect(canonical?.getAttribute('href')).toBe('https://vancine.com/docs')
    const description = document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute('content')
    expect(description).toBe(
      'Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.'
    )

    // No stale tool metadata survives anywhere in the managed head tags.
    for (const tool of [
      'opencode',
      'cline',
      'roo-code',
      'OpenCode',
      'Cline',
      'Roo Code',
    ]) {
      expect(document.title).not.toContain(tool)
      expect(description ?? '').not.toContain(tool)
      expect(canonical?.getAttribute('href') ?? '').not.toContain(tool)
      const ogUrl = document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content')
      expect(ogUrl ?? '').not.toContain(tool)
    }
  })
})

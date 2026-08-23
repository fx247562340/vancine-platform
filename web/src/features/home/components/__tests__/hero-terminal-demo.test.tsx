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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useEffect } from 'react'
import { initReactI18next } from 'react-i18next'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import { HeroTerminalDemo } from '../hero-terminal-demo'

let i18nReady = false
async function initTestI18n(): Promise<void> {
  if (!i18nReady) {
    await i18n.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18n.changeLanguage('en')
}

// Return the tab at the given index or throw — the tablist always has
// the four demo endpoints, so a missing entry is a real test bug, not a
// user-facing condition that warrants an `undefined` return.
function tabAt(tabs: HTMLElement[], index: number): HTMLElement {
  const tab = tabs.at(index)
  if (!tab) {
    throw new Error(`expected a tab at index ${index}`)
  }
  return tab
}

// Honor prefers-reduced-motion so the auto-rotation timer does not run
// in the test environment and race the assertion on aria-selected.
function MockReducedMotion() {
  useEffect(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }, [])
  return null
}

function renderDemo(): void {
  const root = createRootRoute()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => (
          <>
            <MockReducedMotion />
            <HeroTerminalDemo />
          </>
        ),
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  await initTestI18n()
})

beforeEach(() => {
  // Default matchMedia: prefers-reduced-motion ON so the demo's
  // auto-rotation timer never starts in the test environment.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HeroTerminalDemo — API demo tablist accessibility', () => {
  it('renders the tab strip as a role=tablist with an accessible label', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    expect(tablist).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected=true and the rest with false', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.length).toBeGreaterThanOrEqual(4)
    const selectedTabs = tabs.filter(
      (t) => t.getAttribute('aria-selected') === 'true'
    )
    expect(selectedTabs).toHaveLength(1)
  })

  it('keeps the active tab in the tab order (tabIndex=0) and the others out (tabIndex=-1)', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true')
    if (!active) throw new Error('expected one active tab')
    expect(active).toHaveAttribute('tabindex', '0')
    for (const tab of tabs) {
      if (tab === active) continue
      expect(tab).toHaveAttribute('tabindex', '-1')
    }
  })

  it('moves selection on click', async () => {
    const user = userEvent.setup()
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    const target = tabAt(tabs, 2)
    await user.click(target)
    await waitFor(() => {
      expect(target).toHaveAttribute('aria-selected', 'true')
    })
    const selectedTabs = tabs.filter(
      (t) => t.getAttribute('aria-selected') === 'true'
    )
    expect(selectedTabs).toHaveLength(1)
  })

  it('moves selection and focus on ArrowRight, with wrap-around', async () => {
    const user = userEvent.setup()
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    // Move the active tab to index 1 first so the last tab is a
    // non-active boundary — wrap-around must start from a non-active
    // tab, otherwise ArrowRight from the last active tab is a no-op.
    const second = tabAt(tabs, 1)
    await user.click(second)
    await waitFor(() => {
      expect(second).toHaveAttribute('aria-selected', 'true')
    })
    const last = tabAt(tabs, tabs.length - 1)
    if (last.getAttribute('aria-selected') === 'true') {
      throw new Error('precondition: last tab must not be active')
    }
    last.focus()
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    // After wrap-around, the first tab must be the new selection AND
    // the focus must follow — proves both the selection moved and the
    // roving tabindex model routed focus through the boundary.
    const first = tabAt(tabs, 0)
    await waitFor(() => {
      expect(first).toHaveAttribute('aria-selected', 'true')
      expect(first).toHaveFocus()
    })
  })

  it('moves selection and focus on ArrowLeft, with wrap-around', async () => {
    const user = userEvent.setup()
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    // Move the active tab to index 1 first so the first tab is a
    // non-active boundary — wrap-around must start from a non-active
    // tab, otherwise ArrowLeft from the first active tab is a no-op.
    const second = tabAt(tabs, 1)
    await user.click(second)
    await waitFor(() => {
      expect(second).toHaveAttribute('aria-selected', 'true')
    })
    const first = tabAt(tabs, 0)
    if (first.getAttribute('aria-selected') === 'true') {
      throw new Error('precondition: first tab must not be active')
    }
    first.focus()
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    // After wrap-around, the last tab must be the new selection AND
    // the focus must follow.
    const last = tabAt(tabs, tabs.length - 1)
    await waitFor(() => {
      expect(last).toHaveAttribute('aria-selected', 'true')
      expect(last).toHaveFocus()
    })
  })

  it('jumps to the first / last tab on Home / End', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    // Use a non-edge tab as the starting point so Home/End actually
    // moves somewhere — otherwise the assertion would be a no-op.
    const middle = tabAt(tabs, 1)
    middle.focus()
    fireEvent.keyDown(middle, { key: 'End' })
    const last = tabAt(tabs, tabs.length - 1)
    await waitFor(() => {
      expect(last).toHaveAttribute('aria-selected', 'true')
      expect(last).toHaveFocus()
    })
    fireEvent.keyDown(last, { key: 'Home' })
    const first = tabAt(tabs, 0)
    await waitFor(() => {
      expect(first).toHaveAttribute('aria-selected', 'true')
      expect(first).toHaveFocus()
    })
  })

  it('exposes the shared tabpanel with id "hero-api-panel" and aria-labelledby set to the active tab', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const active = within(tablist)
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true')
    if (!active) throw new Error('expected an active tab')
    const tabId = active.getAttribute('id')
    if (!tabId) throw new Error('expected the active tab to have an id')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('id', 'hero-api-panel')
    expect(panel).toHaveAttribute('aria-labelledby', tabId)
  })

  it('every tab points aria-controls at the shared "hero-api-panel"', async () => {
    renderDemo()
    const tablist = await screen.findByRole('tablist', {
      name: /API demo endpoints/i,
    })
    const tabs = within(tablist).getAllByRole('tab')
    for (const tab of tabs) {
      expect(tab).toHaveAttribute('aria-controls', 'hero-api-panel')
    }
  })
})

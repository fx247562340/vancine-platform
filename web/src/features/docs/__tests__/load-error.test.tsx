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
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocsBundleLoader, DocsLocale } from '../i18n/loader'
import { DocsLayout } from '../index'
import { initTestI18n } from './test-i18n'
import { renderWithProviders } from './test-utils'

// Controllable loader: each ensureDocsBundle call is counted and returns a
// promise the test rejects on demand. This drives a deterministic English-load
// failure without relying on fixed sleeps for correctness.
let rejectLoad: ((error: Error) => void) | null = null
let loadCalls = 0
vi.mock('../i18n/loader', async (importActual) => {
  const actual = await importActual<typeof import('../i18n/loader')>()
  return {
    ...actual,
    ensureDocsBundle: (
      _locale: DocsLocale,
      _loaders?: Record<DocsLocale, DocsBundleLoader>
    ) => {
      loadCalls++
      return new Promise<void>((_resolve, reject) => {
        rejectLoad = reject
      })
    },
  }
})

vi.mock('@/components/layout', async (importActual) => {
  const actual = await importActual<typeof import('@/components/layout')>()
  return {
    ...actual,
    PublicLayout: (props: { children: ReactNode }) => (
      <div data-testid='public-layout'>{props.children}</div>
    ),
  }
})

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

// Raw docs-namespace keys that must never leak into the DOM.
const RAW_DOCS_KEY =
  /\b(common|nav|quickstart|migrate|models|chat|image|video|td|audio|sdks|agents|auth|capabilities|errors|faq)\.[a-zA-Z]+/

beforeEach(async () => {
  await initTestI18n('en')
  rejectLoad = null
  loadCalls = 0
})

describe('Docs English-load failure (real DocsLayout)', () => {
  it('reaches a localized error terminal state: no sidebar/TOC, no raw keys, no retry, no unhandled rejection', async () => {
    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      const { container } = renderWithProviders(
        <DocsLayout slugParam='quickstart' />
      )

      // While the (held) load is pending, the docs-independent loading fallback
      // shows and no docs-namespace UI is mounted.
      await waitFor(() =>
        expect(screen.getByText('Loading')).toBeInTheDocument()
      )
      expect(container.querySelector('nav')).toBeNull()

      // Fail the English load.
      await act(async () => {
        rejectLoad?.(new Error('en bundle down'))
      })

      // (a) Global, internationalized error copy is shown.
      await waitFor(() =>
        expect(screen.getByText('Loading failed')).toBeInTheDocument()
      )
      expect(screen.getByText('Please try again later.')).toBeInTheDocument()

      // (b) No DocsSidebar / DocsToc are rendered in the error state.
      expect(container.querySelector('nav')).toBeNull()

      // (c) No raw docs-namespace keys anywhere in the DOM.
      expect(container.textContent).not.toMatch(RAW_DOCS_KEY)

      // (d) The loader is not retried in a loop (single call, terminal state).
      await waitFor(() => expect(loadCalls).toBe(1))
      const callsAtError = loadCalls
      await act(async () => {
        await Promise.resolve()
      })
      expect(loadCalls).toBe(callsAtError)

      // (e) No unhandled rejection escaped. The lifecycle chain is
      // promise-only; unhandled rejections are emitted as soon as the
      // microtask queue drains, which the flush above already proves.
      expect(rejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

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
import { act, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { beforeEach, describe, expect, it } from 'vitest'
import { DocsI18nProvider } from '../i18n/docs-i18n'
import { useDocsI18n } from '../i18n/docs-i18n-context'
import type { DocsBundleLoader, DocsLocale } from '../i18n/loader'
import { clearDocsBundle, EN_DOCS, initTestI18n, ZH_DOCS } from './test-utils'

// Probe renders the active lifecycle state plus a translated Docs string.
// The defaultValue proves we never surface a raw i18n key while loading/error.
function Probe() {
  const { t } = useTranslation('docs', { useSuspense: false })
  const { ready, status } = useDocsI18n()
  return (
    <div>
      <span data-testid='status'>{status}</span>
      <span data-testid='ready'>{String(ready)}</span>
      <span data-testid='title'>
        {t('nav.quickstart', { defaultValue: '__FALLBACK__' })}
      </span>
    </div>
  )
}

function loaders(map: Partial<Record<DocsLocale, DocsBundleLoader>>) {
  return map as Record<DocsLocale, DocsBundleLoader>
}

beforeEach(async () => {
  await initTestI18n('en')
  for (const l of ['en', 'zh', 'fr']) clearDocsBundle(l)
})

describe('DocsI18nProvider lifecycle', () => {
  it('normal first load renders translated text (ready=true)', async () => {
    render(
      <DocsI18nProvider loaders={loaders({ en: async () => EN_DOCS })}>
        <Probe />
      </DocsI18nProvider>
    )
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('ready')
    )
    expect(screen.getByTestId('ready').textContent).toBe('true')
    expect(screen.getByTestId('title').textContent).toBe('Quick Start')
  })

  it('zh → en and en → zh switches render real values', async () => {
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          zh: async () => ZH_DOCS,
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )
    // Initial English.
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('Quick Start')
    )

    // Switch to Chinese: the provider lazily loads zh and re-renders.
    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('快速开始')
    )
    expect(screen.getByTestId('ready').textContent).toBe('true')

    // Switch back to English.
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('Quick Start')
    )
  })

  it('non-English loader rejection falls back to English copy (ready=true)', async () => {
    await initTestI18n('fr')
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          fr: async () => {
            throw new Error('fr bundle down')
          },
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )
    // French failed → English content installed under fr → ready, English copy.
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('ready')
    )
    expect(screen.getByTestId('ready').textContent).toBe('true')
    expect(screen.getByTestId('title').textContent).toBe('Quick Start')
  })

  it('English loader rejection reaches a terminal error state (no unhandled rejection, no loop, no raw key)', async () => {
    // Guard: prove a failed English load produces NO unhandled rejection (the
    // provider owns the lifecycle and consumes the rejection; there is no
    // fire-and-forget eager preload).
    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      let enCalls = 0
      render(
        <DocsI18nProvider
          loaders={loaders({
            en: async () => {
              enCalls++
              throw new Error('en bundle down')
            },
          })}
        >
          <Probe />
        </DocsI18nProvider>
      )

      await waitFor(() =>
        expect(screen.getByTestId('status').textContent).toBe('error')
      )
      // Terminal: not ready, and the loader is not retried in a loop.
      expect(screen.getByTestId('ready').textContent).toBe('false')
      // defaultValue prevents a raw key from reaching the DOM.
      expect(screen.getByTestId('title').textContent).toBe('__FALLBACK__')

      // Settle, then assert the state is stable (no infinite retry/render).
      const callsAtError = enCalls
      await new Promise((r) => setTimeout(r, 30))
      expect(screen.getByTestId('status').textContent).toBe('error')
      expect(enCalls).toBe(callsAtError)

      // Allow any stray promise rejection a chance to surface, then assert none.
      await new Promise((r) => setTimeout(r, 20))
      expect(rejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

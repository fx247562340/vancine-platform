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
import {
  resolveDocsLocale,
  type DocsBundleLoader,
  type DocsLocale,
} from '../i18n/loader'
import zhTwDocs from '../i18n/locales/zh-TW.json'
import { clearDocsBundle, EN_DOCS, initTestI18n } from './test-utils'

const ZH_TW_DOCS = zhTwDocs as unknown as Record<string, unknown>

// Probe renders the resolved Docs locale, lifecycle status, and real Docs
// copy: two navigation labels and a page body sentence. defaultValue proves we
// never surface a raw i18n key while loading or on error.
function Probe() {
  const { t } = useTranslation('docs', { useSuspense: false })
  const { ready, status, locale } = useDocsI18n()
  return (
    <div>
      <span data-testid='status'>{status}</span>
      <span data-testid='ready'>{String(ready)}</span>
      <span data-testid='locale'>{locale}</span>
      <span data-testid='title'>
        {t('nav.quickstart', { defaultValue: '__FALLBACK__' })}
      </span>
      <span data-testid='nav-getting'>
        {t('nav.gettingStarted', { defaultValue: '__FALLBACK__' })}
      </span>
      <span data-testid='body'>
        {t('quickstart.subtitle', { defaultValue: '__FALLBACK__' })}
      </span>
    </div>
  )
}

function loaders(map: Partial<Record<DocsLocale, DocsBundleLoader>>) {
  return map as Record<DocsLocale, DocsBundleLoader>
}

beforeEach(async () => {
  await initTestI18n('zh-TW')
  for (const l of ['en', 'zh', 'zh-TW']) clearDocsBundle(l)
})

describe('Docs zh-TW namespace under global zh-TW', () => {
  it('resolveDocsLocale maps Traditional variants to zh-TW', () => {
    expect(resolveDocsLocale('zh-TW')).toBe('zh-TW')
    expect(resolveDocsLocale('zh-Hant')).toBe('zh-TW')
    expect(resolveDocsLocale('zh-HK')).toBe('zh-TW')
    expect(resolveDocsLocale('zh-MO')).toBe('zh-TW')
    expect(resolveDocsLocale('zh')).toBe('zh')
    expect(resolveDocsLocale('zh-CN')).toBe('zh')
  })

  it('loads the Docs zh-TW bundle and renders real Traditional copy (no raw key, no zh/en fallback)', async () => {
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          'zh-TW': async () => ZH_TW_DOCS,
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('ready')
    )
    expect(screen.getByTestId('ready').textContent).toBe('true')
    // The resolved Docs locale is zh-TW (not zh, not en).
    expect(screen.getByTestId('locale').textContent).toBe('zh-TW')
    // Real Traditional copy: distinct from en "Quick Start" and zh "快速开始",
    // and not the raw key or the defaultValue fallback.
    expect(screen.getByTestId('title').textContent).toBe('快速開始')
  })

  it('switching zh -> zh-TW loads the independent zh-TW bundle (nav + body become Traditional)', async () => {
    await initTestI18n('zh')
    const zhDocs = (await import('../i18n/locales/zh.json'))
      .default as unknown as Record<string, unknown>
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          zh: async () => zhDocs,
          'zh-TW': async () => ZH_TW_DOCS,
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )

    // Simplified first: nav and body are Simplified Chinese.
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('快速开始')
    )
    expect(screen.getByTestId('locale').textContent).toBe('zh')
    expect(screen.getByTestId('nav-getting').textContent).toBe('开始使用')
    expect(screen.getByTestId('body').textContent).toContain('从零')

    // Switch to Traditional: loads the separate zh-TW bundle, not zh.
    await act(async () => {
      await i18n.changeLanguage('zh-TW')
    })
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('快速開始')
    )
    // Locale resolved to zh-TW.
    expect(screen.getByTestId('locale').textContent).toBe('zh-TW')
    expect(screen.getByTestId('ready').textContent).toBe('true')

    // Nav AND body are Traditional...
    const navGetting = screen.getByTestId('nav-getting').textContent
    const body = screen.getByTestId('body').textContent
    expect(navGetting).toBe('開始使用')
    expect(body).toContain('從零')
    // ...not Simplified...
    expect(navGetting).not.toBe('开始使用')
    expect(body).not.toContain('从零')
    // ...not English...
    expect(navGetting).not.toBe('Getting Started')
    expect(body).not.toContain('From zero')
    // ...and not a raw key or the defaultValue fallback.
    expect(navGetting).not.toBe('__FALLBACK__')
    expect(body).not.toBe('__FALLBACK__')
    expect(navGetting).not.toContain('nav.gettingStarted')
    expect(body).not.toContain('quickstart.subtitle')
  })
})

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
import zhTwDocs from '../i18n/locales/zhTW.json'
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
  await initTestI18n('zhTW')
  for (const l of ['en', 'zhCN', 'zhTW']) clearDocsBundle(l)
})

describe('Docs zhTW namespace under global zhTW', () => {
  it('resolveDocsLocale maps Traditional variants to zhTW', () => {
    expect(resolveDocsLocale('zh-TW')).toBe('zhTW')
    expect(resolveDocsLocale('zh-Hant')).toBe('zhTW')
    expect(resolveDocsLocale('zh-HK')).toBe('zhTW')
    expect(resolveDocsLocale('zh-MO')).toBe('zhTW')
    expect(resolveDocsLocale('zh')).toBe('zhCN')
    expect(resolveDocsLocale('zh-CN')).toBe('zhCN')
  })

  it('loads the Docs zhTW bundle and renders real Traditional copy (no raw key, no zhCN/en fallback)', async () => {
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          zhTW: async () => ZH_TW_DOCS,
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('ready')
    )
    expect(screen.getByTestId('ready').textContent).toBe('true')
    // The resolved Docs locale is zhTW (not zhCN, not en).
    expect(screen.getByTestId('locale').textContent).toBe('zhTW')
    // Real Traditional copy: distinct from en "Quick Start" and zhCN "快速开始",
    // and not the raw key or the defaultValue fallback.
    expect(screen.getByTestId('title').textContent).toBe('快速開始')
  })

  it('switching zhCN -> zhTW loads the independent zhTW bundle (nav + body become Traditional)', async () => {
    await initTestI18n('zhCN')
    const zhDocs = (await import('../i18n/locales/zhCN.json'))
      .default as unknown as Record<string, unknown>
    render(
      <DocsI18nProvider
        loaders={loaders({
          en: async () => EN_DOCS,
          zhCN: async () => zhDocs,
          zhTW: async () => ZH_TW_DOCS,
        })}
      >
        <Probe />
      </DocsI18nProvider>
    )

    // Simplified first: nav and body are Simplified Chinese.
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('快速开始')
    )
    expect(screen.getByTestId('locale').textContent).toBe('zhCN')
    expect(screen.getByTestId('nav-getting').textContent).toBe('开始使用')
    expect(screen.getByTestId('body').textContent).toContain('从零')

    // Switch to Traditional: loads the separate zhTW bundle, not zhCN.
    await act(async () => {
      await i18n.changeLanguage('zhTW')
    })
    await waitFor(() =>
      expect(screen.getByTestId('title').textContent).toBe('快速開始')
    )
    // Locale resolved to zhTW.
    expect(screen.getByTestId('locale').textContent).toBe('zhTW')
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

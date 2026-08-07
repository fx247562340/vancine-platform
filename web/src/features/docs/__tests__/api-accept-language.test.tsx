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
// Global API Accept-Language behavior test. Not a Docs feature test; it lives
// under docs/__tests__ only as legacy directory placement (relocating it is
// tracked as non-blocking cleanup debt). It verifies BOTH request paths in
// @/lib/api send the same Accept-Language for a given UI language: the Axios
// request interceptor and getCommonHeaders (used for SSE/fetch-style calls).
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'
import i18n from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import { normalizeInterfaceLanguage } from '@/i18n/languages'
import { api, getCommonHeaders } from '@/lib/api'

const resources = {
  en: { translation: {} },
  zhCN: { translation: {} },
  zhTW: { translation: {} },
}

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: ['en', 'zhCN', 'zhTW'],
      load: 'currentOnly',
      interpolation: { escapeValue: false },
    })
  }
})

// A capturing adapter: records the final request config (after interceptors
// have run) and returns an empty successful response. A holder object avoids
// TS control-flow narrowing of a bare `let` to `undefined`.
const captured: { config?: AxiosRequestConfig } = {}
const capturingAdapter: AxiosAdapter = async (config) => {
  captured.config = config
  return {
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

function capturedAcceptLanguage(): string | undefined {
  const headers = captured.config?.headers as Record<string, string> | undefined
  return headers?.['Accept-Language']
}

async function setLanguage(raw: string) {
  await i18n.changeLanguage(normalizeInterfaceLanguage(raw))
}

describe('API Accept-Language — getCommonHeaders (SSE path)', () => {
  it('zh-TW => zh-TW', async () => {
    await setLanguage('zh-TW')
    expect(getCommonHeaders()['Accept-Language']).toBe('zh-TW')
  })

  it('zh => zh-CN', async () => {
    await setLanguage('zh')
    expect(getCommonHeaders()['Accept-Language']).toBe('zh-CN')
  })

  it('zh-Hans => zh-CN', async () => {
    await setLanguage('zh-Hans')
    expect(getCommonHeaders()['Accept-Language']).toBe('zh-CN')
  })

  it('zh-HK => zh-TW', async () => {
    await setLanguage('zh-HK')
    expect(getCommonHeaders()['Accept-Language']).toBe('zh-TW')
  })

  it('en => en', async () => {
    await setLanguage('en')
    expect(getCommonHeaders()['Accept-Language']).toBe('en')
  })
})

describe('API Accept-Language — Axios request interceptor', () => {
  it('zh-TW => zh-TW (same logic as getCommonHeaders)', async () => {
    await setLanguage('zh-TW')
    captured.config = undefined
    await api.get('/api/status', { adapter: capturingAdapter })
    expect(capturedAcceptLanguage()).toBe('zh-TW')
  })

  it('zh => zh-CN', async () => {
    await setLanguage('zh')
    captured.config = undefined
    await api.get('/api/status', { adapter: capturingAdapter })
    expect(capturedAcceptLanguage()).toBe('zh-CN')
  })

  it('interceptor and getCommonHeaders agree for zh-TW', async () => {
    await setLanguage('zh-TW')
    captured.config = undefined
    await api.get('/api/status', { adapter: capturingAdapter })
    expect(capturedAcceptLanguage()).toBe(getCommonHeaders()['Accept-Language'])
  })
})

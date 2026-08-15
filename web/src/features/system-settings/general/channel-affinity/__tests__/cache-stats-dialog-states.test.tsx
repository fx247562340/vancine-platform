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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAffinityUsageCache } from '../api'
import { CacheStatsDialog } from '../cache-stats-dialog'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

vi.mock('../api', () => ({
  getAffinityUsageCache: vi.fn(),
}))

const getAffinityUsageCacheMock = vi.mocked(getAffinityUsageCache)

afterEach(() => {
  getAffinityUsageCacheMock.mockReset()
  cleanup()
})

const TARGET = {
  rule_name: 'rule-1',
  using_group: 'default',
  key_hint: 'sk-***abc',
  key_fp: 'fp-1',
}

function renderDialog(target: typeof TARGET | null = TARGET): void {
  render(
    <I18nextProvider i18n={i18n}>
      <CacheStatsDialog open onOpenChange={() => undefined} target={target} />
    </I18nextProvider>
  )
}

describe('CacheStatsDialog body states', () => {
  it('shows Loading while the usage cache request is pending', () => {
    getAffinityUsageCacheMock.mockReturnValue(new Promise(() => undefined))
    renderDialog()

    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(screen.queryByText('No data available')).toBeNull()
  })

  it('shows the statistics rows after a successful response', async () => {
    getAffinityUsageCacheMock.mockResolvedValue({
      success: true,
      data: { total: 10, hit: 7, prompt_tokens: 5, cached_tokens: 2 },
    })
    renderDialog()

    await waitFor(() => expect(screen.getByText('Hit Rate')).toBeTruthy())
    expect(screen.getByText('7/10 (70.00%)')).toBeTruthy()
    expect(screen.getByText('Prompt tokens')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.queryByText('No data available')).toBeNull()
  })

  it('shows the empty message when the request fails without statistics', async () => {
    getAffinityUsageCacheMock.mockRejectedValue(new Error('boom'))
    renderDialog()

    await waitFor(() =>
      expect(screen.getByText('No data available')).toBeTruthy()
    )
    expect(screen.queryByText('Hit Rate')).toBeNull()
  })

  it('shows Loading instead of previously displayed rows when the target changes', async () => {
    getAffinityUsageCacheMock.mockResolvedValueOnce({
      success: true,
      data: { total: 10, hit: 7 },
    })
    getAffinityUsageCacheMock.mockReturnValueOnce(new Promise(() => undefined))
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <CacheStatsDialog open onOpenChange={() => undefined} target={TARGET} />
      </I18nextProvider>
    )

    await waitFor(() => expect(screen.getByText('Hit Rate')).toBeTruthy())

    rerender(
      <I18nextProvider i18n={i18n}>
        <CacheStatsDialog
          open
          onOpenChange={() => undefined}
          target={{ ...TARGET, rule_name: 'rule-2' }}
        />
      </I18nextProvider>
    )

    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(screen.queryByText('Hit Rate')).toBeNull()
    expect(screen.queryByText('No data available')).toBeNull()
  })
})

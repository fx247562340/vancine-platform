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
import { beforeEach, describe, expect, it } from 'vitest'

import { FUNNEL_KEYS } from './funnel-keys-en'
import { initTestI18n, PRODUCTION_BUNDLES, testI18n } from './test-i18n'

describe('funnel i18n contract (production bundles)', () => {
  beforeEach(async () => {
    await initTestI18n('en')
  })

  it('has every funnel key present in the real en.json bundle', () => {
    for (const key of FUNNEL_KEYS) {
      expect(PRODUCTION_BUNDLES.en[key]).toBeDefined()
    }
  })

  it('has every funnel key present in the real zh.json bundle', () => {
    for (const key of FUNNEL_KEYS) {
      expect(PRODUCTION_BUNDLES.zh[key]).toBeDefined()
    }
  })

  it('resolves en copy without falling back to the raw key', async () => {
    await initTestI18n('en')
    for (const key of FUNNEL_KEYS) {
      expect(testI18n.t(key)).toBe(PRODUCTION_BUNDLES.en[key])
    }
  })

  it('resolves zh copy from the real zh.json bundle', async () => {
    await initTestI18n('zh')
    for (const key of FUNNEL_KEYS) {
      expect(testI18n.t(key)).toBe(PRODUCTION_BUNDLES.zh[key])
    }
    await initTestI18n('en')
  })

  it('renders the null-metric label as Unavailable in en and 暂不可用 in zh', async () => {
    await initTestI18n('en')
    expect(testI18n.t('Unavailable')).toBe('Unavailable')

    await initTestI18n('zh')
    expect(testI18n.t('Unavailable')).toBe('暂不可用')
    await initTestI18n('en')
  })
})

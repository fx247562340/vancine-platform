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

import {
  formatCoverageTimestamp,
  formatFunnelCount,
  formatFunnelRate,
  getCompletenessStyle,
  getEchoedFilterChips,
} from '../lib/display'

beforeEach(async () => {
  const { initTestI18n } = await import('./test-i18n')
  await initTestI18n()
})

describe('formatFunnelCount', () => {
  it('renders a real zero as "0", never as unavailable', () => {
    expect(formatFunnelCount(0)).toBe('0')
  })

  it('renders counts as their decimal string', () => {
    expect(formatFunnelCount(42)).toBe('42')
  })

  it('renders null and undefined as the Unavailable label key', () => {
    expect(formatFunnelCount(null)).toBe('Unavailable')
    expect(formatFunnelCount(undefined)).toBe('Unavailable')
  })
})

describe('formatFunnelRate (backend reports 0–1 ratios)', () => {
  it('renders 0.5 as 50%', () => {
    expect(formatFunnelRate(0.5)).toBe('50%')
  })

  it('renders 1 as 100%', () => {
    expect(formatFunnelRate(1)).toBe('100%')
  })

  it('renders 0 as 0%', () => {
    expect(formatFunnelRate(0)).toBe('0%')
  })

  it('renders a null rate as Unavailable, not 0%', () => {
    expect(formatFunnelRate(null)).toBe('Unavailable')
  })

  it('matches the shared percent rendering for fractional ratios', () => {
    // 1/3 as a 0–1 ratio → 33.33% with the default locale formatting.
    const expected = new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: 2,
    }).format(1 / 3)
    expect(formatFunnelRate(1 / 3)).toBe(expected)
  })
})

describe('formatCoverageTimestamp (true UTC rendering)', () => {
  it('formats a timestamp exactly one second before a UTC midnight boundary', () => {
    // 2026-03-01T00:00:00Z minus 1s → must render as Feb 28 23:59:59 in UTC
    // even when the machine runs far east (e.g. UTC+8 would say Mar 1 07:59:59).
    const justBeforeBoundary = Date.UTC(2026, 2, 1, 0, 0, 0) / 1000 - 1
    expect(formatCoverageTimestamp(justBeforeBoundary)).toBe(
      '2026-02-28 23:59:59'
    )
  })

  it('formats a timestamp exactly on a UTC midnight boundary', () => {
    const boundary = Date.UTC(2026, 2, 1, 0, 0, 0) / 1000
    expect(formatCoverageTimestamp(boundary)).toBe('2026-03-01 00:00:00')
  })

  it('formats a mid-day UTC instant without local-zone drift', () => {
    const midDay = Date.UTC(2026, 5, 15, 13, 45, 30) / 1000
    expect(formatCoverageTimestamp(midDay)).toBe('2026-06-15 13:45:30')
  })
})

describe('getCompletenessStyle', () => {
  it('distinguishes complete, unavailable and error states', () => {
    const complete = getCompletenessStyle('complete')
    const unavailable = getCompletenessStyle('unavailable')
    const error = getCompletenessStyle('error')

    expect(complete.labelKey).not.toBe(unavailable.labelKey)
    expect(error.labelKey).not.toBe(unavailable.labelKey)
    expect(complete.labelKey).not.toBe(error.labelKey)

    expect(complete.className).not.toBe(unavailable.className)
    expect(error.className).not.toBe(unavailable.className)
  })
})

describe('getEchoedFilterChips', () => {
  it('lists only the non-empty echoed filters', () => {
    const chips = getEchoedFilterChips({
      utm_source: 'hn',
      utm_campaign: '',
      model: 'gpt-5',
    })
    expect(chips).toHaveLength(2)
    expect(chips.map((chip) => chip.value)).toEqual(['hn', 'gpt-5'])
  })

  it('returns no chips when the backend echoed no text filters', () => {
    const chips = getEchoedFilterChips({
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(chips).toHaveLength(0)
  })
})

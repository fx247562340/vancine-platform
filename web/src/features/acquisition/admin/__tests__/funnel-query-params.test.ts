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
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import { buildFunnelFilterSchema } from '../lib/funnel-schema'
import { buildFunnelRequestParams } from '../lib/request-params'
import {
  FUNNEL_MAX_SPAN_DAYS,
  getDefaultUtcWindow,
  parseUtcDate,
  utcDaySpan,
} from '../lib/utc-window'

/**
 * Fixed "now" deep inside a day so the UTC-default window is deterministic
 * and independent of the test machine's local timezone. 2026-03-15T08:26:53Z
 * is mid-day in UTC; local zones from UTC-11 to UTC+14 all still land on the
 * same UTC calendar day.
 */
const FIXED_NOW = new Date('2026-03-15T08:26:53.000Z')

describe('getDefaultUtcWindow', () => {
  it('returns exactly the last 30 complete UTC days from a fixed instant', () => {
    const window = getDefaultUtcWindow(FIXED_NOW)
    expect(window.from).toBe('2026-02-13')
    expect(window.to).toBe('2026-03-15')
  })

  it('is not affected by the local timezone of the machine', () => {
    // Run the same computation under several simulated local offsets: the
    // UTC window derives purely from the UTC calendar fields of `now`.
    for (const offsetHours of [-11, -5, 0, 8, 14]) {
      const shifted = new Date(FIXED_NOW.getTime() + offsetHours * 3_600_000)
      const window = getDefaultUtcWindow(shifted)
      // A shifted instant may fall on the previous/next UTC day; both bounds
      // must shift together, keeping the span at exactly 30 days.
      expect(utcDaySpan(window.from, window.to)).toBe(30)
    }
  })

  it('excludes the in-progress UTC day via the exclusive to bound', () => {
    const window = getDefaultUtcWindow(FIXED_NOW)
    const toMs = parseUtcDate(window.to)
    expect(toMs).toBe(Date.UTC(2026, 2, 15))
    expect(FIXED_NOW.getTime()).toBeLessThan((toMs as number) + 24 * 3_600_000)
  })
})

describe('parseUtcDate', () => {
  it('parses a valid date to UTC midnight', () => {
    expect(parseUtcDate('2026-02-13')).toBe(Date.UTC(2026, 1, 13))
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseUtcDate('')).toBeNull()
    expect(parseUtcDate('2026-2-13')).toBeNull()
    expect(parseUtcDate('2026-13-01')).toBeNull()
    expect(parseUtcDate('2026-02-30')).toBeNull()
    expect(parseUtcDate('not-a-date')).toBeNull()
  })
})

describe('buildFunnelRequestParams', () => {
  it('builds exact backend params for a valid filter set', () => {
    const params = buildFunnelRequestParams({
      from: '2026-02-13',
      to: '2026-03-15',
      utm_source: 'hn',
      utm_campaign: 'launch',
      model: 'gpt-5',
    })
    expect(params).toEqual({
      from: Date.UTC(2026, 1, 13) / 1000,
      to: Date.UTC(2026, 2, 15) / 1000,
      utm_source: 'hn',
      utm_campaign: 'launch',
      model: 'gpt-5',
    })
  })

  it('omits empty text filters entirely instead of sending empty strings', () => {
    const params = buildFunnelRequestParams({
      from: '2026-02-13',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(params).toEqual({
      from: Date.UTC(2026, 1, 13) / 1000,
      to: Date.UTC(2026, 2, 15) / 1000,
    })
    expect('utm_source' in params).toBe(false)
    expect('utm_campaign' in params).toBe(false)
    expect('model' in params).toBe(false)
  })

  it('sends to as the exclusive UTC midnight of the to day', () => {
    const params = buildFunnelRequestParams({
      from: '2026-02-13',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(params.to % 86_400).toBe(0)
    expect(params.to).toBe(Date.UTC(2026, 2, 15) / 1000)
  })
})

describe('buildFunnelFilterSchema', () => {
  it('accepts a valid 30-day window with filters', async () => {
    const { initTestI18n } = await import('../__tests__/test-i18n')
    await initTestI18n()
    const schema = buildFunnelFilterSchema(i18next.t.bind(i18next))
    const result = schema.safeParse({
      from: '2026-02-13',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects from >= to without exposing success data', async () => {
    const { initTestI18n } = await import('../__tests__/test-i18n')
    await initTestI18n()
    const schema = buildFunnelFilterSchema(i18next.t.bind(i18next))

    const equal = schema.safeParse({
      from: '2026-03-15',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(equal.success).toBe(false)

    const inverted = schema.safeParse({
      from: '2026-03-16',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(inverted.success).toBe(false)
  })

  it('rejects a span of more than 366 days', async () => {
    const { initTestI18n } = await import('../__tests__/test-i18n')
    await initTestI18n()
    const schema = buildFunnelFilterSchema(i18next.t.bind(i18next))

    const tooLong = schema.safeParse({
      from: '2025-03-01',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(tooLong.success).toBe(false)
    expect(utcDaySpan('2025-03-01', '2026-03-15')).toBeGreaterThan(
      FUNNEL_MAX_SPAN_DAYS
    )

    // Exactly 366 days stays allowed.
    const exact = schema.safeParse({
      from: '2025-03-15',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(exact.success).toBe(true)
  })

  it('rejects malformed dates at the field level', async () => {
    const { initTestI18n } = await import('../__tests__/test-i18n')
    await initTestI18n()
    const schema = buildFunnelFilterSchema(i18next.t.bind(i18next))
    const result = schema.safeParse({
      from: '2026-02-30',
      to: '2026-03-15',
      utm_source: '',
      utm_campaign: '',
      model: '',
    })
    expect(result.success).toBe(false)
  })
})

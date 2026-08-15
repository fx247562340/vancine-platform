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
import { describe, expect, it } from 'vitest'

import { formatChartTime } from '@/lib/time'
import { DEFAULT_CURRENCY_CONFIG } from '@/stores/system-config-store'

import type { QuotaDataItem } from '../../types'
import { processChartData, processUserChartData } from '../charts'

// Deterministic bucket: fixtures share one day bucket so the expected time
// keys are computed with the same formatter the production code uses (avoids
// local-timezone drift in the assertion).
const T = 1700000000
const DAY_KEY = formatChartTime(T, 'day')

const quotaPerUnit = DEFAULT_CURRENCY_CONFIG.quotaPerUnit
const usage = (rawQuota: number) => Number((rawQuota / quotaPerUnit).toFixed(4))

// processChartData pads sparse time series up to MAX_CHART_TREND_POINTS (7)
// day buckets ending at the latest data point.
const PADDED_DAY_KEYS = Array.from({ length: 6 }, (_, i) =>
  formatChartTime(T - (i + 1) * 86400, 'day')
)

function lineValues(result: ReturnType<typeof processChartData>) {
  return result.spec_line.data[0].values
}

type LineValue = {
  Time: string
  Model: string
  rawQuota: number
  Usage: number
  TimeSum: number
}

function lineRowAt(
  result: ReturnType<typeof processChartData>,
  model: string,
  time: string
) {
  return lineValues(result).find(
    (v: LineValue) => v.Model === model && v.Time === time
  )
}

function pieValues(result: ReturnType<typeof processChartData>) {
  return result.spec_pie.data[0].values
}

function modelLineValues(result: ReturnType<typeof processChartData>) {
  return result.spec_model_line.data[0].values
}

function rankValues(result: ReturnType<typeof processUserChartData>) {
  return result.spec_user_rank.data[0].values
}

function trendValues(result: ReturnType<typeof processUserChartData>) {
  return result.spec_user_trend.data[0].values
}

describe('processChartData aggregation', () => {
  it('returns empty specs for empty input', () => {
    const result = processChartData([])

    expect(pieValues(result)).toEqual([])
    expect(lineValues(result)).toEqual([])
    expect(result.spec_area.data[0].values).toEqual([])
    expect(modelLineValues(result)).toEqual([])
    expect(result.spec_rank_bar.data[0].values).toEqual([])
    expect(result.totalCountDisplay).toBe('0')
  })

  it('aggregates quota, count and tokens for identical time/model rows', () => {
    const items: QuotaDataItem[] = [
      {
        created_at: T,
        model_name: 'gpt-4o',
        quota: 100,
        count: 2,
        token_used: 50,
      },
      {
        created_at: T,
        model_name: 'gpt-4o',
        quota: 200,
        count: 3,
        token_used: 100,
      },
    ]
    const result = processChartData(items)

    // One real bucket plus six zero-filled padded buckets.
    expect(lineValues(result)).toHaveLength(7)
    expect(lineRowAt(result, 'gpt-4o', DAY_KEY)).toEqual({
      Time: DAY_KEY,
      Model: 'gpt-4o',
      rawQuota: 300,
      Usage: usage(300),
      TimeSum: 300,
    })
    for (const padded of PADDED_DAY_KEYS) {
      expect(lineRowAt(result, 'gpt-4o', padded)).toEqual({
        Time: padded,
        Model: 'gpt-4o',
        rawQuota: 0,
        Usage: 0,
        TimeSum: 0,
      })
    }
    expect(modelLineValues(result)).toHaveLength(7)
    expect(
      modelLineValues(result).find(
        (v: { Time: string; Model: string; Count: number }) =>
          v.Time === DAY_KEY
      )
    ).toEqual({ Time: DAY_KEY, Model: 'gpt-4o', Count: 5 })
    expect(pieValues(result)).toEqual([{ type: 'gpt-4o', value: 5 }])
    expect(result.totalCountDisplay).toBe('5')
  })

  it('falls back to Unknown for rows without model_name', () => {
    const items: QuotaDataItem[] = [{ created_at: T, quota: 10, count: 1 }]
    const result = processChartData(items)

    expect(lineRowAt(result, 'Unknown', DAY_KEY)).toEqual({
      Time: DAY_KEY,
      Model: 'Unknown',
      rawQuota: 10,
      Usage: usage(10),
      TimeSum: 10,
    })
  })

  it('keeps zero quota rows as zero instead of NaN or a spike', () => {
    const items: QuotaDataItem[] = [
      { created_at: T, model_name: 'm1', quota: 0, count: 0 },
      { created_at: T, model_name: 'm2' },
    ]
    const result = processChartData(items)

    const m1 = lineRowAt(result, 'm1', DAY_KEY)
    const m2 = lineRowAt(result, 'm2', DAY_KEY)
    expect(m1).toEqual({
      Time: DAY_KEY,
      Model: 'm1',
      rawQuota: 0,
      Usage: 0,
      TimeSum: 0,
    })
    expect(m2).toEqual({
      Time: DAY_KEY,
      Model: 'm2',
      rawQuota: 0,
      Usage: 0,
      TimeSum: 0,
    })
  })
})

describe('processUserChartData aggregation', () => {
  it('aggregates quota per user and emits rank + trend rows', () => {
    const items: QuotaDataItem[] = [
      { created_at: T, username: 'alice', quota: 100 },
      { created_at: T, username: 'alice', quota: 50 },
      { created_at: T, username: 'bob', quota: 30 },
    ]
    const result = processUserChartData(items)

    expect(rankValues(result)).toEqual([
      { User: 'alice', rawQuota: 150, Usage: usage(150) },
      { User: 'bob', rawQuota: 30, Usage: usage(30) },
    ])
    expect(trendValues(result)).toEqual([
      { Time: DAY_KEY, User: 'alice', rawQuota: 150, Usage: usage(150) },
      { Time: DAY_KEY, User: 'bob', rawQuota: 30, Usage: usage(30) },
    ])
  })

  it('falls back to the unknown user contract for rows without username', () => {
    const items: QuotaDataItem[] = [{ created_at: T, quota: 42 }]
    const result = processUserChartData(items)

    expect(rankValues(result)).toEqual([
      { User: 'unknown', rawQuota: 42, Usage: usage(42) },
    ])
  })

  it('applies the limit and zero-fills missing time points for top users', () => {
    const T2 = T + 86400
    const items: QuotaDataItem[] = [
      { created_at: T, username: 'alice', quota: 200 },
      { created_at: T2, username: 'bob', quota: 100 },
      { created_at: T2, username: 'carol', quota: 999 },
    ]
    const result = processUserChartData(items, 'day', undefined, 2)
    const day2Key = formatChartTime(T2, 'day')

    // Rank is limited to the top two users, sorted by quota desc.
    expect(rankValues(result)).toEqual([
      { User: 'carol', rawQuota: 999, Usage: usage(999) },
      { User: 'alice', rawQuota: 200, Usage: usage(200) },
    ])

    // Trend covers every time point x every top user, zero-filling gaps;
    // the excluded user never appears.
    expect(trendValues(result)).toEqual([
      { Time: DAY_KEY, User: 'carol', rawQuota: 0, Usage: 0 },
      { Time: DAY_KEY, User: 'alice', rawQuota: 200, Usage: usage(200) },
      { Time: day2Key, User: 'carol', rawQuota: 999, Usage: usage(999) },
      { Time: day2Key, User: 'alice', rawQuota: 0, Usage: 0 },
    ])
  })
})

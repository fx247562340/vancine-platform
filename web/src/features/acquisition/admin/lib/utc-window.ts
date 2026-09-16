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
/**
 * UTC date window helpers for the acquisition funnel. All arithmetic is done
 * on the UTC calendar (Date.UTC / getUTC*), never on the browser's local
 * timezone, so the default range is always "the last 30 complete UTC days"
 * regardless of where the admin's machine is.
 */

/** Maximum allowed range span, mirroring the backend's 366-day cap. */
export const FUNNEL_MAX_SPAN_DAYS = 366

/** Default range length: the last 30 complete UTC days. */
export const FUNNEL_DEFAULT_RANGE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Format a UTC timestamp (milliseconds) as YYYY-MM-DD on the UTC calendar. */
export function formatUtcDate(utcMs: number): string {
  const d = new Date(utcMs)
  const year = String(d.getUTCFullYear()).padStart(4, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a YYYY-MM-DD string into the UTC millisecond instant of that day's
 * 00:00. Returns null for anything that is not a real calendar date, so
 * "2026-02-30" and "2026-13-01" never become adjacent-day values.
 */
export function parseUtcDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const ms = Date.UTC(year, month - 1, day)
  const d = new Date(ms)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return ms
}

export interface UtcDayWindow {
  /** Inclusive window start, YYYY-MM-DD (UTC). */
  from: string
  /** Exclusive window end, YYYY-MM-DD (UTC). */
  to: string
}

/**
 * Default query window: `to` is today's UTC date 00:00 (exclusive end, so the
 * in-progress day is never included) and `from` is `days` complete UTC days
 * earlier. With the default 30 this is exactly the last 30 complete UTC days.
 */
export function getDefaultUtcWindow(
  now: Date = new Date(),
  days: number = FUNNEL_DEFAULT_RANGE_DAYS
): UtcDayWindow {
  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
  const fromMs = todayUtcMs - days * DAY_MS
  return { from: formatUtcDate(fromMs), to: formatUtcDate(todayUtcMs) }
}

/** Whole UTC days in the half-open window [from, to). */
export function utcDaySpan(from: string, to: string): number {
  const fromMs = parseUtcDate(from)
  const toMs = parseUtcDate(to)
  if (fromMs === null || toMs === null) return Number.NaN
  return (toMs - fromMs) / DAY_MS
}

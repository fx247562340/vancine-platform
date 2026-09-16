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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import type { AcquisitionFunnelFormValues } from '../types'
import {
  FUNNEL_MAX_SPAN_DAYS,
  getDefaultUtcWindow,
  parseUtcDate,
  utcDaySpan,
} from './utc-window'

/**
 * Field-level schema. Every message is an i18n key (identical to the English
 * copy) translated at render time by FormMessage; keep them in sync with
 * locales en.json / zh.json.
 */
export const funnelDateStringSchema = z
  .string()
  .min(1, 'Date is required')
  .refine((value) => parseUtcDate(value) !== null, {
    message: 'Date must be a valid YYYY-MM-DD date',
  })

/**
 * Cross-field rules: from < to and span <= 366 days. Built as a factory so
 * the same constraints can be unit-tested directly and reused by the form
 * resolver.
 */
export function buildFunnelFilterSchema(t: TFunction) {
  return z
    .object({
      from: funnelDateStringSchema,
      to: funnelDateStringSchema,
      utm_source: z.string(),
      utm_campaign: z.string(),
      model: z.string(),
    })
    .superRefine((values, ctx) => {
      const fromMs = parseUtcDate(values.from)
      const toMs = parseUtcDate(values.to)
      if (fromMs === null || toMs === null) return

      if (fromMs >= toMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('From date must be earlier than To date'),
          path: ['from'],
        })
        return
      }

      const spanDays = utcDaySpan(values.from, values.to)
      if (spanDays > FUNNEL_MAX_SPAN_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('Date range cannot exceed {{days}} days', {
            days: FUNNEL_MAX_SPAN_DAYS,
          }),
          path: ['to'],
        })
      }
    })
}

/** Form defaults: the last 30 complete UTC days with empty text filters. */
export function buildFunnelFormDefaults(
  now: Date = new Date()
): AcquisitionFunnelFormValues {
  const window = getDefaultUtcWindow(now)
  return {
    from: window.from,
    to: window.to,
    utm_source: '',
    utm_campaign: '',
    model: '',
  }
}

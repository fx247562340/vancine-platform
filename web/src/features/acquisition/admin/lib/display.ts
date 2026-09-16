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
import dayjs from 'dayjs'
import utcPlugin from 'dayjs/plugin/utc'
/**
 * Display formatting for funnel values. The API contract distinguishes real
 * zeros (valid counts) from JSON null (metric unavailable) — formatting must
 * preserve that distinction instead of collapsing null into 0.
 */
import { t } from 'i18next'

import type { AcquisitionCompleteness } from '../types'

dayjs.extend(utcPlugin)

/** i18n key for a JSON-null metric. */
export const UNAVAILABLE_LABEL_KEY = 'Unavailable'

/**
 * Format a nullable funnel count: 0 stays "0"; null/undefined means the
 * backend could not compute the metric and renders the translated
 * Unavailable label ("Unavailable" / "暂不可用").
 */
export function formatFunnelCount(value: number | null | undefined): string {
  if (value == null) return t(UNAVAILABLE_LABEL_KEY)
  return String(value)
}

/**
 * Format a backend-provided conversion rate. The funnel API reports 0–1
 * ratios (0.5 = 50%); they are rendered as percentages and NEVER recomputed
 * from the counts — the backend's rate is the single source of truth.
 * Null rates render the translated Unavailable label.
 */
export function formatFunnelRate(value: number | null | undefined): string {
  if (value == null) return t(UNAVAILABLE_LABEL_KEY)
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format the coverage marker as a true UTC timestamp (YYYY-MM-DD
 * HH:mm:ss). Formatting happens on the UTC calendar fields — never the
 * browser's local zone — so the rendered value matches the "(UTC)" suffix
 * the page appends.
 */
export function formatCoverageTimestamp(unixSeconds: number): string {
  const d = dayjs.unix(unixSeconds).utc()
  return d.format('YYYY-MM-DD HH:mm:ss')
}

export interface CompletenessStyle {
  /** i18n key for the badge label. */
  labelKey: string
  /** Theme-token class distinguishing the three states. */
  className: string
}

/**
 * Map a per-source completeness flag to its badge label and theme styling.
 * Only three states exist in the backend contract; anything unexpected is
 * rendered conservatively as unavailable styling with the raw value shown.
 */
export function getCompletenessStyle(
  status: AcquisitionCompleteness
): CompletenessStyle {
  switch (status) {
    case 'complete':
      return {
        labelKey: 'Complete',
        className: 'bg-success/10 text-success border-success/30',
      }
    case 'error':
      return {
        labelKey: 'Error',
        className: 'bg-destructive/10 text-destructive border-destructive/30',
      }
    default:
      return {
        labelKey: 'Unavailable',
        className: 'bg-muted text-muted-foreground border-border',
      }
  }
}

/**
 * Echoed filter chips: only non-empty backend-echoed filters are listed, so
 * the displayed scope always matches the backend's sanitized query rather
 * than the raw form.
 */
export function getEchoedFilterChips(filters: {
  utm_source: string
  utm_campaign: string
  model: string
}): { labelKey: string; value: string }[] {
  const chips: { labelKey: string; value: string }[] = []
  if (filters.utm_source) {
    chips.push({ labelKey: 'UTM source', value: filters.utm_source })
  }
  if (filters.utm_campaign) {
    chips.push({ labelKey: 'UTM campaign', value: filters.utm_campaign })
  }
  if (filters.model) {
    chips.push({ labelKey: 'Model', value: filters.model })
  }
  return chips
}

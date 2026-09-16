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
import type {
  AcquisitionFunnelFormValues,
  AcquisitionFunnelParams,
} from '../types'
import { parseUtcDate } from './utc-window'

/**
 * Convert validated form values into the exact backend query params. Dates
 * become Unix seconds at UTC midnight; empty text filters are omitted entirely
 * so the request never carries empty-string filter params. The `to` day is
 * sent as-is — the backend treats the window as half-open [from, to).
 */
export function buildFunnelRequestParams(
  values: AcquisitionFunnelFormValues
): AcquisitionFunnelParams {
  const fromMs = parseUtcDate(values.from)
  const toMs = parseUtcDate(values.to)
  if (fromMs === null || toMs === null) {
    throw new Error(
      'invalid funnel window: dates must be validated before building params'
    )
  }
  return {
    from: Math.floor(fromMs / 1000),
    to: Math.floor(toMs / 1000),
    ...(values.utm_source ? { utm_source: values.utm_source } : {}),
    ...(values.utm_campaign ? { utm_campaign: values.utm_campaign } : {}),
    ...(values.model ? { model: values.model } : {}),
  }
}

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
 * Wire contract of GET /api/acquisition/funnel (backend: AdminAuth). This is
 * the frontend mirror of model.AcquisitionFunnelResult in
 * model/acquisition_touch.go. Pointer metrics serialize as JSON null when
 * unavailable — the page must never reinterpret null as 0.
 */

/** One per-source honesty flag reported by the backend. */
export type AcquisitionCompleteness = 'complete' | 'unavailable' | 'error'

/**
 * Backend-echoed sanitized filters. `from`/`to` are Unix seconds forming the
 * half-open window [from, to); the three text filters are exact-match values
 * (empty string means "not filtered").
 */
export interface AcquisitionFunnelFiltersEcho {
  from: number
  to: number
  utm_source: string
  utm_campaign: string
  model: string
}

/** Aggregate admin funnel report. No user-level data is ever returned. */
export interface AcquisitionFunnelResult {
  landing_view: number
  signup_started: number
  signup_completed: number
  api_key_created: number | null
  first_api_call_succeeded: number | null
  landing_to_signup: number | null
  signup_to_first_call: number | null
  filters: AcquisitionFunnelFiltersEcho
  coverage_started_at: number
  consume_logs_enabled: boolean
  historical_backfill_available: boolean
  from_before_coverage: boolean
  data_completeness: {
    touches: AcquisitionCompleteness
    tokens: AcquisitionCompleteness
    consume_logs: AcquisitionCompleteness
  }
}

/** Envelope used by the unified backend API response format. */
export interface AcquisitionFunnelResponse {
  success: boolean
  message?: string
  data?: AcquisitionFunnelResult
}

/** Validated filter form values, before they become request params. */
export interface AcquisitionFunnelFormValues {
  from: string
  to: string
  utm_source: string
  utm_campaign: string
  model: string
}

/** Exact query params the backend funnel endpoint understands. */
export interface AcquisitionFunnelParams {
  from: number
  to: number
  utm_source?: string
  utm_campaign?: string
  model?: string
}

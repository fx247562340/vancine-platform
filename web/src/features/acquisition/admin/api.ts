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
import { AxiosError } from 'axios'

import { api } from '@/lib/api'

import type {
  AcquisitionFunnelParams,
  AcquisitionFunnelResponse,
  AcquisitionFunnelResult,
} from './types'

/**
 * Feature-local failure for the funnel query. Transport failures are
 * deliberately re-wrapped as this plain error — never an AxiosError — so the
 * app's global QueryCache hook in src/main.tsx (which toasts and redirects
 * to /500 when it sees an AxiosError with status 500) does not hijack this
 * page's own error card + Retry. That is a feature-local choice; other pages
 * keep the global behavior unchanged. The axios interceptor's 401/403
 * handling (token refresh, sign-in redirect, toasts) runs before this
 * wrapping and is untouched.
 */
export class AcquisitionFunnelRequestError extends Error {
  /** HTTP status when the failure came from a response, if any. */
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AcquisitionFunnelRequestError'
    this.status = status
  }
}

/**
 * Fetch the aggregate acquisition funnel report. Uses the project-wide `api`
 * instance so the existing interceptors attach the dashboard Authorization
 * header and handle 401/403 uniformly (no skipErrorHandler opt-out). The
 * backend signals business failures (e.g. invalid range, funnel unavailable)
 * with HTTP 200 + success:false, so the envelope is validated here and
 * surfaced as a rejected promise — React Query then enters isError (the
 * query sets retry:false, so no automatic retries) and the page shows its
 * error state with Retry. Params must already be validated and contain no
 * empty-string filters (see buildFunnelRequestParams).
 */
export async function getAcquisitionFunnel(
  params: AcquisitionFunnelParams
): Promise<AcquisitionFunnelResult> {
  let res
  try {
    res = await api.get<AcquisitionFunnelResponse>('/api/acquisition/funnel', {
      params,
    })
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new AcquisitionFunnelRequestError(
        error.message || 'funnel request failed',
        error.response?.status
      )
    }
    throw error
  }
  const payload = res.data
  if (payload?.success !== true || payload.data == null) {
    throw new AcquisitionFunnelRequestError(
      payload?.message || 'funnel request failed'
    )
  }
  return payload.data
}

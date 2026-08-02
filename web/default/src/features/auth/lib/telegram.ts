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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ApiResponse } from '../types'

// ============================================================================
// Telegram OAuth helpers
// ============================================================================

/**
 * Payload handed to the `data-onauth` callback by the Telegram Login Widget.
 * Mirrors the fields the Classic theme forwards to the backend.
 */
export interface TelegramAuthPayload {
  id?: number | string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date?: number | string
  hash?: string
  lang?: string
  [key: string]: unknown
}

/**
 * The exact set of fields forwarded to `/api/oauth/telegram/login`. Kept in
 * sync with the Classic `onTelegramLoginClicked` field list so the backend
 * HMAC signature check receives the same inputs.
 */
export const TELEGRAM_AUTH_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'username',
  'photo_url',
  'auth_date',
  'hash',
  'lang',
] as const

export type TelegramAuthField = (typeof TELEGRAM_AUTH_FIELDS)[number]

/**
 * Build the query params for the Telegram login endpoint from a widget
 * payload. Mirrors Classic's truthy filter: absent/empty fields are dropped so
 * only real values reach the backend signature check.
 */
export function buildTelegramLoginParams(
  payload: TelegramAuthPayload
): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const field of TELEGRAM_AUTH_FIELDS) {
    const value = payload[field]
    if (value) {
      params[field] = value as string | number
    }
  }
  return params
}

/**
 * Execute the Telegram login request against the backend.
 *
 * The `@/lib/api` module is imported lazily so this module carries no
 * top-level `@/` side effects — the pure helpers above stay importable from
 * `node --test`, which has no `@` alias resolver.
 */
export async function telegramLogin(
  payload: TelegramAuthPayload
): Promise<ApiResponse> {
  const { api } = await import('@/lib/api')
  const params = buildTelegramLoginParams(payload)
  const res = await api.get('/api/oauth/telegram/login', { params })
  return res.data as ApiResponse
}

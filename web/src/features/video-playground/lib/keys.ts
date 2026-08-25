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
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'

export type VideoApiKeyOption = {
  id: number
  name: string
  maskedKey: string
  status: number
  createdTime: number
}

export function isUsableVideoApiKey(
  key: Pick<
    ApiKey,
    'status' | 'expired_time' | 'remain_quota' | 'unlimited_quota'
  >,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (key.status !== API_KEY_STATUS.ENABLED) {
    return false
  }
  if (key.expired_time > 0 && key.expired_time <= nowSeconds) {
    return false
  }
  if (!key.unlimited_quota && key.remain_quota <= 0) {
    return false
  }
  return true
}

export function toVideoApiKeyOption(key: ApiKey): VideoApiKeyOption {
  return {
    id: key.id,
    name: key.name,
    maskedKey: key.key,
    status: key.status,
    createdTime: key.created_time,
  }
}

export function pickDefaultVideoApiKey(
  keys: VideoApiKeyOption[]
): VideoApiKeyOption | null {
  if (keys.length === 0) {
    return null
  }
  return [...keys].sort((left, right) => {
    if (left.createdTime !== right.createdTime) {
      return left.createdTime - right.createdTime
    }
    return left.id - right.id
  })[0]
}

export function bearerApiKey(raw: string): string {
  const trimmed = raw.trim()
  if (/^sk-/i.test(trimmed)) {
    return trimmed
  }
  return `sk-${trimmed}`
}

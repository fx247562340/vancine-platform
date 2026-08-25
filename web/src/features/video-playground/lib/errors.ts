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
import axios from 'axios'

export type VideoPlaygroundErrorSource =
  | { kind: 'system'; errorKey: string }
  | { kind: 'upstream'; rawMessage: string }

export class VideoPlaygroundError extends Error {
  readonly source: VideoPlaygroundErrorSource

  constructor(source: VideoPlaygroundErrorSource) {
    super(source.kind === 'system' ? source.errorKey : source.rawMessage)
    this.name = 'VideoPlaygroundError'
    this.source = source
  }

  get errorKey(): string | undefined {
    return this.source.kind === 'system' ? this.source.errorKey : undefined
  }

  get rawUpstreamMessage(): string | undefined {
    return this.source.kind === 'upstream' ? this.source.rawMessage : undefined
  }
}

export function videoPlaygroundErrorText(
  error: VideoPlaygroundError,
  translate: (key: string) => string
): string {
  if (error.source.kind === 'system') {
    return translate(error.source.errorKey)
  }
  return error.source.rawMessage
}

export function extractServerErrorFromBody(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }
  const envelope = data as {
    error?: { message?: unknown } | string
    message?: unknown
  }
  if (typeof envelope.error === 'string') {
    const message = envelope.error.trim()
    if (message !== '') return message
  }
  if (typeof envelope.error === 'object' && envelope.error) {
    if (typeof envelope.error.message === 'string') {
      const message = envelope.error.message.trim()
      if (message !== '') return message
    }
  }
  if (typeof envelope.message === 'string') {
    const message = envelope.message.trim()
    if (message !== '') return message
  }
  return undefined
}

export function extractUpstreamErrorMessage(
  error: unknown
): string | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined
  }
  return extractServerErrorFromBody(error.response?.data)
}

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
import { extractServerErrorFromBody, VideoPlaygroundError } from './errors'
import { bearerApiKey } from './keys'

type RequestWithApiKeyOptions = {
  path: string
  method?: 'GET' | 'POST'
  apiKey: string
  body?: unknown
  language?: string
  signal?: AbortSignal
  fallbackErrorKey: string
}

// Intentional exception: do not use the shared dashboard Axios instance here.
// That client injects the session JWT and would overwrite the user's API key
// on Authorization. This fetch keeps Bearer sk-... intact.
export async function requestWithApiKey(
  options: RequestWithApiKeyOptions
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearerApiKey(options.apiKey)}`,
    Accept: 'application/json',
  }
  if (options.language) {
    headers['Accept-Language'] = options.language
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(options.path, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: options.fallbackErrorKey,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const message = extractServerErrorFromBody(payload)
    if (message) {
      throw new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: message,
      })
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: options.fallbackErrorKey,
    })
  }

  return payload
}

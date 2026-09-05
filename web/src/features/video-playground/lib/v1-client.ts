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

// Canonical cancellation error for the API-key request layer. A cancelled
// request must surface as AbortError (never as a generic system error) so
// callers can distinguish "the user navigated away / switched key" from a
// real failure and skip any post-await side effects (e.g. key registration).
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function abortError(): Error {
  return Object.assign(new Error('video-request-cancelled'), {
    name: 'AbortError',
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError()
  }
}

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
    if (isAbortError(error) || options.signal?.aborted) {
      throw abortError()
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: options.fallbackErrorKey,
    })
  }
  // A fetch that resolves despite the signal having been aborted (proxy,
  // test double, or a race just before abort) must not proceed: bail out
  // before any response handling or post-await side effects.
  throwIfAborted(options.signal)

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    // A cancellation surfaced by the body stream is NOT a malformed
    // response: rethrow AbortError instead of degrading to payload=undefined
    // and later a generic system error.
    if (isAbortError(error) || options.signal?.aborted) {
      throw abortError()
    }
    payload = undefined
  }
  throwIfAborted(options.signal)

  if (!response.ok) {
    const message = extractServerErrorFromBody(payload)
    if (message) {
      throw new VideoPlaygroundError({
        kind: 'upstream',
        rawMessage: message,
        httpStatus: response.status,
      })
    }
    throw new VideoPlaygroundError({
      kind: 'system',
      errorKey: options.fallbackErrorKey,
      httpStatus: response.status,
    })
  }

  // Final gate before returning: an abort that landed while reading the body
  // means the caller no longer wants this result.
  throwIfAborted(options.signal)
  return payload
}

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
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { loadVideoApiSecret } from '../api'
import { bearerApiKey } from '../lib/keys'

export function isVideoApiSecretCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function abortError(): Error {
  return Object.assign(new Error('video-api-secret-cancelled'), {
    name: 'AbortError',
  })
}

async function waitWithSignal(
  promise: Promise<string>,
  signal?: AbortSignal
): Promise<string> {
  if (!signal) return promise
  if (signal.aborted) throw abortError()
  let onAbort: (() => void) | undefined
  const aborted = new Promise<string>((_resolve, reject) => {
    onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort)
  })
  try {
    const value = await Promise.race([promise, aborted])
    if (signal.aborted) throw abortError()
    return value
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

export function useVideoApiSecret() {
  const secretRef = useRef<string | null>(null)
  const loadedIdRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const inflightRef = useRef<{ id: number; promise: Promise<string> } | null>(
    null
  )

  const clear = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    secretRef.current = null
    loadedIdRef.current = null
    inflightRef.current = null
  }, [])

  useEffect(() => clear, [clear])

  const load = useCallback(async (id: number, signal?: AbortSignal) => {
    if (signal?.aborted) {
      throw abortError()
    }
    if (loadedIdRef.current === id && secretRef.current) {
      return secretRef.current
    }

    if (inflightRef.current?.id === id) {
      return waitWithSignal(inflightRef.current.promise, signal)
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const generation = generationRef.current + 1
    generationRef.current = generation
    secretRef.current = null
    loadedIdRef.current = null

    const promise = (async () => {
      try {
        const raw = await loadVideoApiSecret(id, controller.signal)
        if (generation !== generationRef.current || controller.signal.aborted) {
          throw abortError()
        }
        const normalized = bearerApiKey(raw)
        secretRef.current = normalized
        loadedIdRef.current = id
        return normalized
      } finally {
        if (
          inflightRef.current?.id === id &&
          generation === generationRef.current
        ) {
          inflightRef.current = null
        }
      }
    })()

    inflightRef.current = { id, promise }
    return waitWithSignal(promise, signal)
  }, [])

  return useMemo(() => ({ load, clear }), [load, clear])
}

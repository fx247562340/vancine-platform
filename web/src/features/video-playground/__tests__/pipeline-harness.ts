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
import type { QueryClient } from '@tanstack/react-query'
import { vi } from 'vitest'

// Shared harness for the video playground task pipeline tests. It only fakes
// the two genuinely external boundaries: `fetch` (upstream relay routes) and
// the dashboard axios client (key list + key reveal). The video playground
// api module, registry, hooks, and components under test are always real.

/** A fake key used only inside tests; it is never a working credential. */
export const SUBMIT_API_KEY = 'sk-test-submit-key-not-real'
/** Second fake key used to prove per-task key binding survives key switching. */
export const OTHER_API_KEY = 'sk-test-other-key-not-real'

/** A valid capability token shape: 43 URL-safe Base64 characters. */
const ACCESS_TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

export type RecordedCall = {
  url: string
  method: string
  authorization: string | null
}

export type VideoFetchRoute = (
  url: string,
  init?: RequestInit
) => Response | Promise<Response>

export type VideoRecorder = {
  calls: RecordedCall[]
  install: (route: VideoFetchRoute) => void
}

export type TaskStatusEnvelope = {
  code: string
  data: Record<string, unknown>
}

export type TaskArtifactsEnvelope = Record<string, unknown>

export type VideoArtifactFixture = {
  key: string
  type: string
  mime_type: string
  content_url: string
}

/** Route overrides for the page-level pipeline stub. */
export type PipelineStubOptions = {
  pollStatus?: string
  pollResponse?: (url: string) => Response
  artifactsResponse?: () => Response
}

export type ApiClientMock = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

/**
 * A promise plus resolvers, so tests can hold a request open and settle it
 * at an exact point (before/after unmount or cancel) with no timers.
 */
export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Response bodies are single-use, so every canned response is produced by a
// factory that returns a fresh Response per request.
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  return input.url
}

function authorizationOf(init?: RequestInit): string | null {
  const headers = (init?.headers ?? {}) as Record<string, string>
  return headers.Authorization ?? headers.authorization ?? null
}

/**
 * Installs a recording `fetch` stub. The handler may return a Response (a
 * fresh instance per call) or a Promise of one, letting tests keep a request
 * in flight. Every request is recorded before the handler runs.
 */
function installFetchRecorder(
  handler: VideoFetchRoute,
  calls: RecordedCall[]
): ReturnType<typeof vi.fn> {
  const stub = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = urlOf(input)
      calls.push({
        url,
        method: init?.method ?? 'GET',
        authorization: authorizationOf(init),
      })
      return handler(url, init)
    }
  )
  vi.stubGlobal('fetch', stub)
  return stub
}

/**
 * A per-file fetch recorder: `install` re-stubs the global fetch for one route
 * table, and `calls` exposes every recorded request. Each test file owns its
 * own instance, so recordings never cross files.
 */
export function createVideoRecorder(): VideoRecorder {
  const calls: RecordedCall[] = []
  return {
    calls,
    install: (route: VideoFetchRoute): void => {
      calls.length = 0
      installFetchRecorder(route, calls)
    },
  }
}

/**
 * Resolves when the NEXT mutation reaching this cache settles (success or
 * error). The submit chain under test registers its mutation before the
 * request is sent, and a settled mutation is the explicit completion event
 * for "the late response has been fully processed by the submission layer" —
 * verified to fire even after the page unmounts. Tests await this before any
 * negative assertion, instead of draining a fixed number of microtasks.
 */
export function nextMutationSettled(client: QueryClient): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      const status = event.mutation?.state.status
      if (
        event.type === 'updated' &&
        (status === 'success' || status === 'error')
      ) {
        unsubscribe()
        resolve()
      }
    })
  })
}

/** Generic task DTO envelope from GET /v1/video/generations/:task_id. */
export function statusEnvelope(
  taskId: string,
  status: string,
  extra: Record<string, unknown> = {}
): TaskStatusEnvelope {
  return {
    code: 'success',
    data: {
      id: 7,
      task_id: taskId,
      platform: 'volcengine',
      user_id: 42,
      status,
      ...extra,
    },
  }
}

/** Task Artifacts envelope for GET /v1/tasks/:task_id/artifacts. */
export function artifactsEnvelope(
  taskId: string,
  artifacts: unknown[],
  extra: Record<string, unknown> = {}
): TaskArtifactsEnvelope {
  return { task_id: taskId, artifacts, ...extra }
}

export function capabilityUrl(
  taskId: string,
  artifactKey: string,
  access = ACCESS_TOKEN,
  origin = 'https://media.test'
): string {
  return `${origin}/v1/tasks/${taskId}/artifacts/${artifactKey}/content?access=${access}`
}

export function videoArtifact(
  taskId: string,
  key = 'video',
  extra: Record<string, unknown> = {}
): VideoArtifactFixture & Record<string, unknown> {
  return {
    key,
    type: 'video',
    mime_type: 'video/mp4',
    content_url: capabilityUrl(taskId, key),
    ...extra,
  }
}

/**
 * Minimal axios `/api/token` wiring for the page-level tests: one usable key
 * (id 2) whose revealed secret is `SUBMIT_API_KEY`.
 */
export function stubKeyEndpoints(apiMock: ApiClientMock): void {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/token/')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 2,
                name: 'default',
                key: 'sk-***1111',
                status: 1,
                created_time: 100,
                expired_time: 0,
                remain_quota: 0,
                unlimited_quota: true,
              },
            ],
            total: 1,
          },
        },
      }
    }
    throw new Error(`unexpected api.get: ${url}`)
  })
  apiMock.post.mockImplementation(async (url: string) => {
    if (url === '/api/token/2/key') {
      return { data: { success: true, data: { key: SUBMIT_API_KEY } } }
    }
    throw new Error(`unexpected api.post: ${url}`)
  })
}

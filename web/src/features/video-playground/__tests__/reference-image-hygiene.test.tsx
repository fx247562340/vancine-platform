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

For commercial licensing, please contact support@quantumnous.com.
*/

/**
 * Memory and secrecy hygiene of the rebuilt reference-image tray.
 *
 * Two things must stay out of sight for the whole life of an attached image:
 * the base64 payload that goes on the wire (the DOM, browser storage and the
 * React Query caches must never carry it — a thumbnail is an object URL owned
 * by the resource store), and the full API key secret (it may only ever travel
 * as the out-of-band credential argument of a submit call).
 *
 * Each assertion runs against the real page after a real attach, remove and
 * submit, so a leak introduced anywhere in that composition fails here.
 */
import { Buffer } from 'node:buffer'

import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { i18n as I18n } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routerLinkMock } from '@/test/router-link-mock'

import {
  getVideoModelsWithApiKey,
  getVideoTask,
  submitVideoGenerationRequest,
} from '../api'
import {
  capturedSubmitBodies,
  createVideoPlaygroundI18n,
  FAKE_SECRET,
  makeImageFile,
  pickReferenceImages,
  renderVideoPlayground,
  stubAuthUser,
  stubVideoApi,
  submitStudio,
  typePrompt,
} from './test-utils'

vi.mock('@tanstack/react-router', () => routerLinkMock)
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listUsableVideoApiKeys: vi.fn(),
    loadVideoApiSecret: vi.fn(),
    getVideoModelsWithApiKey: vi.fn(),
    submitVideoGenerationRequest: vi.fn(),
    submitVideoGenerationWithApiKey: vi.fn(),
    getVideoTask: vi.fn(),
  }
})

/**
 * The base64 payload of a fixture, derived from the fixture's own bytes rather
 * than from the production reader, so the expectation cannot be produced by the
 * code under test. A window in the middle of the payload is used as the marker:
 * it is long enough to be distinctive and short enough to keep the assertion
 * readable.
 */
async function base64MarkerOf(file: File): Promise<string> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  return base64.slice(64, 128)
}

function referenceTray(): HTMLElement {
  return screen.getByRole('group', { name: 'Reference images' })
}

async function expectAttachedImages(count: number): Promise<void> {
  await waitFor(() => {
    expect(
      within(referenceTray()).queryAllByRole('button', { name: /^Remove / })
    ).toHaveLength(count)
  })
}

/** Circular-safe rendering of a cache entry's observable state. */
function serializeState(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  const seen = new WeakSet<object>()
  try {
    return (
      JSON.stringify(value, (_key, inner: unknown) => {
        if (inner instanceof Error) {
          return `${inner.name} ${inner.message}`
        }
        if (inner && typeof inner === 'object') {
          if (seen.has(inner)) {
            return '[circular]'
          }
          seen.add(inner)
        }
        return inner
      }) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

/** Everything the query cache currently exposes: keys plus observable state. */
function serializedQueries(client: QueryClient): string {
  return client
    .getQueryCache()
    .getAll()
    .map(
      (query) =>
        `${serializeState(query.queryKey)}\n${serializeState(query.state)}`
    )
    .join('\n')
}

/** Everything the mutation cache currently exposes. */
function serializedMutations(client: QueryClient): string {
  return client
    .getMutationCache()
    .getAll()
    .map((mutation) => serializeState(mutation.state))
    .join('\n')
}

/** Wait until the tray is enabled, which is when it accepts input at all. */
async function readyTray(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('reference-image-file-input')).toBeEnabled()
  })
}

let i18n: I18n
let consoleSpies: ReturnType<typeof vi.spyOn>[]
let restoreObjectUrls: (() => void) | undefined

/** jsdom implements neither object-URL API; the resource store owns both. */
function stubObjectUrls(): void {
  const urlStatics = URL as unknown as {
    createObjectURL?: (blob: Blob) => string
    revokeObjectURL?: (url: string) => void
  }
  const hadCreate = typeof urlStatics.createObjectURL === 'function'
  const hadRevoke = typeof urlStatics.revokeObjectURL === 'function'
  const previousCreate = urlStatics.createObjectURL
  const previousRevoke = urlStatics.revokeObjectURL
  let issued = 0
  urlStatics.createObjectURL = () => {
    issued += 1
    return `blob:hygiene-${issued}`
  }
  urlStatics.revokeObjectURL = () => undefined
  restoreObjectUrls = () => {
    if (hadCreate) {
      urlStatics.createObjectURL = previousCreate
    } else {
      delete urlStatics.createObjectURL
    }
    if (hadRevoke) {
      urlStatics.revokeObjectURL = previousRevoke
    } else {
      delete urlStatics.revokeObjectURL
    }
  }
}

beforeEach(async () => {
  stubAuthUser()
  await stubVideoApi({})
  i18n = await createVideoPlaygroundI18n()
  window.localStorage.clear()
  window.sessionStorage.clear()
  consoleSpies = (['error', 'warn', 'log', 'info', 'debug'] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => undefined)
  )
})

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore())
  restoreObjectUrls?.()
  restoreObjectUrls = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Video studio reference-image hygiene', () => {
  it('renders an attached image as an object URL and keeps its base64 payload out of the DOM', async () => {
    stubObjectUrls()
    const file = makeImageFile('hygiene.png', 'image/png', 4096)
    const marker = await base64MarkerOf(file)
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyTray()

    await pickReferenceImages(user, [file])

    const thumbnail = await within(referenceTray()).findByRole('img', {
      name: 'hygiene.png',
    })
    expect(thumbnail.getAttribute('src')).toMatch(/^blob:hygiene-/)
    const html = document.documentElement.innerHTML
    expect(html).not.toContain(marker)
    expect(html).not.toContain('data:image/png;base64,')
  })

  it('writes nothing to localStorage or sessionStorage when reference images are attached, removed and submitted', async () => {
    const user = userEvent.setup()
    renderVideoPlayground(i18n)
    await readyTray()
    await typePrompt(user, 'a heron landing on a post')

    await pickReferenceImages(user, [
      makeImageFile('kept.png'),
      makeImageFile('dropped.png'),
    ])
    await expectAttachedImages(2)
    await user.click(
      within(referenceTray()).getByRole('button', {
        name: 'Remove dropped.png',
      })
    )
    await expectAttachedImages(1)
    await submitStudio(user)

    await waitFor(() => {
      expect(submitVideoGenerationRequest).toHaveBeenCalledTimes(1)
    })
    // The submission really did carry the remaining image.
    const bodies = await capturedSubmitBodies()
    expect(serializeState(bodies[0])).toContain('data:image/png;base64,')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('keeps the full API key secret out of the DOM, the request body, request URLs, both React Query caches and the console', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    // With `../api` mocked there is no real HTTP layer; this guard catches a
    // regression that puts the key into a request URL instead of a header.
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()
    renderVideoPlayground(i18n, client)
    await readyTray()
    await typePrompt(user, 'a market street at dusk')
    await pickReferenceImages(user, [makeImageFile('street.png')])
    await expectAttachedImages(1)

    await submitStudio(user)

    await waitFor(() => {
      expect(submitVideoGenerationRequest).toHaveBeenCalledTimes(1)
    })
    // The secret really was loaded, and it travels only as the out-of-band
    // credential argument of the two calls that need it (bearer-prefixed).
    expect(
      vi.mocked(submitVideoGenerationRequest).mock.calls[0]?.[0]
    ).toContain(FAKE_SECRET)
    expect(vi.mocked(getVideoModelsWithApiKey).mock.calls[0]?.[0]).toContain(
      FAKE_SECRET
    )
    for (const body of await capturedSubmitBodies()) {
      expect(serializeState(body)).not.toContain(FAKE_SECRET)
    }
    for (const call of [
      ...fetchSpy.mock.calls,
      ...vi.mocked(getVideoTask).mock.calls,
    ]) {
      expect(serializeState(call)).not.toContain(FAKE_SECRET)
    }
    expect(document.documentElement.innerHTML).not.toContain(FAKE_SECRET)
    expect(serializedQueries(client)).not.toContain(FAKE_SECRET)
    expect(serializedMutations(client)).not.toContain(FAKE_SECRET)
    const logged = consoleSpies
      .flatMap((spy) => spy.mock.calls.flat())
      .map((argument) => serializeState(argument))
      .join('\n')
    expect(logged).not.toContain(FAKE_SECRET)
  })

  it('keeps an attached image out of the React Query query and mutation caches as base64', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const file = makeImageFile('hygiene.png', 'image/png', 4096)
    const marker = await base64MarkerOf(file)
    const user = userEvent.setup()
    renderVideoPlayground(i18n, client)
    await readyTray()
    await typePrompt(user, 'a heron landing on a post')

    await pickReferenceImages(user, [file])
    await expectAttachedImages(1)
    await submitStudio(user)
    await waitFor(() => {
      expect(submitVideoGenerationRequest).toHaveBeenCalledTimes(1)
    })
    // Let the pipeline settle past the accepted task id, so the cache inspected
    // below is the one the page keeps around, not an in-flight snapshot.
    await waitFor(() => {
      expect(vi.mocked(getVideoTask)).toHaveBeenCalled()
    })

    // Non-vacuous: the queries and the settled submit mutation are both cached.
    expect(client.getQueryCache().getAll().length).toBeGreaterThan(0)
    expect(client.getMutationCache().getAll().length).toBeGreaterThan(0)
    expect(
      serializedQueries(client).includes(marker),
      'the query cache must not retain the attached image payload'
    ).toBe(false)
    expect(
      serializedMutations(client).includes(marker),
      'the submit mutation cache entry must not retain the attached image payload'
    ).toBe(false)
  })
})

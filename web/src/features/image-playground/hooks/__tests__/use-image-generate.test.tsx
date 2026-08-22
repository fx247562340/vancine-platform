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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetTestOverrides,
  __setTestClock,
  __setTestSessionId,
} from '@/features/image-playground/lib/clock'
import { useAuthStore } from '@/stores/auth-store'
import {
  IMAGE_HISTORY_MAX_RUNS,
  attachImagePlaygroundCrossTabSync,
  useImagePlaygroundStore,
} from '@/stores/image-playground-store'

import { generateImages } from '../../api'
import { ImagePlaygroundError } from '../../lib/errors'
import * as results from '../../lib/results'
import type { ImageModelProfile } from '../../types'
import { useImageGenerate, type GenerateInput } from '../use-image-generate'

vi.mock('../../api', () => ({
  generateImages: vi.fn(),
}))

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Image generation failed': 'Image generation failed',
        'Unable to determine the current account':
          'Unable to determine the current account',
        'Please re-attach the original reference images before retrying':
          'Please re-attach the original reference images before retrying',
        'Temporary image results are not saved to browser history':
          'Temporary image results are not saved to browser history',
        'Generation was interrupted': 'Generation was interrupted',
        'No images were generated': 'No images were generated',
      },
    },
    zh: {
      translation: {
        'Image generation failed': '图片生成失败',
        'No images were generated': '没有生成任何图片',
      },
    },
  },
})

const profile: ImageModelProfile = {
  sizes: ['1024x1024'],
  defaultSize: '1024x1024',
  supportsCustomSize: false,
  supportsAutoSize: false,
  supportsPromptExtendMode: false,
  thinkingRequiresExtend: false,
  agentRequiresNoRefs: false,
  nRange: { min: 1, max: 4, default: 1 },
  maxReferenceImages: 0,
  supportsNegativePrompt: false,
  maxNegativePromptChars: 0,
  supportsSeed: false,
  supportsWatermark: false,
  supportsPromptExtend: false,
  supportsThinkingMode: false,
}

function makeInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    model: 'qwen-image-2.0',
    group: 'default',
    provider: 'Ali',
    prompt: 'a red apple',
    params: {
      size: '1024x1024',
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: 1,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      promptExtendMode: 'direct',
      thinkingMode: false,
    },
    profile,
    references: [],
    ...overrides,
  }
}

function setInputUser(id: number) {
  useAuthStore.setState({
    auth: {
      ...useAuthStore.getState().auth,
      user: { id, username: `user-${id}`, role: 1 },
    },
  })
}

function renderGenerateHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(() => useImageGenerate(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    ),
  })
}

function seedEnvelopeV2(userId: number, runs: unknown[]) {
  const envelope = {
    version: 2,
    users: { [String(userId)]: { runs } },
  }
  localStorage.setItem(
    'vancine.image-playground.history.v2.envelope',
    JSON.stringify(envelope)
  )
}

/**
 * Returns the page error's resolved display text, exactly as the
 * ImageResults component would render it: the i18n key (if any) is
 * translated through the test i18n instance, then appended with the
 * raw upstream message (if any). Stable, so tests can assert on it.
 */
function readPageError(result: {
  current: {
    pageError: {
      ownerUserId: number | null
      errorKey?: string
      rawUpstreamMessage?: string
    }
  }
}): string {
  const parts: string[] = []
  if (result.current.pageError.errorKey) {
    parts.push(result.current.pageError.errorKey)
  }
  if (result.current.pageError.rawUpstreamMessage) {
    parts.push(result.current.pageError.rawUpstreamMessage)
  }
  return parts.join(' | ')
}

function buildSeededRun(index: number, prompt: string, model: string) {
  return {
    id: `seed-${index}`,
    createdAt: new Date(2026, 0, 1 + index).toISOString(),
    updatedAt: new Date(2026, 0, 1 + index).toISOString(),
    status: 'complete',
    ownerUserId: null,
    model,
    group: 'default',
    provider: 'Ali',
    prompt,
    size: '1024x1024',
    n: 1,
    referenceCount: 0,
    images: [
      {
        resultId: `result-${index}`,
        url: `https://example.invalid/${index}.png`,
      },
    ],
    error: null,
    requestSnapshot: {
      model,
      group: 'default',
      provider: 'Ali',
      prompt,
      params: {
        size: '1024x1024',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 1,
        negativePrompt: '',
        seed: null,
        watermark: false,
        promptExtend: false,
        promptExtendMode: 'direct',
        thinkingMode: false,
      },
      references: [],
      profile: null,
    },
  }
}

describe('useImageGenerate runs', () => {
  beforeEach(() => {
    localStorage.clear()
    const auth = useAuthStore.getState().auth
    useAuthStore.setState({ auth: { ...auth, user: null } })
    vi.mocked(generateImages).mockReset()
    useImagePlaygroundStore.setState({
      _hydrated: false,
      _envelope: { version: 2, users: {} },
    })
  })

  it('appends a second run of the same model without dropping the first', async () => {
    setInputUser(1)
    vi.mocked(generateImages)
      .mockResolvedValueOnce([{ url: 'https://example.invalid/a.png' }])
      .mockResolvedValueOnce([{ url: 'https://example.invalid/b.png' }])
    const { result } = renderGenerateHook()

    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'first' }))
    })
    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'second' }))
    })
    expect(result.current.runs).toHaveLength(2)
    expect(result.current.runs[0].prompt).toBe('second')
    expect(result.current.runs[1].prompt).toBe('first')
  })

  it('keeps runs from a different model when generating again', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    const { result } = renderGenerateHook()

    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'qwen run' }))
    })
    await act(async () => {
      await result.current.generate(
        makeInput({ model: 'wan-2.5', prompt: 'wan run' })
      )
    })
    expect(result.current.runs).toHaveLength(2)
    expect(result.current.runs[0].model).toBe('wan-2.5')
    expect(result.current.runs[1].model).toBe('qwen-image-2.0')
  })

  it('keeps successful runs when the second generation fails and retry retries the last input', async () => {
    setInputUser(1)
    vi.mocked(generateImages)
      .mockResolvedValueOnce([{ url: 'https://example.invalid/a.png' }])
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
      )
      .mockResolvedValueOnce([{ url: 'https://example.invalid/b.png' }])
    const { result } = renderGenerateHook()

    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'ok' }))
    })
    let caught: unknown = null
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fails' }))
        .catch((error: unknown) => {
          caught = error
        })
    })
    expect((caught as Error).message).toBe('boom')

    expect(result.current.runs).toHaveLength(2)
    // The successful run is still present alongside the failed one.
    const success = result.current.runs.find((run) => run.prompt === 'ok')
    expect(success).toBeTruthy()
    const failed = result.current.runs.find((run) => run.prompt === 'fails')
    // P13-B R16: upstream failures store the raw message exclusively in
    // rawErrorMessage (rendered verbatim); when the upstream provides a
    // message, the system key is NOT also stored.
    expect(failed?.rawErrorMessage).toBe('boom')
    expect(failed?.errorKey).toBeUndefined()
    expect(failed?.error).toBeNull()
    expect(readPageError(result)).not.toBe('')

    if (failed) {
      act(() => {
        result.current.retry(failed.id)
      })
      await waitFor(() => {
        expect(
          result.current.runs.find((run) => run.prompt === 'fails')?.images
            .length
        ).toBeGreaterThan(0)
      })
    }
    expect(readPageError(result)).toBe('')
  })

  it('persists url runs per user and strips b64 payloads from storage', async () => {
    setInputUser(7)
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png', b64Json: 'iVBORw0KGgo' },
    ])
    const { result } = renderGenerateHook()

    await act(async () => {
      await result.current.generate(makeInput())
    })

    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('b64_json')
    expect(raw).not.toContain('iVBORw0KGgo')
    expect(raw).toContain('https://example.invalid/a.png')

    // In-memory run keeps the b64 image (for preview / download within
    // the page lifetime) when no http(s) URL was returned.
    vi.mocked(generateImages).mockResolvedValueOnce([
      { b64Json: 'iVBORw0KGgo' },
    ])
    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'b64 only' }))
    })
    const b64Run = result.current.runs.find((run) => run.prompt === 'b64 only')
    expect(b64Run?.images[0].b64Json).toBe('iVBORw0KGgo')
  })

  it('restores persisted runs for the current user on mount', async () => {
    setInputUser(7)
    const seeded = Array.from({ length: 3 }, (_, index) =>
      buildSeededRun(index, `prompt-${index}`, `model-${index}`)
    )
    seedEnvelopeV2(7, seeded)

    const { result } = renderGenerateHook()
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(3)
    })
    // The store re-sorts by updatedAt desc on hydrate; the latest model
    // comes first.
    expect(result.current.runs[0].model).toBe('model-2')
  })

  it('isolates history between user ids', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/user1.png' },
    ])
    const first = renderGenerateHook()
    await act(async () => {
      await first.result.current.generate(makeInput())
    })
    first.unmount()

    setInputUser(2)
    const second = renderGenerateHook()
    await waitFor(() => {
      expect(second.result.current.runs).toHaveLength(0)
    })
    second.unmount()

    setInputUser(1)
    const again = renderGenerateHook()
    await waitFor(() => {
      expect(again.result.current.runs).toHaveLength(1)
      expect(again.result.current.runs[0].images[0].url).toBe(
        'https://example.invalid/user1.png'
      )
    })
  })

  it('caps history at the newest 50 runs', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])
    const seeded = Array.from({ length: 55 }, (_, index) =>
      buildSeededRun(index, `prompt-${index}`, `model-${index}`)
    )
    seedEnvelopeV2(1, seeded)

    const { result } = renderGenerateHook()
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(IMAGE_HISTORY_MAX_RUNS)
    })

    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'newest' }))
    })
    expect(result.current.runs).toHaveLength(IMAGE_HISTORY_MAX_RUNS)
    expect(result.current.runs[0].prompt).toBe('newest')
    // The oldest 6 should have been dropped.
    const remainingPrompts = result.current.runs
      .slice(1)
      .map((run) => run.prompt)
    expect(remainingPrompts).toContain('prompt-49')
    expect(remainingPrompts).not.toContain('prompt-0')
  })

  it('clearHistory empties runs and storage for the current user only', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://example.invalid/a.png' },
    ])

    const seeded = Array.from({ length: 2 }, (_, index) =>
      buildSeededRun(index, `prompt-${index}`, `model-${index}`)
    )
    // Seed both users' buckets into the same envelope.
    const envelope = {
      version: 2,
      users: {
        '1': { runs: seeded },
        '2': { runs: [buildSeededRun(0, 'user2-run', 'qwen-image-2.0')] },
      },
    }
    localStorage.setItem(
      'vancine.image-playground.history.v2.envelope',
      JSON.stringify(envelope)
    )

    const { result } = renderGenerateHook()
    await waitFor(() => {
      expect(result.current.runs.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.clearHistory()
    })
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(0)
    })

    // The other user's bucket is untouched.
    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).toContain('user2-run')
  })

  it('keeps a mid-flight result in the original owner partition when the active user changes', async () => {
    setInputUser(1)
    const deferred: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    deferred.promise = new Promise<unknown>((resolve) => {
      deferred.resolve = resolve
    })
    vi.mocked(generateImages).mockImplementation(
      () => deferred.promise as ReturnType<typeof generateImages>
    )
    const { result } = renderGenerateHook()
    // Kick off the generate call inside act (onMutate creates the run and
    // re-renders). We can't await yet: the mock promise has not resolved.
    let generationPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      generationPromise = result.current.generate(
        makeInput({ prompt: 'user1' })
      )
    })
    // Switch to user 2 before the upstream returns.
    act(() => {
      setInputUser(2)
    })
    await act(async () => {
      deferred.resolve([{ url: 'https://example.invalid/user1.png' }])
    })
    // The generate() promise resolves with the same data user 2 sees in
    // their empty history; the important invariant is that the result
    // landed in user 1's localStorage bucket, not user 2's.
    await generationPromise

    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).toContain('"1":')
    expect(raw).toContain('user1')
    // User 2 sees no runs.
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(0)
    })
    // User 1 still sees the run.
    act(() => {
      setInputUser(1)
    })
    await waitFor(() => {
      expect(result.current.runs[0].prompt).toBe('user1')
    })
  })

  it('exposes attachImagePlaygroundCrossTabSync helper for cross-tab merge', () => {
    const detach = attachImagePlaygroundCrossTabSync()
    expect(typeof detach).toBe('function')
    detach()
  })

  it('double-clicking Retry hits the upstream only once', async () => {
    setInputUser(1)
    const deferred: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    deferred.promise = new Promise<unknown>((resolve) => {
      deferred.resolve = resolve
    })
    vi.mocked(generateImages)
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
      )
      .mockImplementation(
        () => deferred.promise as ReturnType<typeof generateImages>
      )
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fails' }))
        .catch(() => undefined)
    })
    await waitFor(() => {
      expect(result.current.runs.some((run) => run.status === 'error')).toBe(
        true
      )
      expect(result.current.isGenerating).toBe(false)
    })
    const failed = result.current.runs.find((run) => run.status === 'error')
    const failedId = failed?.id ?? ''
    expect(failedId).not.toBe('')
    const stored = useImagePlaygroundStore.getState().getRun(1, failedId)
    expect(stored?.requestSnapshot.prompt).toBe('fails')
    await act(async () => {
      result.current.retry(failedId)
      result.current.retry(failedId)
      await Promise.resolve()
    })
    expect(readPageError(result)).not.toBe(
      'Please re-attach the original reference images before retrying'
    )
    expect(vi.mocked(generateImages)).toHaveBeenCalledTimes(2)
    await act(async () => {
      deferred.resolve([{ url: 'https://example.invalid/retry.png' }])
    })
  })

  it('routes out-of-order mutation callbacks to their own run ids', async () => {
    setInputUser(1)
    const first: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    const second: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    first.promise = new Promise<unknown>((resolve) => {
      first.resolve = resolve
    })
    second.promise = new Promise<unknown>((resolve) => {
      second.resolve = resolve
    })
    const firstHook = renderGenerateHook()
    const secondHook = renderGenerateHook()
    vi.mocked(generateImages)
      .mockImplementationOnce(
        () => first.promise as ReturnType<typeof generateImages>
      )
      .mockImplementationOnce(
        () => second.promise as ReturnType<typeof generateImages>
      )
    act(() => {
      void firstHook.result.current.generate(makeInput({ prompt: 'run-a' }))
    })
    act(() => {
      void secondHook.result.current.generate(makeInput({ prompt: 'run-b' }))
    })
    await act(async () => {
      second.resolve([{ url: 'https://example.invalid/b.png' }])
    })
    await act(async () => {
      first.resolve([{ url: 'https://example.invalid/a.png' }])
    })
    await waitFor(() => {
      expect(firstHook.result.current.runs).toHaveLength(2)
    })
    const byPrompt = Object.fromEntries(
      firstHook.result.current.runs.map((run) => [
        run.prompt,
        run.images[0]?.url,
      ])
    )
    expect(byPrompt['run-a']).toBe('https://example.invalid/a.png')
    expect(byPrompt['run-b']).toBe('https://example.invalid/b.png')
    firstHook.unmount()
    secondHook.unmount()
  })

  it('does not call the upstream when the owner is unresolved', async () => {
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current.generate(makeInput())
    })
    expect(vi.mocked(generateImages)).not.toHaveBeenCalled()
    expect(readPageError(result)).toBe(
      'Unable to determine the current account'
    )
  })

  it('persists error runs without images so they survive refresh', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockRejectedValueOnce(
      new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
    )
    const { result, unmount } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fails' }))
        .catch(() => undefined)
    })
    expect(result.current.runs[0].status).toBe('error')
    expect(result.current.runs[0].rawErrorMessage).toBe('boom')
    expect(result.current.runs[0].errorKey).toBeUndefined()
    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).toContain('fails')
    expect(raw).toContain('boom')
    unmount()
    useImagePlaygroundStore.setState({
      _hydrated: false,
      _envelope: { version: 2, users: {} },
    })
    const again = renderGenerateHook()
    await waitFor(() => {
      expect(again.result.current.runs).toHaveLength(1)
      expect(again.result.current.runs[0].status).toBe('error')
      expect(again.result.current.runs[0].rawErrorMessage).toBe('boom')
      expect(again.result.current.runs[0].errorKey).toBeUndefined()
    })
    again.unmount()
  })

  it('keeps a temporary-result shell for base64-only complete runs after refresh', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockResolvedValueOnce([
      { b64Json: 'iVBORw0KGgo' },
    ])
    const first = renderGenerateHook()
    await act(async () => {
      await first.result.current.generate(makeInput({ prompt: 'b64 only' }))
    })
    expect(first.result.current.runs[0].images[0].b64Json).toBe('iVBORw0KGgo')
    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).not.toContain('iVBORw0KGgo')
    expect(raw).toContain('temporaryResultUnavailable')
    first.unmount()
    useImagePlaygroundStore.setState({
      _hydrated: false,
      _envelope: { version: 2, users: {} },
    })
    const again = renderGenerateHook()
    await waitFor(() => {
      expect(again.result.current.runs).toHaveLength(1)
      expect(again.result.current.runs[0].temporaryResultUnavailable).toBe(true)
      expect(again.result.current.runs[0].images).toHaveLength(0)
    })
    again.unmount()
  })

  it('requires re-attaching reference images after refresh and does not hit upstream', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockRejectedValueOnce(
      new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
    )
    const first = renderGenerateHook()
    await act(async () => {
      await first.result.current
        .generate(
          makeInput({
            prompt: 'with-ref',
            profile: { ...profile, maxReferenceImages: 1 },
            references: [
              {
                id: 'ref-1',
                name: 'a.png',
                mimeType: 'image/png',
                dataUrl: 'data:image/png;base64,aaaa',
                size: 4,
              },
            ],
          })
        )
        .catch(() => undefined)
    })
    const raw = localStorage.getItem(
      'vancine.image-playground.history.v2.envelope'
    )
    expect(raw).not.toContain('data:image/png;base64,aaaa')
    first.unmount()
    useImagePlaygroundStore.setState({
      _hydrated: false,
      _envelope: { version: 2, users: {} },
    })
    vi.mocked(generateImages).mockClear()
    const again = renderGenerateHook()
    await waitFor(() => {
      expect(again.result.current.runs).toHaveLength(1)
    })
    act(() => {
      again.result.current.retry(again.result.current.runs[0].id)
    })
    expect(vi.mocked(generateImages)).not.toHaveBeenCalled()
    expect(again.result.current.pageError).toMatchObject({
      ownerUserId: 1,
      errorKey:
        'Please re-attach the original reference images before retrying',
    })
    again.unmount()
  })

  it('does not re-scan old Base64 when a new run is added', async () => {
    setInputUser(1)
    const inspectSpy = vi.spyOn(results, 'inspectBase64Image')
    vi.mocked(generateImages)
      .mockResolvedValueOnce([{ b64Json: 'iVBORw0KGgo' }])
      .mockResolvedValueOnce([{ url: 'https://example.invalid/b.png' }])
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'b64' }))
    })
    const afterFirst = inspectSpy.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)
    await act(async () => {
      await result.current.generate(makeInput({ prompt: 'url' }))
    })
    expect(inspectSpy.mock.calls.length).toBe(afterFirst)
    inspectSpy.mockRestore()
  })

  it('a failed retry records the error without an unhandled rejection', async () => {
    setInputUser(1)
    const unhandled = vi.fn()
    window.addEventListener('unhandledrejection', unhandled)
    vi.mocked(generateImages)
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
      )
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'retry boom' })
      )
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fails' }))
        .catch(() => undefined)
    })
    const failed = result.current.runs.find((run) => run.status === 'error')
    expect(failed).toBeTruthy()

    // Retry is fire-and-forget from the UI: its rejection must be caught.
    const failedId = failed ? failed.id : ''
    expect(failedId).not.toBe('')
    await act(async () => {
      result.current.retry(failedId)
      // Flush microtasks so the rejected promise would have surfaced by now.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => {
      expect(
        result.current.runs.filter((run) => run.status === 'error').length
      ).toBe(2)
      expect(result.current.pageError.rawUpstreamMessage).toBe('retry boom')
    })
    expect(unhandled).not.toHaveBeenCalled()
    window.removeEventListener('unhandledrejection', unhandled)
  })

  it('keeps user A page errors out of user B and preserves A records', async () => {
    setInputUser(1)
    const deferred: {
      promise: Promise<unknown>
      reject: (reason?: unknown) => void
    } = {} as never
    deferred.promise = new Promise<unknown>((_, reject) => {
      deferred.reject = reject
    })
    vi.mocked(generateImages).mockImplementation(
      () => deferred.promise as ReturnType<typeof generateImages>
    )
    const { result } = renderGenerateHook()
    let generationPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      generationPromise = result.current
        .generate(makeInput({ prompt: 'user1-fails' }))
        .catch(() => undefined)
    })
    // Switch to user B before A's request fails.
    act(() => {
      setInputUser(2)
    })
    await act(async () => {
      deferred.reject(
        new ImagePlaygroundError({
          kind: 'upstream',
          rawMessage: 'user 1 failure',
        })
      )
    })
    await generationPromise

    // B's page must not show A's error.
    await waitFor(() => {
      expect(readPageError(result)).toBe('')
      expect(result.current.runs).toHaveLength(0)
    })

    // Switch back to A: the failed run is still recorded there.
    act(() => {
      setInputUser(1)
    })
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1)
      expect(result.current.runs[0].status).toBe('error')
      expect(result.current.runs[0].rawErrorMessage).toBe('user 1 failure')
    })
    // The page error was cleared on the user switch and stays cleared
    // until a new failure for the active user arrives.
    expect(readPageError(result)).toBe('')
  })

  it('clears the page error when the active user changes', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockRejectedValueOnce(
      new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom' })
    )
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fails' }))
        .catch(() => undefined)
    })
    expect(result.current.pageError.rawUpstreamMessage).toBe('boom')
    act(() => {
      setInputUser(2)
    })
    await waitFor(() => {
      expect(readPageError(result)).toBe('')
    })
  })

  it('never retries a run whose persisted snapshot is corrupt', async () => {
    setInputUser(1)
    const seeded: Record<string, unknown> = buildSeededRun(
      0,
      'corrupt',
      'qwen-image-2.0'
    )
    seeded.status = 'error'
    seeded.error = 'boom'
    seeded.images = []
    seeded.snapshotCorrupt = true
    seedEnvelopeV2(1, [seeded])

    const { result } = renderGenerateHook()
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1)
    })
    const run = result.current.runs[0]
    expect(run.retryBlocked).toBe('corrupt-snapshot')
    act(() => {
      result.current.retry(run.id)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(vi.mocked(generateImages)).not.toHaveBeenCalled()
  })

  it('hides Retry for a run whose lease is still owned by another tab', async () => {
    setInputUser(1)
    const seeded: Record<string, unknown> = buildSeededRun(
      0,
      'elsewhere',
      'qwen-image-2.0'
    )
    seeded.status = 'running'
    seeded.error = null
    seeded.images = []
    // Upgrade the seed to snapshotVersion 3 with a complete profile so the
    // test exercises the lease block, not the snapshotCorrupt block.
    seeded.requestSnapshot = {
      snapshotVersion: 3,
      model: 'qwen-image-2.0',
      group: 'default',
      provider: 'Ali',
      prompt: 'elsewhere',
      params: {
        size: '1024x1024',
        sizeMode: 'preset',
        customWidth: null,
        customHeight: null,
        n: 1,
        negativePrompt: '',
        seed: null,
        watermark: false,
        promptExtend: false,
        promptExtendMode: 'direct',
        thinkingMode: false,
      },
      references: [],
      profile: {
        maxReferenceImages: 0,
        supportsAutoSize: false,
        defaultSize: '1024x1024',
        supportsCustomSize: false,
        supportsNegativePrompt: false,
        supportsSeed: false,
        supportsWatermark: false,
        supportsPromptExtend: false,
        supportsPromptExtendMode: false,
        supportsThinkingMode: false,
        thinkingRequiresExtend: false,
        agentRequiresNoRefs: false,
        allowedReferenceMimeTypes: [],
      },
    }
    // Pretend a different tab is still executing the request.
    seeded.leaseOwnerSessionId = 'other-tab'
    seeded.leaseHeartbeatAt = Date.now()
    seedEnvelopeV2(1, [seeded])

    const { result } = renderGenerateHook()
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1)
    })
    const run = result.current.runs[0]
    expect(run.leasedByOtherSession).toBe(true)
    expect(run.retryBlocked).toBe('running-elsewhere')
    // The Retry button is hidden at the UI level because the run is not
    // an error, but invoking the hook's retry() must not issue a second
    // upstream call either.
    act(() => {
      result.current.retry(run.id)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(vi.mocked(generateImages)).not.toHaveBeenCalled()
  })

  it('upstream errors store only the verbatim raw message; system errors only the i18n key; language switches re-translate the key', async () => {
    setInputUser(1)
    // Upstream error: ONLY the raw message is stored - the errorKey stays
    // undefined on both the run record and the page error.
    vi.mocked(generateImages).mockImplementationOnce(() => {
      const err = new ImagePlaygroundError({
        kind: 'upstream',
        rawMessage: 'upstream blew up at 502',
      })
      return Promise.reject(err)
    })
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fail-with-raw' }))
        .catch(() => undefined)
    })
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe(
      'upstream blew up at 502'
    )
    expect(result.current.runs[0].errorKey).toBeUndefined()
    expect(result.current.runs[0].rawErrorMessage).toBe(
      'upstream blew up at 502'
    )

    // System error: ONLY the stable i18n key is stored; the raw field stays
    // undefined. The key is translated at render time, so a language switch
    // re-labels it without touching any persisted text.
    vi.mocked(generateImages).mockImplementationOnce(() => {
      return Promise.reject(
        new ImagePlaygroundError({
          kind: 'system',
          errorKey: 'Image generation failed',
        })
      )
    })
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'fail-system' }))
        .catch(() => undefined)
    })
    expect(result.current.pageError.rawUpstreamMessage).toBeUndefined()
    expect(result.current.pageError.errorKey).toBe('Image generation failed')
    const systemRun = result.current.runs.find(
      (run) => run.prompt === 'fail-system'
    )
    expect(systemRun?.errorKey).toBe('Image generation failed')
    expect(systemRun?.rawErrorMessage).toBeUndefined()

    // Language switch: the stored key stays stable (it is resolved through
    // t() at render time) while the raw upstream message stays untranslated.
    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    expect(i18n.t('Image generation failed')).toBe('图片生成失败')
    expect(result.current.pageError.errorKey).toBe('Image generation failed')
    const rawRun = result.current.runs.find(
      (run) => run.prompt === 'fail-with-raw'
    )
    expect(rawRun?.rawErrorMessage).toBe('upstream blew up at 502')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('B never sees A page error on first render, even right after a switch', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockRejectedValueOnce(
      new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'boom for A' })
    )
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'A-fails' }))
        .catch(() => undefined)
    })
    // A's first-render: the upstream error surfaces ONLY the raw message.
    expect(result.current.pageError.ownerUserId).toBe(1)
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe('boom for A')

    // Switch to user B immediately, no await, no tick.
    act(() => {
      setInputUser(2)
    })
    // B's first-render must not show A's error: the visible page error is
    // the empty state because the stored ownerUserId (=1) does not match
    // the current userId (=2). B never sees the raw message that belongs
    // to A, even synchronously after the switch.
    expect(result.current.pageError.ownerUserId).toBe(null)
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBeUndefined()
    // The run record for A is still in A's partition; B's history is empty.
    expect(result.current.runs).toHaveLength(0)
  })

  // P13-B R16 P0-1: A's heartbeat must keep refreshing A's run after a
  // mid-flight account switch, so the lease stays held by the original
  // session. Switching to B (with the same sessionStorage tab) must not
  // redirect the heartbeat to B's userId and must not interrupt A's run.
  it('A starts a request, switches to B mid-flight, and A lease stays held by the original session', async () => {
    setInputUser(1)
    __resetTestOverrides()
    __setTestSessionId('session-A')
    __setTestClock(1_000_000)
    const deferred: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    deferred.promise = new Promise<unknown>((resolve) => {
      deferred.resolve = resolve
    })
    vi.mocked(generateImages).mockImplementation(
      () => deferred.promise as ReturnType<typeof generateImages>
    )
    const { result } = renderGenerateHook()
    let generationPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      generationPromise = result.current.generate(
        makeInput({ prompt: 'A-in-flight' })
      )
    })
    const aRun = useImagePlaygroundStore
      .getState()
      .getRuns(1)
      .find((run) => run.prompt === 'A-in-flight')
    expect(aRun).toBeDefined()
    const runId = aRun?.id ?? ''
    expect(aRun?.leaseOwnerSessionId).toBe('session-A')

    // Switch to B mid-flight. The activeRunRef in the hook still
    // references A's owner; the heartbeat ticker must continue to
    // refresh A's lease using the captured ownerUserId, not B's.
    act(() => {
      setInputUser(2)
    })

    // Wait past the 30s lease window, with the heartbeat ticker's
    // real-time interval refreshing A's lease. The run must still be
    // 'running' in A's bucket, owned by 'session-A'.
    await act(async () => {
      __setTestClock(1_045_000) // +45s past start, well past the 30s window
    })
    // Yield to the real-time setInterval so the captured-owner
    // heartbeat has a chance to fire at least once.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    const aRunAfter = useImagePlaygroundStore.getState().getRun(1, runId)
    // A lease stays fresh because the heartbeat uses the captured
    // ownerUserId, not the current user's.
    expect(aRunAfter?.status).toBe('running')
    expect(aRunAfter?.leaseOwnerSessionId).toBe('session-A')

    // B sees no records at all (different user bucket).
    expect(useImagePlaygroundStore.getState().getRuns(2)).toHaveLength(0)

    // A's request resolves; the result lands in A's bucket, not B's.
    await act(async () => {
      deferred.resolve([{ url: 'https://example.invalid/A-only.png' }])
    })
    await generationPromise
    await waitFor(() => {
      const aDone = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(aDone?.status).toBe('complete')
      expect(aDone?.images[0]?.url).toBe('https://example.invalid/A-only.png')
    })
    expect(useImagePlaygroundStore.getState().getRuns(2)).toHaveLength(0)
    expect(result.current.runs).toHaveLength(0) // B's view is empty
    __resetTestOverrides()
  })

  // P13-B R16 P0-2: a stale lease MUST transition to outcome-unknown
  // and MUST NOT expose Retry. retry(runId) on an outcome-unknown run
  // must be a hard no-op (generateImages is not called).
  it('stale lease transitions to outcome-unknown and retry(runId) is a hard no-op', async () => {
    setInputUser(1)
    __resetTestOverrides()
    __setTestSessionId('session-A')
    __setTestClock(2_000_000)
    const deferred: {
      promise: Promise<unknown>
      resolve: (value: unknown) => void
    } = {} as never
    deferred.promise = new Promise<unknown>((resolve) => {
      deferred.resolve = resolve
    })
    vi.mocked(generateImages).mockImplementation(
      () => deferred.promise as ReturnType<typeof generateImages>
    )
    const { result } = renderGenerateHook()
    let generationPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      generationPromise = result.current
        .generate(makeInput({ prompt: 'wanderer' }))
        .catch(() => undefined)
    })
    const runId =
      useImagePlaygroundStore
        .getState()
        .getRuns(1)
        .find((run) => run.prompt === 'wanderer')?.id ?? ''
    expect(runId).not.toBe('')

    // Simulate background-tab throttling: the heartbeat ticker pauses
    // for >30s (here we set the clock far past the lease window and
    // skip the real-time interval entirely).
    act(() => {
      __setTestClock(2_120_000) // +120s, no heartbeat refresh
    })
    // The user opens the tab again and the heartbeat ticker fires;
    // reclaimNow catches the stale lease and transitions to
    // outcome-unknown.
    await act(async () => {
      useImagePlaygroundStore.getState().reclaimNow()
    })
    const stale = useImagePlaygroundStore.getState().getRun(1, runId)
    expect(stale?.status).toBe('unknown')
    expect(stale?.errorKey).toBe('Generation was interrupted (outcome unknown)')

    // Run-level Retry: the hook computes retryBlocked === 'outcome-unknown'
    // for this run; the UI hides Retry, and retry() is a no-op.
    const staleRun = result.current.runs.find((run) => run.id === runId)
    expect(staleRun?.retryBlocked).toBe('outcome-unknown')
    expect(staleRun?.status).toBe('unknown')
    const callsBefore = vi.mocked(generateImages).mock.calls.length
    act(() => {
      result.current.retry(runId)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(vi.mocked(generateImages).mock.calls.length).toBe(callsBefore)

    // The original upstream eventually returns a real success. The
    // owner's late updateRun (via onSuccess) overwrites the unknown
    // placeholder with the real terminal state, restoring the run to
    // 'complete'.
    await act(async () => {
      deferred.resolve([{ url: 'https://example.invalid/late-real.png' }])
    })
    await generationPromise
    await waitFor(() => {
      const recovered = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(recovered?.status).toBe('complete')
      expect(recovered?.images[0]?.url).toBe(
        'https://example.invalid/late-real.png'
      )
      expect(recovered?.errorKey).toBeUndefined()
    })
    __resetTestOverrides()
  })

  // P13-B R16 P1-3: a fresh user (B) who takes over after A left an
  // error on screen MUST be able to write their own page error. A's
  // late failure callback must NOT overwrite B's freshly set error.
  it('B can take over the page error after A leaves, A late callback does not pollute B', async () => {
    setInputUser(1)
    vi.mocked(generateImages)
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'A failure' })
      )
      .mockRejectedValueOnce(
        new ImagePlaygroundError({ kind: 'upstream', rawMessage: 'B failure' })
      )
    const { result } = renderGenerateHook()
    // A fails, A's page error is set.
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'A-fails' }))
        .catch(() => undefined)
    })
    expect(result.current.pageError.ownerUserId).toBe(1)
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe('A failure')
    // Switch to B.
    act(() => {
      setInputUser(2)
    })
    // B's first frame must not show A's error (the visible-page-error
    // gate filters out other owners).
    expect(result.current.pageError.ownerUserId).toBe(null)
    // B fails. B's page error must surface on the very next render.
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'B-fails' }))
        .catch(() => undefined)
    })
    expect(result.current.pageError.ownerUserId).toBe(2)
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe('B failure')
  })

  // P13-B R18 P2: the closed error source makes the two storage forms
  // mutually exclusive by construction. An upstream error keeps the raw
  // text only (never t()'d, no generic key in the same record); a system
  // failure keeps only the stable i18n key. The page error mirrors the
  // run record exactly.
  it('upstream error stores rawErrorMessage only; system fallback stores errorKey only', async () => {
    setInputUser(1)
    vi.mocked(generateImages).mockImplementationOnce(() => {
      return Promise.reject(
        new ImagePlaygroundError({
          kind: 'upstream',
          rawMessage: 'upstream blew up',
        })
      )
    })
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'p2-error' }))
        .catch(() => undefined)
    })
    // Per-run: the upstream text is the rawErrorMessage; the system key
    // is NOT also stored (exclusivity).
    const run = result.current.runs[0]
    expect(run.errorKey).toBeUndefined()
    expect(run.rawErrorMessage).toBe('upstream blew up')
    expect(run.error).toBeNull()
    // Page-level error mirrors the run record: raw message only.
    expect(result.current.pageError.errorKey).toBeUndefined()
    expect(result.current.pageError.rawUpstreamMessage).toBe('upstream blew up')
  })

  it('fallback system error (no upstream text) stores only errorKey', async () => {
    setInputUser(1)
    // A plain Error carries no closed error source; resolveErrorSource must
    // fail closed on the system i18n key and never write the raw text.
    vi.mocked(generateImages).mockImplementationOnce(() => {
      return Promise.reject(new Error(''))
    })
    const { result } = renderGenerateHook()
    await act(async () => {
      await result.current
        .generate(makeInput({ prompt: 'p2-fallback' }))
        .catch(() => undefined)
    })
    const run = result.current.runs[0]
    expect(run.errorKey).toBe('Image generation failed')
    expect(run.rawErrorMessage).toBeUndefined()
    expect(run.error).toBeNull()
    expect(result.current.pageError.errorKey).toBe('Image generation failed')
    expect(result.current.pageError.rawUpstreamMessage).toBeUndefined()
  })
})

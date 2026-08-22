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
import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetTestOverrides,
  __setTestClock,
  __setTestSessionId,
} from '@/features/image-playground/lib/clock'

import {
  IMAGE_HISTORY_MAX_RUNS,
  attachImagePlaygroundCrossTabSync,
  parseEnvelope,
  useImagePlaygroundStore,
  type AddRunInput,
  type StoredRun,
} from '../image-playground-store'

const ENVELOPE_KEY = 'vancine.image-playground.history.v2.envelope'

function makeAddInput(prompt: string, ownerUserId: number): AddRunInput {
  return {
    ownerUserId,
    model: 'qwen-image-2.0',
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
    size: '1024x1024',
  }
}

function buildRemoteRun(
  id: string,
  prompt: string,
  ownerUserId: number,
  updatedAt: string
): StoredRun {
  return {
    id,
    status: 'complete',
    createdAt: updatedAt,
    updatedAt,
    ownerUserId,
    model: 'qwen-image-2.0',
    group: 'default',
    provider: 'Ali',
    prompt,
    size: '1024x1024',
    n: 1,
    referenceCount: 0,
    images: [
      {
        resultId: `${id}-img`,
        url: `https://example.invalid/${id}.png`,
      },
    ],
    error: null,
    requestSnapshot: {
      snapshotVersion: 3,
      model: 'qwen-image-2.0',
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

function resetStore() {
  useImagePlaygroundStore.setState({
    _hydrated: false,
    _envelope: { version: 2, users: {} },
  })
}

describe('image playground history store', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
  })

  it('caps a user history at the newest 50 runs', () => {
    const store = useImagePlaygroundStore.getState()
    for (let i = 0; i < IMAGE_HISTORY_MAX_RUNS + 5; i++) {
      store.addRun(makeAddInput(`prompt-${i}`, 1))
    }
    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs.length).toBe(IMAGE_HISTORY_MAX_RUNS)
    // Newest first.
    expect(runs[0].prompt).toBe(`prompt-${IMAGE_HISTORY_MAX_RUNS + 4}`)
    expect(runs.at(-1)?.prompt).toBe('prompt-5')
  })

  it('isolates runs between different user ids', () => {
    const store = useImagePlaygroundStore.getState()
    store.addRun(makeAddInput('user-1-run', 1))
    store.addRun(makeAddInput('user-2-run', 2))
    expect(useImagePlaygroundStore.getState().getRuns(1)).toHaveLength(1)
    expect(useImagePlaygroundStore.getState().getRuns(2)).toHaveLength(1)
    expect(useImagePlaygroundStore.getState().getRuns(1)[0].prompt).toBe(
      'user-1-run'
    )
    expect(useImagePlaygroundStore.getState().getRuns(2)[0].prompt).toBe(
      'user-2-run'
    )
  })

  it('merges a remote tab run without dropping the local run', () => {
    const store = useImagePlaygroundStore.getState()
    store.addRun(makeAddInput('local-run', 1))

    // Simulate another tab persisting its own run for the same user.
    const remoteRun = buildRemoteRun(
      'remote-1',
      'remote-run',
      1,
      new Date(Date.now() + 1000).toISOString()
    )
    const remoteEnvelope = {
      version: 2,
      users: { '1': { runs: [remoteRun] } },
    }
    useImagePlaygroundStore.getState().mergeEnvelope(remoteEnvelope)

    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(2)
    const prompts = runs.map((run) => run.prompt).sort()
    expect(prompts).toEqual(['local-run', 'remote-run'])
  })

  it('prefers the newer updatedAt when the same run id arrives from two tabs', () => {
    const store = useImagePlaygroundStore.getState()
    store.addRun(makeAddInput('local-run', 1))
    const localRun = useImagePlaygroundStore.getState().getRuns(1)[0]

    // Another tab updates the SAME run id with a newer timestamp and a
    // different prompt (e.g. a retried/superseded record).
    const updatedRemote = {
      ...localRun,
      prompt: 'superseded-run',
      updatedAt: new Date(Date.now() + 5000).toISOString(),
    }
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [updatedRemote] } },
    })

    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(1)
    expect(runs[0].prompt).toBe('superseded-run')
  })

  it('reacts to a cross-tab storage event after attaching the listener', () => {
    const store = useImagePlaygroundStore.getState()
    store.addRun(makeAddInput('local-run', 1))
    const detach = attachImagePlaygroundCrossTabSync()

    const remoteRun = buildRemoteRun(
      'remote-2',
      'storage-event-run',
      1,
      new Date(Date.now() + 2000).toISOString()
    )
    const newValue = JSON.stringify({
      version: 2,
      users: { '1': { runs: [remoteRun] } },
    })
    localStorage.setItem(ENVELOPE_KEY, newValue)
    window.dispatchEvent(
      new StorageEvent('storage', { key: ENVELOPE_KEY, newValue })
    )

    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(2)
    expect(runs.some((run) => run.prompt === 'storage-event-run')).toBe(true)
    detach()
  })

  it('fails closed when localStorage contains corrupt JSON', () => {
    localStorage.setItem(ENVELOPE_KEY, '{corrupt json')
    useImagePlaygroundStore.getState().hydrate()
    // Hydration must not throw and must yield an empty history.
    expect(useImagePlaygroundStore.getState().getRuns(1)).toHaveLength(0)
  })

  it('migrates legacy v1 per-user records into the v2 envelope', () => {
    const legacyKey = 'vancine.image-playground.history.v1.user.7'
    const legacyRun = {
      id: 'legacy-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      model: 'qwen-image-2.0',
      group: 'default',
      provider: 'Ali',
      prompt: 'legacy-prompt',
      size: '1024x1024',
      n: 1,
      referenceCount: 0,
      images: [{ url: 'https://example.invalid/legacy.png' }],
    }
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ version: 1, runs: [legacyRun] })
    )

    useImagePlaygroundStore.getState().hydrate()
    const runs = useImagePlaygroundStore.getState().getRuns(7)
    expect(runs).toHaveLength(1)
    expect(runs[0].prompt).toBe('legacy-prompt')
    expect(runs[0].ownerUserId).toBe(7)
  })

  it('ignores malformed storage envelopes without throwing', () => {
    expect(() => parseEnvelope({ version: 2 })).not.toThrow()
    expect(parseEnvelope({ version: 2 }).users).toEqual({})
    expect(() => parseEnvelope({ version: 2, users: 'nope' })).not.toThrow()
    expect(
      parseEnvelope({
        version: 2,
        users: {
          '1': {
            runs: [
              { id: '', prompt: 'bad' },
              {
                id: 'ok',
                status: 'not-a-status',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                ownerUserId: 'x',
                model: 'qwen-image-2.0',
                group: 'default',
                provider: 'Ali',
                prompt: 'bad',
                size: '1024x1024',
                n: 1,
                referenceCount: 0,
                images: [{ url: 'https://example.invalid/a.png' }],
              },
            ],
          },
        },
      }).users['1']?.runs ?? []
    ).toHaveLength(0)
  })

  it('does not resurrect a cleared user history from a stale tab write', () => {
    const store = useImagePlaygroundStore.getState()
    const { runId } = store.addRun(makeAddInput('keep-me', 1))
    useImagePlaygroundStore.getState().updateRun(1, runId, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/keep.png' }],
    })
    store.clearUser(1)
    expect(useImagePlaygroundStore.getState().getRuns(1)).toHaveLength(0)

    const stale = buildRemoteRun(
      'stale-1',
      'should-not-return',
      1,
      new Date(Date.now() - 5000).toISOString()
    )
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [stale], revision: 0 } },
    })
    expect(useImagePlaygroundStore.getState().getRuns(1)).toHaveLength(0)
  })

  it('merges two tabs adding one run each into both memory and storage', () => {
    const store = useImagePlaygroundStore.getState()
    store.addRun(makeAddInput('tab-a', 1))
    const remote = buildRemoteRun(
      'tab-b',
      'tab-b',
      1,
      new Date(Date.now() + 1000).toISOString()
    )
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [remote] } },
    })
    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs.map((run) => run.prompt).sort()).toEqual(['tab-a', 'tab-b'])
    const raw = localStorage.getItem(ENVELOPE_KEY) ?? ''
    expect(raw).toContain('tab-a')
    expect(raw).toContain('tab-b')
  })

  it('clears user A without dropping user B', () => {
    const store = useImagePlaygroundStore.getState()
    const { runId: runA } = store.addRun(makeAddInput('user-a', 1))
    const { runId: runB } = store.addRun(makeAddInput('user-b', 2))
    useImagePlaygroundStore.getState().updateRun(1, runA, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/a.png' }],
    })
    useImagePlaygroundStore.getState().updateRun(2, runB, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/b.png' }],
    })
    store.clearUser(1)
    expect(useImagePlaygroundStore.getState().getRuns(1)).toHaveLength(0)
    expect(useImagePlaygroundStore.getState().getRuns(2)[0].prompt).toBe(
      'user-b'
    )
    const raw = localStorage.getItem(ENVELOPE_KEY) ?? ''
    expect(raw).toContain('user-b')
    expect(raw).not.toContain('user-a')
  })

  it('converts persisted running runs to outcome-unknown on hydrate', () => {
    const running = buildRemoteRun(
      'running-1',
      'still-running',
      1,
      '2026-01-01T00:00:00.000Z'
    )
    running.status = 'running'
    running.images = []
    localStorage.setItem(
      ENVELOPE_KEY,
      JSON.stringify({
        version: 2,
        users: { '1': { runs: [running] } },
      })
    )
    useImagePlaygroundStore.getState().hydrate()
    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(1)
    // P13-B R16: a stale lease transitions to the outcome-unknown terminal
    // status, NOT a retryable error. The notice is a stable i18n key so
    // the component renders it via t(errorKey).
    expect(runs[0].status).toBe('unknown')
    expect(runs[0].errorKey).toBe(
      'Generation was interrupted (outcome unknown)'
    )
    expect(runs[0].error).toBeNull()
    expect(runs[0].leaseOwnerSessionId).toBeNull()
  })

  it('keeps an active run through clearUser and lets it complete afterwards', () => {
    const store = useImagePlaygroundStore.getState()
    const { runId } = store.addRun(makeAddInput('active-run', 1))
    const { runId: doneId } = store.addRun(makeAddInput('done-run', 1))
    useImagePlaygroundStore.getState().updateRun(1, doneId, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/done.png' }],
    })

    useImagePlaygroundStore.getState().clearUser(1)
    const afterClear = useImagePlaygroundStore.getState().getRuns(1)
    // Terminal history is gone, the active run survives.
    expect(afterClear.map((run) => run.id)).toEqual([runId])
    expect(afterClear[0].status).toBe('running')

    // The in-flight request completes: updateRun must still find the run
    // and write the paid result.
    useImagePlaygroundStore.getState().updateRun(1, runId, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/paid.png' }],
      error: null,
    })
    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('complete')
    expect(runs[0].images[0].url).toBe('https://example.invalid/paid.png')
  })

  it('does not tombstone an active run on a cross-tab clear merge', () => {
    const store = useImagePlaygroundStore.getState()
    const { runId } = store.addRun(makeAddInput('active-run', 1))
    const active = useImagePlaygroundStore.getState().getRun(1, runId)
    expect(active).not.toBeNull()

    // Another tab clears after our run started (clearedAt newer than the
    // run's updatedAt, higher revision). The active run must survive the
    // merge so its eventual result can still be written.
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: {
        '1': {
          runs: [],
          clearedAt: new Date(Date.now() + 5000).toISOString(),
          revision: 99,
        },
      },
    })
    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs.map((run) => run.id)).toEqual([runId])
    expect(runs[0].status).toBe('running')

    // And it still completes normally after the cross-tab clear.
    useImagePlaygroundStore.getState().updateRun(1, runId, {
      status: 'complete',
      images: [{ resultId: 'img', url: 'https://example.invalid/late.png' }],
    })
    expect(useImagePlaygroundStore.getState().getRuns(1)[0].status).toBe(
      'complete'
    )
  })

  it('keeps the local Base64-only result when another tab adds an unrelated run', () => {
    const store = useImagePlaygroundStore.getState()
    const { runId } = store.addRun(makeAddInput('b64-run', 1))
    const b64Image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const updatedAt = new Date().toISOString()
    useImagePlaygroundStore.getState().updateRun(1, runId, {
      status: 'complete',
      images: [
        {
          resultId: 'img',
          url: '',
          b64Json: b64Image,
          mime: 'image/png',
          renderable: true,
        },
      ],
      temporaryResultUnavailable: true,
    })
    // Pin updatedAt: the other tab's copy of this run (without b64) carries
    // the same version, only richer local state differs.
    useImagePlaygroundStore.setState((state) => {
      const bucket = state._envelope.users['1']
      if (!bucket) return state
      return {
        _envelope: {
          ...state._envelope,
          users: {
            ...state._envelope.users,
            '1': {
              ...bucket,
              runs: bucket.runs.map((run) =>
                run.id === runId ? { ...run, updatedAt } : run
              ),
            },
          },
        },
      }
    })

    // Tab B persisted the same run (URL-less shell, no b64) plus its own
    // unrelated new run, then fired the storage event.
    const remoteEnvelope = {
      version: 2,
      users: {
        '1': {
          runs: [
            {
              ...buildRemoteRun('other-run', 'unrelated', 1, updatedAt),
            },
            {
              ...buildRemoteRun(runId, 'b64-run', 1, updatedAt),
              images: [],
              temporaryResultUnavailable: true,
            },
          ],
        },
      },
    }
    const newValue = JSON.stringify(remoteEnvelope)
    localStorage.setItem(ENVELOPE_KEY, newValue)
    const detach = attachImagePlaygroundCrossTabSync()
    window.dispatchEvent(
      new StorageEvent('storage', { key: ENVELOPE_KEY, newValue })
    )

    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(2)
    const kept = runs.find((run) => run.id === runId)
    expect(kept?.images[0]?.b64Json).toBe(b64Image)
    expect(kept?.images[0]?.mime).toBe('image/png')
    // The temporary Base64 still never reaches localStorage.
    const raw = localStorage.getItem(ENVELOPE_KEY) ?? ''
    expect(raw).not.toContain(b64Image)
    detach()
  })

  it('marks runs with corrupt snapshots as not retryable but keeps them visible', () => {
    const base = buildRemoteRun(
      'corrupt-1',
      'corrupt-snapshot',
      1,
      '2026-01-02T00:00:00.000Z'
    )
    const withCorruptN = JSON.parse(JSON.stringify(base))
    withCorruptN.requestSnapshot.params.n = 'four' as unknown as number
    withCorruptN.requestSnapshot.params.seed = 'x' as unknown as null
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [withCorruptN] } },
    })

    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(base))
    legacy.id = 'legacy-1'
    delete legacy.requestSnapshot
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [legacy] } },
    })

    const runs = useImagePlaygroundStore.getState().getRuns(1)
    expect(runs).toHaveLength(2)
    for (const run of runs) {
      expect(run.snapshotCorrupt).toBe(true)
      // Still displayed with a sane display-only snapshot.
      expect(run.requestSnapshot.model).toBe('qwen-image-2.0')
      expect(run.requestSnapshot.references).toEqual([])
    }

    // A previously-flagged run stays not-retryable even if someone rewrites
    // its snapshot field in storage.
    const tampered = JSON.parse(JSON.stringify(base))
    tampered.id = 'corrupt-1'
    tampered.snapshotCorrupt = true
    useImagePlaygroundStore.getState().mergeEnvelope({
      version: 2,
      users: { '1': { runs: [tampered] } },
    })
    const after = useImagePlaygroundStore
      .getState()
      .getRuns(1)
      .find((run) => run.id === 'corrupt-1')
    expect(after?.snapshotCorrupt).toBe(true)
  })

  describe('tab execution lease', () => {
    beforeEach(() => {
      __resetTestOverrides()
    })

    it('addRun stamps a fresh lease owned by the current session', () => {
      __setTestClock(1_000_000)
      __setTestSessionId('session-A')
      useImagePlaygroundStore.getState().addRun(makeAddInput('mine', 1))
      const run = useImagePlaygroundStore.getState().getRuns(1)[0]
      expect(run.leaseOwnerSessionId).toBe('session-A')
      expect(run.leaseHeartbeatAt).toBe(1_000_000)
    })

    it('preserves a newer persisted heartbeat when a stale tab writes another run', () => {
      __setTestClock(1_000_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('paid-active-run', 1))

      __setTestClock(1_020_000)
      useImagePlaygroundStore.getState().refreshHeartbeat(1, runId)
      expect(
        useImagePlaygroundStore.getState().getRun(1, runId)?.leaseHeartbeatAt
      ).toBe(1_020_000)

      // Simulate another tab that still holds the pre-heartbeat copy in
      // memory while localStorage already contains the owner's newer lease.
      useImagePlaygroundStore.setState((state) => {
        const bucket = state._envelope.users['1']
        if (!bucket) return state
        return {
          _envelope: {
            ...state._envelope,
            users: {
              ...state._envelope.users,
              '1': {
                ...bucket,
                runs: bucket.runs.map((run) =>
                  run.id === runId
                    ? { ...run, leaseHeartbeatAt: 1_000_000 }
                    : run
                ),
              },
            },
          },
        }
      })

      __setTestClock(1_035_000)
      useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('unrelated-tab-write', 1))
      useImagePlaygroundStore.getState().reclaimNow()

      const active = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(active?.leaseHeartbeatAt).toBe(1_020_000)
      expect(active?.status).toBe('running')
    })

    it('never resurrects an active copy over a terminal copy at the same timestamp', () => {
      __setTestClock(2_000_000)
      __setTestSessionId('session-A')
      const input = makeAddInput('fast-finish', 1)
      input.references = [
        {
          id: 'ref-1',
          name: 'one.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,one',
        },
        {
          id: 'ref-2',
          name: 'two.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,two',
        },
      ]
      const { runId } = useImagePlaygroundStore.getState().addRun(input)
      const active = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(active).not.toBeNull()
      if (active == null) throw new Error('expected an active run fixture')

      useImagePlaygroundStore.getState().updateRun(1, runId, {
        status: 'complete',
        images: [
          { resultId: 'img', url: 'https://example.invalid/complete.png' },
        ],
      })

      // The owner persisted a terminal copy, but this stale tab still has
      // an active in-memory copy with richer reference dataUrls.
      useImagePlaygroundStore.setState((state) => {
        const bucket = state._envelope.users['1']
        if (!bucket) return state
        return {
          _envelope: {
            ...state._envelope,
            users: {
              ...state._envelope.users,
              '1': {
                ...bucket,
                runs: bucket.runs.map((run) =>
                  run.id === runId ? active : run
                ),
              },
            },
          },
        }
      })

      // The stale tab still has the active copy in memory and persists an
      // unrelated run in the same millisecond as the terminal transition.
      useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('unrelated-tab-write', 1))

      const merged = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(merged?.status).toBe('complete')
      expect(merged?.images[0]?.url).toBe(
        'https://example.invalid/complete.png'
      )
    })

    it('hydrate keeps a fresh lease from another tab running, no Retry available', () => {
      __setTestClock(10_000_000)
      __setTestSessionId('session-B')
      const remote: StoredRun = {
        id: 'lease-1',
        status: 'running',
        createdAt: new Date(10_000_000).toISOString(),
        updatedAt: new Date(10_000_000).toISOString(),
        ownerUserId: 1,
        model: 'qwen-image-2.0',
        group: 'default',
        provider: 'Ali',
        prompt: 'remote active',
        size: '1024x1024',
        n: 1,
        referenceCount: 0,
        images: [],
        error: null,
        requestSnapshot: {
          snapshotVersion: 3,
          model: 'qwen-image-2.0',
          group: 'default',
          provider: 'Ali',
          prompt: 'remote active',
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
        },
        leaseOwnerSessionId: 'session-A',
        leaseHeartbeatAt: 10_000_000,
      }
      localStorage.setItem(
        ENVELOPE_KEY,
        JSON.stringify({ version: 2, users: { '1': { runs: [remote] } } })
      )
      useImagePlaygroundStore.getState().hydrate()
      const runs = useImagePlaygroundStore.getState().getRuns(1)
      expect(runs).toHaveLength(1)
      expect(runs[0].status).toBe('running')
      // B's view keeps the run visible, but no claim on the lease.
      expect(runs[0].leaseOwnerSessionId).toBe('session-A')
    })

    it('hydrate reclaims the lease and interrupts only after the heartbeat expires', () => {
      // P13-B R16: the lease window is now 30s (background-tab throttling
      // tolerance). The stale heartbeat is 60s in the past so it is
      // unambiguously expired.
      __setTestClock(20_060_000)
      __setTestSessionId('session-B')
      const remote: StoredRun = {
        id: 'lease-expired',
        status: 'running',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        ownerUserId: 1,
        model: 'qwen-image-2.0',
        group: 'default',
        provider: 'Ali',
        prompt: 'old active',
        size: '1024x1024',
        n: 1,
        referenceCount: 0,
        images: [],
        error: null,
        requestSnapshot: {
          snapshotVersion: 3,
          model: 'qwen-image-2.0',
          group: 'default',
          provider: 'Ali',
          prompt: 'old active',
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
        // Heartbeat from a long-closed tab: 10 seconds in the past.
        leaseOwnerSessionId: 'session-A',
        leaseHeartbeatAt: 10_000_000,
      }
      localStorage.setItem(
        ENVELOPE_KEY,
        JSON.stringify({ version: 2, users: { '1': { runs: [remote] } } })
      )
      useImagePlaygroundStore.getState().hydrate()
      const runs = useImagePlaygroundStore.getState().getRuns(1)
      expect(runs).toHaveLength(1)
      // P13-B R16: an expired lease becomes outcome-unknown, never a
      // retryable error.
      expect(runs[0].status).toBe('unknown')
      expect(runs[0].errorKey).toBe(
        'Generation was interrupted (outcome unknown)'
      )
      expect(runs[0].leaseOwnerSessionId).toBe(null)
    })

    it('refreshHeartbeat is a no-op when the local tab is not the owner', () => {
      __setTestClock(30_000_000)
      __setTestSessionId('session-B')
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: {
          '1': {
            runs: [
              {
                ...buildRemoteRun('mine-1', 'a', 1, '2026-01-02T00:00:00.000Z'),
                status: 'running',
                images: [],
                requestSnapshot: {
                  ...buildRemoteRun(
                    'mine-1',
                    'a',
                    1,
                    '2026-01-02T00:00:00.000Z'
                  ).requestSnapshot,
                },
                leaseOwnerSessionId: 'session-A',
                leaseHeartbeatAt: 30_000_000,
              },
            ],
          },
        },
      })
      useImagePlaygroundStore.getState().refreshHeartbeat(1, 'mine-1')
      const run = useImagePlaygroundStore.getState().getRun(1, 'mine-1')
      expect(run?.leaseHeartbeatAt).toBe(30_000_000)
    })

    it('updateRun drops the lease once the run is terminal', () => {
      __setTestClock(40_000_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('finish', 1))
      useImagePlaygroundStore.getState().updateRun(1, runId, {
        status: 'complete',
        images: [{ resultId: 'img', url: 'https://example.invalid/done.png' }],
      })
      const run = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(run?.status).toBe('complete')
      expect(run?.leaseOwnerSessionId).toBe(null)
      expect(run?.leaseHeartbeatAt).toBe(undefined)
    })

    it('reclaimNow does NOT interrupt a same-session run whose heartbeat is still fresh', () => {
      __setTestClock(300_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('still-running', 1))
      // Heartbeat 1s ago, well within the 5s expiry window.
      __setTestClock(301_000)
      useImagePlaygroundStore.getState().reclaimNow()
      const run = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(run?.status).toBe('running')
    })

    it('reclaimNow interrupts a same-session run whose heartbeat is stale', () => {
      // Simulate tab A starting a generation, then crashing (no further
      // heartbeats). The new same-session tab A boots, hydrates, and
      // discovers the stale lease via the periodic reclaim pass.
      __setTestClock(100_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('crashed', 1))
      // Heartbeat at addRun time is 100_000. Jump the clock past the
      // lease expiry window (30s) to simulate the tab being gone for a
      // while.
      __setTestClock(200_000)
      useImagePlaygroundStore.getState().reclaimNow()
      const run = useImagePlaygroundStore.getState().getRun(1, runId)
      // P13-B R16: the stale run becomes outcome-unknown (not retryable),
      // never a plain retryable error.
      expect(run?.status).toBe('unknown')
      expect(run?.errorKey).toBe('Generation was interrupted (outcome unknown)')
      expect(run?.leaseOwnerSessionId).toBe(null)
    })

    it('A completes the run, B receives the storage event and the run is now complete', () => {
      __setTestClock(50_000_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('cross-tab-finish', 1)) // Tab A's local view: running, lease held.
      const localRun = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(localRun?.status).toBe('running')
      expect(localRun?.leaseOwnerSessionId).toBe('session-A')

      // Tab A finishes the run, the lease is cleared, the result lands.
      useImagePlaygroundStore.getState().updateRun(1, runId, {
        status: 'complete',
        images: [{ resultId: 'img', url: 'https://example.invalid/paid.png' }],
      })
      // Simulate tab B picking up the same envelope via the storage event.
      // B has its own session id; B does not own the lease and never did.
      __setTestSessionId('session-B')
      const newValue = JSON.stringify({
        version: 2,
        users: {
          '1': {
            runs: [
              {
                ...buildRemoteRun(
                  runId,
                  'cross-tab-finish',
                  1,
                  new Date(50_000_000).toISOString()
                ),
                status: 'complete',
                images: [
                  {
                    resultId: 'img',
                    url: 'https://example.invalid/paid.png',
                  },
                ],
                // Bump the snapshot to the current strict contract so the
                // run remains retryable on B (it carries a full profile
                // and a complete params block).
                requestSnapshot: {
                  snapshotVersion: 3,
                  model: 'qwen-image-2.0',
                  group: 'default',
                  provider: 'Ali',
                  prompt: 'cross-tab-finish',
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
                },
                leaseOwnerSessionId: null,
                leaseHeartbeatAt: undefined,
              },
            ],
          },
        },
      })
      localStorage.setItem(ENVELOPE_KEY, newValue)
      const detach = attachImagePlaygroundCrossTabSync()
      window.dispatchEvent(
        new StorageEvent('storage', { key: ENVELOPE_KEY, newValue })
      )
      const runs = useImagePlaygroundStore.getState().getRuns(1)
      expect(runs).toHaveLength(1)
      expect(runs[0].status).toBe('complete')
      expect(runs[0].images[0].url).toBe('https://example.invalid/paid.png')
      // B's view: the run is terminal, no active lease; Retry is available
      // for the failed-then-fixed flow.
      expect(runs[0].leaseOwnerSessionId).toBe(null)
      // The terminal run has no lease; the hook computes retryBlocked at
      // render time, so the store only needs to expose a valid (non-
      // snapshotCorrupt) snapshot for Retry to remain possible.
      expect(runs[0].snapshotCorrupt).toBeFalsy()
      detach()
    })
  })

  describe('strict snapshot fail-closed', () => {
    beforeEach(() => {
      __resetTestOverrides()
    })

    it('a missing profile marks the run snapshotCorrupt, not retryable', () => {
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: {
          '1': {
            runs: [
              {
                ...buildRemoteRun(
                  'missing-profile',
                  'x',
                  1,
                  '2026-01-03T00:00:00.000Z'
                ),
                status: 'error',
                error: 'boom',
                requestSnapshot: {
                  ...buildRemoteRun(
                    'missing-profile',
                    'x',
                    1,
                    '2026-01-03T00:00:00.000Z'
                  ).requestSnapshot,
                  profile: null,
                },
              },
            ],
          },
        },
      })
      const run = useImagePlaygroundStore
        .getState()
        .getRun(1, 'missing-profile')
      expect(run).not.toBeNull()
      expect(run?.snapshotCorrupt).toBe(true)
    })

    it('a partial profile (missing supportsSeed) marks the run snapshotCorrupt', () => {
      const base = buildRemoteRun('partial', 'x', 1, '2026-01-03T00:00:00.000Z')
      const partial = JSON.parse(JSON.stringify(base))
      partial.requestSnapshot.profile = {
        ...base.requestSnapshot.profile,
        supportsSeed: undefined as unknown as boolean,
      }
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: { '1': { runs: [partial] } },
      })
      const run = useImagePlaygroundStore.getState().getRun(1, 'partial')
      expect(run).not.toBeNull()
      expect(run?.snapshotCorrupt).toBe(true)
    })

    it('a missing snapshotVersion (older envelope) marks the run snapshotCorrupt', () => {
      const old = JSON.parse(
        JSON.stringify(buildRemoteRun('v1', 'x', 1, '2026-01-03T00:00:00.000Z'))
      )
      delete old.requestSnapshot.snapshotVersion
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: { '1': { runs: [old] } },
      })
      const run = useImagePlaygroundStore.getState().getRun(1, 'v1')
      expect(run).not.toBeNull()
      expect(run?.snapshotCorrupt).toBe(true)
    })

    it('a wrong-typed capability field (supportsSeed as string) marks the run snapshotCorrupt', () => {
      const base = buildRemoteRun(
        'bad-type',
        'x',
        1,
        '2026-01-03T00:00:00.000Z'
      )
      const bad = JSON.parse(JSON.stringify(base))
      bad.requestSnapshot.profile = {
        ...base.requestSnapshot.profile,
        supportsSeed: 'true' as unknown as boolean,
      }
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: { '1': { runs: [bad] } },
      })
      const run = useImagePlaygroundStore.getState().getRun(1, 'bad-type')
      expect(run).not.toBeNull()
      expect(run?.snapshotCorrupt).toBe(true)
    })

    it('a complete v3 profile is retryable', () => {
      const base = buildRemoteRun('good', 'x', 1, '2026-01-03T00:00:00.000Z')
      const good = JSON.parse(JSON.stringify(base))
      good.requestSnapshot = {
        snapshotVersion: 3,
        model: 'qwen-image-2.0',
        group: 'default',
        provider: 'Ali',
        prompt: 'x',
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
      useImagePlaygroundStore.getState().mergeEnvelope({
        version: 2,
        users: { '1': { runs: [good] } },
      })
      const run = useImagePlaygroundStore.getState().getRun(1, 'good')
      expect(run).not.toBeNull()
      expect(run?.snapshotCorrupt).toBeUndefined()
    })
  })

  describe('P13-B R16 outcome-unknown run state', () => {
    beforeEach(() => {
      __resetTestOverrides()
    })

    it('a late complete callback from the original owner overwrites the outcome-unknown placeholder', () => {
      // Tab A started a request, the heartbeat lease expired, the run
      // became outcome-unknown on hydrate. The original upstream call
      // eventually returns success; the owner's late updateRun must
      // overwrite the placeholder with the real terminal state.
      __setTestClock(20_060_000)
      __setTestSessionId('session-A')
      const unknown: StoredRun = {
        id: 'late-complete',
        status: 'unknown',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ownerUserId: 1,
        model: 'qwen-image-2.0',
        group: 'default',
        provider: 'Ali',
        prompt: 'late but real',
        size: '1024x1024',
        n: 1,
        referenceCount: 0,
        images: [],
        error: null,
        errorKey: 'Generation was interrupted (outcome unknown)',
        requestSnapshot: {
          snapshotVersion: 3,
          model: 'qwen-image-2.0',
          group: 'default',
          provider: 'Ali',
          prompt: 'late but real',
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
        },
      }
      localStorage.setItem(
        ENVELOPE_KEY,
        JSON.stringify({ version: 2, users: { '1': { runs: [unknown] } } })
      )
      useImagePlaygroundStore.getState().hydrate()
      const beforeLate = useImagePlaygroundStore
        .getState()
        .getRun(1, 'late-complete')
      expect(beforeLate?.status).toBe('unknown')
      expect(beforeLate?.errorKey).toBe(
        'Generation was interrupted (outcome unknown)'
      )

      // The original upstream returned a real result. The owner's
      // updateRun overwrites the placeholder with status=complete and
      // the real images, clearing the error key.
      useImagePlaygroundStore.getState().updateRun(1, 'late-complete', {
        status: 'complete',
        images: [{ resultId: 'img', url: 'https://example.invalid/late.png' }],
        error: null,
        errorKey: undefined,
        rawErrorMessage: undefined,
        temporaryResultUnavailable: undefined,
      })
      const afterLate = useImagePlaygroundStore
        .getState()
        .getRun(1, 'late-complete')
      expect(afterLate?.status).toBe('complete')
      expect(afterLate?.errorKey).toBeUndefined()
      expect(afterLate?.rawErrorMessage).toBeUndefined()
      expect(afterLate?.images[0]?.url).toBe('https://example.invalid/late.png')
    })

    it('outcome-unknown runs are removed by clearUser (allowed-from-history)', () => {
      __setTestClock(20_060_000)
      __setTestSessionId('session-A')
      const unknown: StoredRun = {
        id: 'unknown-1',
        status: 'unknown',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ownerUserId: 1,
        model: 'qwen-image-2.0',
        group: 'default',
        provider: 'Ali',
        prompt: 'stale',
        size: '1024x1024',
        n: 1,
        referenceCount: 0,
        images: [],
        error: null,
        errorKey: 'Generation was interrupted (outcome unknown)',
        requestSnapshot: {
          snapshotVersion: 3,
          model: 'qwen-image-2.0',
          group: 'default',
          provider: 'Ali',
          prompt: 'stale',
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
        },
      }
      localStorage.setItem(
        ENVELOPE_KEY,
        JSON.stringify({ version: 2, users: { '1': { runs: [unknown] } } })
      )
      useImagePlaygroundStore.getState().hydrate()
      expect(
        useImagePlaygroundStore.getState().getRun(1, 'unknown-1')?.status
      ).toBe('unknown')
      useImagePlaygroundStore.getState().clearUser(1)
      // The outcome-unknown run is terminal, so clearUser removes it.
      expect(
        useImagePlaygroundStore.getState().getRun(1, 'unknown-1')
      ).toBeNull()
    })

    it('outcome-unknown survives a 5s clock skip and a 60s clock skip without becoming retryable', () => {
      __setTestClock(100_000)
      __setTestSessionId('session-A')
      const { runId } = useImagePlaygroundStore
        .getState()
        .addRun(makeAddInput('background-tab', 1))
      // 5s skip: with the new 30s lease window the run is still fresh.
      __setTestClock(105_000)
      useImagePlaygroundStore.getState().reclaimNow()
      const after5s = useImagePlaygroundStore.getState().getRun(1, runId)
      // 5s gap: with the new 30s lease window the run is still fresh.
      expect(after5s?.status).toBe('running')
      // 60s skip: now past the 30s window, the run becomes outcome-unknown.
      __setTestClock(160_000)
      useImagePlaygroundStore.getState().reclaimNow()
      const after60s = useImagePlaygroundStore.getState().getRun(1, runId)
      expect(after60s?.status).toBe('unknown')
      expect(after60s?.errorKey).toBe(
        'Generation was interrupted (outcome unknown)'
      )
      // Retry is a no-op at the hook layer; the store exposes the
      // status as 'unknown' so the hook computes retryBlocked ===
      // 'outcome-unknown' and never issues a new upstream call.
      expect(after60s?.leaseOwnerSessionId).toBeNull()
    })
  })
})

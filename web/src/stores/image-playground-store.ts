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
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import {
  LEASE_EXPIRY_MS,
  getCurrentSessionId,
  getCurrentTimeMs,
} from '@/features/image-playground/lib/clock'
import type {
  ImageGenerationParams,
  ImageModelProfile,
  ReferenceImage,
} from '@/features/image-playground/types'

/**
 * The Image Playground persistence store.
 *
 * Goals (R12):
 *   - Per-userId isolation, so user A's runs never bleed into user B.
 *   - Stable, globally-unique run IDs (UUID v4, fall back to a counter).
 *   - Base64 image payloads never leave memory; only url-only records are
 *     persisted. Reference image metadata (mime, name, size) is persisted
 *     so retry knows the original list, but the base64 body is discarded.
 *   - Save the original request snapshot for each run, so Retry replays the
 *     exact model/group/prompt/params/references that the user used, even
 *     if the form, model, or group later changed.
 *   - Bounded history; oldest runs are dropped.
 *   - Cross-tab merge: a new run added in tab A is visible in tab B once
 *     tab B's storage event fires, and tab A's write does not blow away
 *     tab B's independent run.
 *   - Fail closed: corrupt localStorage is ignored, the page still starts.
 *
 * The store is a singleton owned by the Image Playground. The Chat
 * playground keeps its own state and storage; we do not import it here.
 */
export const IMAGE_HISTORY_MAX_RUNS = 50

const HISTORY_STORAGE_VERSION = 2
const HISTORY_KEY_PREFIX = `vancine.image-playground.history.v${HISTORY_STORAGE_VERSION}`

/**
 * Per-image metadata. Only http(s) URLs are persisted; Base64 results are
 * dropped. Reference images keep their MIME/name/size but their dataUrl is
 * kept in-memory only as a string, never round-tripped through localStorage.
 */
export type StoredImage = {
  resultId?: string
  url: string
  b64Json?: string
  mime?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  renderable?: boolean
  revisedPrompt?: string
}

export type StoredReference = {
  id: string
  name: string
  mimeType: string
  size?: number
  // dataUrl is intentionally absent from the persisted projection.
  // The in-memory record carries it for the lifetime of the page.
  dataUrl?: string
}

/**
 * Strict request snapshot. Current version (3) requires every capability
 * flag to be present on the profile: a missing or null profile, or a
 * profile with any missing supports* field, marks the run as not
 * retryable. Older snapshots (version < 3) are kept for display only.
 */
export const SNAPSHOT_VERSION = 3

export type StoredRequestSnapshot = {
  snapshotVersion: number
  model: string
  group: string
  provider: string
  prompt: string
  params: ImageGenerationParams
  // Reference images are kept in the snapshot for Retry, but dataUrl is
  // stripped before persisting.
  references: StoredReference[]
  profile: {
    maxReferenceImages: number
    supportsAutoSize: boolean
    defaultSize: string
    supportsCustomSize: boolean
    supportsNegativePrompt: boolean
    supportsSeed: boolean
    supportsWatermark: boolean
    supportsPromptExtend: boolean
    supportsPromptExtendMode: boolean
    supportsThinkingMode: boolean
    thinkingRequiresExtend: boolean
    agentRequiresNoRefs: boolean
    allowedReferenceMimeTypes: string[]
  } | null
}

export type RunStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'error'
  // 'unknown' is the P13-B R16 outcome-unknown terminal state. A run
  // reaches this status only when the heartbeat lease expired (the owner
  // tab closed/crashed/slept long enough that we cannot prove the
  // upstream actually stopped). 'unknown' runs are visible, can be
  // cleared, and may be overwritten by a late complete/error callback
  // from the original owner; they MUST NOT offer Retry because we
  // cannot prove the upstream call is gone.
  | 'unknown'

export type StoredRun = {
  id: string
  status: RunStatus
  createdAt: string
  updatedAt: string
  ownerUserId: number | null
  model: string
  group: string
  provider: string
  prompt: string
  size: string
  n: number
  referenceCount: number
  images: StoredImage[]
  // P13-B R16: legacy single error field kept for back-compat reads.
  // New code stores errorKey (stable i18n key) and rawErrorMessage
  // (verbatim upstream text) separately. The component renders them
  // differently so language switches re-translate system errors while
  // raw upstream messages are shown unchanged. Old persisted records
  // that only carry `error` are treated as raw text (never t()'d) so
  // they never try to translate upstream strings.
  error: string | null
  errorKey?: string
  rawErrorMessage?: string
  requestSnapshot: StoredRequestSnapshot
  temporaryResultUnavailable?: boolean
  // True when the persisted request snapshot was missing or corrupt. The
  // run stays visible for history but Retry must never send it upstream.
  snapshotCorrupt?: boolean
  // Tab execution lease. While a run is queued or running, leaseOwnerSessionId
  // identifies the tab that issued the request and leaseHeartbeatAt is the
  // last time that tab refreshed the heartbeat. Other tabs see a fresh
  // lease and treat the run as still executing (no Retry, no duplicate
  // upstream call); only when the lease expires is the run reclaimable
  // for Retry.
  leaseOwnerSessionId?: string | null
  leaseHeartbeatAt?: number
}

type UserHistory = {
  runs: StoredRun[]
  clearedAt?: string
  revision?: number
}

type HistoryEnvelope = {
  version: number
  users: Record<string, UserHistory>
}

type PersistedRun = {
  id: string
  status: RunStatus
  createdAt: string
  updatedAt: string
  ownerUserId: number | null
  model: string
  group: string
  provider: string
  prompt: string
  size: string
  n: number
  referenceCount: number
  images: StoredImage[]
  error: string | null
  errorKey?: string
  rawErrorMessage?: string
  requestSnapshot: StoredRequestSnapshot
  temporaryResultUnavailable?: boolean
  snapshotCorrupt?: boolean
  leaseOwnerSessionId?: string | null
  leaseHeartbeatAt?: number
}

const emptyEnvelope: HistoryEnvelope = {
  version: HISTORY_STORAGE_VERSION,
  users: {},
}

const legacyV1Prefix = 'vancine.image-playground.history.v1'
const ENVELOPE_STORAGE_KEY = `${HISTORY_KEY_PREFIX}.envelope`

function userBucket(userId: number | null): string {
  return userId === null ? 'anon' : String(userId)
}

function resolveStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (
      storage == null ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

function createRunId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi != null && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function isUsableHttpUrl(raw: string): boolean {
  const value = raw.trim()
  if (value === '') return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.host !== ''
    )
  } catch {
    return false
  }
}

function toStoredReference(ref: ReferenceImage): StoredReference {
  // Keep the base64 dataUrl in the in-memory snapshot so an in-session Retry
  // can resend the exact reference images. The dataUrl is stripped again in
  // toPersistedRun before anything is written to localStorage, so base64
  // never reaches storage.
  return {
    id: ref.id,
    name: ref.name,
    mimeType: ref.mimeType,
    size: ref.size,
    dataUrl: ref.dataUrl,
  }
}

function dropB64FromImage(image: StoredImage): StoredImage {
  return {
    resultId: image.resultId,
    url: image.url,
    mime: image.mime,
    revisedPrompt: image.revisedPrompt,
  }
}

function buildSnapshot(input: {
  model: string
  group: string
  provider: string
  prompt: string
  params: ImageGenerationParams
  references: ReferenceImage[]
  profile: ImageModelProfile | null
}): StoredRequestSnapshot {
  // snapshotVersion 3 is the strict, fail-closed contract. Every profile
  // capability flag must be present and typed; the build step (which
  // always has a real ImageModelProfile for the running path) emits the
  // full profile so Retry can replay with the exact same fields.
  const profile: StoredRequestSnapshot['profile'] = input.profile
    ? {
        maxReferenceImages: input.profile.maxReferenceImages,
        supportsAutoSize: input.profile.supportsAutoSize,
        defaultSize: input.profile.defaultSize,
        supportsCustomSize: input.profile.supportsCustomSize,
        supportsNegativePrompt: input.profile.supportsNegativePrompt,
        supportsSeed: input.profile.supportsSeed,
        supportsWatermark: input.profile.supportsWatermark,
        supportsPromptExtend: input.profile.supportsPromptExtend,
        supportsPromptExtendMode: input.profile.supportsPromptExtendMode,
        supportsThinkingMode: input.profile.supportsThinkingMode,
        thinkingRequiresExtend: input.profile.thinkingRequiresExtend,
        agentRequiresNoRefs: input.profile.agentRequiresNoRefs,
        allowedReferenceMimeTypes:
          input.profile.allowedReferenceMimeTypes ?? [],
      }
    : null
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    model: input.model,
    group: input.group,
    provider: input.provider,
    prompt: input.prompt,
    params: input.params,
    references: input.references.map(toStoredReference),
    profile,
  }
}

function toPersistedRun(run: StoredRun): PersistedRun | null {
  const images = run.images
    .filter((image) => isUsableHttpUrl(image.url ?? ''))
    .map(dropB64FromImage)
  const hadBase64 = run.images.some(
    (image) => typeof image.b64Json === 'string' && image.b64Json !== ''
  )
  const temporary =
    run.temporaryResultUnavailable === true ||
    (run.status === 'complete' && images.length === 0 && hadBase64)
  if (
    images.length === 0 &&
    run.status !== 'error' &&
    run.status !== 'unknown' &&
    run.status !== 'running' &&
    run.status !== 'queued' &&
    !temporary
  ) {
    return null
  }
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ownerUserId: run.ownerUserId,
    model: run.model,
    group: run.group,
    provider: run.provider,
    prompt: run.prompt,
    size: run.size,
    n: run.n,
    referenceCount: run.referenceCount,
    images,
    error: run.error,
    errorKey: run.errorKey,
    rawErrorMessage: run.rawErrorMessage,
    temporaryResultUnavailable: temporary ? true : undefined,
    snapshotCorrupt: run.snapshotCorrupt === true ? true : undefined,
    // Lease is only meaningful while a run is still active. A terminal run
    // has no live lease to persist; we drop the session id entirely so a
    // stale id can never resume a finished run on tab reopen.
    leaseOwnerSessionId:
      run.status === 'running' || run.status === 'queued'
        ? (run.leaseOwnerSessionId ?? null)
        : null,
    leaseHeartbeatAt:
      run.status === 'running' || run.status === 'queued'
        ? run.leaseHeartbeatAt
        : undefined,
    requestSnapshot: {
      snapshotVersion: run.requestSnapshot.snapshotVersion,
      model: run.requestSnapshot.model,
      group: run.requestSnapshot.group,
      provider: run.requestSnapshot.provider,
      prompt: run.requestSnapshot.prompt,
      params: run.requestSnapshot.params,
      references: run.requestSnapshot.references.map((ref) => ({
        id: ref.id,
        name: ref.name,
        mimeType: ref.mimeType,
        size: ref.size,
      })),
      profile: run.requestSnapshot.profile,
    },
  }
}

/**
 * Prefer the copy that carries more in-memory-only payload (b64Json,
 * reference dataUrl, parsed mime/renderable metadata) when two tabs hold
 * the same run id at the same updatedAt. Persisted copies always lack
 * these fields, so this keeps the current page's Base64-only results
 * alive when another tab writes an unrelated run.
 */
function runInMemoryRichness(run: StoredRun): number {
  let score = 0
  for (const image of run.images) {
    if (typeof image.b64Json === 'string' && image.b64Json !== '') score++
    if (image.mime) score++
    if (image.renderable) score++
  }
  const refs = run.requestSnapshot?.references ?? []
  for (const ref of refs) {
    if (typeof ref.dataUrl === 'string' && ref.dataUrl !== '') score++
  }
  return score
}

function mergeConcurrentRunCopies(
  previous: StoredRun,
  incoming: StoredRun
): StoredRun {
  const previousActive =
    previous.status === 'running' || previous.status === 'queued'
  const incomingActive =
    incoming.status === 'running' || incoming.status === 'queued'
  // A terminal observation is authoritative for a run id. Heartbeats do not
  // update updatedAt, and a stale tab may still carry richer reference data,
  // so timestamp/richness ordering must never revive an active copy after
  // another tab has observed completion, failure, or an unknown outcome.
  if (previousActive !== incomingActive) {
    return previousActive ? incoming : previous
  }

  let preferred = incoming
  let alternate = previous
  if (
    previous.updatedAt > incoming.updatedAt ||
    (previous.updatedAt === incoming.updatedAt &&
      runInMemoryRichness(previous) >= runInMemoryRichness(incoming))
  ) {
    preferred = previous
    alternate = incoming
  }

  if (!previousActive) return preferred
  if (
    preferred.leaseOwnerSessionId == null ||
    preferred.leaseOwnerSessionId !== alternate.leaseOwnerSessionId
  ) {
    return preferred
  }

  const preferredHeartbeat = preferred.leaseHeartbeatAt
  const alternateHeartbeat = alternate.leaseHeartbeatAt
  if (
    typeof alternateHeartbeat !== 'number' ||
    (typeof preferredHeartbeat === 'number' &&
      preferredHeartbeat >= alternateHeartbeat)
  ) {
    return preferred
  }
  return { ...preferred, leaseHeartbeatAt: alternateHeartbeat }
}

function normalizeUserRuns(runs: StoredRun[]): StoredRun[] {
  const dedup = new Map<string, StoredRun>()
  for (const run of runs) {
    const previous = dedup.get(run.id)
    if (previous) {
      dedup.set(run.id, mergeConcurrentRunCopies(previous, run))
      continue
    }
    dedup.set(run.id, run)
  }
  const sorted = [...dedup.values()].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt)
    const bTime = Date.parse(b.updatedAt)
    if (Number.isNaN(aTime)) return 1
    if (Number.isNaN(bTime)) return -1
    if (bTime !== aTime) return bTime - aTime
    const aCreated = Date.parse(a.createdAt)
    const bCreated = Date.parse(b.createdAt)
    if (
      !Number.isNaN(aCreated) &&
      !Number.isNaN(bCreated) &&
      bCreated !== aCreated
    ) {
      return bCreated - aCreated
    }
    return 0
  })
  return sorted.slice(0, IMAGE_HISTORY_MAX_RUNS)
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    !Number.isNaN(Date.parse(value))
  )
}

function parseEnvelope(input: unknown): HistoryEnvelope {
  const empty: HistoryEnvelope = {
    version: HISTORY_STORAGE_VERSION,
    users: {},
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return empty
  }
  const parsed = input as Record<string, unknown>
  if (parsed.version !== HISTORY_STORAGE_VERSION) {
    return empty
  }
  const users = parsed.users
  if (!users || typeof users !== 'object' || Array.isArray(users)) {
    return empty
  }
  const normalized: HistoryEnvelope = {
    version: HISTORY_STORAGE_VERSION,
    users: {},
  }
  for (const [userId, payload] of Object.entries(
    users as Record<string, unknown>
  )) {
    const history = validateUserHistory(payload)
    if (!history) continue
    normalized.users[userId] = history
  }
  return normalized
}

function validateUserHistory(payload: unknown): UserHistory | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }
  const record = payload as Record<string, unknown>
  const candidate = record.runs
  const runs: StoredRun[] = []
  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      const validated = validatePersistedRun(entry)
      if (validated) runs.push(validated)
    }
  } else if (candidate !== undefined) {
    return null
  }
  let clearedAt: string | undefined
  if (record.clearedAt !== undefined) {
    if (!isValidTimestamp(record.clearedAt)) return null
    clearedAt = record.clearedAt
  }
  let revision: number | undefined
  if (record.revision !== undefined) {
    if (
      typeof record.revision !== 'number' ||
      !Number.isFinite(record.revision) ||
      record.revision < 0
    ) {
      return null
    }
    revision = record.revision
  }
  return {
    runs: normalizeUserRuns(runs),
    clearedAt,
    revision,
  }
}

/**
 * Reclaim expired leases. A queued or running run is left alone when
 *   (a) its lease is owned by a different session AND its heartbeat is
 *       still fresh (another tab is actively executing the request); or
 *   (b) its lease is owned by the current session AND its heartbeat is
 *       still fresh (this tab is the active owner and the heartbeat
 *       ticker is keeping the lease alive).
 * In all other cases the run transitions to the P13-B R16 'unknown'
 * (outcome-unknown) terminal status:
 *   - same-session run with a stale heartbeat means the tab crashed or
 *     refreshed without a clean finish - we cannot prove the upstream
 *     call stopped, so the run is NOT retryable;
 *   - different-session run with a stale heartbeat means the other tab
 *     is gone (crashed / closed / refreshed) and the lease is freed.
 *
 * The 'unknown' status deliberately replaces the old 'error' +
 * "Generation was interrupted" behavior: a heartbeat gap (background
 * tab throttling, system sleep, page jank) does NOT prove the backend
 * or the paid upstream stopped, so exposing a plain Retry on such a
 * run risks double-billing. The run stays visible, can be cleared,
 * carries a stable i18n key for the outcome-unknown notice, and a late
 * complete/error callback from the original owner may still overwrite
 * it with the real terminal state.
 */
function reclaimExpiredLeases(envelope: HistoryEnvelope): HistoryEnvelope {
  const now = getCurrentTimeMs()
  const users: Record<string, UserHistory> = {}
  for (const [userId, history] of Object.entries(envelope.users)) {
    users[userId] = {
      ...history,
      runs: history.runs.map((run) => {
        if (run.status !== 'running' && run.status !== 'queued') return run
        const owner = run.leaseOwnerSessionId ?? null
        if (owner === null || typeof run.leaseHeartbeatAt !== 'number') {
          // A run with no recorded lease or no heartbeat must not linger
          // as running; otherwise a stale persisted record from before
          // the lease machinery would block the user from ever retrying.
          return {
            ...run,
            status: 'unknown' as const,
            errorKey: 'Generation was interrupted (outcome unknown)',
            error: null,
            leaseOwnerSessionId: null,
            leaseHeartbeatAt: undefined,
          }
        }
        if (now - run.leaseHeartbeatAt < LEASE_EXPIRY_MS) {
          // Fresh heartbeat: either the active owner is keeping it warm
          // (same session, this tab's ticker) or another tab still owns
          // the run. Either way, leave it running.
          return run
        }
        return {
          ...run,
          status: 'unknown' as const,
          errorKey: 'Generation was interrupted (outcome unknown)',
          error: null,
          leaseOwnerSessionId: null,
          leaseHeartbeatAt: undefined,
        }
      }),
    }
  }
  return { version: envelope.version, users }
}

function loadEnvelope(storage: Storage): HistoryEnvelope {
  let raw: string | null = null
  try {
    raw = storage.getItem(ENVELOPE_STORAGE_KEY)
  } catch {
    return { version: HISTORY_STORAGE_VERSION, users: {} }
  }
  if (raw == null || raw === '') {
    return migrateFromV1(storage)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { version: HISTORY_STORAGE_VERSION, users: {} }
  }
  return parseEnvelope(parsed)
}

function validatePersistedRun(input: unknown): PersistedRun | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') return null
  if (typeof r.model !== 'string' || typeof r.prompt !== 'string') return null
  if (typeof r.group !== 'string') return null
  if (typeof r.provider !== 'string') return null
  if (typeof r.size !== 'string') return null
  if (typeof r.n !== 'number' || !Number.isFinite(r.n)) return null
  if (
    typeof r.referenceCount !== 'number' ||
    !Number.isFinite(r.referenceCount)
  ) {
    return null
  }
  if (!isValidTimestamp(r.createdAt)) return null
  const createdAt = r.createdAt
  const updatedAt = isValidTimestamp(r.updatedAt) ? r.updatedAt : createdAt
  let status: RunStatus
  if (r.status === undefined) {
    // Legacy v1 records had no status; they were completed URL runs.
    status = 'complete'
  } else if (
    r.status === 'queued' ||
    r.status === 'running' ||
    r.status === 'complete' ||
    r.status === 'error' ||
    r.status === 'unknown'
  ) {
    status = r.status
  } else {
    return null
  }
  const error = typeof r.error === 'string' ? r.error : null
  // P13-B R16: the error key is a stable i18n key rendered via t() at
  // render time; the raw message is shown verbatim. Both must be plain
  // strings. The legacy `error` field is kept as-is for old records and
  // is rendered as raw text (never t()'d).
  const errorKey =
    typeof r.errorKey === 'string' && r.errorKey !== '' ? r.errorKey : undefined
  const rawErrorMessage =
    typeof r.rawErrorMessage === 'string' && r.rawErrorMessage !== ''
      ? r.rawErrorMessage
      : undefined
  if ('ownerUserId' in r && r.ownerUserId != null) {
    if (typeof r.ownerUserId !== 'number' || !Number.isFinite(r.ownerUserId)) {
      return null
    }
  }
  const images: StoredImage[] = []
  if (Array.isArray(r.images)) {
    for (const item of r.images) {
      if (!item || typeof item !== 'object') continue
      const image = item as Record<string, unknown>
      const url = typeof image.url === 'string' ? image.url : ''
      if (!isUsableHttpUrl(url)) continue
      images.push({
        resultId:
          typeof image.resultId === 'string' ? image.resultId : undefined,
        url,
        mime: image.mime as StoredImage['mime'],
        renderable: true,
        revisedPrompt:
          typeof image.revisedPrompt === 'string'
            ? image.revisedPrompt
            : undefined,
      })
    }
  } else if (r.images !== undefined) {
    return null
  }
  const temporary = r.temporaryResultUnavailable === true
  if (
    images.length === 0 &&
    status !== 'error' &&
    status !== 'unknown' &&
    status !== 'running' &&
    status !== 'queued' &&
    !temporary
  ) {
    return null
  }
  // Fail closed: a persisted snapshotCorrupt flag stays sticky, and a
  // snapshot that fails strict validation marks the run not retryable.
  // The run is still kept for history display with a display-only
  // snapshot; Retry must never replay it upstream.
  let snapshotCorrupt = r.snapshotCorrupt === true
  let snapshot: StoredRequestSnapshot | null = null
  if (!snapshotCorrupt) {
    snapshot = validateSnapshot(r.requestSnapshot)
    if (!snapshot) {
      snapshotCorrupt = true
    }
  }
  if (!snapshot) {
    snapshot = displaySnapshotFromRun({
      model: r.model,
      group: r.group,
      provider: r.provider,
      prompt: r.prompt,
      size: r.size,
      n:
        typeof r.n === 'number' &&
        Number.isInteger(r.n) &&
        r.n >= 1 &&
        r.n <= SNAPSHOT_MAX_N
          ? r.n
          : 1,
    })
  }
  // Lease is only meaningful while a run is still active. Older records
  // that pre-date the lease machinery have no lease; that's fine — they
  // can't be running.
  let leaseOwnerSessionId: string | null = null
  let leaseHeartbeatAt: number | undefined
  if (status === 'running' || status === 'queued') {
    if (
      typeof r.leaseOwnerSessionId === 'string' &&
      r.leaseOwnerSessionId !== ''
    ) {
      leaseOwnerSessionId = r.leaseOwnerSessionId
    } else if (r.leaseOwnerSessionId === null) {
      // explicit null is acceptable (owner-session-id-less recovery flow)
      leaseOwnerSessionId = null
    }
    if (
      typeof r.leaseHeartbeatAt === 'number' &&
      Number.isFinite(r.leaseHeartbeatAt)
    ) {
      leaseHeartbeatAt = r.leaseHeartbeatAt
    }
  }
  return {
    id: r.id,
    status,
    createdAt,
    updatedAt,
    ownerUserId:
      typeof r.ownerUserId === 'number' && Number.isFinite(r.ownerUserId)
        ? r.ownerUserId
        : null,
    model: r.model,
    group: r.group,
    provider: r.provider,
    prompt: r.prompt,
    size: r.size,
    n: r.n,
    referenceCount: r.referenceCount,
    images,
    error,
    errorKey,
    rawErrorMessage,
    temporaryResultUnavailable: temporary ? true : undefined,
    snapshotCorrupt: snapshotCorrupt ? true : undefined,
    leaseOwnerSessionId,
    leaseHeartbeatAt,
    requestSnapshot: snapshot,
  }
}

// Upper sanity bound for a snapshot's n. The backend caps image counts at
// 128 (dto.MaxImageN); a persisted n outside [1, 128] means the snapshot is
// corrupt and must not be replayed by Retry.
const SNAPSHOT_MAX_N = 128

function isCorruptNullableDimension(value: unknown): boolean {
  if (value === null) return false
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100000
  ) {
    return true
  }
  return false
}

function isCorruptProfileField(name: string, value: unknown): boolean {
  switch (name) {
    case 'maxReferenceImages':
      return typeof value !== 'number' || !Number.isInteger(value) || value < 0
    case 'defaultSize':
      return typeof value !== 'string'
    case 'allowedReferenceMimeTypes':
      if (!Array.isArray(value)) return true
      return value.some((item) => typeof item !== 'string')
    default:
      return typeof value !== 'boolean'
  }
}

const SNAPSHOT_PROFILE_FIELDS = [
  'maxReferenceImages',
  'supportsAutoSize',
  'defaultSize',
  'supportsCustomSize',
  'supportsNegativePrompt',
  'supportsSeed',
  'supportsWatermark',
  'supportsPromptExtend',
  'supportsPromptExtendMode',
  'supportsThinkingMode',
  'thinkingRequiresExtend',
  'agentRequiresNoRefs',
  'allowedReferenceMimeTypes',
] as const

/**
 * Strict validation of a persisted request snapshot. Every field Retry
 * replays must have the right type and a legal value; corrupt values are
 * NEVER silently replaced with sendable defaults - the snapshot is
 * rejected and the run is marked not retryable (see validatePersistedRun).
 * Returns null for missing, malformed, or out-of-range snapshots.
 */
function validateSnapshot(input: unknown): StoredRequestSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }
  const s = input as Record<string, unknown>
  // The strict contract is snapshotVersion = 3. Anything older or absent
  // is treated as a corrupt snapshot: the run stays visible for display
  // but Retry must not send it upstream.
  if (s.snapshotVersion !== SNAPSHOT_VERSION) return null
  if (typeof s.model !== 'string' || s.model === '') return null
  if (typeof s.prompt !== 'string') return null
  if (typeof s.group !== 'string') return null
  if (typeof s.provider !== 'string') return null
  if (!s.params || typeof s.params !== 'object' || Array.isArray(s.params)) {
    return null
  }
  const params = s.params as Record<string, unknown>
  if (typeof params.size !== 'string') return null
  if (
    params.sizeMode !== 'preset' &&
    params.sizeMode !== 'custom' &&
    params.sizeMode !== 'auto'
  ) {
    return null
  }
  const sizeMode = params.sizeMode
  if (isCorruptNullableDimension(params.customWidth)) return null
  if (isCorruptNullableDimension(params.customHeight)) return null
  if (
    sizeMode === 'custom' &&
    (params.customWidth === null || params.customHeight === null)
  ) {
    return null
  }
  if (
    typeof params.n !== 'number' ||
    !Number.isInteger(params.n) ||
    params.n < 1 ||
    params.n > SNAPSHOT_MAX_N
  ) {
    return null
  }
  if (typeof params.negativePrompt !== 'string') return null
  if (params.seed !== null) {
    if (typeof params.seed !== 'number' || !Number.isInteger(params.seed)) {
      return null
    }
  }
  if (typeof params.watermark !== 'boolean') return null
  if (typeof params.promptExtend !== 'boolean') return null
  if (
    params.promptExtendMode !== 'direct' &&
    params.promptExtendMode !== 'agent'
  ) {
    return null
  }
  if (typeof params.thinkingMode !== 'boolean') return null

  if (!Array.isArray(s.references)) return null
  const references: StoredReference[] = []
  for (const item of s.references) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const ref = item as Record<string, unknown>
    if (typeof ref.id !== 'string' || ref.id === '') return null
    if (typeof ref.name !== 'string') return null
    if (typeof ref.mimeType !== 'string') return null
    if (
      ref.size !== undefined &&
      (typeof ref.size !== 'number' ||
        !Number.isFinite(ref.size) ||
        ref.size < 0)
    ) {
      return null
    }
    if (ref.dataUrl !== undefined && typeof ref.dataUrl !== 'string') {
      return null
    }
    references.push({
      id: ref.id,
      name: ref.name,
      mimeType: ref.mimeType,
      size: typeof ref.size === 'number' ? ref.size : undefined,
      dataUrl: typeof ref.dataUrl === 'string' ? ref.dataUrl : undefined,
    })
  }

  // Strict profile: snapshotVersion 3 requires a non-null profile object
  // where every capability field is present and of the right type. Retry
  // must never be guessed from a missing or partial profile.
  if (s.profile == null) return null
  if (typeof s.profile !== 'object' || Array.isArray(s.profile)) return null
  const p = s.profile as Record<string, unknown>
  for (const field of SNAPSHOT_PROFILE_FIELDS) {
    const value = p[field]
    if (value === undefined) return null
    if (isCorruptProfileField(field, value)) return null
  }
  const profile: NonNullable<StoredRequestSnapshot['profile']> = {
    maxReferenceImages: p.maxReferenceImages as number,
    supportsAutoSize: p.supportsAutoSize as boolean,
    defaultSize: p.defaultSize as string,
    supportsCustomSize: p.supportsCustomSize as boolean,
    supportsNegativePrompt: p.supportsNegativePrompt as boolean,
    supportsSeed: p.supportsSeed as boolean,
    supportsWatermark: p.supportsWatermark as boolean,
    supportsPromptExtend: p.supportsPromptExtend as boolean,
    supportsPromptExtendMode: p.supportsPromptExtendMode as boolean,
    supportsThinkingMode: p.supportsThinkingMode as boolean,
    thinkingRequiresExtend: p.thinkingRequiresExtend as boolean,
    agentRequiresNoRefs: p.agentRequiresNoRefs as boolean,
    allowedReferenceMimeTypes: p.allowedReferenceMimeTypes as string[],
  }

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    model: s.model,
    group: s.group,
    provider: s.provider,
    prompt: s.prompt,
    params: {
      size: params.size,
      sizeMode,
      customWidth:
        params.customWidth === null ? null : (params.customWidth as number),
      customHeight:
        params.customHeight === null ? null : (params.customHeight as number),
      n: params.n,
      negativePrompt: params.negativePrompt as string,
      seed: params.seed === null ? null : (params.seed as number),
      watermark: params.watermark as boolean,
      promptExtend: params.promptExtend as boolean,
      promptExtendMode: params.promptExtendMode,
      thinkingMode: params.thinkingMode as boolean,
    },
    references,
    profile,
  }
}

/**
 * Display-only snapshot reconstructed from run-level fields for records
 * whose real snapshot is missing or corrupt. Used so legacy URL-only
 * records remain visible; such runs are flagged snapshotCorrupt and Retry
 * never sends them upstream.
 */
function displaySnapshotFromRun(fallback: {
  model: string
  group: string
  provider: string
  prompt: string
  size: string
  n: number
}): StoredRequestSnapshot {
  return {
    // Mark display-only snapshots with an older version so validateSnapshot
    // never re-promotes a "fake" snapshot to retryable. The run carries
    // snapshotCorrupt = true, so Retry is hidden by the UI guard anyway.
    snapshotVersion: 0,
    model: fallback.model,
    group: fallback.group,
    provider: fallback.provider,
    prompt: fallback.prompt,
    params: {
      size: fallback.size,
      sizeMode: 'preset',
      customWidth: null,
      customHeight: null,
      n: fallback.n,
      negativePrompt: '',
      seed: null,
      watermark: false,
      promptExtend: false,
      promptExtendMode: 'direct',
      thinkingMode: false,
    },
    references: [],
    profile: null,
  }
}

function migrateFromV1(storage: Storage): HistoryEnvelope {
  const envelope: HistoryEnvelope = {
    version: HISTORY_STORAGE_VERSION,
    users: {},
  }
  // v1 used per-user keys: vancine.image-playground.history.v1.user.{id}
  // We only need the runs (id, model, prompt, size, n, referenceCount, etc).
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key || !key.startsWith(legacyV1Prefix)) continue
    const remainder = key.slice(legacyV1Prefix.length)
    const userId = parseUserIdFromV1Key(remainder)
    if (userId == null) continue
    const raw = storage.getItem(key)
    if (!raw) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const version = (parsed as { version?: unknown }).version
    if (version !== 1) continue
    const runs = (parsed as { runs?: unknown }).runs
    if (!Array.isArray(runs)) continue
    const bucket: StoredRun[] = []
    for (const candidate of runs) {
      const record = validatePersistedRun(candidate)
      if (record) {
        record.ownerUserId = userId
        bucket.push(record)
      }
    }
    if (bucket.length > 0) {
      envelope.users[String(userId)] = { runs: normalizeUserRuns(bucket) }
    }
  }
  return envelope
}

function parseUserIdFromV1Key(remainder: string): number | null {
  if (!remainder.startsWith('.user.')) return null
  const value = remainder.slice('.user.'.length)
  if (value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  return parsed
}

function persistEnvelope(storage: Storage, envelope: HistoryEnvelope): boolean {
  const users: Record<string, UserHistory> = {}
  for (const [userId, payload] of Object.entries(envelope.users)) {
    const runs: PersistedRun[] = []
    for (const run of payload.runs) {
      const persisted = toPersistedRun(run)
      if (persisted) runs.push(persisted)
    }
    users[userId] = {
      runs,
      clearedAt: payload.clearedAt,
      revision: payload.revision,
    }
  }
  const serialized = JSON.stringify({
    version: HISTORY_STORAGE_VERSION,
    users,
  })
  try {
    if (storage.getItem(ENVELOPE_STORAGE_KEY) === serialized) {
      return false
    }
    storage.setItem(ENVELOPE_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

function laterTimestamp(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

function applyTombstone(runs: StoredRun[], clearedAt?: string): StoredRun[] {
  if (!clearedAt) return runs
  const clearedMs = Date.parse(clearedAt)
  if (Number.isNaN(clearedMs)) return runs
  return runs.filter((run) => {
    // Active runs are never tombstoned, even by a cross-tab Clear: the
    // generation may still complete and must be able to write its result
    // (updateRun guarantees the completed version lands strictly after
    // clearedAt).
    if (run.status === 'queued' || run.status === 'running') return true
    const updated = Date.parse(run.updatedAt)
    if (Number.isNaN(updated)) return false
    return updated > clearedMs
  })
}

function mergeHistoryEnvelopes(
  local: HistoryEnvelope,
  remote: HistoryEnvelope
): HistoryEnvelope {
  const userIds = new Set([
    ...Object.keys(local.users),
    ...Object.keys(remote.users),
  ])
  const merged: HistoryEnvelope = {
    version: HISTORY_STORAGE_VERSION,
    users: {},
  }
  for (const userId of userIds) {
    const a = local.users[userId]
    const b = remote.users[userId]
    const revisionA = a?.revision ?? 0
    const revisionB = b?.revision ?? 0
    const revision = Math.max(revisionA, revisionB)
    let clearedAt: string | undefined
    if (revisionA > revisionB) {
      clearedAt = a?.clearedAt
    } else if (revisionB > revisionA) {
      clearedAt = b?.clearedAt
    } else {
      clearedAt = laterTimestamp(a?.clearedAt, b?.clearedAt)
    }
    const combined = normalizeUserRuns([...(b?.runs ?? []), ...(a?.runs ?? [])])
    merged.users[userId] = {
      runs: applyTombstone(combined, clearedAt),
      clearedAt,
      revision: revision > 0 ? revision : undefined,
    }
  }
  return merged
}

export type AddRunInput = {
  ownerUserId: number | null
  model: string
  group: string
  provider: string
  prompt: string
  params: ImageGenerationParams
  references: ReferenceImage[]
  profile: ImageModelProfile | null
  size: string
}

export type AddRunResult = {
  runId: string
}

type ImagePlaygroundState = {
  _hydrated: boolean
  _envelope: HistoryEnvelope
  hydrate: () => void
  addRun: (input: AddRunInput) => AddRunResult
  updateRun: (
    ownerUserId: number | null,
    runId: string,
    patch: Partial<StoredRun>
  ) => void
  refreshHeartbeat: (ownerUserId: number | null, runId: string) => void
  reclaimNow: () => void
  getRun: (ownerUserId: number | null, runId: string) => StoredRun | null
  getRuns: (ownerUserId: number | null) => StoredRun[]
  clearUser: (userId: number) => void
  mergeEnvelope: (incoming: unknown) => void
  _persist: () => void
}

function userRuns(
  envelope: HistoryEnvelope,
  userId: number | null
): StoredRun[] {
  const bucket = envelope.users[userBucket(userId)]
  if (!bucket) return []
  return bucket.runs
}

function setUserHistory(
  envelope: HistoryEnvelope,
  userId: number | null,
  history: UserHistory
): HistoryEnvelope {
  const next: HistoryEnvelope = {
    version: envelope.version,
    users: { ...envelope.users },
  }
  next.users[userBucket(userId)] = history
  return next
}

function userHistory(
  envelope: HistoryEnvelope,
  userId: number | null
): UserHistory {
  return envelope.users[userBucket(userId)] ?? { runs: [] }
}

export const useImagePlaygroundStore = create<ImagePlaygroundState>()(
  subscribeWithSelector((set, get) => ({
    _hydrated: false,
    _envelope: emptyEnvelope,
    hydrate: () => {
      const storage = resolveStorage()
      if (storage == null) {
        set({ _hydrated: true })
        return
      }
      const loaded = loadEnvelope(storage)
      // Only reclaim leases for runs whose owner is a different session AND
      // whose heartbeat has expired. Cross-tab runs that are still fresh
      // stay running so we do not interrupt the owner tab.
      const envelope = reclaimExpiredLeases(loaded)
      persistEnvelope(storage, envelope)
      set({ _envelope: envelope, _hydrated: true })
    },
    addRun: (input) => {
      const id = createRunId()
      const createdAt = nowIso()
      const sessionId = getCurrentSessionId()
      const run: StoredRun = {
        id,
        status: 'running',
        createdAt,
        updatedAt: createdAt,
        ownerUserId: input.ownerUserId,
        model: input.model,
        group: input.group,
        provider: input.provider,
        prompt: input.prompt,
        size: input.size,
        n: input.params.n,
        referenceCount: input.references.length,
        images: [],
        error: null,
        requestSnapshot: buildSnapshot(input),
        // The owner tab takes a fresh lease on the run. Other tabs see
        // this lease in the persisted envelope and treat the run as still
        // executing until either the owner completes it or the heartbeat
        // ages past LEASE_EXPIRY_MS.
        leaseOwnerSessionId: sessionId,
        leaseHeartbeatAt: getCurrentTimeMs(),
      }
      set((state) => {
        const existing = userHistory(state._envelope, input.ownerUserId)
        const nextRuns = normalizeUserRuns([run, ...existing.runs])
        return {
          _envelope: setUserHistory(state._envelope, input.ownerUserId, {
            ...existing,
            runs: nextRuns,
          }),
        }
      })
      get()._persist()
      return { runId: id }
    },
    updateRun: (ownerUserId, runId, patch) => {
      set((state) => {
        const existing = userHistory(state._envelope, ownerUserId)
        let changed = false
        const clearedMs = existing.clearedAt
          ? Date.parse(existing.clearedAt)
          : NaN
        const nextRuns = existing.runs.map((run) => {
          if (run.id !== runId) return run
          changed = true
          let updatedAt = nowIso()
          // A run that was active when the user cleared must never be
          // tombstoned by that clear once it completes: guarantee the new
          // version is strictly newer than the tombstone timestamp, even
          // when both happen within the same millisecond (or the clearing
          // tab's clearedAt came from a skewed clock).
          if (!Number.isNaN(clearedMs) && Date.parse(updatedAt) <= clearedMs) {
            updatedAt = new Date(clearedMs + 1).toISOString()
          }
          const merged: StoredRun = { ...run, ...patch, updatedAt }
          // Refresh or clear the heartbeat lease based on the resulting
          // status. While the run is active, the owner tab keeps the
          // heartbeat fresh; once the run is terminal, the lease is
          // dropped so a later tab reopen cannot reuse the stale id.
          if (merged.status === 'running' || merged.status === 'queued') {
            if (
              merged.leaseOwnerSessionId == null ||
              merged.leaseOwnerSessionId === getCurrentSessionId()
            ) {
              merged.leaseOwnerSessionId = getCurrentSessionId()
              merged.leaseHeartbeatAt = getCurrentTimeMs()
            }
          } else {
            merged.leaseOwnerSessionId = null
            merged.leaseHeartbeatAt = undefined
          }
          return merged
        })
        if (!changed) return {}
        return {
          _envelope: setUserHistory(state._envelope, ownerUserId, {
            ...existing,
            runs: nextRuns,
          }),
        }
      })
      get()._persist()
    },
    getRun: (ownerUserId, runId) => {
      const runs = userRuns(get()._envelope, ownerUserId)
      return runs.find((run) => run.id === runId) ?? null
    },
    getRuns: (ownerUserId) => {
      return userRuns(get()._envelope, ownerUserId)
    },
    clearUser: (userId) => {
      set((state) => {
        const existing = userHistory(state._envelope, userId)
        // Only terminal-state history is cleared. queued/running runs are
        // kept so a paid result can still land via updateRun when the
        // in-flight request completes; otherwise the result would be
        // permanently lost. The active run's lease fields are preserved
        // untouched so other tabs can still see the in-flight state.
        const kept = existing.runs.filter(
          (run) => run.status === 'queued' || run.status === 'running'
        )
        return {
          _envelope: setUserHistory(state._envelope, userId, {
            runs: kept,
            clearedAt: nowIso(),
            revision: (existing.revision ?? 0) + 1,
          }),
        }
      })
      get()._persist()
    },
    mergeEnvelope: (incoming) => {
      const remote = parseEnvelope(incoming)
      set((state) => {
        const merged = mergeHistoryEnvelopes(state._envelope, remote)
        // Reclaim on every merge too: a cross-tab storage event might be
        // a heartbeat refresh from the owner tab (in which case the
        // lease stays fresh) or a stale write from a closed tab. Without
        // this pass, the local view could keep showing a "stuck" lease
        // long after the owner has gone.
        const reclaimed = reclaimExpiredLeases(merged)
        return { _envelope: reclaimed }
      })
      get()._persist()
    },
    refreshHeartbeat: (ownerUserId, runId) => {
      // The owner tab calls this on a fixed interval while a run is in
      // flight. The mutation is a no-op when the run is terminal or when
      // this tab is not the lease owner; it does not change the
      // persisted envelope when there's nothing to refresh.
      const sessionId = getCurrentSessionId()
      set((state) => {
        const existing = userHistory(state._envelope, ownerUserId)
        const target = existing.runs.find((run) => run.id === runId)
        if (!target) return {}
        if (target.status !== 'running' && target.status !== 'queued') return {}
        if (target.leaseOwnerSessionId !== sessionId) return {}
        if (
          typeof target.leaseHeartbeatAt === 'number' &&
          getCurrentTimeMs() - target.leaseHeartbeatAt < LEASE_EXPIRY_MS / 2
        ) {
          // Half-window: skip the disk write when the heartbeat is still
          // fresh enough.
          return {}
        }
        const nextRuns = existing.runs.map((run) =>
          run.id === runId
            ? { ...run, leaseHeartbeatAt: getCurrentTimeMs() }
            : run
        )
        return {
          _envelope: setUserHistory(state._envelope, ownerUserId, {
            ...existing,
            runs: nextRuns,
          }),
        }
      })
      get()._persist()
    },
    /**
     * Reclaim leases for every user bucket whose heartbeat has aged past
     * LEASE_EXPIRY_MS. Called by the heartbeat ticker so a crashed or
     * refreshed owner tab's stale running runs converge to "interrupted"
     * within one expiry window without waiting for a fresh storage event
     * or a manual hydrate.
     */
    reclaimNow: () => {
      set((state) => {
        const reclaimed = reclaimExpiredLeases(state._envelope)
        return { _envelope: reclaimed }
      })
      get()._persist()
    },
    _persist: () => {
      const storage = resolveStorage()
      if (storage == null) return
      const disk = loadEnvelope(storage)
      const merged = mergeHistoryEnvelopes(disk, get()._envelope)
      persistEnvelope(storage, merged)
      set({ _envelope: merged })
    },
  }))
)

/**
 * Subscribe to the envelope in localStorage (other tabs) and merge any
 * incoming change into the store. Safe to call once at app start.
 */
export function attachImagePlaygroundCrossTabSync(): () => void {
  if (
    typeof globalThis === 'undefined' ||
    typeof globalThis.addEventListener !== 'function'
  ) {
    return () => {}
  }
  const storage = resolveStorage()
  if (storage == null) {
    return () => {}
  }
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key !== ENVELOPE_STORAGE_KEY) return
    if (event.newValue == null || event.newValue === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(event.newValue)
    } catch {
      return
    }
    useImagePlaygroundStore.getState().mergeEnvelope(parsed)
  }
  globalThis.addEventListener('storage', onStorage)
  return () => {
    globalThis.removeEventListener('storage', onStorage)
  }
}

export { parseEnvelope }

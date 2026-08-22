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
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'
import {
  IMAGE_HISTORY_MAX_RUNS,
  attachImagePlaygroundCrossTabSync,
  useImagePlaygroundStore,
  type AddRunInput,
  type StoredImage,
  type StoredRun,
} from '@/stores/image-playground-store'

import { generateImages } from '../api'
import {
  LEASE_HEARTBEAT_INTERVAL_MS,
  getCurrentSessionId,
  isLeaseFresh,
} from '../lib/clock'
import {
  ImagePlaygroundError,
  type ImagePlaygroundErrorSource,
} from '../lib/errors'
import { buildImageGenerationPayload } from '../lib/payload'
import {
  hasRenderableParsedImage,
  inspectBase64Image,
  isUsableHttpUrl,
} from '../lib/results'
import type {
  GeneratedImage,
  ImageGenerationParams,
  ImageModelProfile,
  ParsedImage,
  ReferenceImage,
} from '../types'

/**
 * Page-level error. The errorKey is a stable i18n key translated at
 * render time so a language switch re-labels the message; the
 * rawUpstreamMessage is shown verbatim (no t() lookup) and survives
 * across renders untouched. ownerUserId is the user who produced the
 * error so a later account switch never flashes the wrong user's error.
 */
export type ImagePageError = {
  ownerUserId: number | null
  errorKey?: string
  rawUpstreamMessage?: string
}

const EMPTY_PAGE_ERROR: ImagePageError = {
  ownerUserId: null,
}

export type GenerateInput = {
  model: string
  group: string
  provider: string
  prompt: string
  params: ImageGenerationParams
  profile: ImageModelProfile
  references: ReferenceImage[]
}

type MutationVariables = {
  input: GenerateInput
  ownerUserId: number
  sourceRunId?: string
}

type MutationContext = {
  ownerUserId: number
  newRunId: string
  sourceRunId?: string
}

export type ImageRunRetryBlocked =
  | 'corrupt-snapshot'
  | 'missing-references'
  | 'running-elsewhere'
  // P13-B R16: the run's heartbeat lease expired without a terminal
  // callback. The upstream outcome (and whether it was billed) is
  // unknown, so Retry must never re-issue the request.
  | 'outcome-unknown'

export type ImageRun = {
  id: string
  status: StoredRun['status']
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
  images: ParsedImage[]
  // Legacy raw error text. P13-B R2 compatibility: old persisted records
  // only carry this field. It is rendered verbatim (never t()'d).
  error: string | null
  // Stable i18n key rendered via t() at render time (system errors).
  errorKey?: string
  // Verbatim upstream error message, rendered without translation.
  rawErrorMessage?: string
  requestSnapshot: StoredRun['requestSnapshot']
  temporaryResultUnavailable?: boolean
  snapshotCorrupt?: boolean
  retryBlocked?: ImageRunRetryBlocked
  // True when the run's lease is still owned by another tab. The local
  // tab must not Retry or otherwise re-issue the upstream call.
  leasedByOtherSession?: boolean
}

function resolveRunSize(params: ImageGenerationParams): string {
  if (
    params.sizeMode === 'custom' &&
    params.customWidth != null &&
    params.customHeight != null
  ) {
    return `${params.customWidth}x${params.customHeight}`
  }
  return params.size
}

const EMPTY_RUNS: StoredRun[] = []

function storedImageToParsed(image: StoredImage, index: number): ParsedImage {
  const url = image.url?.trim() ?? ''
  const usableUrl = isUsableHttpUrl(url) ? url : undefined
  return {
    resultId: image.resultId ?? `result-${index}`,
    url: usableUrl,
    b64Json: image.b64Json,
    mime: image.mime ?? 'image/png',
    revisedPrompt: image.revisedPrompt,
    renderable: image.renderable ?? Boolean(usableUrl),
  }
}

function runRetryBlocked(run: StoredRun): ImageRunRetryBlocked | undefined {
  if (run.snapshotCorrupt === true) return 'corrupt-snapshot'
  // P13-B R16 fail-closed: an outcome-unknown run cannot prove the
  // upstream call stopped, so Retry would risk double-billing.
  if (run.status === 'unknown') return 'outcome-unknown'
  if (snapshotNeedsReattachedReferences(run.requestSnapshot)) {
    return 'missing-references'
  }
  if (
    (run.status === 'running' || run.status === 'queued') &&
    isLeaseFresh(
      run.leaseHeartbeatAt ?? 0,
      run.leaseOwnerSessionId,
      getCurrentSessionId()
    )
  ) {
    // A fresh lease from another tab means the upstream call is in
    // flight elsewhere. Retry would double-bill the request.
    return 'running-elsewhere'
  }
  return undefined
}

function isLeasedByOtherSession(run: StoredRun): boolean {
  if (run.status !== 'running' && run.status !== 'queued') return false
  return isLeaseFresh(
    run.leaseHeartbeatAt ?? 0,
    run.leaseOwnerSessionId,
    getCurrentSessionId()
  )
}

function toImageRun(run: StoredRun): ImageRun {
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
    images: run.images.map(storedImageToParsed),
    error: run.error,
    errorKey: run.errorKey,
    rawErrorMessage: run.rawErrorMessage,
    requestSnapshot: run.requestSnapshot,
    temporaryResultUnavailable: run.temporaryResultUnavailable,
    snapshotCorrupt: run.snapshotCorrupt,
    retryBlocked: runRetryBlocked(run),
    leasedByOtherSession: isLeasedByOtherSession(run),
  }
}

function storedImagesFromResult(result: GeneratedImage[]): StoredImage[] {
  const images: StoredImage[] = []
  for (let i = 0; i < result.length; i++) {
    const image = result[i]
    const url = image.url?.trim() ?? ''
    const usableUrl = isUsableHttpUrl(url) ? url : ''
    let mime = image.mime
    let renderable = image.renderable
    let b64Json = image.b64Json
    if (!usableUrl && b64Json && mime == null) {
      const inspected = inspectBase64Image(b64Json)
      if (inspected) {
        mime = inspected.mime
        renderable = true
      } else {
        b64Json = undefined
        renderable = false
      }
    } else if (usableUrl) {
      renderable = true
    }
    if (!usableUrl && !b64Json) continue
    images.push({
      resultId: image.resultId ?? `result-${i}`,
      url: usableUrl,
      b64Json,
      mime,
      renderable,
      revisedPrompt: image.revisedPrompt,
    })
  }
  return images
}

function storedReferenceFromPersisted(
  ref: StoredRun['requestSnapshot']['references'][number]
): ReferenceImage {
  return {
    id: ref.id,
    name: ref.name,
    mimeType: ref.mimeType,
    dataUrl: ref.dataUrl ?? '',
    size: ref.size,
  }
}

function snapshotNeedsReattachedReferences(
  snapshot: StoredRun['requestSnapshot']
): boolean {
  if (snapshot.references.length === 0) return false
  return snapshot.references.some(
    (ref) => typeof ref.dataUrl !== 'string' || ref.dataUrl.trim() === ''
  )
}

function buildRetryInput(run: StoredRun): GenerateInput | null {
  const snap = run.requestSnapshot
  if (!snap || !snap.model || !snap.prompt) return null
  return {
    model: snap.model,
    group: snap.group,
    provider: snap.provider,
    prompt: snap.prompt,
    params: snap.params,
    profile: emptyProfileFromSnapshot(snap.profile),
    references: snap.references.map(storedReferenceFromPersisted),
  }
}

function emptyProfileFromSnapshot(
  profile: StoredRun['requestSnapshot']['profile']
): ImageModelProfile {
  const n = 1
  return {
    sizes: profile?.defaultSize ? [profile.defaultSize] : [],
    defaultSize: profile?.defaultSize ?? '',
    supportsAutoSize: profile?.supportsAutoSize ?? false,
    supportsCustomSize: profile?.supportsCustomSize ?? false,
    nRange: { min: n, max: Math.max(n, 6), default: n },
    maxReferenceImages: profile?.maxReferenceImages ?? 0,
    supportsNegativePrompt: profile?.supportsNegativePrompt ?? false,
    maxNegativePromptChars: 0,
    supportsSeed: profile?.supportsSeed ?? false,
    supportsWatermark: profile?.supportsWatermark ?? false,
    supportsPromptExtend: profile?.supportsPromptExtend ?? false,
    supportsPromptExtendMode: profile?.supportsPromptExtendMode ?? false,
    supportsThinkingMode: profile?.supportsThinkingMode ?? false,
    thinkingRequiresExtend: profile?.thinkingRequiresExtend ?? false,
    agentRequiresNoRefs: profile?.agentRequiresNoRefs ?? false,
    allowedReferenceMimeTypes: profile?.allowedReferenceMimeTypes,
  }
}

/**
 * Page-level errors are per-user. P13-B R16 semantics:
 *   - a callback may write the page error iff its ownerUserId equals the
 *     CURRENT signed-in user - no other condition;
 *   - the current user may always replace whatever error is on screen,
 *     including one left behind by a previous user (so B's first failure
 *     always surfaces, even when the state still holds A's error);
 *   - a late callback from a non-current user (A's onError firing after
 *     the switch to B) is dropped, so it can never pollute B's state.
 */
/**
 * P13-B R18 P2: resolve the error source from a typed
 * ImagePlaygroundError via an exhaustive branch over the closed union.
 * The error carries EITHER a system errorKey (translated via t()) OR a
 * raw upstream message (rendered verbatim) - never both, and one of
 * them is always present.
 *
 * Plain Errors and unknown legacy exceptions fail CLOSED on the system
 * variant: their text must never be written as new raw upstream data.
 * Legacy persisted run.error values are only honored in the history
 * read layer (store sanitization / run rendering), never produced here.
 */
function resolveErrorSource(error: unknown): ImagePlaygroundErrorSource {
  if (error instanceof ImagePlaygroundError) {
    return error.source
  }
  return { kind: 'system', errorKey: 'Image generation failed' }
}

function currentUserId(): number | null {
  return useAuthStore.getState().auth.user?.id ?? null
}

function setPageErrorFor(
  prev: ImagePageError,
  ownerUserId: number | null,
  patch: Omit<ImagePageError, 'ownerUserId'>
): ImagePageError {
  // The only gate: the writer must be the currently signed-in user. When
  // it is, the new error replaces whatever was there before (including a
  // previous user's leftover). When it is not, the previous value is kept
  // untouched.
  if (ownerUserId !== currentUserId()) return prev
  return { ownerUserId, ...patch }
}

export function useImageGenerate() {
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const [pageError, setPageError] = useState<ImagePageError>(EMPTY_PAGE_ERROR)
  const inFlightRef = useRef(false)

  useEffect(() => {
    useImagePlaygroundStore.getState().hydrate()
    const detach = attachImagePlaygroundCrossTabSync()
    return () => {
      detach()
    }
  }, [])

  // P13-B R16: the active-run ref atomically records BOTH the user who
  // started the request AND the run id. The heartbeat ticker must refresh
  // the lease in the OWNER's partition - not the currently signed-in
  // user's - otherwise switching accounts mid-flight stops the owner's
  // lease from being refreshed and the run is falsely reclaimed.
  const activeRunRef = useRef<{ ownerUserId: number; runId: string } | null>(
    null
  )
  useEffect(() => {
    // The ticker is intentionally independent of the current userId: a
    // user switch must never stop (or redirect) the previous user's
    // in-flight lease refresh.
    const tick = () => {
      // Converge stale leases (owner tab crashed/refreshed) for every
      // user bucket; reclaim only transitions them to outcome-unknown,
      // it does not touch runs owned by the current session with a fresh
      // heartbeat.
      useImagePlaygroundStore.getState().reclaimNow()
      const active = activeRunRef.current
      if (active == null) return
      useImagePlaygroundStore
        .getState()
        .refreshHeartbeat(active.ownerUserId, active.runId)
    }
    const handle = globalThis.setInterval(tick, LEASE_HEARTBEAT_INTERVAL_MS)
    return () => {
      globalThis.clearInterval(handle)
    }
  }, [])

  const runs = useImagePlaygroundStore((state) => {
    if (userId === null) return EMPTY_RUNS
    const bucket = state._envelope.users[String(userId)]
    return bucket?.runs ?? EMPTY_RUNS
  })
  const imageRuns = useMemo(
    () => runs.slice(0, IMAGE_HISTORY_MAX_RUNS).map(toImageRun),
    [runs]
  )

  const updateRun = useCallback(
    (ownerUserId: number | null, runId: string, patch: Partial<StoredRun>) => {
      useImagePlaygroundStore.getState().updateRun(ownerUserId, runId, patch)
    },
    []
  )

  const mutation = useMutation({
    mutationFn: (vars: MutationVariables) =>
      generateImages(buildImageGenerationPayload(vars.input)),
    onMutate: (vars): MutationContext => {
      setPageError((prev) => setPageErrorFor(prev, vars.ownerUserId, {}))
      const addInput: AddRunInput = {
        ownerUserId: vars.ownerUserId,
        model: vars.input.model,
        group: vars.input.group,
        provider: vars.input.provider,
        prompt: vars.input.prompt,
        params: vars.input.params,
        references: vars.input.references,
        profile: vars.input.profile,
        size: resolveRunSize(vars.input.params),
      }
      const { runId } = useImagePlaygroundStore.getState().addRun(addInput)
      updateRun(vars.ownerUserId, runId, { status: 'running' })
      // Atomically record owner + run id so the heartbeat ticker keeps
      // refreshing the lease in the owner's partition even after an
      // account switch.
      activeRunRef.current = { ownerUserId: vars.ownerUserId, runId }
      return {
        ownerUserId: vars.ownerUserId,
        newRunId: runId,
        sourceRunId: vars.sourceRunId,
      }
    },
    onSuccess: (result, _vars, context) => {
      if (!context) return
      const images = storedImagesFromResult(result)
      if (images.length === 0) {
        updateRun(context.ownerUserId, context.newRunId, {
          status: 'error',
          images: [],
          error: null,
          errorKey: 'No images were generated',
          rawErrorMessage: undefined,
        })
        setPageError((prev) =>
          setPageErrorFor(prev, context.ownerUserId, {
            errorKey: 'No images were generated',
          })
        )
        return
      }
      const hasUrl = images.some((image) => isUsableHttpUrl(image.url ?? ''))
      const hasB64 = images.some(
        (image) => typeof image.b64Json === 'string' && image.b64Json !== ''
      )
      updateRun(context.ownerUserId, context.newRunId, {
        status: 'complete',
        images,
        error: null,
        errorKey: undefined,
        rawErrorMessage: undefined,
        temporaryResultUnavailable: !hasUrl && hasB64 ? true : undefined,
      })
      // Successful runs clear the page error. The owner-scoped guard
      // ensures a late callback (e.g. after a user switch) never erases
      // the new user's freshly set error.
      setPageError((prev) => setPageErrorFor(prev, context.ownerUserId, {}))
    },
    onError: (error: unknown, vars, context) => {
      const ownerUserId = context?.ownerUserId ?? vars?.ownerUserId ?? null
      // P13-B R18 P2: exhaustive branch over the closed error source.
      // system -> only the stable i18n errorKey is written; upstream ->
      // only the verbatim raw message is written. The two fields stay
      // mutually exclusive on both the run record and the page error.
      const source = resolveErrorSource(error)
      if (context) {
        // The failed run is always recorded in its owner's partition,
        // even if the active user changed while the request was in
        // flight. Either form can overwrite a previous outcome-unknown
        // placeholder so the real terminal state wins.
        if (source.kind === 'upstream') {
          updateRun(context.ownerUserId, context.newRunId, {
            status: 'error',
            error: null,
            errorKey: undefined,
            rawErrorMessage: source.rawMessage,
          })
        } else {
          updateRun(context.ownerUserId, context.newRunId, {
            status: 'error',
            error: null,
            errorKey: source.errorKey,
            rawErrorMessage: undefined,
          })
        }
      }
      // The page error mirrors the run record: a system error surfaces
      // its i18n key (translated at render time), an upstream error
      // surfaces its verbatim message (never t()'d). The owner-scoped
      // guard refuses to overwrite a different user's page error.
      setPageError((prev) =>
        setPageErrorFor(
          prev,
          ownerUserId,
          source.kind === 'upstream'
            ? { rawUpstreamMessage: source.rawMessage }
            : { errorKey: source.errorKey }
        )
      )
    },
    onSettled: (_data, _error, _vars, context) => {
      inFlightRef.current = false
      // Only clear the active ref when it still belongs to THIS mutation.
      // A newer request may have already replaced the ref; clearing
      // unconditionally would stop the newer request's heartbeat.
      if (
        context &&
        activeRunRef.current &&
        activeRunRef.current.ownerUserId === context.ownerUserId &&
        activeRunRef.current.runId === context.newRunId
      ) {
        activeRunRef.current = null
      } else if (!context) {
        activeRunRef.current = null
      }
    },
  })

  const startGeneration = useCallback(
    (input: GenerateInput, sourceRunId?: string) => {
      if (inFlightRef.current) {
        return Promise.resolve([] as GeneratedImage[])
      }
      const ownerUserId = useAuthStore.getState().auth.user?.id ?? null
      if (ownerUserId == null) {
        setPageError((prev) =>
          setPageErrorFor(prev, ownerUserId, {
            errorKey: 'Unable to determine the current account',
          })
        )
        return Promise.resolve([] as GeneratedImage[])
      }
      inFlightRef.current = true
      return mutation
        .mutateAsync({
          input,
          ownerUserId,
          sourceRunId,
        })
        .finally(() => {
          inFlightRef.current = false
        })
    },
    [mutation]
  )

  const clearHistory = useCallback(() => {
    if (userId === null) return
    useImagePlaygroundStore.getState().clearUser(userId)
  }, [userId])

  const retry = useCallback(
    (runId: string) => {
      if (inFlightRef.current) return
      const ownerUserId = useAuthStore.getState().auth.user?.id ?? null
      if (ownerUserId == null) {
        setPageError((prev) =>
          setPageErrorFor(prev, ownerUserId, {
            errorKey: 'Unable to determine the current account',
          })
        )
        return
      }
      const run = useImagePlaygroundStore.getState().getRun(ownerUserId, runId)
      if (!run) return
      if (run.snapshotCorrupt === true) {
        // Fail closed: the persisted snapshot is missing or corrupt and
        // must never be replayed upstream.
        return
      }
      if (run.status === 'unknown') {
        // P13-B R16 fail closed: an outcome-unknown run cannot prove the
        // upstream call stopped (background throttling, system sleep, or
        // a crashed tab). Retrying would risk double-billing, so retry()
        // is a hard no-op - the same guard the UI applies via
        // retryBlocked === 'outcome-unknown'.
        return
      }
      if (isLeasedByOtherSession(run)) {
        // Another tab still owns the upstream call. Showing Retry would
        // let the user re-issue the same request and double-bill.
        return
      }
      if (snapshotNeedsReattachedReferences(run.requestSnapshot)) {
        setPageError((prev) =>
          setPageErrorFor(prev, ownerUserId, {
            errorKey:
              'Please re-attach the original reference images before retrying',
          })
        )
        return
      }
      const input = buildRetryInput(run)
      if (!input) return
      // Fire-and-forget: onError already records the failure on the new
      // run and the page error; swallow the rejection here so a failed
      // retry never surfaces as a window unhandledrejection.
      startGeneration(input, runId).catch(() => undefined)
    },
    [startGeneration]
  )

  // Page error visible to the current user. The render-time guard means
  // B's first paint after a switch cannot show A's error (A's error is
  // still in state but the ownerUserId does not match).
  const visiblePageError =
    pageError.ownerUserId === userId &&
    (pageError.errorKey !== undefined ||
      pageError.rawUpstreamMessage !== undefined)
      ? pageError
      : EMPTY_PAGE_ERROR

  return {
    runs: imageRuns,
    pageError: visiblePageError,
    isGenerating: mutation.isPending,
    isRetrying: (runId: string) =>
      mutation.isPending && mutation.variables?.sourceRunId === runId,
    generate: startGeneration,
    clearError: () =>
      setPageError((prev) =>
        prev.ownerUserId === currentUserId() ? EMPTY_PAGE_ERROR : prev
      ),
    clearHistory,
    retry,
  }
}

export function hasRenderableImages(run: ImageRun): boolean {
  return hasRenderableParsedImage(run.images)
}

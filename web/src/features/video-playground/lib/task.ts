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
import { z } from 'zod'

import {
  VIDEO_TASK_FAILURE,
  VIDEO_TASK_POLL_INTERVAL_MS,
  VIDEO_TASK_SUCCESS,
} from '../constants'
import { VideoPlaygroundError } from './errors'

// GET /v1/video/generations/:task_id replies with the generic task DTO
// envelope ({ code, data }) built by the upstream relay fetch builder.
const taskDtoSchema = z
  .object({
    task_id: z.string().trim().min(1),
    status: z.string(),
    fail_reason: z.string().optional(),
  })
  .passthrough()

const taskFetchEnvelopeSchema = z.object({
  code: z.string().optional(),
  data: taskDtoSchema,
})

export function parseVideoTask(data: unknown): {
  task_id: string
  status: string
  fail_reason?: string
} {
  const envelope = taskFetchEnvelopeSchema.parse(data)
  return {
    task_id: envelope.data.task_id,
    status: envelope.data.status,
    ...(typeof envelope.data.fail_reason === 'string' &&
    envelope.data.fail_reason.trim() !== ''
      ? { fail_reason: envelope.data.fail_reason }
      : {}),
  }
}

// A contract violation in a task-artifacts response is a server-side error:
// it is never a "no result" outcome and cannot heal by retrying, so it is
// surfaced as a terminal system error (see getVideoTask).
function artifactContractError(): VideoPlaygroundError {
  return new VideoPlaygroundError({
    kind: 'system',
    errorKey: 'Failed to load video status',
    terminal: true,
  })
}

// These mirror controller/task.go validateProjectedTaskArtifacts and
// service/task_artifact_access.go BuildTaskArtifactContentURL: the safe
// projection the video page is allowed to render.
const ARTIFACT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/
const ARTIFACT_ACCESS_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_VIDEO_TASK_ARTIFACTS = 64
const LEGACY_VIDEO_ARTIFACT_KEY = 'video'
const ARTIFACT_TYPES = new Set(['image', 'video', 'audio', 'file'])

type ValidatedArtifact = {
  key: string
  type: string
  mimeType?: string
  contentUrl: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A URL or mime type carrying an ASCII control character (including CR/LF) is
// never a valid capability link. Checked by char code so the intent stays
// explicit and lint-clean rather than embedding a control-character class.
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

// Capability URL check for the exact
// /v1/tasks/<taskId>/artifacts/<artifactKey>/content?access=<token>
// projection. A base path from a dedicated TaskPublicAddress media domain is
// allowed, so the path must END with the capability path; same-origin is
// deliberately not required.
export function isVideoArtifactCapabilityUrl(
  raw: unknown,
  taskId: string,
  artifactKey: string
): raw is string {
  if (typeof raw !== 'string' || raw === '') {
    return false
  }
  if (raw !== raw.trim()) {
    return false
  }
  // Backslashes, ASCII control characters, and '#' are rejected in the raw
  // string before any URL normalization can hide them: `new URL('...#')`
  // reports an EMPTY hash for a bare trailing separator, so parsed.hash alone
  // cannot reject it. This matches the backend, which forbids any fragment in
  // ValidateTaskArtifactBaseURL and never emits one from
  // BuildTaskArtifactContentURL. '@' is NOT rejected globally: a
  // TaskPublicAddress base path may legitimately contain it (e.g.
  // https://media.example/media@v1); userinfo is scoped to the authority.
  if (hasControlCharacter(raw) || raw.includes('\\') || raw.includes('#')) {
    return false
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }
  if (parsed.hostname === '') {
    return false
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return false
  }
  // The authority is the only place '@' introduces userinfo. Check it
  // directly so https://user@host and https://user:pass@host are rejected
  // while a later '@' inside the base path stays valid.
  const authority = raw.slice(raw.indexOf('//') + 2).split(/[/?#]/)[0]
  if (authority.includes('@')) {
    return false
  }
  // Defense in depth behind the raw '#' rejection above.
  if (parsed.hash !== '') {
    return false
  }
  // The query must be EXACTLY ?access=<43 unescaped URL-safe base64 chars>.
  // Compare against the raw search, not the decoded searchParams entries:
  // percent-encoding the parameter name (?%61ccess=) or the token must not
  // decode into an accepted shape, and trailing '&', repeated or extra
  // parameters all fail the single-token pattern.
  const accessPrefix = '?access='
  if (!parsed.search.startsWith(accessPrefix)) {
    return false
  }
  if (!ARTIFACT_ACCESS_PATTERN.test(parsed.search.slice(accessPrefix.length))) {
    return false
  }
  if (/%2f/i.test(parsed.pathname)) {
    return false
  }
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(parsed.pathname)
  } catch {
    return false
  }
  if (hasControlCharacter(decodedPath) || decodedPath.includes('\\')) {
    return false
  }
  const capabilityPath = `/v1/tasks/${taskId}/artifacts/${artifactKey}/content`
  if (decodedPath === capabilityPath) {
    return true
  }
  // Optional base path prefix in front of the capability path (a dedicated
  // TaskPublicAddress media domain may be mounted under a path).
  if (!decodedPath.endsWith(capabilityPath)) {
    return false
  }
  const prefix = decodedPath.slice(0, -capabilityPath.length)
  return (
    prefix === '' || (prefix.startsWith('/') && !prefix.includes('/v1/tasks/'))
  )
}

function validateArtifactFields(
  item: unknown,
  taskId: string
): ValidatedArtifact {
  if (!isPlainRecord(item)) {
    throw artifactContractError()
  }
  const key = item.key
  if (typeof key !== 'string' || !ARTIFACT_KEY_PATTERN.test(key)) {
    throw artifactContractError()
  }
  if (
    typeof item.type !== 'string' ||
    item.type === '' ||
    !ARTIFACT_TYPES.has(item.type)
  ) {
    throw artifactContractError()
  }
  if (item.mime_type !== undefined) {
    if (
      typeof item.mime_type !== 'string' ||
      item.mime_type.length > 255 ||
      hasControlCharacter(item.mime_type)
    ) {
      throw artifactContractError()
    }
  }
  if (
    typeof item.content_url !== 'string' ||
    !isVideoArtifactCapabilityUrl(item.content_url, taskId, key)
  ) {
    throw artifactContractError()
  }
  return {
    key,
    type: item.type as string,
    ...(typeof item.mime_type === 'string' ? { mimeType: item.mime_type } : {}),
    contentUrl: item.content_url,
  }
}

// Only the declared artifact type selects a playable video; mime_type is
// metadata and never promotes an image/audio/file artifact to video. This
// mirrors the backend contract in controller/task.go.
function isPlayableVideoArtifact(artifact: ValidatedArtifact): boolean {
  return artifact.type === 'video'
}

// Strict parse of GET /v1/tasks/:task_id/artifacts (same upstream contract
// Usage Logs consumes). Throws a terminal VideoPlaygroundError on any contract
// violation; returns null only for a VALID response without a video artifact
// (or only non-video artifacts).
export function pickVideoArtifactContentUrl(
  data: unknown,
  taskId: string
): string | null {
  if (!isPlainRecord(data)) {
    throw artifactContractError()
  }
  if (
    typeof data.task_id !== 'string' ||
    data.task_id.trim() === '' ||
    data.task_id !== taskId
  ) {
    throw artifactContractError()
  }
  if (
    data.artifacts !== undefined &&
    (!Array.isArray(data.artifacts) ||
      data.artifacts.length > MAX_VIDEO_TASK_ARTIFACTS)
  ) {
    throw artifactContractError()
  }
  const items: unknown[] = Array.isArray(data.artifacts) ? data.artifacts : []
  const seenKeys = new Set<string>()
  let videoUrl: string | null = null
  for (const item of items) {
    const artifact = validateArtifactFields(item, taskId)
    if (seenKeys.has(artifact.key)) {
      throw artifactContractError()
    }
    seenKeys.add(artifact.key)
    if (videoUrl === null && isPlayableVideoArtifact(artifact)) {
      videoUrl = artifact.contentUrl
    }
  }
  if (data.legacy_content_url === undefined) {
    return videoUrl
  }
  if (
    !isVideoArtifactCapabilityUrl(
      data.legacy_content_url,
      taskId,
      LEGACY_VIDEO_ARTIFACT_KEY
    )
  ) {
    throw artifactContractError()
  }
  return videoUrl ?? (data.legacy_content_url as string)
}

export function isTerminalVideoTaskStatus(status: string): boolean {
  return status === VIDEO_TASK_SUCCESS || status === VIDEO_TASK_FAILURE
}

export function videoTaskPollInterval(
  status: string | undefined
): number | false {
  if (!status || isTerminalVideoTaskStatus(status)) {
    return false
  }
  return VIDEO_TASK_POLL_INTERVAL_MS
}

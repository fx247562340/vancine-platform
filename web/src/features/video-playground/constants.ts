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
export const VIDEO_PLAYGROUND_ENDPOINTS = {
  V1_MODELS: '/v1/models',
  V1_GENERATIONS: '/v1/video/generations',
} as const

// Upstream generic Task Artifacts route (Bearer API key, same token that
// submitted the task). The video page reads the safe content_url from it.
export function videoTaskArtifactsPath(taskId: string): string {
  return `/v1/tasks/${encodeURIComponent(taskId)}/artifacts`
}

export const VIDEO_TASK_POLL_INTERVAL_MS = 5000

export const VIDEO_TASK_SUCCESS = 'SUCCESS'
export const VIDEO_TASK_FAILURE = 'FAILURE'

/**
 * The model capability GET /v1/models advertises in `supported_endpoint_types`
 * for a model that really serves the OpenAI video endpoint. It is the ONLY
 * signal the video playground uses to decide whether a model belongs on the
 * page: the server has already applied the API key's group, model restriction
 * and billing configuration before it emits this list.
 */
export const OPENAI_VIDEO_ENDPOINT_TYPE = 'openai-video'

/**
 * Models with a dedicated, first-party-evidence-backed capability profile.
 *
 * This is a profile registry, NOT a page allow-list: the selector is driven by
 * the `openai-video` capability the server returns, and a video model absent
 * from this list still appears on the page with the generic fallback profile.
 */
export const PLAYGROUND_VIDEO_MODELS = [
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.5',
] as const

export type PlaygroundVideoModel = (typeof PLAYGROUND_VIDEO_MODELS)[number]

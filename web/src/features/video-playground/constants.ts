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

export const PLAYGROUND_VIDEO_MODELS = [
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.5',
] as const

export type PlaygroundVideoModel = (typeof PLAYGROUND_VIDEO_MODELS)[number]

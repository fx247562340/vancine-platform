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
import { z } from 'zod'

import { resolveTaskVideoResultUrl } from '@/features/usage-logs/lib/task-video-result'

import {
  VIDEO_TASK_FAILURE,
  VIDEO_TASK_POLL_INTERVAL_MS,
  VIDEO_TASK_SUCCESS,
} from '../constants'
import type { VideoTask } from '../types'

export const videoTaskSchema = z.object({
  task_id: z.string().trim().min(1),
  status: z.string(),
  result_url: z.string().optional(),
  fail_reason: z.string().optional(),
  data: z.unknown().optional(),
})

const taskEnvelopeSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: videoTaskSchema.optional(),
})

export function parseVideoTask(data: unknown): VideoTask {
  const envelope = taskEnvelopeSchema.safeParse(data)
  if (envelope.success && envelope.data.success && envelope.data.data) {
    return envelope.data.data
  }
  return videoTaskSchema.parse(data)
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

export function resolvePlaygroundVideoUrl(task: VideoTask): string | null {
  let data: string | undefined
  if (typeof task.data === 'string') {
    data = task.data
  } else if (task.data) {
    data = JSON.stringify(task.data)
  }
  return resolveTaskVideoResultUrl({
    id: 0,
    user_id: 0,
    platform: '',
    task_id: task.task_id,
    action: 'generate',
    channel_id: 0,
    submit_time: 0,
    status: task.status,
    result_url: task.result_url,
    fail_reason: task.fail_reason,
    data,
  })
}

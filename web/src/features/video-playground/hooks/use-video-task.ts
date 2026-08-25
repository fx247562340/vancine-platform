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
import { useQuery } from '@tanstack/react-query'

import { getVideoTask } from '../api'
import { VIDEO_TASK_POLL_INTERVAL_MS } from '../constants'
import { VideoPlaygroundError } from '../lib/errors'
import { videoTaskPollInterval } from '../lib/task'

export const VIDEO_TASK_STATUS_RETRY_COUNT = 2
export const VIDEO_TASK_STATUS_RETRY_DELAY_MS = 1000

export function useVideoTask(taskId: string | null) {
  return useQuery({
    queryKey: ['video-playground-task', taskId],
    queryFn: () => getVideoTask(taskId as string),
    enabled: Boolean(taskId),
    retry: VIDEO_TASK_STATUS_RETRY_COUNT,
    retryDelay: VIDEO_TASK_STATUS_RETRY_DELAY_MS,
    refetchInterval: (query) => {
      if (query.state.error) {
        return false
      }
      return videoTaskPollInterval(query.state.data?.status)
    },
    refetchIntervalInBackground: false,
  })
}

export function videoTaskQueryError(
  error: unknown
): VideoPlaygroundError | null {
  if (!error) {
    return null
  }
  if (error instanceof VideoPlaygroundError) {
    return error
  }
  return new VideoPlaygroundError({
    kind: 'system',
    errorKey: 'Failed to load video status',
  })
}

export { VIDEO_TASK_POLL_INTERVAL_MS }

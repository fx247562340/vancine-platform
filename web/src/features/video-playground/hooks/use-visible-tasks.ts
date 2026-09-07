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
import { useQueries } from '@tanstack/react-query'

import { selectVisibleTasks } from '../lib/recent-tasks'
import type { QueuedSubmission } from './use-submission'
import { videoTaskQueryOptions } from './use-video-task'

/**
 * The submissions the studio keeps in view: the most recent six, plus every
 * unfinished one however old it is.
 *
 * Finishing is decided by the upstream status, so this reads the same task query
 * the preview and the rows read. React Query deduplicates by key, so the extra
 * observers cost no additional request and cannot drift from the polling
 * configuration the rest of the page uses.
 */
export function useVisibleTasks(
  tasks: ReadonlyArray<QueuedSubmission>
): ReadonlyArray<QueuedSubmission> {
  const queries = useQueries({
    queries: tasks.map((task) => videoTaskQueryOptions(task.taskId)),
  })
  const upstreamStatusBySubmissionId: Record<string, string | undefined> = {}
  tasks.forEach((task, index) => {
    upstreamStatusBySubmissionId[task.id] = queries[index]?.data?.status
  })
  return selectVisibleTasks(tasks, upstreamStatusBySubmissionId)
}

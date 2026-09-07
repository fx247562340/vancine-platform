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
import type { QueuedSubmission } from '../hooks/use-submission'
import { isTerminalVideoTaskStatus } from './task'

/**
 * How many of the most recent submissions the studio keeps in view by default.
 * Anything unfinished stays visible on top of this window, and earlier finished
 * tasks remain in the admin task log — the page offers no pagination, carousel
 * or "show all" for them.
 */
export const RECENT_TASK_WINDOW = 6

/**
 * Whether a submission is still in flight.
 *
 * A submission is unfinished while its POST has not settled, and afterwards
 * while the upstream task has not reached a terminal status. An upstream status
 * that has not arrived yet counts as unfinished: hiding a task whose first poll
 * is still pending would make it vanish and reappear.
 */
export function isSubmissionUnfinished(
  submission: QueuedSubmission,
  upstreamStatus: string | undefined
): boolean {
  if (submission.status === 'failed' || submission.status === 'cancelled') {
    return false
  }
  if (submission.taskId === null) {
    return true
  }
  if (upstreamStatus === undefined) {
    return true
  }
  return !isTerminalVideoTaskStatus(upstreamStatus)
}

/**
 * The submissions the studio shows: the most recent `RECENT_TASK_WINDOW` of
 * them, plus every unfinished one however old it is.
 *
 * `tasks` is in submission order, so the window is a plain suffix. Order is
 * preserved and nothing is sorted or grouped.
 */
export function selectVisibleTasks(
  tasks: ReadonlyArray<QueuedSubmission>,
  upstreamStatusBySubmissionId: Readonly<Record<string, string | undefined>>
): ReadonlyArray<QueuedSubmission> {
  const windowStart = Math.max(0, tasks.length - RECENT_TASK_WINDOW)
  return tasks.filter(
    (submission, index) =>
      index >= windowStart ||
      isSubmissionUnfinished(
        submission,
        upstreamStatusBySubmissionId[submission.id]
      )
  )
}

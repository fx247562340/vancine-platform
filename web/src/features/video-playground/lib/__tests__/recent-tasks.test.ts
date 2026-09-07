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

/**
 * The recent-task window: the newest six, plus every unfinished task however old
 * it is. Older finished tasks stay in the admin task log, and the page offers no
 * pagination or "show all" for them.
 */
import { describe, expect, it } from 'vitest'

import type {
  QueuedSubmission,
  SubmissionStatus,
} from '../../hooks/use-submission'
import {
  isSubmissionUnfinished,
  RECENT_TASK_WINDOW,
  selectVisibleTasks,
} from '../recent-tasks'

function submission(
  id: string,
  status: SubmissionStatus,
  taskId: string | null = `task-${id}`
): QueuedSubmission {
  return {
    id,
    taskId,
    status,
    submitError: null,
    modelId: 'wan3.0-video',
    promptPreview: `prompt ${id}`,
    submittedAt: Number(id),
  }
}

function idsOf(tasks: ReadonlyArray<QueuedSubmission>): string[] {
  return tasks.map((task) => task.id)
}

describe('isSubmissionUnfinished', () => {
  it('treats a submission whose POST has not settled as unfinished', () => {
    expect(
      isSubmissionUnfinished(submission('1', 'submitting', null), undefined)
    ).toBe(true)
    expect(
      isSubmissionUnfinished(submission('1', 'pending', null), undefined)
    ).toBe(true)
  })

  it('treats a polling task with no upstream status yet as unfinished', () => {
    expect(isSubmissionUnfinished(submission('1', 'polling'), undefined)).toBe(
      true
    )
  })

  it('treats a polling task on a non-terminal upstream status as unfinished', () => {
    for (const status of ['SUBMITTED', 'QUEUED', 'IN_PROGRESS', '']) {
      expect(isSubmissionUnfinished(submission('1', 'polling'), status)).toBe(
        true
      )
    }
  })

  it('treats SUCCESS and FAILURE as finished', () => {
    expect(isSubmissionUnfinished(submission('1', 'polling'), 'SUCCESS')).toBe(
      false
    )
    expect(isSubmissionUnfinished(submission('1', 'polling'), 'FAILURE')).toBe(
      false
    )
  })

  it('treats a locally failed or cancelled submission as finished whatever the upstream says', () => {
    expect(isSubmissionUnfinished(submission('1', 'failed'), undefined)).toBe(
      false
    )
    expect(
      isSubmissionUnfinished(submission('1', 'cancelled'), 'IN_PROGRESS')
    ).toBe(false)
  })
})

describe('selectVisibleTasks', () => {
  it('keeps the window size at six', () => {
    expect(RECENT_TASK_WINDOW).toBe(6)
  })

  it('shows every task while there are six or fewer', () => {
    const tasks = ['1', '2', '3'].map((id) => submission(id, 'polling', null))
    expect(idsOf(selectVisibleTasks(tasks, {}))).toEqual(['1', '2', '3'])
  })

  it('shows only the newest six once nine tasks have all finished', () => {
    const tasks = Array.from({ length: 9 }, (_, index) =>
      submission(String(index + 1), 'polling')
    )
    const statuses: Record<string, string> = {}
    for (const task of tasks) {
      statuses[task.id] = 'SUCCESS'
    }
    expect(idsOf(selectVisibleTasks(tasks, statuses))).toEqual([
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
  })

  it('keeps an old unfinished task visible beyond the window', () => {
    const tasks = Array.from({ length: 9 }, (_, index) =>
      submission(String(index + 1), 'polling')
    )
    const statuses: Record<string, string> = {}
    for (const task of tasks) {
      statuses[task.id] = 'SUCCESS'
    }
    statuses['1'] = 'IN_PROGRESS'
    statuses['2'] = 'FAILURE'
    expect(idsOf(selectVisibleTasks(tasks, statuses))).toEqual([
      '1',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
  })

  it('keeps every unfinished task visible when more than six are still running', () => {
    const tasks = Array.from({ length: 10 }, (_, index) =>
      submission(String(index + 1), 'polling')
    )
    const statuses: Record<string, string> = {}
    for (const task of tasks) {
      statuses[task.id] = 'IN_PROGRESS'
    }
    expect(idsOf(selectVisibleTasks(tasks, statuses))).toHaveLength(10)
  })

  it('preserves submission order and never re-sorts', () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      submission(String(index + 1), 'polling')
    )
    const statuses: Record<string, string> = {}
    for (const task of tasks) {
      statuses[task.id] = 'SUCCESS'
    }
    statuses['3'] = 'IN_PROGRESS'
    expect(idsOf(selectVisibleTasks(tasks, statuses))).toEqual([
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ])
  })

  it('shows nothing for an empty queue', () => {
    expect(selectVisibleTasks([], {})).toEqual([])
  })

  it('counts a locally failed submission as finished so it can scroll out of view', () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      index === 0
        ? submission('1', 'failed', null)
        : submission(String(index + 1), 'polling')
    )
    const statuses: Record<string, string> = {}
    for (const task of tasks) {
      statuses[task.id] = 'SUCCESS'
    }
    expect(idsOf(selectVisibleTasks(tasks, statuses))).toEqual([
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ])
  })
})

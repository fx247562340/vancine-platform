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
import { useTranslation } from 'react-i18next'

import { GenerationGalleryShell } from '@/features/media-playground/components/generation-gallery-shell'
import { cn } from '@/lib/utils'

import type { QueuedSubmission } from '../hooks/use-submission'
import { useVideoTask, videoTaskQueryError } from '../hooks/use-video-task'
import { isTerminalVideoTaskStatus } from '../lib/task'
import { TaskStatusBadge } from './task-status-badge'

type RecentTaskListProps = {
  /** Already the visible window: the recent six plus everything unfinished. */
  tasks: ReadonlyArray<QueuedSubmission>
  selectedId: string | null
  onSelect: (submissionId: string) => void
}

/**
 * The tasks under the main preview.
 *
 * Rows are plain buttons, so keyboard users tab through them and select with
 * Enter or Space. Choosing a row is the only thing that moves the preview apart
 * from submitting a new task: no other task's status change can pull the preview
 * away once the user has picked one.
 *
 * There is deliberately no pagination, carousel or "show all". Older finished
 * tasks stay in the admin task log, reachable from the preview's usage-log link.
 */
export function RecentTaskList(props: RecentTaskListProps) {
  const { t } = useTranslation()
  if (props.tasks.length === 0) {
    return null
  }
  return (
    <GenerationGalleryShell
      title={t('Recent tasks')}
      ariaLabel={t('Recent tasks')}
      meta={
        <span className='text-muted-foreground text-xs'>
          {t('{{count}} task', { count: props.tasks.length })}
        </span>
      }
    >
      <ul className='flex flex-col gap-2'>
        {props.tasks.map((submission) => (
          <RecentTaskRow
            key={submission.id}
            submission={submission}
            selected={submission.id === props.selectedId}
            onSelect={props.onSelect}
          />
        ))}
      </ul>
    </GenerationGalleryShell>
  )
}

type RecentTaskRowProps = {
  submission: QueuedSubmission
  selected: boolean
  onSelect: (submissionId: string) => void
}

function RecentTaskRow(props: RecentTaskRowProps) {
  const { t } = useTranslation()
  const submission = props.submission
  const query = useVideoTask(submission.taskId)
  const queryError = query.isError ? videoTaskQueryError(query.error) : null
  const task = query.data
  const status = task?.status
  const isTerminal = status ? isTerminalVideoTaskStatus(status) : false
  const isPending =
    Boolean(submission.taskId) && !queryError && (!task || !isTerminal)

  return (
    <li>
      <button
        type='button'
        onClick={() => props.onSelect(submission.id)}
        aria-pressed={props.selected}
        className={cn(
          'bg-card hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-3',
          props.selected ? 'border-primary' : 'border-border/60'
        )}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm'>
            {submission.promptPreview || t('Untitled prompt')}
          </span>
          <span className='text-muted-foreground block truncate text-xs'>
            {submission.modelId}
          </span>
        </span>
        <TaskStatusBadge
          status={submission.status}
          queryStatus={status}
          isPending={isPending}
        />
      </button>
    </li>
  )
}

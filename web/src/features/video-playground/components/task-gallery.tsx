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
import { useTranslation } from 'react-i18next'

import { GenerationGalleryShell } from '@/features/media-playground/components/generation-gallery-shell'

import type { QueuedSubmission } from '../hooks/use-submission'
import { TaskQueueItem } from './task-queue-item'

type TaskGalleryProps = {
  tasks: ReadonlyArray<QueuedSubmission>
}

export function TaskGallery(props: TaskGalleryProps) {
  const { t } = useTranslation()
  if (props.tasks.length === 0) {
    return null
  }
  return (
    <GenerationGalleryShell
      title={t('Task queue')}
      ariaLabel={t('Task queue')}
      meta={
        <span className='text-muted-foreground text-xs'>
          {t('{{count}} task', { count: props.tasks.length })}
        </span>
      }
    >
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {props.tasks.map((task) => (
          <TaskQueueItem
            key={task.id}
            taskId={task.taskId}
            modelId={task.modelId}
            promptPreview={task.promptPreview}
            submitStatus={task.status}
            submitError={task.submitError}
          />
        ))}
      </div>
    </GenerationGalleryShell>
  )
}

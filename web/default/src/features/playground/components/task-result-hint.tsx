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
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TASK_LOGS_PATH } from '../lib/task-hint'

interface TaskResultHintProps {
  taskId: string
  className?: string
}

/**
 * Success notice for an accepted async task (video / 3D). No polling is
 * performed; the user is pointed to the task logs page for progress.
 */
export function TaskResultHint({ taskId, className }: TaskResultHintProps) {
  const { t } = useTranslation()
  return (
    <Alert className={className}>
      <CheckCircle2 className='text-green-600' />
      <AlertTitle>{t('Task submitted')}</AlertTitle>
      <AlertDescription className='space-y-1'>
        <div className='text-sm'>
          {t('Task ID')}:{' '}
          <code className='bg-muted rounded px-1 py-0.5 text-xs'>{taskId}</code>
        </div>
        <a
          className='text-primary text-sm underline-offset-2 hover:underline'
          href={TASK_LOGS_PATH}
        >
          {t('Go to Task Logs to check progress and results.')}
        </a>
      </AlertDescription>
    </Alert>
  )
}

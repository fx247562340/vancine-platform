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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import {
  videoPlaygroundErrorText,
  type VideoPlaygroundError,
} from '../lib/errors'

type VideoTaskStatusProps = {
  taskId: string | null
  isPending: boolean
  queryError: VideoPlaygroundError | null
  onRetry: () => void
  failureMessage: string | null
}

export function VideoTaskStatus({
  taskId,
  isPending,
  queryError,
  onRetry,
  failureMessage,
}: VideoTaskStatusProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-3'>
      {taskId ? (
        <p className='text-muted-foreground text-sm' role='status'>
          {t('Task ID')}: {taskId}{' '}
          <Link
            to='/usage-logs/$section'
            params={{ section: 'task' }}
            className='text-primary underline'
          >
            {t('View all task logs')}
          </Link>
        </p>
      ) : null}
      {queryError ? (
        <Alert variant='destructive'>
          {queryError.source.kind === 'upstream' ? (
            <AlertTitle>{t('Failed to load video status')}</AlertTitle>
          ) : null}
          <AlertDescription className='flex flex-col gap-3'>
            <span>{videoPlaygroundErrorText(queryError, t)}</span>
            <Button type='button' variant='outline' size='sm' onClick={onRetry}>
              {t('Retry status')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {isPending ? (
        <p className='text-muted-foreground text-sm' role='status'>
          {t('Waiting for video...')}
        </p>
      ) : null}
      {failureMessage ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('Task failed')}</AlertTitle>
          <AlertDescription>{failureMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

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
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { VIDEO_TASK_FAILURE, VIDEO_TASK_SUCCESS } from '../constants'
import { useVideoTask, videoTaskQueryError } from '../hooks/use-video-task'
import {
  videoPlaygroundErrorText,
  type VideoPlaygroundError,
} from '../lib/errors'
import {
  isTerminalVideoTaskStatus,
  resolvePlaygroundVideoUrl,
} from '../lib/task'

type TaskQueueItemProps = {
  taskId: string | null
  modelId: string
  promptPreview: string
  submitStatus: 'submitting' | 'pending' | 'polling' | 'failed' | 'cancelled'
  submitError: VideoPlaygroundError | null
}

export function TaskQueueItem({
  taskId,
  modelId,
  promptPreview,
  submitStatus,
  submitError,
}: TaskQueueItemProps) {
  const { t } = useTranslation()
  const query = useVideoTask(taskId)
  const queryError = query.isError ? videoTaskQueryError(query.error) : null
  const task = query.data
  const status = task?.status
  const isTerminal = status ? isTerminalVideoTaskStatus(status) : false
  const isPending = Boolean(taskId) && !queryError && (!task || !isTerminal)
  const failureReason =
    status === VIDEO_TASK_FAILURE
      ? task?.fail_reason?.trim() || t('Task failed')
      : null
  const videoUrl =
    status === VIDEO_TASK_SUCCESS && task
      ? resolvePlaygroundVideoUrl(task)
      : null
  const [mediaError, setMediaError] = useState(false)

  useEffect(() => {
    setMediaError(false)
  }, [videoUrl])

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2 text-sm font-medium'>
          <span className='truncate'>
            {promptPreview || t('Untitled prompt')}
          </span>
          <StatusBadge
            status={submitStatus}
            queryStatus={status}
            isPending={isPending}
          />
        </CardTitle>
        <p className='text-muted-foreground text-xs'>{modelId}</p>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {taskId ? (
          <p className='text-muted-foreground text-xs' role='status'>
            {t('Task ID')}: {taskId}{' '}
            <Link
              to='/usage-logs/$section'
              params={{ section: 'task' }}
              className='text-primary underline'
            >
              {t('View in usage logs')}
            </Link>
          </p>
        ) : null}
        {submitStatus === 'submitting' ? (
          <p className='text-muted-foreground flex items-center gap-2 text-xs'>
            <HugeiconsIcon
              icon={Loading03Icon}
              aria-hidden
              data-icon='inline-start'
              className='animate-spin'
            />
            {t('Submitting...')}
          </p>
        ) : null}
        {submitStatus === 'cancelled' ? (
          <p className='text-muted-foreground text-xs' role='status'>
            {t('Cancelled')}
          </p>
        ) : null}
        {submitStatus === 'failed' && submitError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Submission failed')}</AlertTitle>
            <AlertDescription>
              {videoPlaygroundErrorText(submitError, t)}
            </AlertDescription>
          </Alert>
        ) : null}
        {isPending && submitStatus !== 'cancelled' ? (
          <p className='text-muted-foreground flex items-center gap-2 text-xs'>
            <HugeiconsIcon
              icon={Loading03Icon}
              aria-hidden
              data-icon='inline-start'
              className='animate-spin'
            />
            {t('Waiting for video...')}
          </p>
        ) : null}
        {queryError ? (
          <Alert variant='destructive'>
            {queryError.source.kind === 'upstream' ? (
              <AlertTitle>{t('Failed to load video status')}</AlertTitle>
            ) : null}
            <AlertDescription className='flex flex-col gap-3'>
              <span>{videoPlaygroundErrorText(queryError, t)}</span>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => void query.refetch()}
              >
                {t('Retry status')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {failureReason ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Task failed')}</AlertTitle>
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        ) : null}
        {status === VIDEO_TASK_SUCCESS && !videoUrl ? (
          <Alert>
            <AlertTitle>{t('No playable video result')}</AlertTitle>
            <AlertDescription>
              {t('Use the task logs to inspect this generation.')}
            </AlertDescription>
          </Alert>
        ) : null}
        {status === VIDEO_TASK_SUCCESS && videoUrl && mediaError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Video failed to load')}</AlertTitle>
            <AlertDescription>
              {t('Open video in a new tab to play this result.')}
            </AlertDescription>
          </Alert>
        ) : null}
        {status === VIDEO_TASK_SUCCESS && videoUrl && !mediaError ? (
          <video
            src={videoUrl}
            controls
            preload='metadata'
            aria-label={t('Generated video')}
            className='bg-muted/20 max-h-[50vh] w-full rounded-md'
            onError={() => setMediaError(true)}
          />
        ) : null}
      </CardContent>
      {status === VIDEO_TASK_SUCCESS && videoUrl ? (
        <CardFooter className='flex flex-wrap gap-3'>
          <a
            href={videoUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary text-sm underline'
          >
            {t('Open video')}
          </a>
          <a
            href={videoUrl}
            download={`${taskId ?? 'result'}.mp4`}
            className='text-primary text-sm underline'
          >
            {t('Download')}
          </a>
        </CardFooter>
      ) : null}
    </Card>
  )
}

type StatusBadgeProps = {
  status: TaskQueueItemProps['submitStatus']
  queryStatus: string | undefined
  isPending: boolean
}

function StatusBadge({ status, queryStatus, isPending }: StatusBadgeProps) {
  const { t } = useTranslation()
  if (status === 'submitting') {
    return (
      <Badge variant='secondary' className='gap-1'>
        <HugeiconsIcon
          icon={Loading03Icon}
          aria-hidden
          data-icon='inline-start'
          className='animate-spin'
        />
        {t('Submitting')}
      </Badge>
    )
  }
  if (status === 'cancelled') {
    return (
      <Badge variant='outline' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Cancelled')}
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant='destructive' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Submission failed')}
      </Badge>
    )
  }
  if (isPending) {
    return (
      <Badge variant='secondary' className='gap-1'>
        <HugeiconsIcon
          icon={Loading03Icon}
          aria-hidden
          data-icon='inline-start'
          className='animate-spin'
        />
        {t('Generating')}
      </Badge>
    )
  }
  if (queryStatus === VIDEO_TASK_SUCCESS) {
    return (
      <Badge variant='default' className='gap-1'>
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Success')}
      </Badge>
    )
  }
  if (queryStatus === VIDEO_TASK_FAILURE) {
    return (
      <Badge variant='destructive' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Failed')}
      </Badge>
    )
  }
  return <Badge variant='outline'>{t('Pending')}</Badge>
}

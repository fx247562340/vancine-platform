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
import { Loading03Icon, Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { VIDEO_TASK_FAILURE, VIDEO_TASK_SUCCESS } from '../constants'
import type { QueuedSubmission } from '../hooks/use-submission'
import { useVideoTask, videoTaskQueryError } from '../hooks/use-video-task'
import { videoPlaygroundErrorText } from '../lib/errors'
import { isTerminalVideoTaskStatus } from '../lib/task'
import { TaskStatusBadge } from './task-status-badge'

type VideoPreviewProps = {
  /** The submission the user is looking at; null until the first one exists. */
  submission: QueuedSubmission | null
  /** False once the submission has left the recent-task window. */
  canRestore: boolean
  onRestoreSettings: () => void
}

/**
 * The studio's main preview: one task at a time, in place.
 *
 * Selection changes only when the user submits or picks a task, so an older task
 * finishing later cannot steal the preview, and the selected task turning from
 * running into finished renders its video exactly where the spinner was.
 *
 * The only media source is `content_url`, the server-built artifact capability
 * URL. The upstream result URL is never read, shown or copied. A media load
 * failure retries the artifact read only — it never resubmits and so never bills
 * a second time.
 */
export function VideoPreview(props: VideoPreviewProps) {
  const { t } = useTranslation()
  const submission = props.submission
  const query = useVideoTask(submission?.taskId ?? null)
  const queryError = query.isError ? videoTaskQueryError(query.error) : null
  const task = query.data
  const status = task?.status
  const isTerminal = status ? isTerminalVideoTaskStatus(status) : false
  const isPending =
    Boolean(submission?.taskId) && !queryError && (!task || !isTerminal)
  const failureReason =
    status === VIDEO_TASK_FAILURE
      ? task?.fail_reason?.trim() || t('Task failed')
      : null
  const videoUrl =
    status === VIDEO_TASK_SUCCESS && task?.content_url ? task.content_url : null

  const [mediaError, setMediaError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  useEffect(() => {
    setMediaError(false)
    setReloadToken(0)
  }, [videoUrl])

  if (!submission) {
    return (
      <section
        aria-label={t('Preview')}
        className='bg-card border-border/60 flex min-h-72 items-center justify-center rounded-2xl border shadow-sm'
      >
        <Empty className='border-0'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <HugeiconsIcon
                icon={Video01Icon}
                strokeWidth={2}
                aria-hidden
                data-icon='empty'
              />
            </EmptyMedia>
            <EmptyTitle>{t('Preview')}</EmptyTitle>
            <EmptyDescription>
              {t('Your generated video will appear here.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  const submitError =
    submission.status === 'failed' ? submission.submitError : null
  const showRestore =
    props.canRestore &&
    (Boolean(videoUrl) || Boolean(failureReason) || submitError != null)

  return (
    <section
      aria-label={t('Preview')}
      className='bg-card border-border/60 overflow-hidden rounded-2xl border shadow-sm'
    >
      <header className='border-border/60 flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-foreground truncate text-sm font-medium'>
            {submission.promptPreview || t('Untitled prompt')}
          </p>
          <p className='text-muted-foreground text-xs'>{submission.modelId}</p>
        </div>
        <TaskStatusBadge
          status={submission.status}
          queryStatus={status}
          isPending={isPending}
        />
      </header>

      <div className='flex flex-col gap-3 px-4 py-4'>
        {submission.taskId ? (
          <p className='text-muted-foreground text-xs'>
            {t('Task ID')}: {submission.taskId}{' '}
            <Link
              to='/usage-logs/$section'
              params={{ section: 'task' }}
              className='text-primary underline'
            >
              {t('View in usage logs')}
            </Link>
          </p>
        ) : null}

        {submission.status === 'submitting' ? (
          <p className='text-muted-foreground flex items-center gap-2 text-sm'>
            <HugeiconsIcon
              icon={Loading03Icon}
              aria-hidden
              data-icon='inline-start'
              className='animate-spin'
            />
            {t('Submitting...')}
          </p>
        ) : null}

        {submission.status === 'cancelled' ? (
          <p className='text-muted-foreground text-sm' role='status'>
            {t('Cancelled')}
          </p>
        ) : null}

        {submitError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Failed')}</AlertTitle>
            <AlertDescription>
              {videoPlaygroundErrorText(submitError, t)}
            </AlertDescription>
          </Alert>
        ) : null}

        {isPending && submission.status !== 'cancelled' ? (
          <div
            className='bg-muted/20 flex min-h-52 items-center justify-center rounded-xl'
            role='status'
          >
            <p className='text-muted-foreground flex items-center gap-2 text-sm'>
              <HugeiconsIcon
                icon={Loading03Icon}
                aria-hidden
                data-icon='inline-start'
                className='animate-spin'
              />
              {t('Waiting for video...')}
            </p>
          </div>
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
                className='w-fit'
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

        {videoUrl && mediaError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Video failed to load')}</AlertTitle>
            <AlertDescription className='flex flex-col gap-3'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='w-fit'
                onClick={() => {
                  setMediaError(false)
                  setReloadToken((token) => token + 1)
                }}
              >
                {t('Reload preview')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {videoUrl && !mediaError ? (
          <video
            key={reloadToken}
            src={videoUrl}
            controls
            preload='metadata'
            aria-label={t('Generated video')}
            className='bg-muted/20 max-h-[60vh] w-full rounded-xl'
            onError={() => setMediaError(true)}
          />
        ) : null}
      </div>

      {showRestore || videoUrl ? (
        <footer className='bg-muted/50 border-border/60 flex flex-wrap items-center gap-2 border-t px-4 py-3'>
          {videoUrl ? (
            <Button
              variant='outline'
              size='sm'
              render={
                <a
                  href={videoUrl}
                  download={`${submission.taskId ?? 'result'}.mp4`}
                />
              }
            >
              {t('Download')}
            </Button>
          ) : null}
          {showRestore ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={props.onRestoreSettings}
            >
              {t('Use these settings again')}
            </Button>
          ) : null}
        </footer>
      ) : null}
    </section>
  )
}

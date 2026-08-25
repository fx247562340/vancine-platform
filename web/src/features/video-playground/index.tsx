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
import { zodResolver } from '@hookform/resolvers/zod'
import { Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { defaultVideoApiKey, submitVideoGenerationWithApiKey } from './api'
import { ApiKeySelector } from './components/api-key-selector'
import { VideoModelSelector } from './components/model-selector'
import { VideoSubmitCard } from './components/submit-card'
import { VideoTaskStatus } from './components/task-status'
import { VideoResult } from './components/video-result'
import { VIDEO_TASK_FAILURE, VIDEO_TASK_SUCCESS } from './constants'
import { useVideoKeys } from './hooks/use-video-keys'
import { useVideoModels } from './hooks/use-video-models'
import { useVideoApiSecret } from './hooks/use-video-secret'
import { useVideoTask, videoTaskQueryError } from './hooks/use-video-task'
import { videoPlaygroundErrorText, VideoPlaygroundError } from './lib/errors'
import { videoFormSchema, type VideoFormValues } from './lib/form-schema'
import {
  isTerminalVideoTaskStatus,
  resolvePlaygroundVideoUrl,
} from './lib/task'

export function VideoPlayground() {
  const { t, i18n } = useTranslation()
  const [keyId, setKeyId] = useState<number | null>(null)
  const [model, setModel] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<VideoPlaygroundError | null>(
    null
  )

  const keysQuery = useVideoKeys()
  const secret = useVideoApiSecret()
  const { load: loadSecret, clear: clearSecret } = secret
  const modelsQuery = useVideoModels(keyId, loadSecret)
  const taskQuery = useVideoTask(taskId)
  const generation = useMutation({
    mutationFn: async (values: VideoFormValues) => {
      if (keyId == null) {
        throw new VideoPlaygroundError({
          kind: 'system',
          errorKey: 'Failed to load API key',
        })
      }
      const apiKey = await loadSecret(keyId)
      return submitVideoGenerationWithApiKey(
        apiKey,
        { model, prompt: values.prompt.trim() },
        i18n.language
      )
    },
    onError: () => {},
  })

  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema),
    defaultValues: { prompt: '' },
  })

  useEffect(() => {
    if (!keysQuery.isFetched) return
    const exists =
      keyId != null && keysQuery.keys.some((item) => item.id === keyId)
    if (exists) return
    clearSecret()
    setKeyId(defaultVideoApiKey(keysQuery.keys)?.id ?? null)
  }, [keysQuery.isFetched, keysQuery.keys, keyId, clearSecret])

  useEffect(() => {
    if (!modelsQuery.isFetched) return
    const exists = modelsQuery.models.some((item) => item.value === model)
    if (exists) return
    setModel(modelsQuery.models[0]?.value ?? '')
  }, [modelsQuery.isFetched, modelsQuery.models, model])

  const task = taskQuery.data
  const queryError = taskQuery.isError
    ? videoTaskQueryError(taskQuery.error)
    : null
  const isTaskPending = Boolean(
    taskId && !queryError && (!task || !isTerminalVideoTaskStatus(task.status))
  )
  const isBusy = generation.isPending || isTaskPending
  const canSubmit =
    keysQuery.isFetched &&
    !keysQuery.isError &&
    keyId != null &&
    modelsQuery.isFetched &&
    !modelsQuery.isError &&
    Boolean(model) &&
    modelsQuery.models.length > 0 &&
    !isBusy

  const videoUrl = task ? resolvePlaygroundVideoUrl(task) : null
  const failureMessage =
    task?.status === VIDEO_TASK_FAILURE
      ? task.fail_reason?.trim() || t('Task failed')
      : null

  return (
    <div
      data-testid='video-playground-page'
      className='flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6'>
        <header className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1'>
            <h1 className='text-2xl font-semibold'>{t('Video generation')}</h1>
            <p className='text-muted-foreground text-sm'>
              {t('Select a video model to start generating.')}
            </p>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <ApiKeySelector
              keys={keysQuery.keys}
              selectedId={keyId}
              disabled={isBusy || keysQuery.isLoading}
              onChange={(id) => {
                clearSecret()
                setModel('')
                setKeyId(id)
              }}
            />
            <VideoModelSelector
              models={modelsQuery.models}
              selectedModel={model}
              onChange={setModel}
              disabled={isBusy || modelsQuery.isLoading || keyId == null}
            />
          </div>
        </header>

        {keysQuery.loadError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {videoPlaygroundErrorText(keysQuery.loadError, t)}
            </AlertDescription>
          </Alert>
        ) : null}
        {modelsQuery.loadError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {videoPlaygroundErrorText(modelsQuery.loadError, t)}
            </AlertDescription>
          </Alert>
        ) : null}

        {keysQuery.isFetched && keysQuery.keys.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <HugeiconsIcon icon={Video01Icon} strokeWidth={2} aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t('No API keys available')}</EmptyTitle>
              <EmptyDescription>
                {t('Create an API key to generate video.')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link to='/keys' />}>
                {t('Create API Key')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

        {keyId != null &&
        modelsQuery.isFetched &&
        modelsQuery.models.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <HugeiconsIcon icon={Video01Icon} strokeWidth={2} aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t('No video models available')}</EmptyTitle>
              <EmptyDescription>
                {t('This API key has no Seedance 2.0 or 2.5 models.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        <VideoSubmitCard
          form={form}
          disabled={isBusy}
          canSubmit={canSubmit}
          onSubmit={async (values) => {
            setSubmitError(null)
            setTaskId(null)
            try {
              const result = await generation.mutateAsync(values)
              setTaskId(result.task_id ?? result.id ?? null)
            } catch (error) {
              if (error instanceof VideoPlaygroundError) {
                setSubmitError(error)
                return
              }
              setSubmitError(
                new VideoPlaygroundError({
                  kind: 'system',
                  errorKey: 'Video generation failed',
                })
              )
            }
          }}
        />

        {submitError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {videoPlaygroundErrorText(submitError, t)}
            </AlertDescription>
          </Alert>
        ) : null}

        <VideoTaskStatus
          taskId={taskId}
          isPending={isTaskPending}
          queryError={queryError}
          onRetry={() => {
            void taskQuery.refetch()
          }}
          failureMessage={failureMessage}
        />

        {task?.status === VIDEO_TASK_SUCCESS ? (
          <VideoResult taskId={task.task_id} videoUrl={videoUrl} />
        ) : null}
      </div>
    </div>
  )
}
